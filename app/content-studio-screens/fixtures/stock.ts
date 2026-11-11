import type { TGetProductPriceCostHistoryOutput } from "@/app/api/products/price-cost-history/route";
import type { TGetProductStockAnalyticsOutput } from "@/app/api/products/stock-analytics/route";
import type { TGetProductStockLotsOutput } from "@/app/api/products/stock-lots/route";
import type { TGetProductStockTransactionsOutput } from "@/app/api/products/stock-transactions/route";
import type { TGetProductionRecipesOutput } from "@/app/api/productions/recipes/route";

// Episódio g003: o picolé de morango é classe A, 1º de 48 produtos em faturamento no trimestre.
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-10T12:00:00Z").getTime();

export const DEMO_STOCK_ANALYTICS = {
	data: {
		analytics: {
			produto: { saldo: 186, unidade: "UN", precoVenda: 10 },
			kpis: { coberturaDias: 12, consumoMedioDia: 15.5, consumoMedioAnterior: 13.2, desvioPadrao: 4.1, giro: 2.4, saidasPeriodo: 465 },
			reposicao: {
				prazoDias: 3,
				prazoOrigem: "PADRAO",
				comprasConsideradas: 0,
				estoqueSeguranca: 30,
				pontoPedido: 77,
				sugestao: 0,
				abaixoPontoPedido: false,
				rupturaPrevista: NOW + 12 * DAY,
			},
			serie: Array.from({ length: 30 }, (_, i) => ({ dia: new Date(NOW - (29 - i) * DAY).toISOString().slice(0, 10), saldo: 160 + ((i * 37) % 90), entradas: i % 7 === 0 ? 120 : 0, saidas: 15 })),
			eventos: [],
			abc: {
				classe: "A",
				classeVolume: "A",
				posicao: 1,
				totalProdutos: 48,
				faturamento: 13950,
				participacao: 0.0698,
				faturamentoTotal: 200000,
				classes: {
					A: { produtos: 9, participacao: 0.8, valor: 160000, participacaoCatalogo: 9 / 48 },
					B: { produtos: 11, participacao: 0.15, valor: 30000, participacaoCatalogo: 11 / 48 },
					C: { produtos: 28, participacao: 0.05, valor: 10000, participacaoCatalogo: 28 / 48 },
				},
				curva: Array.from({ length: 40 }, (_, i) => ({ x: (i + 1) / 40, y: Math.min(1, 1 - Math.pow(1 - (i + 1) / 40, 3.2)) })),
				ponto: { x: 1 / 48, y: 0.0698 },
			},
		},
	},
	message: "Análise de estoque do produto obtida com sucesso.",
} satisfies TGetProductStockAnalyticsOutput;

export const DEMO_STOCK_LOTS = { data: { byId: undefined, default: { stockLots: [], stockLotsMatched: 0, totalPages: 1 } }, message: "Lotes encontrados com sucesso." } satisfies TGetProductStockLotsOutput;
export const DEMO_STOCK_TRANSACTIONS = { data: { default: { transactions: [], transactionsMatched: 0, totalPages: 1, resumo: { totalEntradas: 0, totalSaidas: 0, totalMovimentacoes: 0 } } }, message: "Movimentações encontradas." } satisfies TGetProductStockTransactionsOutput;
export const DEMO_PRICE_COST_HISTORY = {
	data: { inicio: NOW - 90 * DAY, fim: NOW, compras: [], precos: [], resumo: { custoInicio: 7, custoAtual: 7, precoInicio: 10, precoAtual: 10, margemInicio: 0.3, margemAtual: 0.3, custoMedioPonderado: null, quantidadeCompras: 0 } },
	message: "Histórico encontrado.",
} satisfies TGetProductPriceCostHistoryOutput;
export const DEMO_RECIPES = { data: { byId: undefined, default: { recipes: [], recipesMatched: 0, totalPages: 1 } }, message: "Receitas encontradas com sucesso." } satisfies TGetProductionRecipesOutput;
