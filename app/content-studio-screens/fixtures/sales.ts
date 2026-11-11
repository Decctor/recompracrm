import type { TGetGoalsStatsOutput } from "@/app/api/goals/stats/route";
import type { TGroupedSalesStats } from "@/app/api/stats/sales-grouped/route";
import type { TSalesGraphOutput } from "@/app/api/stats/sales-graph/route";
import type { TOverallSalesStats } from "@/lib/sales/overall-stats";

// Episódio g004 (ticket médio): este mês 1.300 vendas e R$ 45.500 (ticket R$ 35); antes 1.200 vendas e
// R$ 48.000 (ticket R$ 40). Os três vendedores somam exatamente o mês.
const pair = (atual: number, anterior: number) => ({ atual, anterior });

export const DEMO_OVERALL_SALES: TOverallSalesStats = {
	faturamentoMeta: 50000,
	faturamentoMetaPorcentagem: 91,
	faturamento: pair(45500, 48000),
	margemBruta: pair(13650, 14400),
	qtdeVendas: pair(1300, 1200),
	ticketMedio: pair(35, 40),
	qtdeItensVendidos: pair(2340, 2160),
	itensPorVendaMedio: pair(1.8, 1.8),
	valorDiarioVendido: pair(4136.36, 4363.64),
	faturamentoViaClientesRecorrentes: { ...pair(29575, 31680), porcentagem: 0.65 },
	faturamentoViaNovosClientes: { ...pair(6825, 7200), porcentagem: 0.15 },
	faturamentoViaClientesNaoIdentificados: { ...pair(9100, 9120), porcentagem: 0.2 },
};

const seller = (id: string, nome: string, qtde: number, total: number) => ({ vendedor: { id, identificador: nome.toUpperCase(), nome, avatarUrl: null }, qtde, total });

export const DEMO_GROUPED_SALES: TGroupedSalesStats = {
	porItem: [],
	porGrupo: [],
	porVendedor: [seller("content-studio-marcia", "Márcia", 520, 20384), seller("content-studio-lucas", "Lucas", 480, 16080), seller("content-studio-bia", "Bia", 300, 9036)],
	porCanal: [],
	porEntregaModalidade: [],
	porParceiro: [],
	porDiaDoMes: [],
	porMes: [],
	porDiaDaSemana: [],
	porDiaSemanaHora: [],
};

export const DEMO_SALES_GRAPH: TSalesGraphOutput = Array.from({ length: 11 }, (_, i) => ({
	titulo: `${String(i + 1).padStart(2, "0")}/11`,
	ATUAL: { qtde: 118, total: 4136 },
	ANTERIOR: { qtde: 109, total: 4364 },
	meta: 0,
}));

export const DEMO_GOALS_STATS = {
	data: { activeGoal: null, historico: [], totalMetas: 0, metasConcluidas: 0, mediaPercentualConclusiaoValor: 0 },
} satisfies TGetGoalsStatsOutput;
