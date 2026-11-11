import type { TGetSalesResultsOutput } from "@/app/api/sales/results/route";

// Episódio g004: a aba Operacional dos resultados, com o ticket médio de cada vendedor. Os três
// somam o mês da loja (1.300 vendas, R$ 45.500) e o mês anterior (1.200 vendas, R$ 48.000).
const seller = (vendedorId: string, vendedorNome: string, qtdeVendas: number, faturamento: number) => ({
	vendedorId,
	vendedorNome,
	vendedorAvatarUrl: null,
	qtdeVendas,
	faturamento,
	descontos: 0,
	ticketMedio: faturamento / qtdeVendas,
	qtdeItens: Math.round(qtdeVendas * 1.8),
	custoTotal: faturamento * 0.7,
	margemBruta: faturamento * 0.3,
	canceladas: { qtde: 0, valor: 0 },
	meta: null,
});
const pair = (atual: number, anterior: number) => ({ atual, anterior });

export const DEMO_RESULTS_PERIOD = {
	inicio: new Date("2026-11-01T03:00:00.000Z"),
	fim: new Date("2026-12-01T02:59:59.999Z"),
	anteriorInicio: new Date("2026-10-01T03:00:00.000Z"),
	anteriorFim: new Date("2026-11-01T02:59:59.999Z"),
};

export const DEMO_SALES_RESULTS = {
	data: {
		periodo: DEMO_RESULTS_PERIOD,
		resumo: {
			periodo: DEMO_RESULTS_PERIOD,
			qtdeVendas: pair(1300, 1200),
			faturamento: pair(45500, 48000),
			descontos: pair(0, 0),
			acrescimos: pair(0, 0),
			ticketMedio: pair(35, 40),
			qtdeItens: pair(2340, 2160),
			custoTotal: pair(31850, 33600),
			margemBruta: pair(13650, 14400),
			canceladas: { qtde: 0, valor: 0 },
			meta: null,
		},
		porMetodo: { linhas: [], totalRecebido: 45500, totalBruto: 45500, ajustes: { total: 0, troco: 0, trocoRegistrado: 0, trocoInferido: 0, taxasCanal: 0, naoClassificado: 0 }, cobertura: { vendasComPagamento: 1300, vendasSemPagamento: 0, valorSemPagamento: 0 } },
		porVendedor: [seller("content-studio-marcia", "Márcia", 520, 20384), seller("content-studio-lucas", "Lucas", 480, 16080), seller("content-studio-bia", "Bia", 300, 9036)],
		porModalidade: { linhas: [], faturamentoTotal: 45500 },
		fiscal: { porTipo: [], vendasSemDocumento: { qtde: 0 }, vendasComPendencia: { qtde: 0, valor: 0 }, rejeicoes: [], ultimasPendencias: [] },
		filterOptions: { canais: [], contasFinanceiras: [] },
	},
	message: "Resultados de vendas calculados com sucesso.",
} satisfies TGetSalesResultsOutput;
