import type { TPaymentAttemptEventOriginEnum, TPaymentAttemptEventTypeEnum, TPaymentAttemptStatusEnum } from "@/schemas/enums";
import type { DBTransaction } from "@/services/drizzle";
import { type TPaymentAttemptSanitizedResult, paymentAttemptEvents } from "@/services/drizzle/schema";

export type TRecordPaymentAttemptEventParams = {
	tx: DBTransaction;
	organizationId: string;
	attemptId: string;
	origem: TPaymentAttemptEventOriginEnum;
	tipo: TPaymentAttemptEventTypeEnum;
	statusAnterior: TPaymentAttemptStatusEnum | null;
	statusPosterior: TPaymentAttemptStatusEnum;
	principalId?: string | null;
	usuarioId?: string | null;
	evidenciaSanitizada?: TPaymentAttemptSanitizedResult | null;
	chaveIdempotencia?: string | null;
	fingerprintEntrada?: string | null;
	descricao?: string | null;
};

// Append-only; sempre dentro da mesma transação da mudança que descreve. Nunca é fonte do estado.
export async function recordPaymentAttemptEvent(params: TRecordPaymentAttemptEventParams) {
	const { tx, organizationId, attemptId, ...rest } = params;
	await tx.insert(paymentAttemptEvents).values({
		organizacaoId: organizationId,
		tentativaId: attemptId,
		origem: rest.origem,
		tipo: rest.tipo,
		statusAnterior: rest.statusAnterior,
		statusPosterior: rest.statusPosterior,
		principalId: rest.principalId ?? null,
		usuarioId: rest.usuarioId ?? null,
		evidenciaSanitizada: rest.evidenciaSanitizada ?? null,
		chaveIdempotencia: rest.chaveIdempotencia ?? null,
		fingerprintEntrada: rest.fingerprintEntrada ?? null,
		descricao: rest.descricao ?? null,
	});
}
