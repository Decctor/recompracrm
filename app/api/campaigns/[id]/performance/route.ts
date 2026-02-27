import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { db } from "@/services/drizzle";
import { campaignConversions, campaigns, interactions } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, avg, count, countDistinct, eq, gte, lte, sum } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const GetCampaignPerformanceInputSchema = z.object({
	startDate: z
		.string()
		.optional()
		.nullable()
		.transform((v) => (v ? dayjs(v).toDate() : dayjs().subtract(30, "day").toDate())),
	endDate: z
		.string()
		.optional()
		.nullable()
		.transform((v) => (v ? dayjs(v).toDate() : dayjs().toDate())),
});
export type TGetCampaignPerformanceInput = z.infer<typeof GetCampaignPerformanceInputSchema>;

async function getCampaignPerformance({
	campaignId,
	input,
	session,
}: {
	campaignId: string;
	input: TGetCampaignPerformanceInput;
	session: TAuthUserSession;
}) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	// Verify campaign exists and belongs to the organization
	const campaign = await db.query.campaigns.findFirst({
		where: and(eq(campaigns.id, campaignId), eq(campaigns.organizacaoId, userOrgId)),
	});

	if (!campaign) throw new createHttpError.NotFound("Campanha não encontrada.");

	const dateRangeConditions = [
		eq(interactions.campanhaId, campaignId),
		eq(interactions.organizacaoId, userOrgId),
		eq(interactions.tipo, "ENVIO-MENSAGEM"),
		gte(interactions.dataInsercao, input.startDate),
		lte(interactions.dataInsercao, input.endDate),
	];

	// Get interactions count (messages sent) for this campaign in the date range
	const interactionsResult = await db
		.select({
			total: count(interactions.id),
			clientesAlcancados: countDistinct(interactions.clienteId),
		})
		.from(interactions)
		.where(and(...dateRangeConditions));

	const interacoesEnviadas = interactionsResult[0]?.total ?? 0;
	const clientesAlcancados = interactionsResult[0]?.clientesAlcancados ?? 0;

	// Get delivery breakdown
	const deliveryResult = await db
		.select({
			statusEnvio: interactions.statusEnvio,
			total: count(interactions.id),
		})
		.from(interactions)
		.where(and(...dateRangeConditions))
		.groupBy(interactions.statusEnvio);

	const totalEntregues = deliveryResult
		.filter((r) => r.statusEnvio === "DELIVERED" || r.statusEnvio === "READ")
		.reduce((acc, r) => acc + r.total, 0);

	const totalFalhas = deliveryResult.find((r) => r.statusEnvio === "FAILED")?.total ?? 0;

	// Get conversions for this campaign in the date range
	const conversionsResult = await db
		.select({
			total: count(campaignConversions.id),
			receitaTotal: sum(campaignConversions.atribuicaoReceita),
			tempoMedioMinutos: avg(campaignConversions.tempoParaConversaoMinutos),
			clientesConvertidos: countDistinct(campaignConversions.clienteId),
			ticketMedio: avg(campaignConversions.vendaValor),
		})
		.from(campaignConversions)
		.where(
			and(
				eq(campaignConversions.campanhaId, campaignId),
				eq(campaignConversions.organizacaoId, userOrgId),
				gte(campaignConversions.dataConversao, input.startDate),
				lte(campaignConversions.dataConversao, input.endDate),
			),
		);

	const conversoes = conversionsResult[0]?.total ?? 0;
	const receitaAtribuida = Number(conversionsResult[0]?.receitaTotal ?? 0);
	const tempoMedioMinutos = Number(conversionsResult[0]?.tempoMedioMinutos ?? 0);
	const clientesConvertidos = conversionsResult[0]?.clientesConvertidos ?? 0;
	const ticketMedioConversao = Number(conversionsResult[0]?.ticketMedio ?? 0);

	// Calculate conversion rate
	const taxaConversao = interacoesEnviadas > 0 ? (conversoes / interacoesEnviadas) * 100 : 0;

	// Convert average time to hours
	const tempoMedioConversaoHoras = tempoMedioMinutos / 60;

	return {
		data: {
			campanhaId: campaignId,
			campanhaTitulo: campaign.titulo,
			interacoesEnviadas,
			clientesAlcancados,
			totalEntregues,
			totalFalhas,
			conversoes,
			clientesConvertidos,
			taxaConversao: Math.round(taxaConversao * 100) / 100,
			receitaAtribuida,
			tempoMedioConversaoHoras: Math.round(tempoMedioConversaoHoras * 100) / 100,
			ticketMedioConversao: Math.round(ticketMedioConversao * 100) / 100,
			periodoInicio: input.startDate,
			periodoFim: input.endDate,
		},
		message: "Performance da campanha recuperada com sucesso.",
	};
}
export type TGetCampaignPerformanceOutput = Awaited<ReturnType<typeof getCampaignPerformance>>;

const getCampaignPerformanceRoute = async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");

	const { id: campaignId } = await params;
	if (!campaignId) throw new createHttpError.BadRequest("ID da campanha não informado.");

	const searchParams = request.nextUrl.searchParams;
	const input = GetCampaignPerformanceInputSchema.parse({
		startDate: searchParams.get("startDate") ?? undefined,
		endDate: searchParams.get("endDate") ?? undefined,
	});

	const result = await getCampaignPerformance({ campaignId, input, session: session });
	return NextResponse.json(result, { status: 200 });
};

export const GET = appApiHandler({
	GET: getCampaignPerformanceRoute,
});
