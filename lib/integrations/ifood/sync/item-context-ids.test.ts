import assert from "node:assert/strict";
import test from "node:test";
import type { TIfoodContextModifierDTO } from "@/lib/integrations/ifood/catalog-types";
import type { TIfoodItemDocument } from "@/lib/integrations/ifood/item-document";
import { itemContextIdsOfDocument, itemContextIdsOfFlat, sameContextIds } from "./item-context-ids";

function canal(contexto: string, itemContextoId: string | null): TIfoodContextModifierDTO {
	return { contexto, preco: 36, status: "AVAILABLE", codigoExterno: null, itemContextoId };
}

test("lê os ids de contexto do flat mapeado, sem nulos nem repetidos", () => {
	const ids = itemContextIdsOfFlat({ canais: [canal("WHITELABEL", "b"), canal("DEFAULT", "a"), canal("INDOOR", null), canal("DEFAULT", "a")] });
	assert.deepEqual(ids, ["a", "b"]);
});

test("lê os ids de contexto do documento cru do /flat", () => {
	const doc = {
		item: {
			id: "897e4e84-f680-44a6-895e-c9e88295c699",
			productId: "ae03e02b-be46-47c4-b378-92143902b23b",
			contextModifiers: [{ catalogContext: "DEFAULT", status: "UNAVAILABLE", itemContextId: "de31d236-1417-4a1a-a659-2f2c63700074" }],
		},
	} as Pick<TIfoodItemDocument, "item">;
	assert.deepEqual(itemContextIdsOfDocument(doc), ["de31d236-1417-4a1a-a659-2f2c63700074"]);
});

test("item sem contextModifiers não tem ids", () => {
	assert.deepEqual(itemContextIdsOfDocument({ item: { id: "i", productId: "p" } }), []);
});

test("compara listas de ids sem depender da ordem gravada", () => {
	assert.equal(sameContextIds(["b", "a"], ["a", "b"]), true);
	assert.equal(sameContextIds([], ["a"]), false);
	assert.equal(sameContextIds(null, []), true);
});
