import type { TPaymentAttemptNextActionEnum, TPaymentAttemptStatusEnum } from "@/schemas/enums";
import type { TPaymentAttemptEvidence } from "@/schemas/payment-attempts";
import { db } from "@/services/drizzle";
import { type TPaymentAttemptSanitizedResult, paymentAttemptEvents, paymentAttempts } from "@/services/drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import { consumeApprovedPaymentAttempt } from "./consume";
import { PaymentTerminalError } from "./errors";
import { fingerprintPaymentAttemptEvidence, sanitizePaymentAttemptEvidence, validateApprovedEvidence } from "./evidence";
import { recordPaymentAttemptEvent } from "./events";
import { resolveEvidenceTransition } from "./state-machine";
import { buildAttemptStatusView, findPaymentAttemptForDevice } from "./views";

export type TReportPaymentAttemptEvidenceParams = {
	organizationId: string;
	deviceId: string;
	attemptId: string;
	idempotencyKey: string;
	evidence: TPaymentAttemptEvidence;
};

type TTransitionOutcome =
	| { kind: "TRANSITIONED"; status: TPaymentAttemptStatusEnum }
	| { kind: "REPLAY"; status: TPaymentAttemptStatusEnum }
	| { kind: "NOOP"; status: TPaymentAttemptStatusEnum }
	| { kind: "CONFLICT"; status: TPaymentAttemptStatusEnum }
	| { kind: "MISMATCH"; status: TPaymentAttemptStatusEnum; reason: string };

// Registra a evidência do terminal e deriva a transição (docs/04 §2). Ordem:
// 1. sanitizar + fingerprint; 2. em transação: lock da tentativa, idempotência por chave,
//    resolução da máquina de estados, CAS por `versao`, evento append-only; 3. fora da transação,
//    no caminho aprovado, tentar o consumo (efetivação) — falha vira 202 AGUARDAR_EFETIVACAO, nunca
//    reabre a adquirente; 4. responder com `nextAction`.
export async function reportPaymentAttemptEvidence({ organizationId, deviceId, attemptId, idempotencyKey, evidence }: TReportPaymentAttemptEvidenceParams) {
	const sanitized = sanitizePaymentAttemptEvidence(evidence);
	const fingerprint = fingerprintPaymentAttemptEvidence(sanitized);

	const outcome = await db.transaction(async (tx): Promise<TTransitionOutcome> => {
		const [attempt] = await tx
			.select()
			.from(paymentAttempts)
			.where(and(eq(paymentAttempts.id, attemptId), eq(paymentAttempts.organizacaoId, organizationId), eq(paymentAttempts.dispositivoId, deviceId)))
			.for("update");
		if (!attempt) {
			throw new PaymentTerminalError(404, "PAYMENT_ATTEMPT_NOT_FOUND", "Cobrança não encontrada ou não atribuída a este terminal.", { attemptId });
		}

		// Idempotência do comando: mesma chave + mesmo payload = replay silencioso do estado atual;
		// mesma chave + payload diferente = reuso indevido.
		const previous = await tx.query.paymentAttemptEvents.findFirst({
			where: and(eq(paymentAttemptEvents.tentativaId, attempt.id), eq(paymentAttemptEvents.chaveIdempotencia, idempotencyKey)),
			columns: { id: true, fingerprintEntrada: true },
		});
		if (previous) {
			if (previous.fingerprintEntrada !== fingerprint) {
				throw new PaymentTerminalError(409, "IDEMPOTENCY_KEY_REUSED", "A chave de idempotência já foi usada com outra evidência.", { attemptId: attempt.id });
			}
			return { kind: "REPLAY", status: attempt.status };
		}

		const resolution = resolveEvidenceTransition({ status: attempt.status, motivoAtual: attempt.motivoNaoAprovacao, evidenceType: evidence.tipo });
		const eventBase = {
			tx,
			organizationId,
			attemptId: attempt.id,
			origem: "DISPOSITIVO" as const,
			principalId: deviceId,
			evidenciaSanitizada: sanitized,
			chaveIdempotencia: idempotencyKey,
			fingerprintEntrada: fingerprint,
		};

		if (resolution.kind === "CONFLICT") {
			// O evento é persistido ANTES de responder 409: conflito gera auditoria e conciliação,
			// nunca sobrescreve silenciosamente o estado.
			await recordPaymentAttemptEvent({
				...eventBase,
				tipo: "EVIDENCIA_CONFLITANTE",
				statusAnterior: attempt.status,
				statusPosterior: attempt.status,
				descricao: `Evidência ${evidence.tipo} incompatível com o estado ${attempt.status}.`,
			});
			return { kind: "CONFLICT", status: attempt.status };
		}

		if (resolution.kind === "NOOP") {
			await recordPaymentAttemptEvent({ ...eventBase, tipo: "EVIDENCIA_REPETIDA", statusAnterior: attempt.status, statusPosterior: attempt.status });
			return { kind: "NOOP", status: attempt.status };
		}

		let nextStatus = resolution.nextStatus;
		let motivo = resolution.motivo;
		let mismatchReason: string | null = null;
		if (nextStatus === "APROVADA_EFETIVACAO_PENDENTE") {
			const validation = validateApprovedEvidence({
				attempt: { valor: attempt.valor, totalParcelas: attempt.totalParcelas, ordemProvedorId: attempt.ordemProvedorId },
				evidence: sanitized,
			});
			if (!validation.ok) {
				// A adquirente pode ter aprovado algo diferente do que pedimos: isso bloqueia nova
				// cobrança e exige conciliação — RESULTADO_INCERTO, nunca aprovação nem recusa.
				mismatchReason = validation.reason;
				nextStatus = "RESULTADO_INCERTO";
				motivo = null;
			}
		}

		const now = new Date();
		const [updated] = await tx
			.update(paymentAttempts)
			.set({
				status: nextStatus,
				motivoNaoAprovacao: motivo,
				versao: sql`${paymentAttempts.versao} + 1`,
				resultadoSanitizado: sanitized,
				dataInicio: attempt.dataInicio ?? now,
				dataConclusao: nextStatus === "NAO_APROVADA" ? now : attempt.dataConclusao,
				...(nextStatus === "APROVADA_EFETIVACAO_PENDENTE" ? approvedColumns(sanitized) : {}),
				...(nextStatus === "NAO_APROVADA" ? { erroCodigo: sanitized.codigoResposta ?? evidence.tipo, erroMensagem: sanitized.mensagem } : {}),
				...(mismatchReason ? { erroCodigo: "PAYMENT_RESULT_MISMATCH", erroMensagem: mismatchReason } : {}),
			})
			.where(and(eq(paymentAttempts.id, attempt.id), eq(paymentAttempts.versao, attempt.versao)))
			.returning({ id: paymentAttempts.id });
		if (!updated) {
			throw new PaymentTerminalError(409, "PAYMENT_ATTEMPT_INVALID_TRANSITION", "A cobrança foi alterada concorrentemente. Consulte o estado atual.", { attemptId: attempt.id });
		}

		await recordPaymentAttemptEvent({
			...eventBase,
			tipo: "EVIDENCIA",
			statusAnterior: attempt.status,
			statusPosterior: nextStatus,
			descricao: mismatchReason,
		});

		if (mismatchReason) return { kind: "MISMATCH", status: nextStatus, reason: mismatchReason };
		return { kind: "TRANSITIONED", status: nextStatus };
	});

	if (outcome.kind === "CONFLICT") {
		throw new PaymentTerminalError(409, "PAYMENT_ATTEMPT_INVALID_TRANSITION", `A evidência ${evidence.tipo} não é compatível com o estado atual da cobrança (${outcome.status}).`, {
			attemptId,
		});
	}
	if (outcome.kind === "MISMATCH") {
		throw new PaymentTerminalError(422, "PAYMENT_RESULT_MISMATCH", `${outcome.reason} O resultado do pagamento precisa ser conciliado. Não realize nova cobrança.`, { attemptId });
	}

	// Caminho aprovado (novo, repetido ou replay): efetivar fora da transação da evidência. Se
	// falhar, a aprovação permanece e o terminal recebe 202 para aguardar — nunca reabrir a Stone.
	let effectuationFailed = false;
	if (outcome.status === "APROVADA_EFETIVACAO_PENDENTE") {
		try {
			await consumeApprovedPaymentAttempt({ organizationId, paymentAttemptId: attemptId, principalId: deviceId });
		} catch (error) {
			effectuationFailed = true;
			console.error("[payment-attempts] efetivação após aprovação falhou", {
				attemptId,
				organizationId,
				error: error instanceof Error ? error.message : String(error),
			});
			await recordEffectuationFailure({ organizationId, attemptId, deviceId, error });
		}
	}

	const current = await findPaymentAttemptForDevice({ organizationId, deviceId, attemptId });
	const view = buildAttemptStatusView(current);
	const httpStatus = view.nextAction === "AGUARDAR_EFETIVACAO" ? 202 : 200;
	return {
		httpStatus,
		result: {
			data: view,
			message: messageFor({ status: current.status, nextAction: view.nextAction, evidenceType: evidence.tipo, effectuationFailed }),
		},
	};
}
export type TReportPaymentAttemptEvidenceOutput = Awaited<ReturnType<typeof reportPaymentAttemptEvidence>>["result"];

function approvedColumns(sanitized: TPaymentAttemptSanitizedResult) {
	return {
		provedorStatus: sanitized.provedorStatus,
		itkProvedor: sanitized.itk,
		atkProvedor: sanitized.atk,
		codigoResposta: sanitized.codigoResposta,
		codigoAutorizacao: sanitized.codigoAutorizacao,
		bandeira: sanitized.bandeira,
		panMascarado: sanitized.panMascarado,
		modoEntrada: sanitized.modoEntrada,
		valorAutorizado: sanitized.valorAutorizado,
		dataAutorizacaoProvedor: sanitized.dataAutorizacao ? new Date(sanitized.dataAutorizacao) : null,
		erroCodigo: null,
		erroMensagem: null,
	};
}

async function recordEffectuationFailure({ organizationId, attemptId, deviceId, error }: { organizationId: string; attemptId: string; deviceId: string; error: unknown }) {
	try {
		await db.transaction((tx) =>
			recordPaymentAttemptEvent({
				tx,
				organizationId,
				attemptId,
				origem: "BACKEND",
				tipo: "FALHA_EFETIVACAO",
				statusAnterior: "APROVADA_EFETIVACAO_PENDENTE",
				statusPosterior: "APROVADA_EFETIVACAO_PENDENTE",
				principalId: deviceId,
				descricao: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
			}),
		);
	} catch {
		// Best-effort: o log estruturado acima já registrou a falha.
	}
}

function messageFor({
	status,
	nextAction,
	evidenceType,
	effectuationFailed,
}: {
	status: TPaymentAttemptStatusEnum;
	nextAction: TPaymentAttemptNextActionEnum;
	evidenceType: TPaymentAttemptEvidence["tipo"];
	effectuationFailed: boolean;
}) {
	if (status === "CONSUMIDA") return "Pagamento aprovado e transação efetivada com sucesso.";
	if (nextAction === "AGUARDAR_EFETIVACAO") return effectuationFailed ? "Pagamento aprovado. A efetivação será retomada." : "Pagamento aprovado. Aguardando efetivação.";
	if (status === "RESULTADO_INCERTO") return "O resultado do pagamento ainda precisa ser conciliado. Não realize nova cobrança.";
	if (status === "NAO_APROVADA") return "Pagamento não aprovado.";
	if (evidenceType === "INICIADA") return "Início da cobrança registrado.";
	return "Evidência registrada.";
}
