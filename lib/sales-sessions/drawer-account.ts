import { getOrganizationPaymentMethodsConfig } from "@/lib/payments/defaults";
import type { TOrganizationConfiguration } from "@/schemas/organizations";
import { db, type DBTransaction } from "@/services/drizzle";
import { accountsCharts, financialAccounts } from "@/services/drizzle/schema";
import { and, asc, eq, isNull, ne, notExists } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

/**
 * Conta financeira da gaveta: a da sessão, ou a conta padrão do DINHEIRO — a mesma onde as vendas
 * em dinheiro caem. Sangria, suprimento e despesa precisam movimentar essa conta; sem isso o
 * Financeiro vê o dinheiro das vendas entrar e nunca vê a sangria sair (sessão sem conta própria,
 * vendas caindo na conta padrão do dinheiro).
 */
export async function resolveSessionDrawerAccount({
	trx,
	orgId,
	sessionAccountId,
	configuracao,
}: {
	trx?: DBTransaction;
	orgId: string;
	sessionAccountId: string | null;
	configuracao: Pick<TOrganizationConfiguration, "defaults"> | null | undefined;
}): Promise<{ id: string; nome: string; contaContabilId: string | null } | null> {
	const accountId = sessionAccountId ?? getOrganizationPaymentMethodsConfig(configuracao).DINHEIRO?.contaFinanceiraPadraoId ?? null;
	if (!accountId) return null;
	const [account] = await (trx ?? db)
		.select({ id: financialAccounts.id, nome: financialAccounts.nome, contaContabilId: financialAccounts.contaContabilId })
		.from(financialAccounts)
		.where(and(eq(financialAccounts.id, accountId), eq(financialAccounts.organizacaoId, orgId), eq(financialAccounts.ativo, true)));
	return account ?? null;
}

/**
 * O que o modal de movimento oferece: contas para onde a sangria leva o dinheiro (ou de onde o
 * suprimento vem) e as categorias de despesa do plano de contas.
 *
 * Servido pela rota de movimentos, e não pelas rotas do Financeiro, porque quem opera o caixa
 * normalmente não tem permissão do módulo financeiro.
 */
export async function listSalesSessionMovementOptions({
	orgId,
	sessionAccountId,
	configuracao,
}: {
	orgId: string;
	sessionAccountId: string | null;
	configuracao: Pick<TOrganizationConfiguration, "defaults"> | null | undefined;
}) {
	const childCharts = alias(accountsCharts, "child_charts");
	const [contaGaveta, contas, categoriasDespesa] = await Promise.all([
		resolveSessionDrawerAccount({ orgId, sessionAccountId, configuracao }),
		db
			.select({ id: financialAccounts.id, nome: financialAccounts.nome, tipo: financialAccounts.tipo })
			.from(financialAccounts)
			// Fatura de cartão não recebe dinheiro em espécie, e conta de sistema (repasse do iFood) não é
			// lugar de guardar sangria.
			.where(
				and(
					eq(financialAccounts.organizacaoId, orgId),
					eq(financialAccounts.ativo, true),
					ne(financialAccounts.tipo, "CARTAO_CREDITO"),
					isNull(financialAccounts.chaveSistema),
				),
			)
			.orderBy(asc(financialAccounts.nome)),
		// Só contas-folha: uma conta-mãe ("Despesas operacionais") agrupa, não classifica.
		db
			.select({ id: accountsCharts.id, nome: accountsCharts.nome, codigo: accountsCharts.codigo })
			.from(accountsCharts)
			.where(
				and(
					eq(accountsCharts.organizacaoId, orgId),
					eq(accountsCharts.natureza, "DESPESA"),
					notExists(
						db
							.select({ id: childCharts.id })
							.from(childCharts)
							.where(and(eq(childCharts.idContaPai, accountsCharts.id), eq(childCharts.organizacaoId, orgId))),
					),
				),
			)
			.orderBy(asc(accountsCharts.codigo), asc(accountsCharts.nome)),
	]);
	return {
		contaGaveta,
		contas: contas.filter((conta) => conta.id !== contaGaveta?.id),
		categoriasDespesa,
	};
}
