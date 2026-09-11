import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { computeSessionExpectedByMethod } from "@/lib/sales-sessions";
import { SALE_CHANGE_TRANSACTION_ORIGIN } from "@/lib/sales/sale-change";
import { db } from "@/services/drizzle";
import { accountingEntries, financialTransactions, fiscalOutboundDocuments, sales, salesSessions, users } from "@/services/drizzle/schema";
import { and, asc, count, desc, eq, ne, or, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const PAGE_SIZE = 25;

const GetSalesSessionsInputSchema = z.object({
	id: z.string({ invalid_type_error: "Tipo invalido para o ID da sessao." }).optional().nullable(),
	page: z
		.string({ invalid_type_error: "Tipo invalido para pagina." })
		.optional()
		.nullable()
		.transform((v) => (v ? Number(v) : 1)),
	status: z.enum(["ABERTA", "FECHADA", "CONFERIDA", "CANCELADA"]).optional().nullable(),
});
export type TGetSalesSessionsInput = z.infer<typeof GetSalesSessionsInputSchema>;

async function getSalesSessions({ input, session }: { input: TGetSalesSessionsInput; session: TAuthUserSession }) {
	const orgId = session.membership?.organizacao.id;
	if (!orgId) throw new createHttpError.Unauthorized("Voce precisa estar vinculado a uma organizacao.");

	if (input.id) {
		const found = await db.query.salesSessions.findFirst({
			where: and(eq(salesSessions.id, input.id), eq(salesSessions.organizacaoId, orgId)),
			with: {
				vendedorPadrao: { columns: { id: true, nome: true } },
				abertaPorUsuario: { columns: { id: true, nome: true } },
				fechadaPorUsuario: { columns: { id: true, nome: true } },
				conferidaPorUsuario: { columns: { id: true, nome: true } },
				conferencias: true,
				vendas: {
					columns: { id: true, valorTotal: true, dataVenda: true, vendedorId: true, vendedorNome: true },
					with: { cliente: { columns: { id: true, nome: true } } },
				},
			},
		});
		if (!found) throw new createHttpError.NotFound("Sessão de venda não encontrada.");

		// O ledger da sessão é a única fonte que explica o esperado (fundo, entradas, troco, sangrias
		// e estornos). Numa sessão aberta ele ainda é a própria verdade; depois do fechamento vira a
		// composição do que `conferencias` congelou — nenhum movimento novo é carimbado numa sessão
		// fechada, então recalcular aqui devolve os mesmos valores e serve o detalhe histórico.
		// As pendências fiscais seguem junto: quem confere o caixa precisa vê-las tanto quanto quem fecha.
		const [resumoEsperado, pendenciasFiscais, movimentosRows] = await Promise.all([
			computeSessionExpectedByMethod({ orgId, sessaoVendaId: found.id, saldoInicial: found.saldoInicial }),
			db
				.select({
					id: fiscalOutboundDocuments.id,
					referencia: fiscalOutboundDocuments.referencia,
					statusInterno: fiscalOutboundDocuments.statusInterno,
				})
				.from(fiscalOutboundDocuments)
				.innerJoin(sales, eq(fiscalOutboundDocuments.vendaId, sales.id))
				.where(
					and(
						eq(sales.sessaoVendaId, found.id),
						eq(fiscalOutboundDocuments.organizacaoId, orgId),
						ne(fiscalOutboundDocuments.statusInterno, "AUTORIZADO"),
					),
				),
			// Os movimentos que a composição resume em uma linha só: sangrias, suprimentos e estornos.
			// Ficam de fora o troco (já é linha própria) e o recebimento de venda (já é a lista de vendas
			// do turno) — sem isso, um turno movimentado despejaria centenas de linhas dentro do modal.
			db
				.select({
					id: financialTransactions.id,
					titulo: financialTransactions.titulo,
					tipo: financialTransactions.tipo,
					valor: financialTransactions.valor,
					metodo: financialTransactions.metodo,
					dataEfetivacao: financialTransactions.dataEfetivacao,
					dataPrevisao: financialTransactions.dataPrevisao,
					origemTipo: accountingEntries.origemTipo,
					// A observação do operador (sangria/suprimento) e o motivo do estorno moram no
					// lançamento contábil — o título da transação é sempre genérico.
					observacoes: accountingEntries.anotacoes,
					autorNome: users.nome,
				})
				.from(financialTransactions)
				.innerJoin(accountingEntries, eq(financialTransactions.lancamentoContabilId, accountingEntries.id))
				.leftJoin(users, eq(financialTransactions.autorId, users.id))
				.where(
					and(
						eq(financialTransactions.organizacaoId, orgId),
						eq(financialTransactions.sessaoVendaId, found.id),
						sql`coalesce(${financialTransactions.modificadoresMetadata} ->> 'origem', '') <> ${SALE_CHANGE_TRANSACTION_ORIGIN}`,
						or(ne(accountingEntries.origemTipo, "VENDA"), ne(financialTransactions.tipo, "ENTRADA")),
					),
				)
				.orderBy(asc(financialTransactions.dataPrevisao)),
		]);
		const movimentos = movimentosRows.map(({ dataEfetivacao, dataPrevisao, ...movimento }) => ({ ...movimento, data: dataEfetivacao ?? dataPrevisao }));

		return {
			data: {
				byId: { ...found, resumoEsperado, pendenciasFiscais, movimentos },
				default: undefined,
			},
			message: "Sessao de venda encontrada com sucesso.",
		};
	}

	const conditions = [eq(salesSessions.organizacaoId, orgId)];
	if (input.status) conditions.push(eq(salesSessions.status, input.status));

	const page = input.page && input.page > 0 ? input.page : 1;
	const skip = PAGE_SIZE * (page - 1);

	const [sessionsResult, totalResult] = await Promise.all([
		db.query.salesSessions.findMany({
			where: and(...conditions),
			with: { vendedorPadrao: { columns: { id: true, nome: true } } },
			orderBy: desc(salesSessions.dataAbertura),
			offset: skip,
			limit: PAGE_SIZE,
		}),
		db
			.select({ count: count() })
			.from(salesSessions)
			.where(and(...conditions)),
	]);

	const matched = totalResult[0]?.count ?? 0;

	return {
		data: {
			byId: undefined,
			default: {
				sessions: sessionsResult,
				sessionsMatched: matched,
				totalPages: Math.ceil(matched / PAGE_SIZE),
			},
		},
		message: "Sessoes de venda listadas com sucesso.",
	};
}
export type TGetSalesSessionsOutput = Awaited<ReturnType<typeof getSalesSessions>>;
export type TGetSalesSessionsOutputById = Exclude<TGetSalesSessionsOutput["data"]["byId"], undefined>;
export type TGetSalesSessionsOutputDefault = Exclude<TGetSalesSessionsOutput["data"]["default"], undefined>;

async function getSalesSessionsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Voce nao esta autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Voce precisa estar vinculado a uma organizacao.");

	const { searchParams } = new URL(request.url);
	const input = GetSalesSessionsInputSchema.parse({
		id: searchParams.get("id") ?? undefined,
		page: searchParams.get("page") ?? undefined,
		status: searchParams.get("status") ?? undefined,
	});
	const result = await getSalesSessions({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getSalesSessionsRoute });
