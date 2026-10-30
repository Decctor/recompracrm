import { buildMetaAdsInsightFields } from "./fields";
import { fetchMetaAdsInsightsRaw } from "./insights-query";
import { aggregateRichMetrics, normalizeMetaAdsRich } from "./mappers";
import type {
	TMetaAdsBreakdown,
	TMetaAdsBreakdownKey,
	TMetaAdsBreakdownSegment,
	TMetaAdsBreakdownType,
	TMetaAdsIntegrationConfigWithToken,
	TMetaAdsRichMetrics,
} from "./types";

/** Combinações de breakdown que a Graph API aceita para cada eixo de análise. */
export const META_ADS_BREAKDOWN_PRESETS = {
	demographics: ["age", "gender"],
	region: ["region"],
	country: ["country"],
	placements: ["publisher_platform", "platform_position", "impression_device"],
	dayparting: ["hourly_stats_aggregated_by_advertiser_time_zone"],
} as const satisfies Record<string, readonly TMetaAdsBreakdownKey[]>;

type TBreakdownParams = {
	config: TMetaAdsIntegrationConfigWithToken;
	since: string;
	until: string;
	/** Recorta os insights de uma entidade (anúncio, conjunto, campanha) em vez da conta inteira. */
	objectId?: string | null;
};

type TSegmentRow = { segment: Partial<Record<TMetaAdsBreakdownKey, string>>; metrics: TMetaAdsRichMetrics };

async function fetchSegmentRows(params: TBreakdownParams & { breakdowns: readonly TMetaAdsBreakdownKey[] }): Promise<TSegmentRow[]> {
	const rows = await fetchMetaAdsInsightsRaw({
		config: params.config,
		level: params.objectId ? undefined : "account",
		objectId: params.objectId ?? undefined,
		since: params.since,
		until: params.until,
		fields: buildMetaAdsInsightFields({
			level: "account",
			breakdowns: params.breakdowns,
			includeIdentity: false,
			includeRankings: false,
			includeVideo: false,
		}),
		breakdowns: params.breakdowns,
		limit: 1000,
	});
	return rows.map((row) => {
		const segment: TSegmentRow["segment"] = {};
		for (const key of params.breakdowns) {
			const value = row[key];
			if (typeof value === "string" && value.length > 0) segment[key] = value;
		}
		return { segment, metrics: normalizeMetaAdsRich(row) };
	});
}

/** Agrupa por uma chave, agrega as métricas de cada grupo e ordena por investimento. */
function pivotBy(rows: readonly TSegmentRow[], keyOf: (row: TSegmentRow) => string | undefined): TMetaAdsBreakdownSegment[] {
	const groups = new Map<string, TMetaAdsRichMetrics[]>();
	for (const row of rows) {
		const key = keyOf(row);
		if (!key) continue;
		const bucket = groups.get(key);
		if (bucket) bucket.push(row.metrics);
		else groups.set(key, [row.metrics]);
	}
	return [...groups.entries()].map(([key, list]) => ({ key, metrics: aggregateRichMetrics(list) })).sort((a, b) => b.metrics.spend - a.metrics.spend);
}

export async function fetchMetaAdsBreakdown(params: TBreakdownParams & { type: TMetaAdsBreakdownType }): Promise<TMetaAdsBreakdown> {
	switch (params.type) {
		case "demographics": {
			const rows = await fetchSegmentRows({ ...params, breakdowns: META_ADS_BREAKDOWN_PRESETS.demographics });
			return {
				type: "demographics",
				byAge: pivotBy(rows, (row) => row.segment.age).sort((a, b) => a.key.localeCompare(b.key)),
				byGender: pivotBy(rows, (row) => row.segment.gender),
				byAgeGender: rows
					.filter((row) => row.segment.age && row.segment.gender)
					.map((row) => ({ age: row.segment.age as string, gender: row.segment.gender as string, metrics: row.metrics })),
			};
		}
		case "geography": {
			const [regionRows, countryRows] = await Promise.all([
				fetchSegmentRows({ ...params, breakdowns: META_ADS_BREAKDOWN_PRESETS.region }),
				fetchSegmentRows({ ...params, breakdowns: META_ADS_BREAKDOWN_PRESETS.country }),
			]);
			return {
				type: "geography",
				byRegion: pivotBy(regionRows, (row) => row.segment.region),
				byCountry: pivotBy(countryRows, (row) => row.segment.country),
			};
		}
		case "placements": {
			const rows = await fetchSegmentRows({ ...params, breakdowns: META_ADS_BREAKDOWN_PRESETS.placements });
			const byPosition = pivotBy(rows, (row) => {
				const { publisher_platform: platform, platform_position: position } = row.segment;
				return platform && position ? `${platform}|${position}` : undefined;
			}).map(({ key, metrics }) => {
				const [platform = "", position = ""] = key.split("|");
				return { platform, position, metrics };
			});
			return {
				type: "placements",
				byPlatform: pivotBy(rows, (row) => row.segment.publisher_platform),
				byPosition,
				byDevice: pivotBy(rows, (row) => row.segment.impression_device),
			};
		}
		case "dayparting": {
			const rows = await fetchSegmentRows({ ...params, breakdowns: META_ADS_BREAKDOWN_PRESETS.dayparting });
			// A Meta devolve a faixa como "00:00:00 - 00:59:59"; a hora é o que importa para o gráfico.
			const byHour = pivotBy(rows, (row) => row.segment.hourly_stats_aggregated_by_advertiser_time_zone?.slice(0, 2)).sort((a, b) =>
				a.key.localeCompare(b.key),
			);
			return { type: "dayparting", byHour };
		}
	}
}
