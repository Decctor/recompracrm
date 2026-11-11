import type { TGetClientsOutput } from "@/app/api/clients/route";
import type { TRFMLabelledStats } from "@/app/api/stats/sales-rfm-labelled/route";
import type { TSaleQueryFilterOptions } from "@/app/api/stats/sales-query-params/route";
import { NO_PURCHASES_RFM_LABEL } from "@/utils/rfm";

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
