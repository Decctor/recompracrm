import assert from "node:assert/strict";
import test from "node:test";
import { allocateFiscalHeaderDiscount, resolveFiscalHeaderDiscount } from "./header-discount";

test("deriva o desconto geral nao representado nos itens (venda Congelatte 9f785668, rejeicao 865)", () => {
	// Item de R$ 33 sem desconto de item; desconto geral de R$ 20 no cabecalho; total R$ 13.
	const valor = resolveFiscalHeaderDiscount({
		itens: [{ valorBruto: 33, valorDesconto: 0 }],
		valorTotal: 13,
		acrescimosTotal: 0,
		descontosTotal: 20,
	});
	assert.equal(valor, 20);
});

test("nao realoca desconto ja representado no item (recompensa: item com desconto integral)", () => {
	// descontosTotal inclui o premio (confirm soma prize.valorVenda), mas o item ja carrega o desconto.
	const valor = resolveFiscalHeaderDiscount({
		itens: [
			{ valorBruto: 28, valorDesconto: 0 },
			{ valorBruto: 17, valorDesconto: 17 },
		],
		valorTotal: 28,
		acrescimosTotal: 0,
		descontosTotal: 17,
	});
	assert.equal(valor, 0);
});

test("caso misto: desconto geral + desconto de item, descontosTotal guarda so o cabecalho", () => {
	// Bruto 100, desconto de item 5 (liquido 95), desconto geral 10 -> total 85.
	const valor = resolveFiscalHeaderDiscount({
		itens: [{ valorBruto: 100, valorDesconto: 5 }],
		valorTotal: 85,
		acrescimosTotal: 0,
		descontosTotal: 10,
	});
	assert.equal(valor, 10);
});

test("taxa de entrega no acrescimo nao vira desconto", () => {
	// Liquido 25, cupom 6.25, taxa de entrega 7 -> total 25.75.
	const valor = resolveFiscalHeaderDiscount({
		itens: [{ valorBruto: 25, valorDesconto: 0 }],
		valorTotal: 25.75,
		acrescimosTotal: 7,
		descontosTotal: 6.25,
	});
	assert.equal(valor, 6.25);
});

test("nunca fabrica desconto acima do declarado em descontosTotal (venda importada com totais divergentes)", () => {
	const valor = resolveFiscalHeaderDiscount({
		itens: [{ valorBruto: 100, valorDesconto: 0 }],
		valorTotal: 60,
		acrescimosTotal: 0,
		descontosTotal: null,
	});
	assert.equal(valor, 0);
});

test("limita o desconto ao liquido dos itens", () => {
	const valor = resolveFiscalHeaderDiscount({
		itens: [{ valorBruto: 10, valorDesconto: 0 }],
		valorTotal: 0,
		acrescimosTotal: 0,
		descontosTotal: 50,
	});
	assert.equal(valor, 10);
});

test("venda sem valorTotal numerico nao aloca nada", () => {
	const valor = resolveFiscalHeaderDiscount({
		itens: [{ valorBruto: 33, valorDesconto: 0 }],
		valorTotal: undefined,
		acrescimosTotal: 0,
		descontosTotal: 20,
	});
	assert.equal(valor, 0);
});

test("rateio proporcional ao liquido com ajuste de centavos e soma exata", () => {
	const shares = allocateFiscalHeaderDiscount({
		valorDesconto: 10,
		itens: [
			{ valorBruto: 10, valorDesconto: 0 },
			{ valorBruto: 10, valorDesconto: 0 },
			{ valorBruto: 10, valorDesconto: 0 },
		],
	});
	assert.equal(
		shares.reduce((sum, value) => sum + value, 0),
		10,
	);
	for (const share of shares) assert.ok(share === 3.33 || share === 3.34);
});

test("item totalmente descontado nao recebe rateio", () => {
	const shares = allocateFiscalHeaderDiscount({
		valorDesconto: 5,
		itens: [
			{ valorBruto: 20, valorDesconto: 0 },
			{ valorBruto: 17, valorDesconto: 17 },
		],
	});
	assert.deepEqual(shares, [5, 0]);
});

test("varias recompensas: nenhum item integralmente descontado recebe rateio nem realoca desconto", () => {
	// Venda com duas recompensas (uma com quantidade 2): descontosTotal soma os tres premios,
	// mas cada item ja carrega o proprio desconto — o cabecalho nao ganha nada e o rateio de um
	// desconto geral cai inteiro no item pago.
	const itens = [
		{ valorBruto: 28, valorDesconto: 0 },
		{ valorBruto: 16, valorDesconto: 16 }, // premio A x2 (8 cada)
		{ valorBruto: 15, valorDesconto: 15 }, // premio B
	];
	assert.equal(resolveFiscalHeaderDiscount({ itens, valorTotal: 28, acrescimosTotal: 0, descontosTotal: 31 }), 0);
	assert.equal(resolveFiscalHeaderDiscount({ itens, valorTotal: 23, acrescimosTotal: 0, descontosTotal: 36 }), 5);
	assert.deepEqual(allocateFiscalHeaderDiscount({ valorDesconto: 5, itens }), [5, 0, 0]);
});

test("nenhum item recebe desconto acima do proprio liquido", () => {
	const shares = allocateFiscalHeaderDiscount({
		valorDesconto: 30,
		itens: [
			{ valorBruto: 20, valorDesconto: 0 },
			{ valorBruto: 10, valorDesconto: 0 },
		],
	});
	assert.deepEqual(shares, [20, 10]);
});
