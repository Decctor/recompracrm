import assert from "node:assert/strict";
import test from "node:test";
import {
	clampCartLineQuantity,
	countReservedStock,
	describeCartIncrementShortage,
	describeStockShortage,
	resolveAvailableStock,
	resolveCartLineStock,
} from "./stock-availability";

const line = (produtoVarianteId: string | null, quantidade: number, extra: { quantidadeEntregue?: number; saldoEstoque?: number | null } = {}) => ({
	produtoId: "moletom",
	produtoVarianteId,
	quantidade,
	...extra,
});

test("reserva soma só as linhas do mesmo produto e variante", () => {
	const lines = [line("marrom-p", 2), line("marrom-p", 1), line("marrom-m", 5), { produtoId: "outro", produtoVarianteId: null, quantidade: 9 }];
	assert.equal(countReservedStock(lines, { produtoId: "moletom", produtoVarianteId: "marrom-p" }), 3);
	assert.equal(countReservedStock(lines, { produtoId: "outro" }), 9);
});

test("na edição, a parte já entregue não reserva de novo", () => {
	assert.equal(countReservedStock([line("marrom-p", 3, { quantidadeEntregue: 2 })], { produtoId: "moletom", produtoVarianteId: "marrom-p" }), 1);
});

test("disponível é saldo menos reserva; sem saldo rastreado é null", () => {
	assert.equal(resolveAvailableStock({ stock: 5, reserved: 2 }), 3);
	assert.equal(resolveAvailableStock({ stock: null, reserved: 2 }), null);
	assert.equal(resolveAvailableStock({ stock: 1.25, reserved: 0.5 }), 0.75);
});

test("motivo da recusa", () => {
	assert.equal(describeStockShortage({ nome: "Moletom P", available: null, quantity: 99 }), null);
	assert.equal(describeStockShortage({ nome: "Moletom P", available: 3, quantity: 3 }), null);
	assert.equal(describeStockShortage({ nome: "Moletom P", available: 0, quantity: 1 }), "Sem estoque: Moletom P.");
	assert.equal(describeStockShortage({ nome: "Moletom P", available: -2, quantity: 1 }), "Sem estoque: Moletom P.");
	assert.equal(describeStockShortage({ nome: "Moletom P", available: 2, quantity: 3 }), "Moletom P: só 2 em estoque.");
});

test("linha do carrinho usa o snapshot mais recente e desconta todas as linhas", () => {
	const lines = [line("marrom-p", 1, { saldoEstoque: 5 }), line("marrom-p", 2, { saldoEstoque: 4 })];
	assert.deepEqual(resolveCartLineStock(lines, { produtoId: "moletom", produtoVarianteId: "marrom-p" }), { stock: 4, available: 1 });
});

test("linha sem snapshot não restringe", () => {
	assert.deepEqual(resolveCartLineStock([line("marrom-p", 1)], { produtoId: "moletom", produtoVarianteId: "marrom-p" }), {
		stock: null,
		available: null,
	});
});

test("mais uma unidade na linha: cabe, esgotou ou passa do saldo", () => {
	const key = { produtoId: "moletom", produtoVarianteId: "marrom-p", nome: "Moletom P" };
	assert.equal(describeCartIncrementShortage([line("marrom-p", 2, { saldoEstoque: 3 })], key), null);
	assert.equal(describeCartIncrementShortage([line("marrom-p", 3, { saldoEstoque: 3 })], key), "Moletom P: só 3 em estoque.");
	assert.equal(describeCartIncrementShortage([line("marrom-p", 1, { saldoEstoque: 0 })], key), "Sem estoque: Moletom P.");
	assert.equal(describeCartIncrementShortage([line("marrom-p", 9)], key), null);
});

test("quantidade digitada: cabe, limita ao saldo descontando as outras linhas", () => {
	const nome = "Moletom P";
	const own = { ...line("marrom-p", 1, { saldoEstoque: 10 }), nome };
	assert.deepEqual(clampCartLineQuantity([own], own, 10), { quantidade: 10, shortage: null });
	assert.deepEqual(clampCartLineQuantity([own], own, 100), { quantidade: 10, shortage: "Moletom P: só 10 em estoque." });

	const other = line("marrom-p", 4, { saldoEstoque: 10 });
	assert.deepEqual(clampCartLineQuantity([other, own], own, 100), { quantidade: 6, shortage: "Moletom P: só 10 em estoque." });
	assert.deepEqual(clampCartLineQuantity([other, own], own, 6), { quantidade: 6, shortage: null });
});

test("quantidade digitada: diminuir sempre passa; sem saldo não sobe; sem snapshot não limita", () => {
	const nome = "Moletom P";
	const over = { ...line("marrom-p", 5, { saldoEstoque: 3 }), nome };
	assert.deepEqual(clampCartLineQuantity([over], over, 2), { quantidade: 2, shortage: null });
	assert.deepEqual(clampCartLineQuantity([over], over, 8), { quantidade: 5, shortage: "Moletom P: só 3 em estoque." });

	const empty = { ...line("marrom-p", 1, { saldoEstoque: 0 }), nome };
	assert.deepEqual(clampCartLineQuantity([empty], empty, 3), { quantidade: 1, shortage: "Sem estoque: Moletom P." });

	const untracked = { ...line("marrom-p", 1), nome };
	assert.deepEqual(clampCartLineQuantity([untracked], untracked, 500), { quantidade: 500, shortage: null });
});

test("quantidade digitada na edição: a parte entregue não conta contra o saldo", () => {
	const nome = "Moletom P";
	const edited = { ...line("marrom-p", 3, { quantidadeEntregue: 2, saldoEstoque: 4 }), nome };
	// Reserva 1 (3 − 2 entregues); disponível 3 → pode reservar 4 → total 6.
	assert.deepEqual(clampCartLineQuantity([edited], edited, 9), { quantidade: 6, shortage: "Moletom P: só 4 em estoque." });
});
