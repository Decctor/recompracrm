import { writeDefaultAccountingEntryLines } from "@/lib/finances/accounting-entry-lines";
import { normalizeFinancialTransactionValue } from "@/lib/finances/financial-transaction-value";
import { resolveAccountingDefaultAccountIds } from "@/lib/finances/resolve-accounting-default-accounts";
import type { TOrganizationConfiguration } from "@/schemas/organizations";
import type { TRegisterSalesSessionMovementInput } from "@/schemas/sales-sessions";
import { db } from "@/services/drizzle";
import { accountingEntries, accountsCharts, financialAccounts, financialTransactions, salesSessions } from "@/services/drizzle/schema";
import { and, eq, isNull, ne } from "drizzle-orm";
import createHttpError from "http-errors";
import { resolveSessionDrawerAccount } from "./drawer-account";

const MOVEMENT_TITLES = {
	SANGRIA: "Sangria de caixa",
	SUPRIMENTO: "Suprimento de caixa",
	DESPESA: "Despesa paga com o caixa",
} as const;

/**
 * Registra um movimento manual de caixa numa sessão aberta. Toda perna da gaveta é uma transação
 * DINHEIRO carimbada com `sessaoVendaId` (entra no esperado) e lançada na conta financeira da gaveta
 * (entra no saldo do Financeiro). A contrapartida nunca é carimbada: ela não passa pela gaveta.
 *
 * - SANGRIA: dinheiro sai da gaveta para outra conta (cofre, banco). Lançamento TRANSFERENCIA com
 *   SAIDA na gaveta e ENTRADA no destino.
 * - SUPRIMENTO: dinheiro entra na gaveta. TRANSFERENCIA; com conta de origem, a SAIDA sai dela.
 * - DESPESA: dinheiro sai da gaveta para pagar uma conta (entrega, insumo). Lançamento MANUAL com a
 *   categoria no débito e a conta da gaveta no crédito.
 */
export async function registerSalesSessionMovement({
	orgId,
	input,
	autorId,
	configuracao,
}: {
	orgId: string;
	input: TRegisterSalesSessionMovementInput;
	autorId: string | null;
	configuracao: Pick<TOrganizationConfiguration, "defaults">;
}) {
	const observacoes = input.observacoes?.trim() || null;

	const result = await db.transaction(async (tx) => {
		const [session] = await tx
			.select({ id: salesSessions.id, status: salesSessions.status, contaFinanceiraId: salesSessions.contaFinanceiraId })
			.from(salesSessions)
			.where(and(eq(salesSessions.id, input.sessaoVendaId), eq(salesSessions.organizacaoId, orgId)))
			.for("update");
		if (!session) throw new createHttpError.NotFound("Sessao de venda nao encontrada.");
		if (session.status !== "ABERTA") throw new createHttpError.BadRequest("Somente sessoes abertas aceitam movimentos de caixa.");

		const drawer = await resolveSessionDrawerAccount({ trx: tx, orgId, sessionAccountId: session.contaFinanceiraId, configuracao });
		const transferDefaults = await resolveAccountingDefaultAccountIds({ trx: tx, orgId, kind: "transferencias", autoProvisionFromSeed: true });
		// Conta contábil da gaveta: a vinculada à conta financeira, ou a padrão de transferências (Caixa e Bancos).
		const drawerChartId = drawer?.contaContabilId ?? transferDefaults.creditAccountId;

		const counterpartAccountId = input.tipo === "DESPESA" ? null : (input.contaFinanceiraId ?? null);
		const counterpart = counterpartAccountId
			? (
					await tx
						.select({ id: financialAccounts.id, nome: financialAccounts.nome, contaContabilId: financialAccounts.contaContabilId })
						.from(financialAccounts)
						.where(
							and(
								eq(financialAccounts.id, counterpartAccountId),
								eq(financialAccounts.organizacaoId, orgId),
								eq(financialAccounts.ativo, true),
								ne(financialAccounts.tipo, "CARTAO_CREDITO"),
								isNull(financialAccounts.chaveSistema),
							),
						)
				)[0]
			: null;
		if (counterpartAccountId && !counterpart) throw new createHttpError.NotFound("Conta financeira nao encontrada ou inativa.");
		if (counterpart && drawer && counterpart.id === drawer.id) {
			throw new createHttpError.BadRequest("Escolha uma conta diferente da conta do caixa.");
		}

		const category =
			input.tipo === "DESPESA" && input.categoriaContaId
				? (
						await tx
							.select({ id: accountsCharts.id, nome: accountsCharts.nome })
							.from(accountsCharts)
							.where(and(eq(accountsCharts.id, input.categoriaContaId), eq(accountsCharts.organizacaoId, orgId), eq(accountsCharts.natureza, "DESPESA")))
					)[0]
				: null;
		if (input.tipo === "DESPESA" && !category) throw new createHttpError.NotFound("Categoria de despesa nao encontrada.");

		const baseTitle = MOVEMENT_TITLES[input.tipo];
		const target = category?.nome ?? counterpart?.nome ?? null;
		const entryTitle = [target ? `${baseTitle} - ${target}` : baseTitle, observacoes].filter(Boolean).join(" - ");

		// Débito recebe, crédito entrega: a sangria e a despesa saem da gaveta; o suprimento entra nela.
		const { debitAccountId, creditAccountId } =
			input.tipo === "DESPESA"
				? { debitAccountId: category?.id as string, creditAccountId: drawerChartId }
				: input.tipo === "SANGRIA"
					? { debitAccountId: counterpart?.contaContabilId ?? transferDefaults.debitAccountId, creditAccountId: drawerChartId }
					: { debitAccountId: drawerChartId, creditAccountId: counterpart?.contaContabilId ?? transferDefaults.creditAccountId };

		const [entry] = await tx
			.insert(accountingEntries)
			.values({
				organizacaoId: orgId,
				origemTipo: input.tipo === "DESPESA" ? "MANUAL" : "TRANSFERENCIA",
				titulo: entryTitle,
				anotacoes: observacoes,
				idContaDebito: debitAccountId,
				idContaCredito: creditAccountId,
				valor: input.valor,
				valorPrevisto: input.valor,
				dataCompetencia: new Date(),
				autorId,
			})
			.returning({ id: accountingEntries.id });
		if (!entry) throw new createHttpError.InternalServerError("Erro ao registrar o movimento de caixa.");

		await writeDefaultAccountingEntryLines({
			trx: tx,
			organizationId: orgId,
			accountingEntryId: entry.id,
			entryValue: input.valor,
			expectedValue: input.valor,
			debitAccountId,
			creditAccountId,
		});

		const now = new Date();
		const settled = {
			metodo: "DINHEIRO" as const,
			...normalizeFinancialTransactionValue({ valor: input.valor }),
			dataPrevisao: now,
			dataEfetivacao: now,
			efetivacaoAutorId: autorId,
			efetivacaoOrigem: "IMEDIATA" as const,
			provedorStatus: "APROVADO",
			autorId,
		};
		const drawerIsOutflow = input.tipo !== "SUPRIMENTO";

		const [drawerTransaction] = await tx
			.insert(financialTransactions)
			.values({
				organizacaoId: orgId,
				lancamentoContabilId: entry.id,
				contaFinanceiraId: drawer?.id ?? null,
				sessaoVendaId: session.id,
				titulo: target ? `${baseTitle} - ${target}` : baseTitle,
				tipo: drawerIsOutflow ? "SAIDA" : "ENTRADA",
				...settled,
			})
			.returning({ id: financialTransactions.id });

		// A contrapartida em outra conta financeira, sem `sessaoVendaId`: o cofre não é a gaveta.
		if (counterpart) {
			await tx.insert(financialTransactions).values({
				organizacaoId: orgId,
				lancamentoContabilId: entry.id,
				contaFinanceiraId: counterpart.id,
				titulo: drawerIsOutflow ? `${baseTitle} - entrada` : `${baseTitle} - saída`,
				tipo: drawerIsOutflow ? "ENTRADA" : "SAIDA",
				...settled,
			});
		}

		return { lancamentoContabilId: entry.id, transacaoId: drawerTransaction?.id ?? null };
	});

	return { sessaoVendaId: input.sessaoVendaId, tipo: input.tipo, valor: input.valor, ...result };
}
