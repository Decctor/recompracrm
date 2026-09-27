import type { TGetCatalogLinksOutput } from "@/app/api/integrations/ifood/sync/links/route";
import type { TGetCatalogSuggestionsOutput } from "@/app/api/integrations/ifood/sync/suggestions/route";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

async function fetchCatalogLinks(merchantId: string) {
	const searchParams = new URLSearchParams({ merchantId });
	const { data } = await axios.get<TGetCatalogLinksOutput>(`/api/integrations/ifood/sync/links?${searchParams.toString()}`);
	return data.data.links;
}

/**
 * Vínculos de uma loja do iFood (todos os status, inclusive DESVINCULADO). A matriz de canais já
 * traz os vínculos ativos no próprio GET; este hook serve a aba Catálogo do iFood, que lista o
 * catálogo remoto e precisa dizer a que produto cada item está preso.
 */
export function useCatalogLinks({ merchantId }: { merchantId: string | null }) {
	const queryKey = ["catalog-links", merchantId];
	return {
		...useQuery({ queryKey, queryFn: () => fetchCatalogLinks(merchantId as string), enabled: !!merchantId, retry: false }),
		queryKey,
	};
}
export type TCatalogLink = Awaited<ReturnType<typeof fetchCatalogLinks>>[number];

async function fetchCatalogLinkSuggestions({ merchantId, catalogId }: { merchantId: string; catalogId: string }) {
	const searchParams = new URLSearchParams({ merchantId, catalogId });
	const { data } = await axios.get<TGetCatalogSuggestionsOutput>(`/api/integrations/ifood/sync/suggestions?${searchParams.toString()}`);
	return data.data;
}

/**
 * Sugestões de correspondência item do iFood ↔ nó interno (FORTE por código, FRACA por nome),
 * já sem os itens e nós vinculados. Lê o catálogo remoto inteiro: só habilite com o diálogo aberto.
 */
export function useCatalogLinkSuggestions({
	merchantId,
	catalogId,
	enabled = true,
}: {
	merchantId: string | null;
	catalogId: string | null;
	enabled?: boolean;
}) {
	const queryKey = ["catalog-link-suggestions", merchantId, catalogId];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchCatalogLinkSuggestions({ merchantId: merchantId as string, catalogId: catalogId as string }),
			enabled: enabled && !!merchantId && !!catalogId,
			retry: false,
		}),
		queryKey,
	};
}
export type TCatalogLinkSuggestions = Awaited<ReturnType<typeof fetchCatalogLinkSuggestions>>;
