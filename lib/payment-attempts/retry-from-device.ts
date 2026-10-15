import { hashAccessSecret } from "@/lib/access/tokens";
import { db } from "@/services/drizzle";
import { financialTransactions, paymentAttempts } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { createAssignedPaymentAttempt } from "./create-assigned";
import { PaymentTerminalError } from "./errors";
import { isNewPaymentAttemptAllowed } from "./state-machine";
import { buildChargeView, findPaymentAttemptForDevice } from "./views";

const CANCELLED_TRANSACTION_STATUSES = new Set(["CANCELADO", "ESTORNADO"]);

/**
 * "Tentar de novo" no terminal: depois de uma cobrança não aprovada, uma NOVA tentativa deliberada
 * para a mesma transação pendente (mesmo método, valor e parcelas), atribuída a este dispositivo —
 * a mesma operação que "reatribuir" faz na plataforma (docs/03: `novaTentativaPermitida`). Nunca
 * reabre a tentativa anterior e nunca roda sozinha: o operador pede, com o cliente presente.
 *
 * Idempotente pela chave do dispositivo: repetir o pedido devolve a mesma nova cobrança.
 */
export async function retryPaymentAttemptFromDevice({
	organizationId,
	deviceId,
	attemptId,
	idempotencyKey,
}: {
	organizationId: string;
	deviceId: string;
	attemptId: string;
	idempotencyKey: string;
}) {
	return db.transaction(async (tx) => {
		const replay = await tx.query.paymentAttempts.findFirst({
			where: and(
				eq(paymentAttempts.organizacaoId, organizationId),
				eq(paymentAttempts.dispositivoId, deviceId),
				eq(paymentAttempts.chaveIdempotencia, idempotencyKey),
			),
			columns: { id: true, tentativaOrigemId: true },
		});
		if (replay) {
			if (replay.tentativaOrigemId !== attemptId)
				throw new PaymentTerminalError(409, "IDEMPOTENCY_KEY_REUSED", "A chave de idempotência já foi usada em outra operação.");
			return buildChargeView(await findPaymentAttemptForDevice({ organizationId, deviceId, attemptId: replay.id, database: tx }));
		}

		const previous = await findPaymentAttemptForDevice({ organizationId, deviceId, attemptId, database: tx });
		if (!isNewPaymentAttemptAllowed(previous.status)) {
			throw new PaymentTerminalError(409, "PAYMENT_ATTEMPT_INVALID_TRANSITION", "Só é possível cobrar de novo depois de uma cobrança não aprovada.", {
				attemptId,
			});
		}
		if (previous.venda.statusVenda !== "CONFIRMADA")
			throw new PaymentTerminalError(409, "CONFLICT", "A venda desta cobrança não está mais confirmada.", { attemptId });
		if (!previous.transacaoFinanceiraId)
			throw new PaymentTerminalError(409, "CONFLICT", "A cobrança não está mais vinculada a um pagamento pendente.", { attemptId });

		// O pagamento pode ter sido trocado ou cancelado na plataforma depois da recusa: aí não há o que recobrar.
		const transaction = await tx.query.financialTransactions.findFirst({
			where: and(eq(financialTransactions.id, previous.transacaoFinanceiraId), eq(financialTransactions.organizacaoId, organizationId)),
			columns: { id: true, dataEfetivacao: true, provedorStatus: true },
		});
		if (!transaction || transaction.dataEfetivacao || CANCELLED_TRANSACTION_STATUSES.has(transaction.provedorStatus ?? "")) {
			throw new PaymentTerminalError(409, "CONFLICT", "Este pagamento já foi resolvido ou alterado no RecompraCRM.", { attemptId });
		}

		const next = await createAssignedPaymentAttempt({
			tx,
			organizationId,
			saleId: previous.vendaId,
			deviceId,
			financialTransactionId: previous.transacaoFinanceiraId,
			metodo: previous.metodo,
			valor: previous.valor,
			totalParcelas: previous.totalParcelas ?? 1,
			parcelamentoResponsavel: previous.parcelamentoResponsavel,
			chaveIdempotencia: idempotencyKey,
			fingerprintEntrada: hashAccessSecret(JSON.stringify({ deviceId, operation: "RETRY", attemptId })),
			origem: "DISPOSITIVO",
			tentativaOrigemId: previous.id,
		});
		return buildChargeView(await findPaymentAttemptForDevice({ organizationId, deviceId, attemptId: next.id, database: tx }));
	});
}
