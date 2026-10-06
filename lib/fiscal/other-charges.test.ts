import assert from "node:assert/strict";
import test from "node:test";
import { resolveFiscalOtherCharges } from "./other-charges";

test("acrescimo geral do PDV vira vOutro (venda Congelatte ff76a70a, rejeicao 866)", () => {
	// Gelato 80ml de R$ 17 com acrescimo geral de R$ 3; total e Pix de R$ 20.
	const valor = resolveFiscalOtherCharges({
		itens: [{ valorBruto: 17, valorDesconto: 0 }],
		valorTotal: 20,
		acrescimosTotal: 3,
		valorFrete: 0,
		valorDescontoCabecalho: 0,
	});
	assert.equal(valor, 3);
});

test("taxa de entrega no acrescimo fica no vFrete e nao vira vOutro", () => {
	const valor = resolveFiscalOtherCharges({
		itens: [{ valorBruto: 28, valorDesconto: 0 }],
		valorTotal: 35,
		acrescimosTotal: 7,
		valorFrete: 7,
		valorDescontoCabecalho: 0,
	});
	assert.equal(valor, 0);
});

test("entrega com acrescimo geral separa frete e vOutro", () => {
	// Item R$ 28 + taxa de entrega R$ 7 + acrescimo geral R$ 2 = R$ 37.
	const valor = resolveFiscalOtherCharges({
		itens: [{ valorBruto: 28, valorDesconto: 0 }],
		valorTotal: 37,
		acrescimosTotal: 9,
		valorFrete: 7,
		valorDescontoCabecalho: 0,
	});
	assert.equal(valor, 2);
});

test("acrescimo e desconto geral na mesma venda fecham com o total", () => {
	// Item R$ 50, desconto geral R$ 10, acrescimo R$ 4: total R$ 44.
	const valor = resolveFiscalOtherCharges({
		itens: [{ valorBruto: 50, valorDesconto: 0 }],
		valorTotal: 44,
		acrescimosTotal: 4,
		valorFrete: 0,
		valorDescontoCabecalho: 10,
	});
	assert.equal(valor, 4);
});

test("nao fabrica vOutro quando os totais da venda nao comportam o acrescimo", () => {
	// Venda importada com acrescimo declarado mas total igual aos itens.
	const valor = resolveFiscalOtherCharges({
		itens: [{ valorBruto: 17, valorDesconto: 0 }],
		valorTotal: 17,
		acrescimosTotal: 3,
		valorFrete: 0,
		valorDescontoCabecalho: 0,
	});
	assert.equal(valor, 0);
});

test("sem total valido nao ha vOutro", () => {
	const valor = resolveFiscalOtherCharges({
		itens: [{ valorBruto: 17, valorDesconto: 0 }],
		valorTotal: null,
		acrescimosTotal: 3,
		valorFrete: 0,
		valorDescontoCabecalho: 0,
	});
	assert.equal(valor, 0);
});
