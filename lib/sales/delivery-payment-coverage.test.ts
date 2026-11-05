import assert from "node:assert/strict";
import test from "node:test";
import { resolveDeliveryPaymentCoverage } from "./delivery-payment-coverage";

const settled = new Date("2026-11-04T19:00:00.000Z");

test("fiado em aberto cobre a entrega e nao entra no que sera recebido", () => {
	const result = resolveDeliveryPaymentCoverage({
		saleTotal: 50,
		transactions: [{ id: "fiado", valor: 50, tipo: "ENTRADA", metodo: "FIADO_NOTA", dataEfetivacao: null, provedorStatus: "PENDENTE" }],
	});
	assert.equal(result.isCovered, true);
	assert.equal(result.valorFiadoEmAberto, 50);
	assert.deepEqual(result.transacoesAReceber, []);
});

test("fiado parcial com o restante pendente: so o restante e recebido na entrega", () => {
	const result = resolveDeliveryPaymentCoverage({
		saleTotal: 80,
		transactions: [
			{ id: "fiado", valor: 30, tipo: "ENTRADA", metodo: "FIADO_NOTA", dataEfetivacao: null, provedorStatus: "PENDENTE" },
			{ id: "pix", valor: 50, tipo: "ENTRADA", metodo: "PIX", dataEfetivacao: null, provedorStatus: "PENDENTE" },
		],
	});
	assert.equal(result.isCovered, false);
	assert.equal(result.isCoverableBySettling, true);
	assert.deepEqual(
		result.transacoesAReceber.map((transaction) => transaction.id),
		["pix"],
	);
});

test("pagamento efetivado somado ao fiado cobre a venda", () => {
	const result = resolveDeliveryPaymentCoverage({
		saleTotal: 0.3,
		transactions: [
			{ id: "dinheiro", valor: 0.1, tipo: "ENTRADA", metodo: "DINHEIRO", dataEfetivacao: settled, provedorStatus: "APROVADO" },
			{ id: "fiado", valor: 0.2, tipo: "ENTRADA", metodo: "FIADO_NOTA", dataEfetivacao: null, provedorStatus: "PENDENTE" },
		],
	});
	assert.equal(result.isCovered, true);
});

test("fiado cancelado e saidas nao contam", () => {
	const result = resolveDeliveryPaymentCoverage({
		saleTotal: 40,
		transactions: [
			{ id: "fiado-cancelado", valor: 40, tipo: "ENTRADA", metodo: "FIADO_NOTA", dataEfetivacao: null, provedorStatus: "CANCELADO" },
			{ id: "taxa", valor: 40, tipo: "SAIDA", metodo: "OUTRO", dataEfetivacao: settled, provedorStatus: "APROVADO" },
		],
	});
	assert.equal(result.isCovered, false);
	assert.equal(result.isCoverableBySettling, false);
});
