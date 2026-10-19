import assert from "node:assert/strict";
import test from "node:test";
import type { TPaymentAttemptEvidenceTypeEnum, TPaymentAttemptStatusEnum } from "@/schemas/enums";
import {
	OPEN_PAYMENT_ATTEMPT_STATUSES,
	PROCESSING_STALE_AFTER_MS,
	canTransitionPaymentAttempt,
	isOpenPaymentAttemptStatus,
	resolveEvidenceTransition,
	resolvePaymentAttemptNextAction,
	toCents,
} from "./state-machine";

const ALL_STATUSES: TPaymentAttemptStatusEnum[] = ["CRIADA", "PROCESSANDO", "APROVADA_EFETIVACAO_PENDENTE", "CONSUMIDA", "NAO_APROVADA", "RESULTADO_INCERTO"];

test("não existem transições de volta nem saída de estados terminais", () => {
	for (const from of ["CONSUMIDA", "NAO_APROVADA"] as const) {
		for (const to of ALL_STATUSES) assert.equal(canTransitionPaymentAttempt(from, to), false, `${from} -> ${to}`);
	}
	assert.equal(canTransitionPaymentAttempt("PROCESSANDO", "CRIADA"), false);
	assert.equal(canTransitionPaymentAttempt("APROVADA_EFETIVACAO_PENDENTE", "NAO_APROVADA"), false);
	assert.equal(canTransitionPaymentAttempt("APROVADA_EFETIVACAO_PENDENTE", "CONSUMIDA"), true);
});

test("tudo que vale a partir de PROCESSANDO vale a partir de CRIADA", () => {
	for (const to of ALL_STATUSES) {
		if (canTransitionPaymentAttempt("PROCESSANDO", to)) assert.equal(canTransitionPaymentAttempt("CRIADA", to), true, `CRIADA -> ${to}`);
	}
});

test("estados abertos são exatamente os que aparecem para o terminal", () => {
	assert.deepEqual([...OPEN_PAYMENT_ATTEMPT_STATUSES].sort(), ["APROVADA_EFETIVACAO_PENDENTE", "CRIADA", "PROCESSANDO", "RESULTADO_INCERTO"]);
	assert.equal(isOpenPaymentAttemptStatus("CONSUMIDA"), false);
	assert.equal(isOpenPaymentAttemptStatus("NAO_APROVADA"), false);
});

test("INICIADA só move CRIADA e é ruído em qualquer outro estado", () => {
	assert.deepEqual(resolveEvidenceTransition({ status: "CRIADA", evidenceType: "INICIADA" }), { kind: "TRANSITION", nextStatus: "PROCESSANDO", motivo: null });
	for (const status of ALL_STATUSES.filter((s) => s !== "CRIADA")) {
		assert.deepEqual(resolveEvidenceTransition({ status, evidenceType: "INICIADA" }), { kind: "NOOP" }, status);
	}
});

test("APROVADA aprova a partir de qualquer estado aberto, repete em aprovada/consumida e conflita com não aprovada", () => {
	for (const status of ["CRIADA", "PROCESSANDO", "RESULTADO_INCERTO"] as const) {
		assert.deepEqual(resolveEvidenceTransition({ status, evidenceType: "APROVADA" }), { kind: "TRANSITION", nextStatus: "APROVADA_EFETIVACAO_PENDENTE", motivo: null });
	}
	assert.deepEqual(resolveEvidenceTransition({ status: "APROVADA_EFETIVACAO_PENDENTE", evidenceType: "APROVADA" }), { kind: "NOOP" });
	assert.deepEqual(resolveEvidenceTransition({ status: "CONSUMIDA", evidenceType: "APROVADA" }), { kind: "NOOP" });
	assert.deepEqual(resolveEvidenceTransition({ status: "NAO_APROVADA", motivoAtual: "RECUSADA", evidenceType: "APROVADA" }), { kind: "CONFLICT" });
});

test("recusa, cancelamento e falha colapsam em NAO_APROVADA com o motivo correto", () => {
	const cases: Array<[TPaymentAttemptEvidenceTypeEnum, string]> = [
		["RECUSADA", "RECUSADA"],
		["CANCELADA_PELO_OPERADOR", "CANCELADA"],
		["FALHA_CONCLUSIVA", "FALHA"],
	];
	for (const [evidenceType, motivo] of cases) {
		assert.deepEqual(resolveEvidenceTransition({ status: "PROCESSANDO", evidenceType }), { kind: "TRANSITION", nextStatus: "NAO_APROVADA", motivo });
		assert.deepEqual(resolveEvidenceTransition({ status: "RESULTADO_INCERTO", evidenceType }), { kind: "TRANSITION", nextStatus: "NAO_APROVADA", motivo });
	}
});

test("evidência não aprovada repetida é no-op; com motivo diferente ou após aprovação é conflito", () => {
	assert.deepEqual(resolveEvidenceTransition({ status: "NAO_APROVADA", motivoAtual: "RECUSADA", evidenceType: "RECUSADA" }), { kind: "NOOP" });
	assert.deepEqual(resolveEvidenceTransition({ status: "NAO_APROVADA", motivoAtual: "RECUSADA", evidenceType: "CANCELADA_PELO_OPERADOR" }), { kind: "CONFLICT" });
	assert.deepEqual(resolveEvidenceTransition({ status: "APROVADA_EFETIVACAO_PENDENTE", evidenceType: "RECUSADA" }), { kind: "CONFLICT" });
	assert.deepEqual(resolveEvidenceTransition({ status: "CONSUMIDA", evidenceType: "FALHA_CONCLUSIVA" }), { kind: "CONFLICT" });
});

test("DESCONHECIDA só torna incerto o que ainda não tem resultado conclusivo", () => {
	assert.deepEqual(resolveEvidenceTransition({ status: "CRIADA", evidenceType: "DESCONHECIDA" }), { kind: "TRANSITION", nextStatus: "RESULTADO_INCERTO", motivo: null });
	assert.deepEqual(resolveEvidenceTransition({ status: "PROCESSANDO", evidenceType: "DESCONHECIDA" }), { kind: "TRANSITION", nextStatus: "RESULTADO_INCERTO", motivo: null });
	for (const status of ["RESULTADO_INCERTO", "APROVADA_EFETIVACAO_PENDENTE", "CONSUMIDA", "NAO_APROVADA"] as const) {
		assert.deepEqual(resolveEvidenceTransition({ status, evidenceType: "DESCONHECIDA" }), { kind: "NOOP" }, status);
	}
});

test("nextAction nunca autoriza nova cobrança sem prova conclusiva", () => {
	const now = new Date("2026-08-19T14:10:00.000Z");
	assert.equal(resolvePaymentAttemptNextAction({ status: "CRIADA", now }), "EXECUTAR");
	assert.equal(resolvePaymentAttemptNextAction({ status: "PROCESSANDO", dataInicio: new Date(now.getTime() - 1000), now }), "AGUARDAR");
	assert.equal(resolvePaymentAttemptNextAction({ status: "PROCESSANDO", dataInicio: new Date(now.getTime() - PROCESSING_STALE_AFTER_MS - 1), now }), "RECUPERAR_NO_TERMINAL");
	assert.equal(resolvePaymentAttemptNextAction({ status: "RESULTADO_INCERTO", now }), "RECUPERAR_NO_TERMINAL");
	assert.equal(resolvePaymentAttemptNextAction({ status: "APROVADA_EFETIVACAO_PENDENTE", now }), "AGUARDAR_EFETIVACAO");
	assert.equal(resolvePaymentAttemptNextAction({ status: "CONSUMIDA", now }), "ENCERRAR");
	assert.equal(resolvePaymentAttemptNextAction({ status: "NAO_APROVADA", now }), "INICIAR_NOVA_TENTATIVA");
	// Só CRIADA manda executar.
	for (const status of ALL_STATUSES.filter((s) => s !== "CRIADA")) {
		assert.notEqual(resolvePaymentAttemptNextAction({ status, now }), "EXECUTAR", status);
	}
});

test("conversão para centavos é determinística em valores com ponto flutuante", () => {
	assert.equal(toCents(129.9), 12990);
	assert.equal(toCents(0.1 + 0.2), 30);
	assert.equal(toCents(1.005), 101);
});
