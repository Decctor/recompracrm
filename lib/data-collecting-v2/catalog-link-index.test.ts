import assert from "node:assert/strict";
import { test } from "node:test";
import type { TCanonicalSaleItem } from "@/lib/data-connectors";
import { indexCatalogLinksByExternalItemId } from "./catalog-link-index";
import { resolveSaleItemTarget } from "./sync-sales";
import type { TResolvedAuxiliaryEntities } from "./types";

// Ids reais da Congelatte (2026-10-29): o pedido do Gelato em Fatia trouxe `aada22f4…` em
// `items[].id`, que é o `itemContextId` do contexto DEFAULT do item `5c943640…`.
const GELATO_EM_FATIA = {
	produtoId: "produto-gelato-em-fatia",
	produtoVarianteId: null,
	externoItemId: "5c943640-2722-47cf-9a1c-f18285aae502",
	externoItemContextoIds: ["aada22f4-cb8c-4e14-be37-85705e4e767e"],
};
// Fondue: código interno 1223573, mas o item no iFood carrega o externalCode 2556489 — o mesmo
// código de um produto órfão criado por um pedido anterior.
const FONDUE = {
	produtoId: "produto-fondue",
	produtoVarianteId: null,
	externoItemId: "897e4e84-f680-44a6-895e-c9e88295c699",
	externoItemContextoIds: ["de31d236-1417-4a1a-a659-2f2c63700074"],
};

function context(rows: (typeof FONDUE)[], productsByCode: [string, string][] = []): TResolvedAuxiliaryEntities {
	const productsByExternalItemId: TResolvedAuxiliaryEntities["productsByExternalItemId"] = new Map();
	indexCatalogLinksByExternalItemId(productsByExternalItemId, rows);
	return { productsByCode: new Map(productsByCode), productsByExternalItemId, variantsByCode: new Map() } as unknown as TResolvedAuxiliaryEntities;
}

function orderItem(productExternalId: string, productCode: string): TCanonicalSaleItem {
	return {
		productExternalId,
		productCode,
		quantity: 1,
		unitSaleValue: 36,
		unitCostValue: 0,
		totalCostValue: 0,
		grossSaleValue: 36,
		discountValue: 0,
		netSaleValue: 36,
	};
}

test("indexa o vínculo pelo id do item e pelos ids de contexto", () => {
	const ctx = context([GELATO_EM_FATIA]);
	assert.equal(ctx.productsByExternalItemId.get(GELATO_EM_FATIA.externoItemId)?.produtoId, "produto-gelato-em-fatia");
	assert.equal(ctx.productsByExternalItemId.get("aada22f4-cb8c-4e14-be37-85705e4e767e")?.produtoId, "produto-gelato-em-fatia");
});

test("pedido do iFood (id de contexto, sem externalCode) casa pelo vínculo", () => {
	const ctx = context([GELATO_EM_FATIA]);
	// Sem externalCode, o mapper usa o próprio id como código.
	const target = resolveSaleItemTarget(ctx, orderItem("aada22f4-cb8c-4e14-be37-85705e4e767e", "aada22f4-cb8c-4e14-be37-85705e4e767e"));
	assert.equal(target?.produtoId, "produto-gelato-em-fatia");
});

test("o vínculo vence o externalCode que aponta para outro produto", () => {
	const ctx = context([FONDUE], [["2556489", "produto-fondue-orfao"]]);
	const target = resolveSaleItemTarget(ctx, orderItem("de31d236-1417-4a1a-a659-2f2c63700074", "2556489"));
	assert.equal(target?.produtoId, "produto-fondue");
});

test("vínculo ainda sem ids de contexto mantém o fallback por código", () => {
	const ctx = context([{ ...FONDUE, externoItemContextoIds: [] }], [["2556489", "produto-fondue-orfao"]]);
	const target = resolveSaleItemTarget(ctx, orderItem("de31d236-1417-4a1a-a659-2f2c63700074", "2556489"));
	assert.equal(target?.produtoId, "produto-fondue-orfao");
});

test("vínculo sem produto não entra no índice", () => {
	const ctx = context([{ ...FONDUE, produtoId: null as unknown as string }]);
	assert.equal(ctx.productsByExternalItemId.size, 0);
});
