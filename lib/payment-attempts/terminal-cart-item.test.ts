import assert from "node:assert/strict";
import test from "node:test";
import type { THydratedPOSProduct } from "@/lib/pos/hydrate-pos-products";
import { DEVICE_DISCOUNT_AUTHORITY, evaluateDiscount } from "@/lib/permissions/discounts";
import { resolveActorFiscalEmission } from "@/lib/sales/sale-actor";
import { PaymentTerminalError } from "./errors";
import { buildTerminalCartItem } from "./terminal-cart-item";

// Produto como a projeção do canal PDV o entrega: preço do nó e grupos já com as regras do vínculo.
function burger(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		id: "p-burger",
		nome: "X-Burger",
		codigo: "200",
		grupo: "Lanches",
		imagemCapaUrl: null,
		precoVenda: 25,
		precoCusto: 9,
		variantes: [],
		addOnsReferencias: [
			{ grupo: { nome: "Ponto da carne", minOpcoes: 1, maxOpcoes: 1, opcoes: [{ id: "o-mal", nome: "Mal passado", precoDelta: 0 }, { id: "o-bem", nome: "Bem passado", precoDelta: 0 }] } },
			{ grupo: { nome: "Extras", minOpcoes: 0, maxOpcoes: 3, opcoes: [{ id: "o-bacon", nome: "Bacon", precoDelta: 4.5, maxQtdePorItem: 2 }, { id: "o-ovo", nome: "Ovo", precoDelta: 2 }] } },
		],
		...overrides,
	} as unknown as THydratedPOSProduct;
}

function rejects(run: () => unknown) {
	assert.throws(run, (error: unknown) => error instanceof PaymentTerminalError && error.status === 422 && error.code === "VALIDATION_ERROR");
}

test("item do terminal é montado com o preço do catálogo e o preço das opções, nunca do aparelho", () => {
	const item = buildTerminalCartItem(burger(), {
		produtoId: "p-burger",
		quantidade: 2,
		modificadores: [{ opcaoId: "o-bem", quantidade: 1 }, { opcaoId: "o-bacon", quantidade: 2 }],
		observacoes: "  sem cebola ",
	});
	assert.equal(item.valorUnitarioBase, 25);
	assert.equal(item.valorModificadores, 9);
	assert.equal(item.valorUnitarioFinal, 34);
	assert.equal(item.valorTotalLiquido, 68);
	assert.equal(item.valorDesconto, 0);
	assert.equal(item.observacoes, "sem cebola");
	assert.deepEqual(
		item.modificadores.map((modifier) => [modifier.nome, modifier.quantidade, modifier.valorTotal]),
		[
			["Bem passado", 1, 0],
			["Bacon", 2, 9],
		],
	);
});

test("regras dos grupos valem no terminal: obrigatório, máximo por opção e opção de fora", () => {
	rejects(() => buildTerminalCartItem(burger(), { produtoId: "p-burger", quantidade: 1 }));
	rejects(() => buildTerminalCartItem(burger(), { produtoId: "p-burger", quantidade: 1, modificadores: [{ opcaoId: "o-mal", quantidade: 1 }, { opcaoId: "o-bem", quantidade: 1 }] }));
	rejects(() => buildTerminalCartItem(burger(), { produtoId: "p-burger", quantidade: 1, modificadores: [{ opcaoId: "o-mal", quantidade: 1 }, { opcaoId: "o-bacon", quantidade: 3 }] }));
	rejects(() => buildTerminalCartItem(burger(), { produtoId: "p-burger", quantidade: 1, modificadores: [{ opcaoId: "o-mal", quantidade: 1 }, { opcaoId: "o-queijo", quantidade: 1 }] }));
});

test("produto fora do canal, sem preço ou com variação faltando é recusado como validação", () => {
	rejects(() => buildTerminalCartItem(undefined, { produtoId: "p-x", quantidade: 1 }));
	rejects(() => buildTerminalCartItem(burger({ precoVenda: null, addOnsReferencias: [] }), { produtoId: "p-burger", quantidade: 1 }));
	const shirt = burger({ addOnsReferencias: [], variantes: [{ id: "v-m", nome: "M", codigo: "100-M", imagemCapaUrl: null, precoVenda: 59.9, precoCusto: 20, addOnsReferencias: [] }] });
	rejects(() => buildTerminalCartItem(shirt, { produtoId: "p-burger", quantidade: 1 }));
	assert.equal(buildTerminalCartItem(shirt, { produtoId: "p-burger", produtoVarianteId: "v-m", quantidade: 1 }).valorTotalLiquido, 59.9);
});

test("o dispositivo herda a emissão fiscal da organização e não a altera", () => {
	const device = { kind: "DEVICE" as const, organizationId: "org", deviceId: "dev", deviceName: "Caixa 01" };
	assert.equal(resolveActorFiscalEmission({ actor: device, requested: null, organizationDefault: true }), null);
	assert.equal(resolveActorFiscalEmission({ actor: device, requested: true, organizationDefault: true }), null);
	assert.throws(() => resolveActorFiscalEmission({ actor: device, requested: false, organizationDefault: true }), (error: { statusCode?: number }) => error.statusCode === 403);
});

test("sem vendedor com teto próprio, qualquer desconto do dispositivo exige aprovação", () => {
	assert.equal(evaluateDiscount({ authority: DEVICE_DISCOUNT_AUTHORITY, valorBase: 100, descontoTotal: 0 }), "PERMITIDO");
	assert.equal(evaluateDiscount({ authority: DEVICE_DISCOUNT_AUTHORITY, valorBase: 100, descontoTotal: 0.5 }), "REQUER_APROVACAO");
});
