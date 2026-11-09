import { getOverallSaleGoal, getOverallStats } from "@/lib/sales/overall-stats";
import z from "zod";
import { resolveOrganizationScope } from "../organization-scope";
import { PERIOD_DESCRIPTION, PeriodInputSchema, resolvePeriod } from "../period";
import { roundForModel } from "../serialization";
import { defineAgentTool } from "../types";

const CommercialResultsInputSchema = z.object({
	periodo: PeriodInputSchema,
	organizacaoId: z.string({ invalid_type_error: "Tipo inválido para o id da organização." }).optional().nullable(),
});

/** Variação relativa ao período anterior. Sem base anterior não há variação — devolve nulo. */
function computeVariation(current: number, previous: number | undefined) {
	if (previous === undefined || !Number.isFinite(previous) || previous === 0) return undefined;
	return roundForModel(((current - previous) / previous) * 100);
}

function describeMetric(current: number, previous: number | undefined, decimals = 2) {
	return {
		atual: roundForModel(current, decimals),
		anterior: roundForModel(previous, decimals),
		variacaoPercentual: computeVariation(current, previous),
	};
}

export const commercialResultsTool = defineAgentTool({
	name: "get_commercial_results",
	title: "Resultados comerciais",
	scopes: ["agent:results:read"],
	modes: ["ORG", "PLATAFORMA"],
	inputSchema: CommercialResultsInputSchema,
	describe: (actor) =>
		[
			"Resultado comercial consolidado de um período: faturamento, margem bruta, ticket médio, quantidade de vendas e itens,",
			"além da composição do faturamento entre clientes recorrentes, clientes novos e vendas não identificadas.",
			"Cada métrica vem com o valor do período anterior de mesma duração e a variação percentual.",
			"Considera apenas vendas confirmadas.",
			PERIOD_DESCRIPTION,
			actor.mode === "PLATAFORMA"
				? "Conexão de plataforma: `organizacaoId` (id ou slug) escolhe a organização."
				: "Sempre responde sobre a organização desta conexão.",
		].join(" "),
	execute: async (input, actor) => {
		const organizacaoId = await resolveOrganizationScope(actor, input.organizacaoId);
		const periodo = resolvePeriod(input.periodo);

		const filters = {
			period: { after: periodo.inicio, before: periodo.fim },
			total: { min: null, max: null },
			integrationsIds: [],
			sellersIds: [],
			clientRFMTitles: [],
			excludedSalesIds: [],
		};

		const [stats, meta] = await Promise.all([
			getOverallStats(filters, organizacaoId),
			getOverallSaleGoal({ after: periodo.inicio, before: periodo.fim, organizacaoId }),
		]);

		// `getOverallStats` divide por zero em período sem venda (ticket médio, itens por venda).
		// `sanitizeForModel` remove os NaN antes de o payload chegar ao modelo — omitir é o
		// comportamento certo aqui: "não houve venda" e "ticket médio zero" são coisas diferentes.
		return {
			periodo: { inicio: periodo.inicio, fim: periodo.fim },
			faturamento: describeMetric(stats.faturamento.atual, stats.faturamento.anterior),
			margemBruta: describeMetric(stats.margemBruta.atual, stats.margemBruta.anterior),
			ticketMedio: describeMetric(stats.ticketMedio.atual, stats.ticketMedio.anterior),
			qtdeVendas: describeMetric(stats.qtdeVendas.atual, stats.qtdeVendas.anterior, 0),
			qtdeItensVendidos: describeMetric(stats.qtdeItensVendidos.atual, stats.qtdeItensVendidos.anterior, 0),
			itensPorVendaMedio: describeMetric(stats.itensPorVendaMedio.atual, stats.itensPorVendaMedio.anterior),
			valorDiarioVendido: describeMetric(stats.valorDiarioVendido.atual, stats.valorDiarioVendido.anterior),
			meta: {
				objetivo: roundForModel(meta),
				atingidoPercentual: meta > 0 ? roundForModel((stats.faturamento.atual / meta) * 100) : undefined,
			},
			composicaoFaturamento: {
				clientesRecorrentes: {
					valor: roundForModel(stats.faturamentoViaClientesRecorrentes.atual),
					percentual: roundForModel(stats.faturamentoViaClientesRecorrentes.porcentagem),
				},
				novosClientes: {
					valor: roundForModel(stats.faturamentoViaNovosClientes.atual),
					percentual: roundForModel(stats.faturamentoViaNovosClientes.porcentagem),
				},
				naoIdentificados: {
					valor: roundForModel(stats.faturamentoViaClientesNaoIdentificados.atual),
					percentual: roundForModel(stats.faturamentoViaClientesNaoIdentificados.porcentagem),
				},
			},
		};
	},
});
