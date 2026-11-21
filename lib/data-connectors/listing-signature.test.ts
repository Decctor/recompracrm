import assert from "node:assert/strict";
import test from "node:test";
import { computeSaleImportSignature } from "@/lib/data-collecting-v2/sale-signature";
import { getBlingListingSignature } from "./bling/canonical";
import type { TBlingSale } from "./bling/types";
import { getCardapioWebListingSignature } from "./cardapio-web/canonical";
import { partitionListingByKnownSignature } from "./listing-signature";

function makeBlingSale(overrides: Partial<TBlingSale> = {}): TBlingSale {
	return {
		id: 101,
		numero: "55",
		numeroLoja: null,
		data: "2026-11-21",
		dataSaida: null,
		dataPrevista: null,
		totalProdutos: 90,
		total: 100,
		outrasDespesas: 0,
		observacoes: null,
		contato: { id: 7 },
		situacao: { id: 9, valor: 1, nome: "Atendido" },
		itens: [],
		...overrides,
	} as TBlingSale;
}

test("pedido com a mesma assinatura conhecida fica fora do detalhe; novo ou mudado é detalhado", () => {
	const orders = [
		{ id: "1", signature: "a" },
		{ id: "2", signature: "b" },
		{ id: "3", signature: "c" },
	];
	const { toFetch, unchanged } = partitionListingByKnownSignature({
		items: orders,
		getSourceSaleId: (order) => order.id,
		getSignature: (order) => order.signature,
		known: new Map([
			["1", "a"],
			["2", "outra"],
		]),
	});
	assert.deepEqual(
		toFetch.map((order) => order.id),
		["2", "3"],
	);
	assert.deepEqual(
		unchanged.map((order) => order.id),
		["1"],
	);
});

test("run completo (sem assinaturas conhecidas) detalha tudo", () => {
	const { toFetch, unchanged } = partitionListingByKnownSignature({
		items: [{ id: "1" }],
		getSourceSaleId: (order) => order.id,
		getSignature: () => "a",
		known: null,
	});
	assert.equal(toFetch.length, 1);
	assert.equal(unchanged.length, 0);
});

test("assinatura do Bling muda com situação e total, não com campos que só o detalhe traz", () => {
	const base = getBlingListingSignature(makeBlingSale());
	assert.equal(getBlingListingSignature(makeBlingSale({ observacoes: "só no detalhe", itens: [{} as TBlingSale["itens"][number]] })), base);
	assert.notEqual(getBlingListingSignature(makeBlingSale({ situacao: { id: 12, valor: 2, nome: "Cancelado" } })), base);
	assert.notEqual(getBlingListingSignature(makeBlingSale({ total: 120 })), base);
	assert.match(base, /^BLING:v1:[0-9a-f]{64}$/);
});

test("assinatura do Cardápio Web muda com status e updated_at", () => {
	const base = getCardapioWebListingSignature({ status: "closed", updated_at: "2026-11-21T12:00:00Z" });
	assert.equal(getCardapioWebListingSignature({ status: "closed", updated_at: "2026-11-21T12:00:00Z" }), base);
	assert.notEqual(getCardapioWebListingSignature({ status: "canceled", updated_at: "2026-11-21T12:00:00Z" }), base);
	assert.notEqual(getCardapioWebListingSignature({ status: "closed", updated_at: "2026-11-21T13:00:00Z" }), base);
});

test("conector que não carimba listagem mantém a assinatura de importação de antes", () => {
	const saleValues = { idExterno: "1", valorTotal: 10 };
	const before = computeSaleImportSignature({ saleValues, resolvedItems: [], saleItemRewritePolicy: "REPLACE_ON_EVERY_SYNC" });
	const after = computeSaleImportSignature({
		saleValues: { ...saleValues, assinaturaExternaListagem: undefined },
		resolvedItems: [],
		saleItemRewritePolicy: "REPLACE_ON_EVERY_SYNC",
	});
	assert.equal(after, before);
});
