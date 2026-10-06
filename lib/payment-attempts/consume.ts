import { processSaleAutomaticFiscalEmissionIfEligible, processSaleCashbackAccumulationIfEligible } from "@/lib/sales/sale-processing";
import { db } from "@/services/drizzle";
import { financialTransactions, organizations, paymentAttempts } from "@/services/drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import { PaymentTerminalError } from "./errors";
import { recordPaymentAttemptEvent } from "./events";

export type TConsumeApprovedPaymentAttemptParams = {
	organizationId: string;
	paymentAttemptId: string;
	principalId?: string | null;
	actorUserId?: string | null;
};

export type TConsumeApprovedPaymentAttemptResult = {
	attemptId: string;
	saleId: string;
	financialTransactionId: string;
	alreadyConsumed: boolean;
};

const AMOUNT_TOLERANCE = 0.005;

// Consumo = efetivação da transação financeira pendente vinculada, na MESMA transação PostgreSQL
// que marca a tentativa como CONSUMIDA (docs/03 "Consumo", docs/05 "Ordem transacional" §2).
// Bloqueia a tentativa (FOR UPDATE), relê a transação, valida valor/método/vínculo, seta
// `dataEfetivacao` + referências do provedor e grava o evento. Falhar aqui preserva a aprovação:
// a tentativa continua APROVADA_EFETIVACAO_PENDENTE e qualquer consulta/outcome repetido retoma.
// Nenhum rollback PostgreSQL desfaz a adquirente.
export async function consumeApprovedPaymentAttempt(params: TConsumeApprovedPaymentAttemptParams): Promise<TConsumeApprovedPaymentAttemptResult> {
	const { organizationId, paymentAttemptId } = params;

	const result = await db.transaction(async (tx) => {
		const [attempt] = await tx
			.select()
			.from(paymentAttempts)
			.where(and(eq(paymentAttempts.id, paymentAttemptId), eq(paymentAttempts.organizacaoId, organizationId)))
			.for("update");
		if (!attempt) throw new PaymentTerminalError(404, "PAYMENT_ATTEMPT_NOT_FOUND", "Tentativa de pagamento não encontrada.", { attemptId: paymentAttemptId });

		if (attempt.status === "CONSUMIDA") {
			return { attemptId: attempt.id, saleId: attempt.vendaId, financialTransactionId: attempt.transacaoFinanceiraId, alreadyConsumed: true };
		}
		if (attempt.status !== "APROVADA_EFETIVACAO_PENDENTE") {
			throw new PaymentTerminalError(409, "PAYMENT_ATTEMPT_INVALID_TRANSITION", "Somente tentativas aprovadas podem ser consumidas.", { attemptId: attempt.id });
		}

		const [transaction] = await tx
			.select({
				id: financialTransactions.id,
				valor: financialTransactions.valor,
				metodo: financialTransactions.metodo,
				dataEfetivacao: financialTransactions.dataEfetivacao,
				tentativaPagamentoId: financialTransactions.tentativaPagamentoId,
			})
			.from(financialTransactions)
			.where(and(eq(financialTransactions.id, attempt.transacaoFinanceiraId), eq(financialTransactions.organizacaoId, organizationId)))
			.for("update");
		if (!transaction) {
			throw new PaymentTerminalError(409, "PAYMENT_ATTEMPT_INVALID_TRANSITION", "A transação financeira vinculada à cobrança não existe mais.", { attemptId: attempt.id });
		}
		// Efetivada por outro caminho (conciliação manual, troca de método): a aprovação da adquirente
		// existe, mas o financeiro já está fechado — caso do runbook "cobrou, mas não efetivou".
		if (transaction.dataEfetivacao && transaction.tentativaPagamentoId !== attempt.id) {
			throw new PaymentTerminalError(409, "PAYMENT_ATTEMPT_INVALID_TRANSITION", "A transação financeira já foi efetivada por outro meio. Conciliação manual necessária.", {
				attemptId: attempt.id,
			});
		}
		if (Math.abs(transaction.valor - attempt.valor) > AMOUNT_TOLERANCE || transaction.metodo !== attempt.metodo) {
			throw new PaymentTerminalError(422, "PAYMENT_RESULT_MISMATCH", "Valor ou método da transação pendente divergem da tentativa aprovada.", { attemptId: attempt.id });
		}

		const now = new Date();
		if (!transaction.dataEfetivacao) {
			await tx
				.update(financialTransactions)
				.set({
					dataEfetivacao: now,
					provedorReferencia: attempt.atkProvedor ?? attempt.itkProvedor ?? null,
					provedorStatus: "APROVADO",
					tentativaPagamentoId: attempt.id,
				})
				.where(and(eq(financialTransactions.id, transaction.id), eq(financialTransactions.organizacaoId, organizationId)));
		}

		const [consumed] = await tx
			.update(paymentAttempts)
			.set({ status: "CONSUMIDA", dataConsumo: now, dataConclusao: attempt.dataConclusao ?? now, versao: sql`${paymentAttempts.versao} + 1` })
			.where(and(eq(paymentAttempts.id, attempt.id), eq(paymentAttempts.versao, attempt.versao)))
			.returning({ id: paymentAttempts.id });
		if (!consumed) {
			throw new PaymentTerminalError(409, "PAYMENT_ATTEMPT_INVALID_TRANSITION", "A tentativa foi alterada concorrentemente.", { attemptId: attempt.id });
		}

		await recordPaymentAttemptEvent({
			tx,
			organizationId,
			attemptId: attempt.id,
			origem: "BACKEND",
			tipo: "CONSUMO",
			statusAnterior: "APROVADA_EFETIVACAO_PENDENTE",
			statusPosterior: "CONSUMIDA",
			principalId: params.principalId ?? null,
			usuarioId: params.actorUserId ?? null,
			descricao: `Transação financeira ${transaction.id} efetivada.`,
		});

		return { attemptId: attempt.id, saleId: attempt.vendaId, financialTransactionId: transaction.id, alreadyConsumed: false };
	});

	// Efeitos pós-commit, idênticos aos da efetivação manual (lib/finances/effect-financial-transaction.ts):
	// ambos são idempotentes e nunca podem derrubar o consumo já persistido.
	if (!result.alreadyConsumed) await runPostConsumptionEffects({ organizationId, saleId: result.saleId });

	return result;
}

async function runPostConsumptionEffects({ organizationId, saleId }: { organizationId: string; saleId: string }) {
	try {
		const organization = await db.query.organizations.findFirst({ where: eq(organizations.id, organizationId) });
		if (!organization) return;
		await processSaleCashbackAccumulationIfEligible({ organizationId, saleId, authorId: null });
		await processSaleAutomaticFiscalEmissionIfEligible({ organization, saleId, authorId: null });
	} catch (error) {
		console.error("[payment-attempts] efeitos pós-consumo falharam", { organizationId, saleId, error: error instanceof Error ? error.message : String(error) });
	}
}
