import { metaGraphGet, metaGraphGetByFullUrl } from "./client";
import type { TMetaAdsBreakdownKey, TMetaAdsIntegrationConfigWithToken, TMetaAdsInsightLevel, TMetaAdsInsightRow } from "./types";

type MetaAdsInsightsResponse = {
	data?: TMetaAdsInsightRow[];
	paging?: { next?: string };
};

/**
 * Segue `paging.next` da Graph API até esgotar as páginas, acumulando as linhas.
 * Compartilhado por todos os fetchers de insights (conta, campanha, conjunto,
 * anúncio, breakdowns e séries temporais).
 */
export async function fetchMetaAdsInsightRowsPaged(path: string, params: Record<string, string>, accessToken: string): Promise<TMetaAdsInsightRow[]> {
	const rows: TMetaAdsInsightRow[] = [];
	const first = await metaGraphGet<MetaAdsInsightsResponse>(path, params, accessToken);
	rows.push(...(first.data ?? []));
	let nextUrl = first.paging?.next;
	while (nextUrl) {
		const page = await metaGraphGetByFullUrl<MetaAdsInsightsResponse>(nextUrl);
		rows.push(...(page.data ?? []));
		nextUrl = page.paging?.next;
	}
	return rows;
}

export type TMetaAdsInsightsQuery = {
	config: TMetaAdsIntegrationConfigWithToken;
	/** Campos já resolvidos (use {@link buildMetaAdsInsightFields} para montá-los). */
	fields: readonly string[];
	since: string;
	until: string;
	/** Nível de agregação. Omitido quando `objectId` aponta para a própria entidade. */
	level?: TMetaAdsInsightLevel;
	/** Consulta os insights de uma entidade específica (`/{objectId}/insights`) em vez da conta. */
	objectId?: string;
	breakdowns?: readonly TMetaAdsBreakdownKey[];
	/** `1` para série diária; `"all_days"` para agregado. Omitido = agregado do período. */
	timeIncrement?: number | "all_days";
	/** Janelas de atribuição explícitas (ex.: `["7d_click","1d_view"]`). Se omitido usa a config unificada da conta. */
	actionAttributionWindows?: readonly string[];
	/** Filtro nativo da Graph API (array de `{ field, operator, value }`). */
	filtering?: unknown;
	limit?: number;
};

/**
 * Primitivo componível de consulta de insights da Meta Ads: um único ponto que
 * monta os parâmetros da Graph API (nível, período, breakdowns, incremento de
 * tempo, atribuição e filtros) e devolve as linhas cruas já paginadas. Todos os
 * fetchers de mais alto nível (ricos, breakdowns, hierarquia, séries) são
 * construídos sobre ele — o que torna a lib reutilizável fora do dashboard
 * (ex.: ferramentas dos agentes de IA) sem duplicar a montagem de requisição.
 */
export async function fetchMetaAdsInsightsRaw(query: TMetaAdsInsightsQuery): Promise<TMetaAdsInsightRow[]> {
	const path = `/${query.objectId ?? query.config.adAccountId}/insights`;

	const params: Record<string, string> = {
		time_range: JSON.stringify({ since: query.since, until: query.until }),
		fields: query.fields.join(","),
		limit: String(query.limit ?? 500),
	};

	if (query.level) params.level = query.level;
	if (query.breakdowns && query.breakdowns.length > 0) params.breakdowns = query.breakdowns.join(",");
	if (query.timeIncrement != null) params.time_increment = String(query.timeIncrement);
	if (query.filtering != null) params.filtering = JSON.stringify(query.filtering);

	if (query.actionAttributionWindows && query.actionAttributionWindows.length > 0) {
		params.action_attribution_windows = JSON.stringify(query.actionAttributionWindows);
	} else {
		params.use_unified_attribution_setting = "true";
	}

	return await fetchMetaAdsInsightRowsPaged(path, params, query.config.accessToken);
}
