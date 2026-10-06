import type { DBTransaction } from "@/services/drizzle";
import { paymentAttempts } from "@/services/drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import { PaymentTerminalError } from "./errors";
import { recordPaymentAttemptEvent } from "./events";

export type TCancelPaymentAttemptFromPlatformParams = {
	tx: DBTransaction;
	organizationId: string;
	attemptId: string;
	userId?: string | null;
	// Troca de método, reatribuição de dispositivo, cancelamento da venda — vai para o evento.
	motivo: string;
};

// A plataforma só cancela tentativa em CRIADA (decisão 6 de docs/10): a partir de PROCESSANDO a
// resolução vem do terminal ou da conciliação. CAS no status resolve a corrida com o outcome do
// terminal — quem perde recebe 409 e a tentativa simplesmente some da listagem do dispositivo.
export async function cancelPaymentAttemptFromPlatform({ tx, organizationId, attemptId, userId, motivo }: TCancelPaymentAttemptFromPlatformParams) {
	const now = new Date();
	const [cancelled] = await tx
		.update(paymentAttempts)
		.set({
			status: "NAO_APROVADA",
			motivoNaoAprovacao: "CANCELADA",
			erroCodigo: "CANCELADA_PELA_PLATAFORMA",
			erroMensagem: motivo,
			dataConclusao: now,
			versao: sql`${paymentAttempts.versao} + 1`,
		})
		.where(and(eq(paymentAttempts.id, attemptId), eq(paymentAttempts.organizacaoId, organizationId), eq(paymentAttempts.status, "CRIADA")))
		.returning({ id: paymentAttempts.id, vendaId: paymentAttempts.vendaId, transacaoFinanceiraId: paymentAttempts.transacaoFinanceiraId });

	if (!cancelled) {
		throw new PaymentTerminalError(409, "PAYMENT_ATTEMPT_INVALID_TRANSITION", "A cobrança já foi iniciada no terminal e não pode mais ser cancelada pela plataforma.", {
			attemptId,
		});
	}

	await recordPaymentAttemptEvent({
		tx,
		organizationId,
		attemptId,
		origem: "PLATAFORMA",
		tipo: "CANCELAMENTO_PLATAFORMA",
		statusAnterior: "CRIADA",
		statusPosterior: "NAO_APROVADA",
		usuarioId: userId ?? null,
		descricao: motivo,
	});

	return cancelled;
}
