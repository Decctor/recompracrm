import assert from "node:assert/strict";
import test from "node:test";
import type { TPaymentSplit } from "@/lib/payments/types";
import { normalizePaymentsForTerminal, resolvePaymentTerminalAssignment } from "./assignment";
import { PaymentTerminalError } from "./errors";

const card = (overrides: Partial<TPaymentSplit> = {}): TPaymentSplit => ({ metodo: "CARTAO_CREDITO", valor: 100, efetivacaoTipo: "IMEDIATA", ...overrides });

test("sem terminal atribuído não há cobrança na maquininha", () => {
	assert.equal(resolvePaymentTerminalAssignment({ payments: [card(), card({ metodo: "DINHEIRO", valor: 50 })], saleTotal: 150 }), null);
});

test("um único cartão cobrindo o total é atribuível, inclusive parcelado", () => {
	const payment = card({ dispositivoId: "dev-1", totalParcelas: 3, valor: 300.004 });
	const assignment = resolvePaymentTerminalAssignment({ payments: [payment], saleTotal: 300 });
	assert.deepEqual(assignment, { index: 0, dispositivoId: "dev-1", payment });
});

test("split misto, dois terminais, método errado e valor divergente são recusados", () => {
	const cases: TPaymentSplit[][] = [
		[card({ dispositivoId: "dev-1", valor: 50 }), card({ metodo: "DINHEIRO", valor: 50 })],
		[card({ dispositivoId: "dev-1", valor: 50 }), card({ dispositivoId: "dev-2", valor: 50 })],
		[card({ dispositivoId: "dev-1", metodo: "PIX" })],
		[card({ dispositivoId: "dev-1", valor: 99 })],
	];
	for (const payments of cases) {
		assert.throws(() => resolvePaymentTerminalAssignment({ payments, saleTotal: 100 }), (error: unknown) => error instanceof PaymentTerminalError && error.status === 422);
	}
});

test("o pagamento atribuído é normalizado como pendente para agora; os demais ficam intactos", () => {
	const [terminal, cash] = normalizePaymentsForTerminal([card({ dispositivoId: "dev-1", efetivacaoTipo: "IMEDIATA" }), card({ metodo: "DINHEIRO" })]);
	assert.equal(terminal.efetivacaoTipo, "PENDENTE");
	assert.ok(terminal.dataPrevisao instanceof Date);
	assert.equal(cash.efetivacaoTipo, "IMEDIATA");
	assert.equal(cash.dataPrevisao, undefined);
});
