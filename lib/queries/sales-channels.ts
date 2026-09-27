import type { TGetSalesChannelMatrixOutput } from "@/app/api/sales-channels/matrix/route";
import type { TGetSalesChannelsOutput } from "@/app/api/sales-channels/route";
import type { TGetSalesChannelShowcaseInput, TGetSalesChannelShowcaseOutput } from "@/app/api/sales-channels/showcase/route";
import type { TGetSalesChannelsStatusOutput } from "@/app/api/sales-channels/status/route";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

const SALES_CHANNELS_STATUS_REFETCH_MS = 60 * 1000;

async function fetchSalesChannelsStatus() {
	const { data } = await axios.get<TGetSalesChannelsStatusOutput>("/api/sales-channels/status");
	return data.data.canais;
}

/**
 * O trilho do header vive em toda página, então a cadência importa: o `staleTime` padrão de 60s do
 * `TanstackProvider` já evita refetch ao navegar, e o intervalo mantém o estado fresco em quem
 * deixa o painel aberto. O servidor ainda faz cache por organização — as duas camadas somadas
 * seguram o custo em ~1 chamada por minuto por organização.
 */
export function useSalesChannelsStatus() {
	const queryKey = ["sales-channels-status"];
	return {
		...useQuery({
			queryKey,
			queryFn: fetchSalesChannelsStatus,
			refetchInterval: SALES_CHANNELS_STATUS_REFETCH_MS,
			// Um canal fora do ar já volta como INDETERMINADO; insistir só gera ruído de rede.
			retry: false,
		}),
		queryKey,
	};
}

async function fetchSalesChannels() {
	const { data } = await axios.get<TGetSalesChannelsOutput>("/api/sales-channels");
	return data.data.channels;
}

/**
 * O registro de canais da organização (o GET materializa os internos que ainda faltarem). Nada a
 * ver com `useSalesChannelsStatus`, que é o trilho de saúde do header: aqui é a CONFIGURAÇÃO.
 */
export function useSalesChannels({ enabled = true }: { enabled?: boolean } = {}) {
	const queryKey = ["sales-channels"];
	return {
		...useQuery({ queryKey, queryFn: fetchSalesChannels, enabled }),
		queryKey,
	};
}

async function fetchSalesChannelShowcase(channel: TGetSalesChannelShowcaseInput["channel"]) {
	const searchParams = new URLSearchParams({ channel });
	const { data } = await axios.get<TGetSalesChannelShowcaseOutput>(`/api/sales-channels/showcase?${searchParams.toString()}`);
	return data.data;
}

/**
 * A curadoria de um canal interno: o modo do catálogo, a ordem dos grupos e os produtos que estão
 * na vitrine hoje — incluindo os que a loja esconde por falta de preço ou estoque, que precisam
 * aparecer para quem monta a vitrine.
 */
export function useSalesChannelShowcase({ channel }: { channel: TGetSalesChannelShowcaseInput["channel"] }) {
	const queryKey = ["sales-channel-showcase", channel];
	return {
		...useQuery({ queryKey, queryFn: () => fetchSalesChannelShowcase(channel) }),
		queryKey,
	};
}
export type TSalesChannelShowcase = Awaited<ReturnType<typeof fetchSalesChannelShowcase>>;
export type TSalesChannelShowcaseProduct = TSalesChannelShowcase["products"][number];

async function fetchSalesChannelMatrix() {
	const { data } = await axios.get<TGetSalesChannelMatrixOutput>("/api/sales-channels/matrix");
	return data.data;
}

/**
 * A matriz inteira da aba "Canais" de Produtos: todos os canais da organização (internos e um por
 * merchant iFood), todos os produtos vendáveis com suas variantes, as linhas esparsas de override e
 * os vínculos iFood. Uma leitura só — a grade filtra e agrupa no cliente.
 */
export function useSalesChannelMatrix({ enabled = true }: { enabled?: boolean } = {}) {
	const queryKey = ["sales-channel-matrix"];
	return {
		...useQuery({ queryKey, queryFn: fetchSalesChannelMatrix, enabled }),
		queryKey,
	};
}
export type TSalesChannelMatrix = Awaited<ReturnType<typeof fetchSalesChannelMatrix>>;
export type TSalesChannelMatrixChannel = TSalesChannelMatrix["channels"][number];
export type TSalesChannelMatrixProduct = TSalesChannelMatrix["products"][number];
export type TSalesChannelMatrixVariant = TSalesChannelMatrixProduct["variantes"][number];
export type TSalesChannelMatrixLink = TSalesChannelMatrix["links"][number];
