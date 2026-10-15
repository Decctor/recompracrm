import assert from "node:assert/strict";
import test from "node:test";
import {
	getTabPartialPaymentBlockReason,
	resolveTabBalance,
	resolveTabPartialPaymentCap,
	sumActiveTabPayments,
	sumTabDraftConsumption,
	tabPaymentsMatchRemaining,
} from "./partial-payments";

test("sumActiveTabPayments: ignora estornados e arredonda em centavos", () => {
	assert.equal(
		sumActiveTabPayments([
			{ valor: 10.1, status: "ATIVO" },
			{ valor: 20.2, status: "ATIVO" },
			{ valor: 99, status: "ESTORNADO" },
		]),
		30.3,
	);
	assert.equal(sumActiveTabPayments([]), 0);
});

test("resolveTabBalance: sem parcial, restante = total", () => {
	const balance = resolveTabBalance({ consumo: 100, jaPago: 0 });
	assert.equal(balance.valorTotal, 100);
	assert.equal(balance.restante, 100);
	assert.equal(balance.bloqueio, null);
});

test("resolveTabBalance: parcial menor que o total abate do restante", () => {
	const balance = resolveTabBalance({ consumo: 100, descontoGeral: 10, acrescimoGeral: 10, jaPago: 62 });
	assert.equal(balance.valorTotal, 100);
	assert.equal(balance.restante, 38);
	assert.equal(balance.bloqueio, null);
});

test("resolveTabBalance: parcial cobre tudo (inclusive com centavo de tolerancia)", () => {
	assert.equal(resolveTabBalance({ consumo: 100, jaPago: 100 }).restante, 0);
	const withCent = resolveTabBalance({ consumo: 100, jaPago: 100.01 });
	assert.equal(withCent.restante, 0);
	assert.equal(withCent.bloqueio, null);
});

test("resolveTabBalance: desconto que deixa o total abaixo do ja pago bloqueia", () => {
	const balance = resolveTabBalance({ consumo: 100, descontoGeral: 50, jaPago: 62 });
	assert.equal(balance.valorTotal, 50);
	assert.equal(balance.restante, 0);
	assert.match(balance.bloqueio ?? "", /Estorne um recebimento/);
});

test("teto do parcial = consumo - ja pago; acima disso recusa", () => {
	assert.equal(resolveTabPartialPaymentCap({ consumo: 100, jaPago: 62 }), 38);
	assert.equal(getTabPartialPaymentBlockReason({ consumo: 100, jaPago: 62, valor: 38 }), null);
	assert.equal(getTabPartialPaymentBlockReason({ consumo: 100, jaPago: 62, valor: 38.01 }), null);
	assert.match(getTabPartialPaymentBlockReason({ consumo: 100, jaPago: 62, valor: 38.5 }) ?? "", /R\$ 38,00/);
	assert.match(getTabPartialPaymentBlockReason({ consumo: 100, jaPago: 0, valor: 0 }) ?? "", /maior que zero/);
});

test("tabPaymentsMatchRemaining: tolerancia de um centavo", () => {
	assert.equal(tabPaymentsMatchRemaining({ paymentsTotal: 38, restante: 38 }), true);
	assert.equal(tabPaymentsMatchRemaining({ paymentsTotal: 38.01, restante: 38 }), true);
	assert.equal(tabPaymentsMatchRemaining({ paymentsTotal: 38.02, restante: 38 }), false);
	assert.equal(tabPaymentsMatchRemaining({ paymentsTotal: 0, restante: 0 }), true);
});

test("sumTabDraftConsumption: liquido dos itens ativos, nunca o total gravado da venda", () => {
	// Mesa 11 da Brejaria: itens somam 117,80; o rascunho gravado dizia 129,58 (com 10% embutido).
	const itens = [13, 7.9, 8.9, 16, 16, 32, 24].map((valor) => ({ valorVendaTotalLiquido: valor, quantidade: 1, quantidadeCancelada: 0 }));
	assert.equal(sumTabDraftConsumption(itens), 117.8);
	assert.equal(sumTabDraftConsumption([...itens, { valorVendaTotalLiquido: 50, quantidade: 2, quantidadeCancelada: 2 }]), 117.8);
	assert.equal(sumTabDraftConsumption([]), 0);
	// O total que a tela cobra e o que o fechamento aceita saem da mesma base.
	const balance = resolveTabBalance({ consumo: sumTabDraftConsumption(itens), acrescimoGeral: 11.78, jaPago: 0 });
	assert.equal(tabPaymentsMatchRemaining({ paymentsTotal: 129.58, restante: balance.restante }), true);
});
