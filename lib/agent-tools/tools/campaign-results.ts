import { getCampaignStats } from "@/lib/campaigns/stats";
import z from "zod";
import { resolveOrganizationScope } from "../organization-scope";
import { PERIOD_DESCRIPTION, PeriodInputSchema, resolvePeriod } from "../period";
import { roundForModel } from "../serialization";
import { defineAgentTool } from "../types";

const GetCampaignResultsInputSchema = z.object({
	campanhaId: z.string({
		required_error: "Informe o id da campanha.",
		invalid_type_error: "Tipo inválido para o id da campanha.",
	}),
	periodo: PeriodInputSchema,
	organizacaoId: z.string({ invalid_type_error: "Tipo inválido para o id da organização." }).optional().nullable(),
});

export const campaignResultsTool = defineAgentTool({
	name: "get_campaign_results",
	title: "Resultado de campanha",
	scopes: ["agent:campaigns:read"],
	modes: ["ORG", "PLATAFORMA"],
	inputSchema: GetCampaignResultsInputSchema,
	describe: (actor) =>
		[
			"Resultado de envio e conversão de **uma** campanha no período: interações enviadas, clientes alcançados, entregas e falhas,",
			"conversões, taxa de conversão, receita atribuída e tempo médio até a conversão.",
			"Atende uma campanha por chamada; o `campanhaId` vem de `list_campaigns`.",
			"Duas leituras diferentes de conversão: `conversoes`/`receitaAtribuida` contam tudo que aconteceu depois do envio,",
			"enquanto `conversoesIncrementais`/`receitaIncremental` descontam o que provavelmente teria acontecido de qualquer jeito.",
			"A leitura incremental é a que mede o efeito da campanha.",
			PERIOD_DESCRIPTION,
			actor.mode === "PLATAFORMA" ? "`organizacaoId` (id ou slug) escolhe a organização." : "",
		]
			.filter(Boolean)
			.join(" "),
	execute: async (input, actor) => {
		const organizacaoId = await resolveOrganizationScope(actor, input.organizacaoId);
		const periodo = resolvePeriod(input.periodo);

		const result = await getCampaignStats({
			input: { campaignId: input.campanhaId, startDate: periodo.after, endDate: periodo.before },
			organizacaoId,
		});
		const stats = result.data;

		return {
			periodo: { inicio: periodo.inicio, fim: periodo.fim },
			campanhaId: stats.campanhaId,
			campanhaTitulo: stats.campanhaTitulo,
			envio: {
				interacoesEnviadas: stats.interacoesEnviadas,
				clientesAlcancados: stats.clientesAlcancados,
				totalEntregues: stats.totalEntregues,
				totalFalhas: stats.totalFalhas,
			},
			conversao: {
				conversoes: stats.conversoes,
				clientesConvertidos: stats.clientesConvertidos,
				taxaConversaoPercentual: roundForModel(stats.taxaConversao),
				receitaAtribuida: roundForModel(stats.receitaAtribuida),
				ticketMedioConversao: roundForModel(stats.ticketMedioConversao),
				tempoMedioConversaoHoras: roundForModel(stats.tempoMedioConversaoHoras),
			},
			conversaoIncremental: {
				conversoes: stats.conversoesIncrementais,
				receita: roundForModel(stats.receitaIncremental),
			},
			// Limite semanal é restrição operacional, não métrica: o agente precisa dela para não
			// sugerir "dispare de novo" numa campanha que já bateu a cota da semana.
			limiteSemanal: {
				restanteCampanha: stats.limiteSemanal.campaignRemainingThisWeek,
				restanteOrganizacao: stats.limiteSemanal.organizationRemainingThisWeek,
			},
		};
	},
});
