import type {
	TPaymentAttemptEvidenceTypeEnum,
	TPaymentAttemptNextActionEnum,
	TPaymentAttemptNotApprovedReasonEnum,
	TPaymentAttemptStatusEnum,
} from "@/schemas/enums";

// Máquina de estados da tentativa (recompracrm-pos-android/docs/03). Pura: sem banco, sem HTTP.
// Não existem transições de volta. Repetir a mesma evidência é no-op; evidência conflitante é
// conflito (409 + evento de auditoria), nunca sobrescreve o estado.

// Estados em que a cobrança ainda aparece para o terminal e bloqueia edição da venda.
export const OPEN_PAYMENT_ATTEMPT_STATUSES = ["CRIADA", "PROCESSANDO", "RESULTADO_INCERTO", "APROVADA_EFETIVACAO_PENDENTE"] as const satisfies readonly TPaymentAttemptStatusEnum[];

export function isOpenPaymentAttemptStatus(status: TPaymentAttemptStatusEnum) {
	return (OPEN_PAYMENT_ATTEMPT_STATUSES as readonly TPaymentAttemptStatusEnum[]).includes(status);
}

const TRANSITIONS: Record<TPaymentAttemptStatusEnum, readonly TPaymentAttemptStatusEnum[]> = {
	CRIADA: ["PROCESSANDO", "APROVADA_EFETIVACAO_PENDENTE", "NAO_APROVADA", "RESULTADO_INCERTO"],
	// `INICIADA` é best-effort, então tudo que vale a partir de PROCESSANDO vale a partir de CRIADA.
	PROCESSANDO: ["APROVADA_EFETIVACAO_PENDENTE", "NAO_APROVADA", "RESULTADO_INCERTO"],
	RESULTADO_INCERTO: ["APROVADA_EFETIVACAO_PENDENTE", "NAO_APROVADA"],
	APROVADA_EFETIVACAO_PENDENTE: ["CONSUMIDA"],
	CONSUMIDA: [],
	NAO_APROVADA: [],
};

export function canTransitionPaymentAttempt(from: TPaymentAttemptStatusEnum, to: TPaymentAttemptStatusEnum) {
	return TRANSITIONS[from].includes(to);
}

export type TEvidenceResolution =
	| { kind: "TRANSITION"; nextStatus: TPaymentAttemptStatusEnum; motivo: TPaymentAttemptNotApprovedReasonEnum | null }
	| { kind: "NOOP" }
	| { kind: "CONFLICT" };

const NOT_APPROVED_REASON_BY_EVIDENCE: Partial<Record<TPaymentAttemptEvidenceTypeEnum, TPaymentAttemptNotApprovedReasonEnum>> = {
	RECUSADA: "RECUSADA",
	CANCELADA_PELO_OPERADOR: "CANCELADA",
	FALHA_CONCLUSIVA: "FALHA",
};

// Deriva o que uma evidência do terminal faz com a tentativa no estado atual. O terminal nunca
// escolhe o status: ele descreve o que viu e o backend decide.
export function resolveEvidenceTransition({
	status,
	motivoAtual,
	evidenceType,
}: {
	status: TPaymentAttemptStatusEnum;
	motivoAtual?: TPaymentAttemptNotApprovedReasonEnum | null;
	evidenceType: TPaymentAttemptEvidenceTypeEnum;
}): TEvidenceResolution {
	switch (evidenceType) {
		case "INICIADA":
			// Chega de forma assíncrona e pode cruzar com o outcome: fora de CRIADA é apenas ruído.
			return status === "CRIADA" ? { kind: "TRANSITION", nextStatus: "PROCESSANDO", motivo: null } : { kind: "NOOP" };
		case "APROVADA":
			if (status === "APROVADA_EFETIVACAO_PENDENTE" || status === "CONSUMIDA") return { kind: "NOOP" };
			if (canTransitionPaymentAttempt(status, "APROVADA_EFETIVACAO_PENDENTE")) {
				return { kind: "TRANSITION", nextStatus: "APROVADA_EFETIVACAO_PENDENTE", motivo: null };
			}
			return { kind: "CONFLICT" };
		case "RECUSADA":
		case "CANCELADA_PELO_OPERADOR":
		case "FALHA_CONCLUSIVA": {
			const motivo = NOT_APPROVED_REASON_BY_EVIDENCE[evidenceType] ?? "FALHA";
			if (status === "NAO_APROVADA") return motivoAtual === motivo ? { kind: "NOOP" } : { kind: "CONFLICT" };
			if (canTransitionPaymentAttempt(status, "NAO_APROVADA")) return { kind: "TRANSITION", nextStatus: "NAO_APROVADA", motivo };
			return { kind: "CONFLICT" };
		}
		case "DESCONHECIDA":
			// Um resultado inconclusivo nunca desfaz um conclusivo: só CRIADA/PROCESSANDO viram incertas.
			return canTransitionPaymentAttempt(status, "RESULTADO_INCERTO") ? { kind: "TRANSITION", nextStatus: "RESULTADO_INCERTO", motivo: null } : { kind: "NOOP" };
	}
}

// Tempo sem outcome após `INICIADA` a partir do qual a tentativa deixa de ser "aguardando" e
// passa a exigir recuperação no terminal (journal local ou conciliação) em vez de nova cobrança.
export const PROCESSING_STALE_AFTER_MS = 5 * 60 * 1000;

// Traduz o estado em comando para o terminal. A interface traduz `nextAction`, nunca inventa um
// estado — e em nenhum caso um estado aberto sem prova conclusiva autoriza nova cobrança.
export function resolvePaymentAttemptNextAction({
	status,
	dataInicio,
	now = new Date(),
}: {
	status: TPaymentAttemptStatusEnum;
	dataInicio?: Date | null;
	now?: Date;
}): TPaymentAttemptNextActionEnum {
	switch (status) {
		case "CRIADA":
			return "EXECUTAR";
		case "PROCESSANDO": {
			const startedAt = dataInicio?.getTime() ?? now.getTime();
			return now.getTime() - startedAt > PROCESSING_STALE_AFTER_MS ? "RECUPERAR_NO_TERMINAL" : "AGUARDAR";
		}
		case "RESULTADO_INCERTO":
			return "RECUPERAR_NO_TERMINAL";
		case "APROVADA_EFETIVACAO_PENDENTE":
			return "AGUARDAR_EFETIVACAO";
		case "CONSUMIDA":
			return "ENCERRAR";
		case "NAO_APROVADA":
			return "INICIAR_NOVA_TENTATIVA";
	}
}

// Nova tentativa só é permitida quando a anterior encerrou sem aprovação — e sempre de forma
// deliberada, pela plataforma: o terminal nunca recobra sozinho.
export function isNewPaymentAttemptAllowed(status: TPaymentAttemptStatusEnum) {
	return status === "NAO_APROVADA";
}

// Conversão determinística reais → centavos para o comando do terminal (invariante 2 de docs/03).
export function toCents(valor: number) {
	// `toPrecision` absorve o ruído binário (1.005 * 100 = 100.49999…) antes do arredondamento.
	return Math.round(Number((valor * 100).toPrecision(15)));
}
