import assert from "node:assert/strict";
import { test } from "node:test";
import { allocateStoreCreditReceipt, getStoreCreditAllocationError, getStoreCreditTitlesTotal, sortStoreCreditTitlesByPriority } from "./allocate";

const TITULOS = [
	{ transacaoId: "b", saldo: 80, dataPrevisao: new Date("2026-08-01T00:00:00.000Z") },
	{ transacaoId: "a", saldo: 150, dataPrevisao: new Date("2026-07-01T00:00:00.000Z") },
	{ transacaoId: "c", saldo: 40, dataPrevisao: new Date("2026-09-01T00:00:00.000Z") },
];

test("prioridade é a previsão mais antiga", () => {
	assert.deepEqual(
		sortStoreCreditTitlesByPriority(TITULOS).map((titulo) => titulo.transacaoId),
		["a", "b", "c"],
	);
});

test("previsões empatadas desempatam pela venda e depois pelo id, para a sugestão não oscilar", () => {
	const mesmaPrevisao = new Date("2026-07-01T00:00:00.000Z");
	const ordenados = sortStoreCreditTitlesByPriority([
		{ transacaoId: "z", saldo: 10, dataPrevisao: mesmaPrevisao, dataVenda: new Date("2026-06-10T00:00:00.000Z") },
		{ transacaoId: "y", saldo: 10, dataPrevisao: mesmaPrevisao, dataVenda: new Date("2026-06-01T00:00:00.000Z") },
		{ transacaoId: "x", saldo: 10, dataPrevisao: mesmaPrevisao, dataVenda: new Date("2026-06-10T00:00:00.000Z") },
	]);
	assert.deepEqual(
		ordenados.map((titulo) => titulo.transacaoId),
		["y", "x", "z"],
	);
});

test("abatimento parcial quita o mais antigo e sobra no seguinte", () => {
	const { allocations, sobra } = allocateStoreCreditReceipt({ titles: TITULOS, valorRecebido: 200 });
	assert.deepEqual(allocations, [
		{ transacaoId: "a", valor: 150 },
		{ transacaoId: "b", valor: 50 },
	]);
	assert.equal(sobra, 0);
});

test("abatimento menor que o primeiro título não encosta nos demais", () => {
	const { allocations } = allocateStoreCreditReceipt({ titles: TITULOS, valorRecebido: 30 });
	assert.deepEqual(allocations, [{ transacaoId: "a", valor: 30 }]);
});

test("valor acima do devido reporta sobra em vez de alocar demais", () => {
	const { allocations, sobra } = allocateStoreCreditReceipt({ titles: TITULOS, valorRecebido: 300 });
	assert.equal(getStoreCreditTitlesTotal(allocations.map((item) => ({ saldo: item.valor }))), 270);
	assert.equal(sobra, 30);
});

test("centavos não se perdem ao encadear títulos quebrados", () => {
	const quebrados = [
		{ transacaoId: "a", saldo: 33.33, dataPrevisao: new Date("2026-07-01T00:00:00.000Z") },
		{ transacaoId: "b", saldo: 33.33, dataPrevisao: new Date("2026-07-02T00:00:00.000Z") },
		{ transacaoId: "c", saldo: 33.34, dataPrevisao: new Date("2026-07-03T00:00:00.000Z") },
	];
	const { allocations, sobra } = allocateStoreCreditReceipt({ titles: quebrados, valorRecebido: 100 });
	assert.equal(sobra, 0);
	assert.equal(getStoreCreditTitlesTotal(allocations.map((item) => ({ saldo: item.valor }))), 100);
	assert.equal(allocations.length, 3);
});

test("alocação válida passa", () => {
	assert.equal(
		getStoreCreditAllocationError({
			titles: TITULOS,
			valorRecebido: 200,
			allocations: [
				{ transacaoId: "a", valor: 150 },
				{ transacaoId: "b", valor: 50 },
			],
		}),
		null,
	);
});

test("alocação que passa do saldo da venda é recusada", () => {
	assert.equal(
		getStoreCreditAllocationError({ titles: TITULOS, valorRecebido: 100, allocations: [{ transacaoId: "c", valor: 100 }] }),
		"O valor abatido não pode passar do saldo da venda.",
	);
});

test("alocação que não fecha com o valor recebido é recusada", () => {
	assert.equal(
		getStoreCreditAllocationError({ titles: TITULOS, valorRecebido: 200, allocations: [{ transacaoId: "a", valor: 150 }] }),
		"A soma dos abatimentos precisa fechar com o valor recebido.",
	);
});

test("venda de outro cliente, repetida ou com valor zero é recusada", () => {
	assert.equal(
		getStoreCreditAllocationError({ titles: TITULOS, valorRecebido: 10, allocations: [{ transacaoId: "intruso", valor: 10 }] }),
		"Uma das vendas informadas não está em aberto para este cliente.",
	);
	assert.equal(
		getStoreCreditAllocationError({
			titles: TITULOS,
			valorRecebido: 20,
			allocations: [
				{ transacaoId: "a", valor: 10 },
				{ transacaoId: "a", valor: 10 },
			],
		}),
		"A mesma venda foi informada duas vezes no abatimento.",
	);
	assert.equal(getStoreCreditAllocationError({ titles: TITULOS, valorRecebido: 0, allocations: [] }), "O valor recebido precisa ser maior que zero.");
});

test("redistribuição manual fora da ordem FIFO é aceita — o operador manda", () => {
	assert.equal(
		getStoreCreditAllocationError({
			titles: TITULOS,
			valorRecebido: 90,
			allocations: [
				{ transacaoId: "c", valor: 40 },
				{ transacaoId: "b", valor: 50 },
			],
		}),
		null,
	);
});
