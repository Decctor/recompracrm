import assert from "node:assert/strict";
import test from "node:test";
import { PaymentTerminalError } from "./errors";
import { type TTerminalPaymentMethodView, resolveTerminalSalePayments } from "./terminal-payments";

const methods: TTerminalPaymentMethodView[] = [
	{ metodo: "DINHEIRO", rotulo: "Dinheiro", maxParcelas: 1, executaNaMaquininha: false, exigeCliente: false, permiteTroco: true, efetivacao: "IMEDIATA", prazoPadraoDias: 0 },
	{ metodo: "PIX", rotulo: "Pix", maxParcelas: 1, executaNaMaquininha: false, exigeCliente: false, permiteTroco: false, efetivacao: "IMEDIATA", prazoPadraoDias: 0 },
	{ metodo: "CARTAO_DEBITO", rotulo: "Cartão de débito", maxParcelas: 1, executaNaMaquininha: true, exigeCliente: false, permiteTroco: false, efetivacao: "PENDENTE", prazoPadraoDias: 0 },
	{ metodo: "CARTAO_CREDITO", rotulo: "Cartão de crédito", maxParcelas: 6, executaNaMaquininha: true, exigeCliente: false, permiteTroco: false, efetivacao: "PENDENTE", prazoPadraoDias: 0 },
	{ metodo: "FIADO_NOTA", rotulo: "Fiado / nota", maxParcelas: 1, executaNaMaquininha: false, exigeCliente: true, permiteTroco: false, efetivacao: "PENDENTE", prazoPadraoDias: 30 },
];
const base = { saleTotal: 80.8, deviceId: "dev-1", hasClient: false, methods, today: "2026-10-08" };

function rejects(payments: Parameters<typeof resolveTerminalSalePayments>[0]["payments"], code: string, overrides: Partial<typeof base> = {}) {
	assert.throws(
		() => resolveTerminalSalePayments({ ...base, ...overrides, payments }),
		(error: unknown) => error instanceof PaymentTerminalError && error.status === 422 && error.code === code,
	);
}

test("dinheiro acima do total vira troco e entra pelo valor entregue", () => {
	const result = resolveTerminalSalePayments({ ...base, payments: [{ metodo: "DINHEIRO", valor: 100 }] });
	assert.equal(result.troco, 19.2);
	assert.equal(result.terminal, false);
	assert.equal(result.splits.length, 1);
	assert.equal(result.splits[0].valor, 100);
	assert.equal(result.splits[0].efetivacaoTipo, "IMEDIATA");
	assert.equal(result.splits[0].dispositivoId, null);
});

test("dinheiro, Pix e fiado combinam; o fiado recebe o prazo padrão quando não informado", () => {
	const result = resolveTerminalSalePayments({ ...base, hasClient: true, payments: [{ metodo: "DINHEIRO", valor: 30 }, { metodo: "PIX", valor: 20.8 }, { metodo: "FIADO_NOTA", valor: 30 }] });
	assert.equal(result.troco, 0);
	assert.deepEqual(
		result.splits.map((split) => [split.metodo, split.efetivacaoTipo, split.dataPrevisao]),
		[
			["DINHEIRO", "IMEDIATA", "2026-10-08"],
			["PIX", "IMEDIATA", "2026-10-08"],
			["FIADO_NOTA", "PENDENTE", "2026-11-07"],
		],
	);
});

test("fiado aceita prazo explícito, mas não no passado nem sem cliente", () => {
	const result = resolveTerminalSalePayments({ ...base, hasClient: true, payments: [{ metodo: "FIADO_NOTA", valor: 80.8, dataPrevisao: "2026-10-15" }] });
	assert.equal(result.splits[0].dataPrevisao, "2026-10-15");
	rejects([{ metodo: "FIADO_NOTA", valor: 80.8, dataPrevisao: "2026-10-01" }], "VALIDATION_ERROR", { hasClient: true });
	rejects([{ metodo: "FIADO_NOTA", valor: 80.8 }], "UNSUPPORTED_PAYMENT_OPERATION");
});

test("cartão é perna única e exata, atribuída ao dispositivo como pendente", () => {
	const result = resolveTerminalSalePayments({ ...base, payments: [{ metodo: "CARTAO_CREDITO", valor: 80.8, totalParcelas: 3 }] });
	assert.equal(result.terminal, true);
	assert.equal(result.splits[0].dispositivoId, "dev-1");
	assert.equal(result.splits[0].efetivacaoTipo, "PENDENTE");
	assert.equal(result.splits[0].totalParcelas, 3);
	rejects([{ metodo: "CARTAO_CREDITO", valor: 50 }, { metodo: "DINHEIRO", valor: 30.8 }], "UNSUPPORTED_PAYMENT_OPERATION");
	rejects([{ metodo: "CARTAO_DEBITO", valor: 100 }], "UNSUPPORTED_PAYMENT_OPERATION");
	rejects([{ metodo: "CARTAO_DEBITO", valor: 80.8, totalParcelas: 2 }], "UNSUPPORTED_PAYMENT_OPERATION");
	rejects([{ metodo: "CARTAO_CREDITO", valor: 80.8, totalParcelas: 12 }], "UNSUPPORTED_PAYMENT_OPERATION");
});

test("falta de valor, troco sobre Pix e troco com fiado são recusados", () => {
	rejects([{ metodo: "DINHEIRO", valor: 50 }], "VALIDATION_ERROR");
	rejects([{ metodo: "PIX", valor: 100 }], "UNSUPPORTED_PAYMENT_OPERATION");
	rejects([{ metodo: "DINHEIRO", valor: 60 }, { metodo: "FIADO_NOTA", valor: 40 }], "UNSUPPORTED_PAYMENT_OPERATION", { hasClient: true });
});

test("método fora do recorte do terminal ou não suportado pela loja é recusado", () => {
	rejects([{ metodo: "BOLETO", valor: 80.8 }], "UNSUPPORTED_PAYMENT_OPERATION");
	rejects([{ metodo: "PIX", valor: 80.8 }], "UNSUPPORTED_PAYMENT_OPERATION", { methods: methods.filter((method) => method.metodo !== "PIX") });
	rejects([], "VALIDATION_ERROR");
	rejects([{ metodo: "DINHEIRO", valor: 0 }], "VALIDATION_ERROR");
});
