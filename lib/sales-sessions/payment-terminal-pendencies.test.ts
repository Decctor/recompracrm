import assert from "node:assert/strict";
import test from "node:test";
import { classifyPaymentTerminalPendency, selectSessionPaymentAttempts } from "./payment-terminal-pendencies";

test("a consumed card leg never hides another leg still processing, including tied timestamps", () => {
	const rows = [
		{ id: "consumed", transacaoFinanceiraId: "card-1", status: "CONSUMIDA" as const },
		{ id: "processing", transacaoFinanceiraId: "card-2", status: "PROCESSANDO" as const },
		{ id: "old-declined", transacaoFinanceiraId: "card-2", status: "NAO_APROVADA" as const },
	];
	for (const ordered of [rows, [...rows].reverse()]) {
		const attempts = selectSessionPaymentAttempts(ordered);
		assert.equal(attempts.length, 2);
		assert.equal(
			attempts.filter((row) => classifyPaymentTerminalPendency({ status: row.status, transacaoPendente: true })?.bloqueiaFechamento).length,
			1,
		);
	}
});

test("charges still running on the terminal block the cash session close", () => {
	for (const status of ["CRIADA", "PROCESSANDO", "APROVADA_EFETIVACAO_PENDENTE"] as const) {
		assert.deepEqual(classifyPaymentTerminalPendency({ status, transacaoPendente: true }), { tipo: "EM_ANDAMENTO", bloqueiaFechamento: true }, status);
	}
});

test("uncertain results warn without blocking: reconciliation can outlive the shift", () => {
	assert.deepEqual(classifyPaymentTerminalPendency({ status: "RESULTADO_INCERTO", transacaoPendente: true }), {
		tipo: "INCERTA",
		bloqueiaFechamento: false,
	});
});

test("a declined charge is a pendency only while its transaction is still pending", () => {
	assert.deepEqual(classifyPaymentTerminalPendency({ status: "NAO_APROVADA", transacaoPendente: true }), {
		tipo: "NAO_APROVADA_PENDENTE",
		bloqueiaFechamento: false,
	});
	assert.equal(classifyPaymentTerminalPendency({ status: "NAO_APROVADA", transacaoPendente: false }), null);
});

test("a consumed attempt is received money, not a pendency", () => {
	assert.equal(classifyPaymentTerminalPendency({ status: "CONSUMIDA", transacaoPendente: false }), null);
});
