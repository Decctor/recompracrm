import { getProductsRanking } from "@/lib/products/ranking";
import dayjs from "dayjs";
import z from "zod";
import { resolveOrganizationScope } from "../organization-scope";
import { PERIOD_DESCRIPTION, PeriodInputSchema, resolvePeriod } from "../period";
import { roundForModel } from "../serialization";
import { defineAgentTool } from "../types";

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

const RANKING_BY_MAP = {
	FATURAMENTO: "sales-total-value",
	QUANTIDADE: "sales-total-qty",
	MARGEM: "sales-total-margin",
} as const;

const GetProductPerformanceInputSchema = z.object({
	periodo: PeriodInputSchema,
	ordenacao: z.enum(["FATURAMENTO", "QUANTIDADE", "MARGEM"]).optional().nullable(),
	limite: z.number({ invalid_type_error: "Tipo inválido para o limite." }).int().positive().max(MAX_LIMIT).optional().nullable(),
	organizacaoId: z.string({ invalid_type_error: "Tipo inválido para o id da organização." }).optional().nullable(),
});

export const productPerformanceTool = defineAgentTool({
	name: "get_product_performance",
	title: "Desempenho de produtos",
	scopes: ["agent:products:read"],
	modes: ["ORG", "PLATAFORMA"],
	inputSchema: GetProductPerformanceInputSchema,
	describe: (actor) =>
		[
			"Ranking de produtos no período por faturamento, quantidade vendida ou margem, com a posição e os números do",
			"período anterior de mesma duração e a variação de posição (`variacaoPosicao`: positivo = subiu no ranking).",
			"Responde 'o que mais vendeu', 'o que carrega margem' e 'o que caiu' — é sobre o que **foi vendido**.",
			"O catálogo em si (preço, estoque, o que existe) está em `search_products`.",
			PERIOD_DESCRIPTION,
			`Devolve no máximo ${MAX_LIMIT} produtos por chamada.`,
			actor.mode === "PLATAFORMA" ? "`organizacaoId` (id ou slug) escolhe a organização." : "",
		]
			.filter(Boolean)
			.join(" "),
	execute: async (input, actor) => {
		const organizacaoId = await resolveOrganizationScope(actor, input.organizacaoId);
		const periodo = resolvePeriod(input.periodo);
		const limite = input.limite ?? DEFAULT_LIMIT;

		// Período de comparação derivado, não pedido ao modelo: "mesma duração, imediatamente
		// antes" é o que qualquer pessoa quer dizer com "comparado ao período anterior", e deixar
		// o modelo escolher produziria comparações diferentes a cada chamada.
		const durationDays = Math.max(dayjs(periodo.before).diff(dayjs(periodo.after), "days"), 1);
		const comparingBefore = dayjs(periodo.after).subtract(1, "day").endOf("day");
		const comparingAfter = comparingBefore.subtract(durationDays, "days").startOf("day");

		const result = await getProductsRanking({
			input: {
				periodAfter: periodo.after,
				periodBefore: periodo.before,
				comparingPeriodAfter: comparingAfter.toDate(),
				comparingPeriodBefore: comparingBefore.toDate(),
				rankingBy: RANKING_BY_MAP[input.ordenacao ?? "FATURAMENTO"],
			},
			organizacaoId,
		});

		const ranking = result.data.slice(0, limite);

		return {
			periodo: { inicio: periodo.inicio, fim: periodo.fim },
			periodoComparacao: { inicio: comparingAfter.toISOString(), fim: comparingBefore.toISOString() },
			ordenacao: input.ordenacao ?? "FATURAMENTO",
			total: result.data.length,
			exibindo: ranking.length,
			truncado: result.data.length > ranking.length,
			produtos: ranking.map((item) => ({
				produtoId: item.produtoId,
				nome: item.nome,
				grupo: item.grupo,
				posicao: item.rank,
				posicaoAnterior: item.rankComparison,
				// Delta positivo = subiu. O campo cru já vem com esse sinal; o nome em português é
				// que evita o modelo interpretar "rankDelta: 3" como "caiu três posições".
				variacaoPosicao: item.rankDelta,
				quantidadeVendida: roundForModel(item.totalQuantity, 3),
				faturamento: roundForModel(item.totalRevenue),
				margem: roundForModel(item.totalMargin),
				margemPercentual: roundForModel(item.marginPercentage),
				anterior: {
					quantidadeVendida: roundForModel(item.totalQuantityComparison, 3),
					faturamento: roundForModel(item.totalRevenueComparison),
					margem: roundForModel(item.totalMarginComparison),
				},
			})),
		};
	},
});
