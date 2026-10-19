import assert from "node:assert/strict";
import test from "node:test";
import type { TPaymentSplit } from "@/lib/payments/types";
import { normalizePaymentsForTerminal, resolvePaymentTerminalAssignments } from "./assignment";
import { PaymentTerminalError } from "./errors";

const card = (overrides: Partial<TPaymentSplit> = {}): TPaymentSplit => ({
	metodo: "CARTAO_CREDITO",
	valor: 100,
	efetivacaoTipo: "IMEDIATA",
	...overrides,
});

test("sem terminal atribuído não há cobrança na maquininha", () => {
	assert.deepEqual(resolvePaymentTerminalAssignments({ payments: [card(), card({ metodo: "DINHEIRO", valor: 50 })], saleTotal: 150 }), []);
});

test("um cartão cobrindo o total é atribuível, inclusive parcelado", () => {
	const payment = card({ dispositivoId: "dev-1", totalParcelas: 3, valor: 300.004 });
	assert.deepEqual(resolvePaymentTerminalAssignments({ payments: [payment], saleTotal: 300 }), [{ index: 0, dispositivoId: "dev-1", payment }]);
});

test("cartão combina com dinheiro e com outro cartão: uma atribuição por perna, na ordem", () => {
	const cash = card({ metodo: "DINHEIRO", valor: 30 });
	const credit = card({ dispositivoId: "dev-1", valor: 50 });
	const debit = card({ dispositivoId: "dev-1", metodo: "CARTAO_DEBITO", valor: 20 });
	const assignments = resolvePaymentTerminalAssignments({ payments: [cash, credit, debit], saleTotal: 100 });
	assert.deepEqual(
		assignments.map((assignment) => [assignment.index, assignment.payment.metodo]),
		[
			[1, "CARTAO_CREDITO"],
			[2, "CARTAO_DEBITO"],
		],
	);
});

test("dois terminais, método errado e cartão acima do total são recusados", () => {
	const cases: TPaymentSplit[][] = [
		[card({ dispositivoId: "dev-1", valor: 50 }), card({ dispositivoId: "dev-2", valor: 50 })],
		[card({ dispositivoId: "dev-1", metodo: "PIX" })],
		[card({ dispositivoId: "dev-1", valor: 99 }), card({ dispositivoId: "dev-1", valor: 2 })],
		Array.from({ length: 5 }, () => card({ dispositivoId: "dev-1", valor: 20 })),
	];
	for (const payments of cases) {
		assert.throws(
			() => resolvePaymentTerminalAssignments({ payments, saleTotal: 100 }),
			(error: unknown) => error instanceof PaymentTerminalError && error.status === 422,
		);
	}
});

test("o pagamento atribuído é normalizado como pendente para agora; os demais ficam intactos", () => {
	const [terminal, cash] = normalizePaymentsForTerminal([card({ dispositivoId: "dev-1", efetivacaoTipo: "IMEDIATA" }), card({ metodo: "DINHEIRO" })]);
	assert.equal(terminal.efetivacaoTipo, "PENDENTE");
	assert.ok(terminal.dataPrevisao instanceof Date);
	assert.equal(cash.efetivacaoTipo, "IMEDIATA");
	assert.equal(cash.dataPrevisao, undefined);
});
