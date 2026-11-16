import type { TGetClientsOutput } from "@/app/api/clients/route";
import type { TRFMLabelledStats } from "@/app/api/stats/sales-rfm-labelled/route";
import type { TSaleQueryFilterOptions } from "@/app/api/stats/sales-query-params/route";
import type { TGetRFMHealthOutput } from "@/app/api/segmentations/rfm-health/route";
import { NO_PURCHASES_RFM_LABEL, type TRFMConfig } from "@/utils/rfm";

// Episódios g002 (churn), 003 e 004: uma base de ~1.000 clientes com 118 em risco e 120 perdidos.
// Rótulos, cores e áreas da grade são os mesmos que /api/stats/sales-rfm-labelled devolve.
const SEGMENTS: Array<[label: string, background: string, gridArea: string, clients: number, revenue: number, purchases: number]> = [
	[NO_PURCHASES_RFM_LABEL, "bg-slate-500", "", 0, 0, 0],
	["NÃO PODE PERDÊ-LOS", "bg-blue-400", "1 / 1 / 2 / 3", 38, 21480, 412],
	["CLIENTES LEAIS", "bg-green-400", "1 / 3 / 3 / 6", 212, 58930, 1388],
	["CAMPEÕES", "bg-orange-400", "1 / 5 / 2 / 6", 84, 64210, 1104],
	["EM RISCO", "bg-yellow-400", "2 / 1 / 4 / 3", 118, 18760, 402],
	["PRECISAM DE ATENÇÃO", "bg-indigo-400", "3 / 3 / 4 / 4", 96, 12340, 318],
	["POTENCIAIS CLIENTES LEAIS", "bg-[#5C4033]", "3 / 4 / 5 / 6", 141, 27150, 702],
	["HIBERNANDO", "bg-purple-400", "4 / 2 / 5 / 3", 74, 9870, 236],
	["PRESTES A DORMIR", "bg-yellow-600", "4 / 3 / 6 / 4", 63, 11420, 288],
	["PERDIDOS", "bg-red-500", "4 / 1 / 6 / 3", 120, 8130, 214],
	["PROMISSORES", "bg-pink-400", "5 / 4 / 6 / 5", 29, 10660, 251],
	["CLIENTES RECENTES", "bg-teal-400", "5 / 5 / 6 / 6", 25, 7940, 198],
];

export const DEMO_RFM_LABELLED: TRFMLabelledStats = SEGMENTS.map(([rfmLabel, backgroundCollor, gridArea, clientsQty, totalRevenue, totalPurchasesQty]) => ({
	rfmLabel,
	backgroundCollor,
	gridArea,
	clientsQty,
	segmentPeriodStats: {
		totalRevenue,
		totalPurchasesQty,
		avgTicket: totalPurchasesQty > 0 ? totalRevenue / totalPurchasesQty : 0,
		medianPurchaseCycleDays: 30,
		avgBasketSize: 1.8,
		cycleSampleClientsQty: Math.round(clientsQty * 0.6),
		repeatPurchaseRate: 0.6,
		avgRecencyDays: 45,
		cycleLagRatio: 1.5,
	},
}));

export const DEMO_EMPTY_CLIENTS = { data: { byId: undefined, default: { clients: [], clientsMatched: 0, totalPages: 0 } } } satisfies TGetClientsOutput;

export const DEMO_SALE_FILTER_OPTIONS: TSaleQueryFilterOptions = { integrations: [], sellers: [], partners: [], productsGroups: [] };

// Saúde da matriz RFM (seção abaixo da matriz): uma base saudável, coerente com SEGMENTS. Sem esta
// resposta a seção fica no carregamento animado e cada captura sai com um quadro diferente.
const ranges = (bounds: [number, number, number, number, number, number], higherIsBetter: boolean): TRFMConfig["frequencia"] => {
	const [b0, b1, b2, b3, b4, b5] = bounds;
	const asc = [
		{ min: b0, max: b1 },
		{ min: b1, max: b2 },
		{ min: b2, max: b3 },
		{ min: b3, max: b4 },
		{ min: b4, max: b5 },
	];
	const ordered = higherIsBetter ? asc : [...asc].reverse();
	return { 1: ordered[0], 2: ordered[1], 3: ordered[2], 4: ordered[3], 5: ordered[4] };
};
const DEMO_RFM_CONFIG: TRFMConfig = {
	identificador: "CONFIG_RFM",
	recencia: ranges([0, 15, 30, 60, 120, 365], false),
	frequencia: ranges([1, 1, 2, 4, 8, 60], true),
	monetario: ranges([0, 40, 90, 180, 400, 5000], true),
};
const metric = (count: number, average: number, p: [number, number, number, number, number, number, number, number, number]) => ({
	count,
	average,
	median: p[4],
	percentiles: { p0: p[0], p5: p[1], p10: p[2], p25: p[3], p50: p[4], p75: p[5], p90: p[6], p95: p[7], p100: p[8] },
});
const histogram = (min: number, step: number, counts: number[]) => ({
	bins: counts.map((count, index) => ({ start: min + index * step, end: min + (index + 1) * step, count })),
	min,
	max: min + step * counts.length,
	clippedAt: null,
	overflowCount: 0,
});
const HEALTH_TOTAL = SEGMENTS.reduce((sum, [, , , clients]) => sum + clients, 0);

export const DEMO_RFM_HEALTH = {
	data: {
		period: { months: 12, start: new Date("2025-11-16T03:00:00.000Z"), end: new Date("2026-11-16T02:59:59.999Z") },
		totalClients: HEALTH_TOTAL,
		healthScore: {
			classification: "SAUDAVEL" as const,
			label: "Saudável",
			summary: "A configuração RFM parece coerente com o comportamento da sua base no período analisado.",
		},
		alerts: [],
		labelDistribution: SEGMENTS.filter(([label]) => label !== NO_PURCHASES_RFM_LABEL).map(([label, , , count]) => ({ label, count, percentage: (count / HEALTH_TOTAL) * 100 })),
		scoreDistribution: {
			recency: { 1: 194, 2: 137, 3: 181, 4: 213, 5: 180 },
			frequency: { 1: 262, 2: 205, 3: 188, 4: 151, 5: 99 },
			monetary: { 1: 181, 2: 181, 3: 181, 4: 181, 5: 181 },
		},
		metrics: {
			recency: metric(HEALTH_TOTAL, 74, [0, 3, 7, 18, 46, 104, 182, 241, 365]),
			frequency: metric(HEALTH_TOTAL, 4.6, [1, 1, 1, 2, 3, 6, 10, 14, 58]),
			monetary: metric(HEALTH_TOTAL, 276, [12, 24, 36, 78, 158, 344, 612, 880, 4920]),
		},
		histograms: {
			recency: histogram(0, 16, [118, 104, 92, 81, 70, 61, 54, 47, 41, 36, 31, 27, 24, 20, 17]),
			frequency: [
				{ label: "1", min: 1, max: 1, count: 262 },
				{ label: "2", min: 2, max: 2, count: 171 },
				{ label: "3", min: 3, max: 3, count: 128 },
				{ label: "4", min: 4, max: 4, count: 94 },
				{ label: "5", min: 5, max: 5, count: 71 },
				{ label: "6-10", min: 6, max: 10, count: 112 },
				{ label: "11-20", min: 11, max: 20, count: 48 },
				{ label: "20+", min: 21, max: Number.MAX_SAFE_INTEGER, count: 19 },
			],
			monetary: histogram(12, 58, [96, 132, 118, 97, 81, 66, 54, 44, 36, 30, 24, 20, 16, 13, 11]),
		},
		rfmConfig: DEMO_RFM_CONFIG,
		suggestedConfig: DEMO_RFM_CONFIG,
	},
	message: "Saúde da matriz RFM calculada com sucesso.",
} satisfies TGetRFMHealthOutput;
