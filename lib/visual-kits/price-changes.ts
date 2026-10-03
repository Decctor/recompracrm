import { isSamePrice } from "@/lib/products/price-snapshot";
import { loadVisualKitCatalog } from "./catalog";
import { visualKitItemKey } from "./types";

type TGeneratedKitItem = {
	produtoId: string;
	produtoVarianteId: string | null;
	precoGerado: number | null;
	precoDeGerado: number | null;
};

/**
 * Quantos produtos de cada kit gerado mudaram desde a geração: preço efetivo diferente do impresso,
 * "De" diferente (promoção começou, acabou ou expirou), produto incluído depois da geração ou que
 * saiu do catálogo. É o que alimenta o aviso "Preço mudou" de Meus kits — sem cron, sempre atual.
 */
export async function countVisualKitPriceChanges({
	organizationId,
	kits,
}: {
	organizationId: string;
	kits: { id: string; canalVendaId: string | null; itens: TGeneratedKitItem[] }[];
}): Promise<Map<string, number>> {
	const changes = new Map<string, number>();
	const kitsByChannel = new Map<string | null, typeof kits>();
	for (const kit of kits) kitsByChannel.set(kit.canalVendaId, [...(kitsByChannel.get(kit.canalVendaId) ?? []), kit]);

	for (const [canalVendaId, channelKits] of kitsByChannel) {
		const keys = [...new Set(channelKits.flatMap((kit) => kit.itens.map(visualKitItemKey)))];
		const { items } = await loadVisualKitCatalog({ organizationId, salesChannelId: canalVendaId, mode: "KEYS", keys });
		const current = new Map(items.map((item) => [item.chave, item]));
		for (const kit of channelKits) {
			const changed = kit.itens.filter((item) => {
				const now = current.get(visualKitItemKey(item));
				if (!now || item.precoGerado == null) return true;
				return !isSamePrice(now.preco, item.precoGerado) || !isSamePrice(now.promocao.precoDe, item.precoDeGerado);
			}).length;
			changes.set(kit.id, changed);
		}
	}
	return changes;
}
