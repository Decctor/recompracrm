import type { TGetVisualKitCatalogOutput } from "@/app/api/visual-kits/catalog/route";
import type { TGetVisualKitsOutput } from "@/app/api/visual-kits/route";
import type { TVisualKitCatalogItem } from "@/lib/visual-kits/types";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useDebouncedText } from "../hooks/use-debounced-text";

async function fetchVisualKits() {
	const { data } = await axios.get<TGetVisualKitsOutput>("/api/visual-kits");
	const result = data.data.default;
	if (!result) throw new Error("Kits não encontrados.");
	return result;
}

export function useVisualKits() {
	const queryKey = ["visual-kits"];
	return {
		...useQuery({ queryKey, queryFn: fetchVisualKits }),
		queryKey,
	};
}

export async function fetchVisualKitById(id: string) {
	const { data } = await axios.get<TGetVisualKitsOutput>(`/api/visual-kits?id=${id}`);
	const result = data.data.byId;
	if (!result) throw new Error("Kit não encontrado.");
	return result;
}

export function useVisualKitById({ id, enabled = true }: { id: string | null; enabled?: boolean }) {
	const queryKey = ["visual-kit-by-id", id];
	return {
		...useQuery({ queryKey, queryFn: () => fetchVisualKitById(id as string), enabled: enabled && !!id }),
		queryKey,
	};
}

async function fetchVisualKitCatalog(params: { search: string; canalVendaId: string | null; promo: boolean }) {
	const searchParams = new URLSearchParams();
	if (params.search.trim()) searchParams.set("search", params.search.trim());
	if (params.canalVendaId) searchParams.set("canalVendaId", params.canalVendaId);
	if (params.promo) searchParams.set("promo", "true");
	const { data } = await axios.get<TGetVisualKitCatalogOutput>(`/api/visual-kits/catalog?${searchParams.toString()}`);
	return data.data;
}

/** Busca do passo Produtos: termo com debounce, filtro de promoção e preço do canal do kit. */
export function useVisualKitCatalogSearch({ search, canalVendaId, promo }: { search: string; canalVendaId: string | null; promo: boolean }) {
	const debouncedSearch = useDebouncedText(search);
	const queryKey = ["visual-kit-catalog", debouncedSearch, canalVendaId, promo];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchVisualKitCatalog({ search: debouncedSearch, canalVendaId, promo }),
			placeholderData: keepPreviousData,
		}),
		queryKey,
	};
}

// Chaves vão na URL: lotes curtos mantêm cada requisição bem abaixo do limite de tamanho de URL.
const KEYS_PER_REQUEST = 50;

export async function fetchVisualKitCatalogItems(keys: string[], canalVendaId: string | null) {
	const chunks: string[][] = [];
	for (let index = 0; index < keys.length; index += KEYS_PER_REQUEST) chunks.push(keys.slice(index, index + KEYS_PER_REQUEST));
	const results = await Promise.all(
		chunks.map(async (chunk) => {
			const searchParams = new URLSearchParams({ keys: chunk.join(",") });
			if (canalVendaId) searchParams.set("canalVendaId", canalVendaId);
			const { data } = await axios.get<TGetVisualKitCatalogOutput>(`/api/visual-kits/catalog?${searchParams.toString()}`);
			return data.data.itens;
		}),
	);
	const byKey = new Map<string, TVisualKitCatalogItem>(results.flat().map((item) => [item.chave, item]));
	// Mantém a ordem escolhida no kit; chave sem item = produto removido ou desativado.
	return keys.flatMap((key) => {
		const item = byKey.get(key);
		return item ? [item] : [];
	});
}

/** Itens do kit com preços atuais, na ordem do kit — fonte das pré-visualizações. */
export function useVisualKitCatalogItems({ keys, canalVendaId }: { keys: string[]; canalVendaId: string | null }) {
	const queryKey = ["visual-kit-catalog-items", keys, canalVendaId];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchVisualKitCatalogItems(keys, canalVendaId),
			enabled: keys.length > 0,
			placeholderData: keepPreviousData,
		}),
		queryKey,
	};
}
