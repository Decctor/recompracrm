import type { TResolvedAuxiliaryEntities } from "./types";

export type TCatalogLinkIndexRow = {
	produtoId: string | null;
	produtoVarianteId: string | null;
	externoItemId: string | null;
	externoItemContextoIds: string[];
};

/**
 * Indexa os vínculos pelas chaves com que um pedido pode citar o item: o id do item E os ids de
 * contexto. O iFood manda em `items[].id` o `itemContextId` (contexto DEFAULT), nunca o id do item —
 * indexar só `externoItemId` fazia o vínculo nunca casar e a venda cair no `externalCode`.
 */
export function indexCatalogLinksByExternalItemId(target: TResolvedAuxiliaryEntities["productsByExternalItemId"], rows: TCatalogLinkIndexRow[]) {
	for (const link of rows) {
		if (!link.produtoId) continue;
		const value = { produtoId: link.produtoId, produtoVarianteId: link.produtoVarianteId, opcoes: [] };
		for (const key of [link.externoItemId, ...link.externoItemContextoIds]) {
			if (key) target.set(key, value);
		}
	}
}
