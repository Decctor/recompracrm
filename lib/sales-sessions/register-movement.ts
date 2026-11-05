import { db } from "@/services/drizzle";
import { accountingEntries, financialTransactions, salesSessions } from "@/services/drizzle/schema";
import type { TRegisterSalesSessionMovementInput } from "@/schemas/sales-sessions";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { normalizeFinancialTransactionValue } from "@/lib/finances/financial-transaction-value";
import { writeDefaultAccountingEntryLines } from "@/lib/finances/accounting-entry-lines";

/**
 * Registra um movimento manual de caixa (sangria/suprimento) numa sessão aberta.
 *
 * Reaproveita a maquinaria contábil existente:
 * - SANGRIA: dinheiro sai do caixa (→ cofre/banco). financialTransaction SAIDA + lançamento TRANSFERENCIA.
 * - SUPRIMENTO: dinheiro entra no caixa (troco). financialTransaction ENTRADA + lançamento TRANSFERENCIA.
 *
 * O movimento é carimbado com `sessaoVendaId`, então entra no cálculo do esperado de gaveta.
 */
export async function registerSalesSessionMovement({
	orgId,
	input,
	autorId,
	transferAccounts,
}: {
	orgId: string;
	input: TRegisterSalesSessionMovementInput;
	autorId: string | null;
	transferAccounts: { debitoContaId: string | null; creditoContaId: string | null };
}) {
	const session = await db.query.salesSessions.findFirst({
		where: and(eq(salesSessions.id, input.sessaoVendaId), eq(salesSessions.organizacaoId, orgId)),
	});
	if (!session) throw new createHttpError.NotFound("Sessao de venda nao encontrada.");
	if (session.status !== "ABERTA") throw new createHttpError.BadRequest("Somente sessoes abertas aceitam movimentos de caixa.");

	if (!transferAccounts.debitoContaId || !transferAccounts.creditoContaId) {
		throw new createHttpError.BadRequest("A organizacao nao possui contas padrao de transferencias configuradas para movimentar o caixa.");
	}

	const isSangria = input.tipo === "SANGRIA";
	const tipoTransacao = isSangria ? "SAIDA" : "ENTRADA";
	const titulo = isSangria ? "Sangria de caixa" : "Suprimento de caixa";
	// SUPRIMENTO segue a direção configurada (entra no caixa); SANGRIA é o inverso (sai do caixa).
	const idContaDebito = isSangria ? transferAccounts.creditoContaId : transferAccounts.debitoContaId;
	const idContaCredito = isSangria ? transferAccounts.debitoContaId : transferAccounts.creditoContaId;

	const result = await db.transaction(async (tx) => {
		const [entry] = await tx
			.insert(accountingEntries)
			.values({
				organizacaoId: orgId,
				origemTipo: "TRANSFERENCIA",
				titulo: input.observacoes?.trim() ? `${titulo} - ${input.observacoes.trim()}` : titulo,
				anotacoes: input.observacoes ?? null,
				idContaDebito,
				idContaCredito,
				valor: input.valor,
				dataCompetencia: new Date(),
				autorId,
			})
			.returning({ id: accountingEntries.id });

		await writeDefaultAccountingEntryLines({
			trx: tx,
			organizationId: orgId,
			accountingEntryId: entry.id,
			entryValue: input.valor,
			debitAccountId: idContaDebito,
			creditAccountId: idContaCredito,
		});

		const [transaction] = await tx
			.insert(financialTransactions)
			.values({
				organizacaoId: orgId,
				lancamentoContabilId: entry.id,
				contaFinanceiraId: session.contaFinanceiraId ?? null,
				sessaoVendaId: session.id,
				titulo,
				tipo: tipoTransacao,
				...normalizeFinancialTransactionValue({ valor: input.valor }),
				metodo: "DINHEIRO",
				dataPrevisao: new Date(),
				dataEfetivacao: new Date(),
				efetivacaoAutorId: autorId,
				efetivacaoOrigem: "IMEDIATA",
				provedorStatus: "APROVADO",
				autorId,
			})
			.returning({ id: financialTransactions.id });

		return { lancamentoContabilId: entry.id, transacaoId: transaction.id };
	});

	return { sessaoVendaId: session.id, tipo: input.tipo, valor: input.valor, ...result };
}
