import { CAMPAIGN_SENT_INTERACTION_STATUSES } from "@/lib/campaigns/utils";
import { countIncrementalConversionsExpr, sumIncrementalRevenueExpr } from "@/lib/conversions/incremental";
import { getSendQuotaStatus } from "@/lib/interactions/send-counters";
import { db } from "@/services/drizzle";
import { campaignConversions, campaigns, interactions } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, avg, count, countDistinct, eq, gte, inArray, lte, sum } from "drizzle-orm";
import createHttpError from "http-errors";
import z from "zod";

/**
 * Resultado de envio e conversão de uma campanha, extraído de
 * `app/api/campaigns/stats/by-campaign/route.ts` para que o painel e o agente de IA
 * (`lib/agent-tools/tools/campaign-results.ts`) leiam os mesmos números.
 *
 * Nada aqui lê sessão ou request: a organização entra por parâmetro, sempre.
 */

export const GetCampaignStatsInputSchema = z.object({
	campaignId: z.string({
		required_error: "ID da campanha não informado.",
		invalid_type_error: "Tipo inválido para ID da campanha.",
	}),
	startDate: z
		.string({
			required_error: "Período não informado.",
			invalid_type_error: "Tipo inválido para período.",
		})
		.datetime({ message: "Tipo inválido para período." })
		.optional()
		.nullable()
		.transform((v) => (v ? dayjs(v).toDate() : dayjs().subtract(30, "day").toDate())),
	endDate: z
		.string({
			required_error: "Período não informado.",
			invalid_type_error: "Tipo inválido para período.",
		})
		.datetime({ message: "Tipo inválido para período." })
		.optional()
		.nullable()
		.transform((v) => (v ? dayjs(v).toDate() : dayjs().toDate())),
});
export type TGetCampaignStatsInput = z.infer<typeof GetCampaignStatsInputSchema>;

export async function getCampaignStats({ input, organizacaoId }: { input: TGetCampaignStatsInput; organizacaoId: string }) {
	// Verify campaign exists and belongs to the organization
	const campaign = await db.query.campaigns.findFirst({
		where: and(eq(campaigns.id, input.campaignId), eq(campaigns.organizacaoId, organizacaoId)),
	});

	if (!campaign) throw new createHttpError.NotFound("Campanha não encontrada.");

	const dateRangeConditions = [
		eq(interactions.campanhaId, input.campaignId),
		eq(interactions.organizacaoId, organizacaoId),
		eq(interactions.tipo, "ENVIO-MENSAGEM"),
		,
		gte(interactions.dataInsercao, input.startDate),
		lte(interactions.dataInsercao, input.endDate),
	];

	const [interactionsResult, deliveryResult, conversionsResult, weeklyLimitResult] = await Promise.all([
		db
			.select({
				total: count(interactions.id),
				clientesAlcancados: countDistinct(interactions.clienteId),
			})
			.from(interactions)
			.where(and(...dateRangeConditions, inArray(interactions.statusEnvio, [...CAMPAIGN_SENT_INTERACTION_STATUSES]))),
		db
			.select({
				statusEnvio: interactions.statusEnvio,
				total: count(interactions.id),
			})
			.from(interactions)
			.where(and(...dateRangeConditions, inArray(interactions.statusEnvio, ["ENVIADO", "ENTREGUE", "LIDO", "FALHOU"])))
			.groupBy(interactions.statusEnvio),
		db
			.select({
				total: count(campaignConversions.id),
				receitaTotal: sum(campaignConversions.atribuicaoReceita),
				receitaIncremental: sumIncrementalRevenueExpr,
				conversoesIncrementais: countIncrementalConversionsExpr,
				tempoMedioMinutos: avg(campaignConversions.tempoParaConversaoMinutos),
				clientesConvertidos: countDistinct(campaignConversions.clienteId),
				ticketMedio: avg(campaignConversions.vendaValor),
			})
			.from(campaignConversions)
			.where(
				and(
					eq(campaignConversions.campanhaId, input.campaignId),
					eq(campaignConversions.organizacaoId, organizacaoId),
					gte(campaignConversions.dataConversao, input.startDate),
					lte(campaignConversions.dataConversao, input.endDate),
				),
			),
		getSendQuotaStatus({ organizationId: organizacaoId, campaignId: input.campaignId }),
	]);

	const interacoesEnviadas = interactionsResult[0]?.total ?? 0;
	const clientesAlcancados = interactionsResult[0]?.clientesAlcancados ?? 0;

	const totalEntregues = deliveryResult.filter((r) => r.statusEnvio === "ENTREGUE" || r.statusEnvio === "LIDO").reduce((acc, r) => acc + r.total, 0);

	const totalFalhas = deliveryResult.find((r) => r.statusEnvio === "FALHOU")?.total ?? 0;

	const conversoes = conversionsResult[0]?.total ?? 0;
	const receitaAtribuida = Number(conversionsResult[0]?.receitaTotal ?? 0);
	const receitaIncremental = Number(conversionsResult[0]?.receitaIncremental ?? 0);
	const conversoesIncrementais = Number(conversionsResult[0]?.conversoesIncrementais ?? 0);
	const tempoMedioMinutos = Number(conversionsResult[0]?.tempoMedioMinutos ?? 0);
	const clientesConvertidos = conversionsResult[0]?.clientesConvertidos ?? 0;
	const ticketMedioConversao = Number(conversionsResult[0]?.ticketMedio ?? 0);

	// Calculate conversion rate
	const taxaConversao = interacoesEnviadas > 0 ? (conversoes / interacoesEnviadas) * 100 : 0;

	// Convert average time to hours
	const tempoMedioConversaoHoras = tempoMedioMinutos / 60;

	return {
		data: {
			campanhaId: input.campaignId,
			campanhaTitulo: campaign.titulo,
			interacoesEnviadas,
			clientesAlcancados,
			totalEntregues,
			totalFalhas,
			conversoes,
			conversoesIncrementais,
			clientesConvertidos,
			taxaConversao: Math.round(taxaConversao * 100) / 100,
			receitaAtribuida,
			receitaIncremental: Math.round(receitaIncremental * 100) / 100,
			tempoMedioConversaoHoras: Math.round(tempoMedioConversaoHoras * 100) / 100,
			ticketMedioConversao: Math.round(ticketMedioConversao * 100) / 100,
			// Quota por janela (dia e semana), organização e campanha, lida do ledger de contadores.
			quota: weeklyLimitResult,
			limiteSemanal: {
				campaignEffectiveWeeklyLimit: weeklyLimitResult.find((w) => w.tipo === "SEMANAL")?.campanha.limite ?? null,
				campaignUsedThisWeek: weeklyLimitResult.find((w) => w.tipo === "SEMANAL")?.campanha.usados ?? 0,
				campaignRemainingThisWeek: weeklyLimitResult.find((w) => w.tipo === "SEMANAL")?.campanha.restante ?? null,
				organizationWeeklyLimit: weeklyLimitResult.find((w) => w.tipo === "SEMANAL")?.organizacao.limite ?? null,
				organizationUsedThisWeek: weeklyLimitResult.find((w) => w.tipo === "SEMANAL")?.organizacao.usados ?? 0,
				organizationRemainingThisWeek: weeklyLimitResult.find((w) => w.tipo === "SEMANAL")?.organizacao.restante ?? null,
			},
			periodoInicio: input.startDate,
			periodoFim: input.endDate,
		},
		message: "Performance da campanha recuperada com sucesso.",
	};
}
export type TGetCampaignStatsOutput = Awaited<ReturnType<typeof getCampaignStats>>;
