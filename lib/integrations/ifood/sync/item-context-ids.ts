import type { AxiosInstance } from "axios";
import { getIfoodItemFlat } from "@/lib/integrations/ifood/catalog";
import type { TIfoodItemFlatDTO } from "@/lib/integrations/ifood/catalog-types";
import type { TIfoodItemDocument } from "@/lib/integrations/ifood/item-document";
import { db } from "@/services/drizzle";
import { catalogLinks, type TCatalogLinkEntity } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";

/**
 * Ids de contexto do item — o que os pedidos do iFood trazem em `items[].id` (medido na Congelatte em
 * 2026-10-29: o pedido do Gelato em Fatia trouxe `aada22f4…`, o `itemContextId` do contexto DEFAULT
 * do item `5c943640…`). O vínculo guarda estes ids para a ingestão casar o pedido pelo vínculo.
 */
function uniqueContextIds(ids: (string | null | undefined)[]) {
	return [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))].sort();
}

export function itemContextIdsOfFlat(flat: Pick<TIfoodItemFlatDTO, "canais">): string[] {
	return uniqueContextIds(flat.canais.map((canal) => canal.itemContextoId));
}

export function itemContextIdsOfDocument(doc: Pick<TIfoodItemDocument, "item">): string[] {
	const modifiers = Array.isArray(doc.item.contextModifiers) ? (doc.item.contextModifiers as { itemContextId?: unknown }[]) : [];
	return uniqueContextIds(modifiers.map((modifier) => (typeof modifier.itemContextId === "string" ? modifier.itemContextId : null)));
}

export function sameContextIds(a: string[] | null | undefined, b: string[]) {
	const current = uniqueContextIds(a ?? []);
	return current.length === b.length && current.every((id, index) => id === b[index]);
}

/** Grava os ids lidos se mudaram. Lista vazia não apaga: leitura sem contexto não é prova de ausência. */
export async function recordItemContextIds(link: Pick<TCatalogLinkEntity, "id" | "externoItemContextoIds">, ids: string[]) {
	if (ids.length === 0 || sameContextIds(link.externoItemContextoIds, ids)) return false;
	await db.update(catalogLinks).set({ externoItemContextoIds: ids }).where(eq(catalogLinks.id, link.id));
	return true;
}

/**
 * Lê o item e devolve os ids de contexto, best-effort: falhar aqui não pode derrubar o vínculo nem o
 * push. O vínculo fica sem ids e o próximo push (ou o backfill) preenche.
 */
export async function readItemContextIds({ client, merchantId, itemId }: { client: AxiosInstance; merchantId: string; itemId: string }) {
	try {
		return itemContextIdsOfFlat(await getIfoodItemFlat(client, merchantId, itemId));
	} catch (error) {
		console.warn("[IFOOD_ITEM_CONTEXT_IDS] Não foi possível ler os ids de contexto do item.", { merchantId, itemId, error });
		return [];
	}
}

/** Vínculo de item ainda sem ids (anterior à 0143, ou leitura que falhou): lê e grava uma vez. */
export async function ensureItemContextIds({
	client,
	link,
}: {
	client: AxiosInstance;
	link: Pick<TCatalogLinkEntity, "id" | "merchantId" | "externoItemId" | "externoItemContextoIds">;
}) {
	if (!link.externoItemId || link.externoItemContextoIds.length > 0) return;
	const ids = await readItemContextIds({ client, merchantId: link.merchantId, itemId: link.externoItemId });
	await recordItemContextIds(link, ids).catch((error) => {
		console.warn("[IFOOD_ITEM_CONTEXT_IDS] Não foi possível gravar os ids de contexto do item.", { linkId: link.id, error });
	});
}
