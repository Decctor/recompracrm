import assert from "node:assert/strict";
import test from "node:test";
import { getSaleChangeTotal, isSaleChangeTransaction, netSaleChangeFromPayments, resolveSaleChange } from "./sale-change";

test("sem excesso nao ha troco", () => {
	const result = resolveSaleChange({ payments: [{ metodo: "DINHEIRO", valor: 37, efetivacaoTipo: "IMEDIATA" }], saleTotal: 37 });
	assert.equal(result.troco, 0);
	assert.equal(result.bloqueio, null);
	assert.equal(result.cobertoPorDinheiro, true);
});

test("dinheiro a maior vira troco coberto por dinheiro", () => {
	const result = resolveSaleChange({ payments: [{ metodo: "DINHEIRO", valor: 50, efetivacaoTipo: "IMEDIATA" }], saleTotal: 37 });
	assert.equal(result.troco, 13);
	assert.equal(result.bloqueio, null);
	assert.equal(result.cobertoPorDinheiro, true);
});

test("excesso pago no cartao gera troco, mas nao coberto por dinheiro", () => {
	const result = resolveSaleChange({ payments: [{ metodo: "CARTAO_CREDITO", valor: 50, efetivacaoTipo: "IMEDIATA" }], saleTotal: 37 });
	assert.equal(result.troco, 13);
	assert.equal(result.bloqueio, null);
	assert.equal(result.cobertoPorDinheiro, false);
});

test("dinheiro cobrindo so parte do troco nao conta como coberto", () => {
	const result = resolveSaleChange({
		payments: [
			{ metodo: "CARTAO_DEBITO", valor: 40, efetivacaoTipo: "IMEDIATA" },
			{ metodo: "DINHEIRO", valor: 10, efetivacaoTipo: "IMEDIATA" },
		],
		saleTotal: 37,
	});
	assert.equal(result.troco, 13);
	assert.equal(result.cobertoPorDinheiro, false);
});

test("pagamento previsto com excesso bloqueia o troco", () => {
	const result = resolveSaleChange({
		payments: [
			{ metodo: "DINHEIRO", valor: 30, efetivacaoTipo: "IMEDIATA" },
			{ metodo: "FIADO_NOTA", valor: 20, efetivacaoTipo: "PENDENTE" },
		],
		saleTotal: 37,
	});
	assert.equal(result.troco, 13);
	assert.match(result.bloqueio ?? "", /previstos, fiados ou parcelados/);
});

test("cartao parcelado conta como pagamento nao imediato", () => {
	const result = resolveSaleChange({
		payments: [{ metodo: "CARTAO_CREDITO", valor: 50, efetivacaoTipo: "IMEDIATA", totalParcelas: 3 }],
		saleTotal: 37,
	});
	assert.notEqual(result.bloqueio, null);
});

test("pagamento previsto sem excesso nao bloqueia nada", () => {
	const result = resolveSaleChange({ payments: [{ metodo: "FIADO_NOTA", valor: 37, efetivacaoTipo: "PENDENTE" }], saleTotal: 37 });
	assert.equal(result.troco, 0);
	assert.equal(result.bloqueio, null);
});

test("tolerancia de centavo nao gera troco", () => {
	const result = resolveSaleChange({ payments: [{ metodo: "PIX", valor: 37.01, efetivacaoTipo: "IMEDIATA" }], saleTotal: 37 });
	assert.equal(result.troco, 0);
});

test("identifica e soma apenas as saidas de troco vivas", () => {
	const transactions = [
		{ valor: 50, tipo: "ENTRADA", provedorStatus: "APROVADO", modificadoresMetadata: null },
		{ valor: 13, tipo: "SAIDA", provedorStatus: "APROVADO", modificadoresMetadata: { origem: "TROCO" } },
		{ valor: 5, tipo: "SAIDA", provedorStatus: "ESTORNADO", modificadoresMetadata: { origem: "TROCO" } },
		{ valor: 2, tipo: "SAIDA", provedorStatus: "APROVADO", modificadoresMetadata: { origem: "TAXA_CANAL" } },
	];
	assert.equal(isSaleChangeTransaction(transactions[1]), true);
	assert.equal(isSaleChangeTransaction(transactions[0]), false);
	assert.equal(isSaleChangeTransaction(transactions[3]), false);
	assert.equal(getSaleChangeTotal(transactions), 13);
});

test("visao fiscal desconta o troco do dinheiro primeiro", () => {
	const result = netSaleChangeFromPayments([{ metodo: "DINHEIRO" as const, valor: 50 }], 13);
	assert.deepEqual(result, [{ metodo: "DINHEIRO", valor: 37 }]);
});

test("visao fiscal rateia o troco restante entre os outros metodos e fecha no total", () => {
	const result = netSaleChangeFromPayments(
		[
			{ metodo: "DINHEIRO" as const, valor: 5 },
			{ metodo: "CARTAO_CREDITO" as const, valor: 30 },
			{ metodo: "PIX" as const, valor: 15 },
		],
		13,
	);
	// 50 pagos - 13 troco = 37: dinheiro zera (5), sobram 8 rateados entre 30 e 15.
	const total = result.reduce((sum, payment) => sum + payment.valor, 0);
	assert.equal(Math.round(total * 100) / 100, 37);
	assert.equal(result.some((payment) => payment.metodo === "DINHEIRO"), false);
});

test("visao fiscal sem troco devolve os pagamentos intactos", () => {
	const payments = [{ metodo: "PIX" as const, valor: 37 }];
	assert.equal(netSaleChangeFromPayments(payments, 0), payments);
});

test("card charged on the terminal does not block change from the cash received with it", () => {
	const result = resolveSaleChange({
		payments: [
			{ metodo: "CARTAO_CREDITO", valor: 50, efetivacaoTipo: "PENDENTE", totalParcelas: 3, dispositivoId: "dev-1" },
			{ metodo: "DINHEIRO", valor: 50, efetivacaoTipo: "IMEDIATA" },
		],
		saleTotal: 80,
	});
	assert.equal(result.bloqueio, null);
	assert.equal(result.troco, 20);
	assert.equal(result.cobertoPorDinheiro, true);
});
