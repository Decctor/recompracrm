import assert from "node:assert/strict";
import test from "node:test";
import { classifyPaymentTerminalPendency } from "./payment-terminal-pendencies";

test("charges still running on the terminal block the cash session close", () => {
	for (const status of ["CRIADA", "PROCESSANDO", "APROVADA_EFETIVACAO_PENDENTE"] as const) {
		assert.deepEqual(classifyPaymentTerminalPendency({ status, transacaoPendente: true }), { tipo: "EM_ANDAMENTO", bloqueiaFechamento: true }, status);
	}
});

test("uncertain results warn without blocking: reconciliation can outlive the shift", () => {
	assert.deepEqual(classifyPaymentTerminalPendency({ status: "RESULTADO_INCERTO", transacaoPendente: true }), { tipo: "INCERTA", bloqueiaFechamento: false });
});

test("a declined charge is a pendency only while its transaction is still pending", () => {
	assert.deepEqual(classifyPaymentTerminalPendency({ status: "NAO_APROVADA", transacaoPendente: true }), { tipo: "NAO_APROVADA_PENDENTE", bloqueiaFechamento: false });
	assert.equal(classifyPaymentTerminalPendency({ status: "NAO_APROVADA", transacaoPendente: false }), null);
});

test("a consumed attempt is received money, not a pendency", () => {
	assert.equal(classifyPaymentTerminalPendency({ status: "CONSUMIDA", transacaoPendente: false }), null);
});
