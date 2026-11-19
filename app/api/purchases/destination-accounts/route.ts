import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { PURCHASE_DESTINATION_ACCOUNT_NATURES } from "@/lib/purchase/destination";
import { db } from "@/services/drizzle";
import { accountsCharts } from "@/services/drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";

/**
 * Contas que podem receber o custo de um item de compra, para quem lança compras — o plano de contas
 * completo (/api/finances/account-charts) exige permissão do financeiro, e escolher o destino de uma
 * nota não deveria. Traz também a conta de estoque (o destino padrão) e a conta padrão do custo de um
 * cancelamento, para as telas pré-selecionarem sem conhecer a configuração da organização.
 */
async function getPurchaseDestinationAccounts({ organizationId }: { organizationId: string }) {
	const [accounts, organization] = await Promise.all([
		db
			.select({ id: accountsCharts.id, nome: accountsCharts.nome, codigo: accountsCharts.codigo, natureza: accountsCharts.natureza })
			.from(accountsCharts)
			.where(and(eq(accountsCharts.organizacaoId, organizationId), inArray(accountsCharts.natureza, [...PURCHASE_DESTINATION_ACCOUNT_NATURES]))),
		db.query.organizations.findFirst({ where: (fields, { eq }) => eq(fields.id, organizationId), columns: { configuracao: true } }),
	]);
	const purchaseDefaults = organization?.configuracao.defaults.contabilidade.lancamentosPadrao.compras;
	// Códigos são caminhos hierárquicos: ordena segmento a segmento (1, 1.2, 1.10), como o plano de contas.
	// Em JS e não com `::int[]` no SQL: um código não numérico num plano personalizado derrubaria a consulta.
	const sorted = [...accounts].sort((a, b) => {
		if (a.codigo && b.codigo) return a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }) || a.nome.localeCompare(b.nome, "pt-BR");
		if (a.codigo || b.codigo) return a.codigo ? -1 : 1; // sem código por último
		return a.nome.localeCompare(b.nome, "pt-BR");
	});
	return {
		data: {
			contas: sorted,
			contaEstoqueId: purchaseDefaults?.debitoContaId ?? null,
			contaPerdaPadraoId: purchaseDefaults?.debitoDespesaPeriodoContaId ?? null,
		},
		message: "Contas de destino obtidas com sucesso.",
	};
}
export type TGetPurchaseDestinationAccountsOutput = Awaited<ReturnType<typeof getPurchaseDestinationAccounts>>;

async function getPurchaseDestinationAccountsRoute() {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	const permissions = session.membership?.permissoes.compras;
	if (!permissions?.visualizar && !permissions?.criar && !permissions?.editar)
		throw new createHttpError.Forbidden("Você não possui permissão para acessar compras.");
	return NextResponse.json(await getPurchaseDestinationAccounts({ organizationId }));
}

export const GET = appApiHandler({
	GET: getPurchaseDestinationAccountsRoute,
});
