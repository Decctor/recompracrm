import { writeDefaultAccountingEntryLines } from "@/lib/finances/accounting-entry-lines";
import { registerRefundCashMovement } from "@/lib/sales-sessions";
import { db } from "@/services/drizzle";
import type { TOrganizationEntity } from "@/services/drizzle/schema";
import { accountingEntries, financialTransactions, salesSessions, tabPayments, tabs } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { TAB_PARTIAL_PAYMENT_REFUND_TRANSACTION_ORIGIN } from "./partial-payments";
import { sumTabActivePayments } from "./utils";

export type TRefundTabPaymentInput = {
	tabPaymentId: string;
	reason: string;
	// Caixa aberto que devolve o dinheiro. Obrigatorio para DINHEIRO (ver abaixo).
	sessaoVendaId?: string | null;
};

const roundCents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Estorno de um recebimento parcial, so com a conta ABERTA (depois do fechamento o caminho e o
 * cancelamento da venda, que ja estorna todas as transacoes do lancamento).
 *
 * Dinheiro exige caixa aberto: o cancelamento da venda confirmada calcula o dinheiro a devolver
 * somando toda transacao DINHEIRO efetivada, sem olhar status. Um parcial em dinheiro estornado
 * sem a SAIDA correspondente continuaria contando como recebido, e um cancelamento posterior da
 * venda devolveria esse dinheiro pela segunda vez. Com a SAIDA sempre presente, ENTRADA − SAIDA = 0.
 */
export async function refundTabPayment({
	organization,
	userId,
	input,
}: {
	organization: TOrganizationEntity;
	userId: string;
	input: TRefundTabPaymentInput;
}) {
	const reason = input.reason.trim();
	if (!reason) throw new createHttpError.BadRequest("Informe o motivo do estorno.");

	return db.transaction(async (tx) => {
		const [payment] = await tx
			.select()
			.from(tabPayments)
			.where(and(eq(tabPayments.id, input.tabPaymentId), eq(tabPayments.organizacaoId, organization.id)))
			.for("update");
		if (!payment) throw new createHttpError.NotFound("Recebimento parcial nao encontrado.");
		if (payment.status !== "ATIVO") throw new createHttpError.BadRequest("Este recebimento ja foi estornado.");

		const [tab] = await tx.select({ id: tabs.id, status: tabs.status }).from(tabs).where(eq(tabs.id, payment.tabId)).for("update");
		if (!tab) throw new createHttpError.NotFound("Conta nao encontrada.");
		if (tab.status !== "ABERTA") {
			throw new createHttpError.BadRequest("A conta ja foi fechada. Para devolver um pagamento, cancele a venda da conta.");
		}

		const isCash = payment.metodo === "DINHEIRO";
		if (isCash && !input.sessaoVendaId) {
			throw new createHttpError.BadRequest("Abra um caixa para estornar um recebimento em dinheiro.");
		}
		let activeSession: { id: string; contaFinanceiraId: string | null } | null = null;
		if (input.sessaoVendaId) {
			const [lockedSession] = await tx
				.select({ id: salesSessions.id, status: salesSessions.status, contaFinanceiraId: salesSessions.contaFinanceiraId })
				.from(salesSessions)
				.where(and(eq(salesSessions.id, input.sessaoVendaId), eq(salesSessions.organizacaoId, organization.id)))
				.for("update");
			if (!lockedSession || lockedSession.status !== "ABERTA") {
				throw new createHttpError.Conflict("A sessao de venda foi fechada. Selecione outro caixa e tente novamente.");
			}
			activeSession = { id: lockedSession.id, contaFinanceiraId: lockedSession.contaFinanceiraId };
		}

		const now = new Date();
		const refundedRows = await tx
			.update(tabPayments)
			.set({ status: "ESTORNADO", estornadoPorUsuarioId: userId, dataEstorno: now, motivoEstorno: reason })
			.where(and(eq(tabPayments.id, payment.id), eq(tabPayments.status, "ATIVO")))
			.returning({ id: tabPayments.id });
		if (refundedRows.length === 0) {
			throw new createHttpError.Conflict("O recebimento foi alterado por outra operacao. Atualize e tente novamente.");
		}

		if (payment.transacaoFinanceiraId) {
			await tx.update(financialTransactions).set({ provedorStatus: "ESTORNADO" }).where(eq(financialTransactions.id, payment.transacaoFinanceiraId));
		}

		// Lancamento VENDA: valor em place. Estornar o ultimo parcial deixa o lancamento em 0 com
		// duas linhas de 0 — assertAccountingEntryLinesBalanced aceita (so exige >= 2 linhas e
		// debito = credito = valor).
		if (payment.lancamentoContabilId) {
			const entry = await tx.query.accountingEntries.findFirst({
				where: (fields, { eq }) => eq(fields.id, payment.lancamentoContabilId as string),
				columns: { id: true, valor: true, idContaDebito: true, idContaCredito: true, titulo: true },
			});
			if (entry) {
				const nextValue = roundCents(Math.max(0, entry.valor - payment.valor));
				await tx.update(accountingEntries).set({ valor: nextValue }).where(eq(accountingEntries.id, entry.id));
				await writeDefaultAccountingEntryLines({
					trx: tx,
					organizationId: organization.id,
					accountingEntryId: entry.id,
					entryValue: nextValue,
					debitAccountId: entry.idContaDebito,
					creditAccountId: entry.idContaCredito,
				});

				// Dinheiro sai da gaveta do caixa aberto, ancorado no mesmo lancamento da venda. A origem
				// nunca e TROCO: o detPag e o esperado de gaveta descontariam como troco.
				if (isCash && activeSession) {
					await registerRefundCashMovement({
						tx,
						orgId: organization.id,
						sessaoVendaId: activeSession.id,
						lancamentoContabilId: entry.id,
						valorDinheiro: payment.valor,
						contaFinanceiraId: activeSession.contaFinanceiraId,
						autorId: userId,
						titulo: `ESTORNO PARCIAL - ${entry.titulo}`,
						origem: TAB_PARTIAL_PAYMENT_REFUND_TRANSACTION_ORIGIN,
					});
				}
			}
		}

		const valorPago = await sumTabActivePayments(tx, { tabId: tab.id });
		return { tabPaymentId: payment.id, tabId: tab.id, valorPago };
	});
}
export type TRefundTabPaymentResult = Awaited<ReturnType<typeof refundTabPayment>>;
