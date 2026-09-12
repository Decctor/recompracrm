import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { loadSalesErpData } from "@/lib/sales/erp-data";
import { groupSaleChangeByMethod } from "@/lib/sales/sale-change";
import {
	buildSaleCompositionSummary,
	buildSaleFiscalSummary,
	buildSalePaymentsSummary,
	resolvePrimarySaleFiscalDocument,
} from "@/lib/sales/export-summaries";
import { buildSalesHistoryConditions } from "@/lib/sales/history-conditions";
import { SalesHistoryFiltersSchema } from "@/lib/sales/history-filters";
import { classifySalePaymentTransactions, computeSaleFinancialStatus, computeSaleFiscalStatus, groupSalePaymentsByMethod } from "@/lib/sales/utils";
import { db } from "@/services/drizzle";
import { sales } from "@/services/drizzle/schema";
import { and, count, desc, inArray } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * Exportação do histórico de vendas, página a página.
 *
 * Mesmos filtros e mesma ordenação da listagem (`GET /api/sales`), via `buildSalesHistoryConditions`:
 * o que o usuário vê filtrado é o que ele exporta. Páginas maiores que as da listagem porque o
 * consumidor é um laço no navegador, não uma tela; e sem as relações que a planilha não usa
 * (cashback, atribuição de campanha, avatares). A composição, os pagamentos e os documentos fiscais
 * chegam como texto pronto para a célula, calculado em `lib/sales/export-summaries`.
 */
const EXPORT_PAGE_SIZE = 200;

// O histórico nunca filtra por cliente; a exportação segue o histórico.
const GetSalesExportInputSchema = SalesHistoryFiltersSchema.omit({ clientId: true }).extend({
	page: z
		.string({
			required_error: "Página não informada.",
			invalid_type_error: "Tipo inválido para página.",
		})
		.default("1")
		.transform((val) => (val ? Math.max(1, Number(val)) : 1)),
});
export type TGetSalesExportInput = z.infer<typeof GetSalesExportInputSchema>;

async function getSalesExport({ input, sessionUser }: { input: TGetSalesExportInput; sessionUser: TAuthUserSession }) {
	const orgId = sessionUser.membership?.organizacao.id;
	if (!orgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	// Mesmos portões da listagem: o módulo de ERP gateia as colunas financeiras e fiscais da
	// organização; a permissão fiscal do membro gateia só a metade fiscal.
	const orgHasERPAccess = !!sessionUser.membership?.organizacao.configuracao?.recursos?.erp?.acesso;
	const userCanViewFiscal = orgHasERPAccess && !!sessionUser.membership?.permissoes.fiscal.visualizar;

	const conditions = buildSalesHistoryConditions({ filters: { ...input, clientId: null }, orgId, orgHasERPAccess });
	const where = and(...conditions);
	const { page } = input;

	// A contagem só na primeira página: com filtros de ERP ela é a parte cara da consulta, e o
	// laço de exportação já sabe quantas páginas tem depois da primeira resposta.
	const [salesPage, salesMatched] = await Promise.all([
		db
			.select({ id: sales.id })
			.from(sales)
			.where(where)
			.orderBy(desc(sales.dataVenda), desc(sales.id))
			.offset(EXPORT_PAGE_SIZE * (page - 1))
			.limit(EXPORT_PAGE_SIZE),
		page === 1 ? db.select({ count: count() }).from(sales).where(where) : Promise.resolve(null),
	]);
	const saleIds = salesPage.map((sale) => sale.id);

	const [salesHydrated, erpData] = await Promise.all([
		saleIds.length === 0
			? []
			: db.query.sales.findMany({
					where: inArray(sales.id, saleIds),
					columns: {
						id: true,
						dataVenda: true,
						statusVenda: true,
						processamentoOrigem: true,
						valorTotal: true,
						descontosTotal: true,
						acrescimosTotal: true,
						vendedorNome: true,
						parceiro: true,
						canal: true,
						entregaModalidade: true,
						comandaNumero: true,
						observacoes: true,
					},
					with: {
						integracao: { columns: { tipo: true, apelido: true } },
						cliente: { columns: { id: true, nome: true, telefone: true, cpfCnpj: true, email: true } },
						itens: {
							columns: { quantidade: true, valorVendaTotalLiquido: true },
							with: {
								produto: { columns: { nome: true } },
								produtoVariante: { columns: { nome: true } },
							},
						},
					},
				}),
		orgHasERPAccess ? loadSalesErpData({ orgId, saleIds }) : Promise.resolve(null),
	]);

	const now = new Date();
	const salesHydratedById = new Map(salesHydrated.map((sale) => [sale.id, sale]));
	// Preserva a ordem da página: `IN (...)` não garante ordem.
	const rows = saleIds.flatMap((id) => {
		const sale = salesHydratedById.get(id);
		if (!sale) return [];
		const { itens, ...saleFields } = sale;

		let erp: {
			financeiro: { status: ReturnType<typeof computeSaleFinancialStatus>; pagamentosResumo: string; valorRecebido: number };
			fiscal: {
				status: ReturnType<typeof computeSaleFiscalStatus>;
				documentosResumo: string;
				documentoPrincipal: { tipo: string; numero: string | null; serie: string | null; chaveAcesso: string | null } | null;
			} | null;
		} | null = null;
		if (erpData) {
			const transacoes = erpData.transactionsBySaleId.get(id) ?? [];
			const documentos = erpData.fiscalDocsBySaleId.get(id) ?? [];
			const pagamentos = groupSalePaymentsByMethod(classifySalePaymentTransactions(transacoes).todas, now);
			const trocos = groupSaleChangeByMethod(transacoes);
			const trocoTotal = trocos.reduce((acc, troco) => acc + troco.valor, 0);
			const documentoPrincipal = resolvePrimarySaleFiscalDocument(documentos);
			erp = {
				financeiro: {
					status: computeSaleFinancialStatus({ transactions: transacoes, saleTotal: sale.valorTotal, now }),
					pagamentosResumo: buildSalePaymentsSummary(pagamentos, trocos),
					// Líquido: quem soma a coluna quer o que entrou no caixa, não o que passou por ele. O
					// troco devolvido aparece discriminado em PAGAMENTOS, então a subtração é auditável.
					valorRecebido: pagamentos.reduce((acc, pagamento) => acc + pagamento.valorRecebido, 0) - trocoTotal,
				},
				fiscal: userCanViewFiscal
					? {
							status: computeSaleFiscalStatus({ documents: documentos }),
							documentosResumo: buildSaleFiscalSummary(documentos),
							documentoPrincipal: documentoPrincipal
								? {
										tipo: documentoPrincipal.tipo,
										numero: documentoPrincipal.numero,
										serie: documentoPrincipal.serie,
										chaveAcesso: documentoPrincipal.chaveAcesso,
									}
								: null,
						}
					: null,
			};
		}

		return [
			{
				...saleFields,
				itensQuantidade: itens.length,
				composicaoResumo: buildSaleCompositionSummary(itens),
				erp,
			},
		];
	});

	const salesMatchedCount = salesMatched ? (salesMatched[0]?.count ?? 0) : null;
	return {
		data: {
			sales: rows,
			page,
			salesMatched: salesMatchedCount,
			totalPages: salesMatchedCount === null ? null : Math.ceil(salesMatchedCount / EXPORT_PAGE_SIZE),
		},
		message: "Vendas encontradas com sucesso.",
	};
}
export type TGetSalesExportOutput = Awaited<ReturnType<typeof getSalesExport>>;
export type TSaleExportEntry = TGetSalesExportOutput["data"]["sales"][number];

async function getSalesExportRoute(request: NextRequest) {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const input = GetSalesExportInputSchema.parse(Object.fromEntries(request.nextUrl.searchParams.entries()));
	const result = await getSalesExport({ input, sessionUser });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getSalesExportRoute });
