import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { db } from "@/services/drizzle";
import { campaignConversions, interactions } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, asc, count, eq, gte, lte, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const GetCampaignFunnelInputSchema = z.object({
	startDate: z
		.string()
		.optional()
		.nullable()
		.transform((v) => (v ? dayjs(v).startOf("day").toDate() : undefined)),
	endDate: z
		.string()
		.optional()
		.nullable()
		.transform((v) => (v ? dayjs(v).endOf("day").toDate() : undefined)),
});
export type TGetCampaignFunnelInput = z.infer<typeof GetCampaignFunnelInputSchema>;
async function getCampaignFunnel({ input, session }: { input: TGetCampaignFunnelInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	let startDate = input.startDate;
	const endDate = input.endDate ?? new Date();

	if (!startDate) {
		const firstInteraction = await db
			.select({
				date: interactions.dataInsercao,
			})
			.from(interactions)
			.where(eq(interactions.organizacaoId, userOrgId))
			.orderBy(asc(interactions.dataInsercao))
			.limit(1);
		startDate = firstInteraction[0]?.date ?? dayjs().subtract(30, "day").toDate();
	}

	// Get total interactions (sent messages) in the period
	const totalInteractions = await db
		.select({
			total: count(interactions.id),
		})
		.from(interactions)
		.where(
			and(
				eq(interactions.organizacaoId, userOrgId),
				eq(interactions.tipo, "ENVIO-MENSAGEM"),
				gte(interactions.dataInsercao, startDate),
				lte(interactions.dataInsercao, endDate),
			),
		);

	const enviados = Number(totalInteractions[0]?.total ?? 0);

	// Get interactions by delivery status
	const interactionsByStatus = await db
		.select({
			statusEnvio: interactions.statusEnvio,
			total: count(interactions.id),
		})
		.from(interactions)
		.where(
			and(
				eq(interactions.organizacaoId, userOrgId),
				eq(interactions.tipo, "ENVIO-MENSAGEM"),
				gte(interactions.dataInsercao, startDate),
				lte(interactions.dataInsercao, endDate),
			),
		)
		.groupBy(interactions.statusEnvio);

	// Map statuses to counts
	const statusMap = new Map(interactionsByStatus.map((s) => [s.statusEnvio, Number(s.total)]));

	// Calculate funnel stages
	const entregues = (statusMap.get("ENTREGUE") ?? 0) + (statusMap.get("LIDO") ?? 0);
	const lidos = statusMap.get("LIDO") ?? 0;

	// Get total conversions in the period
	const totalConversions = await db
		.select({
			total: count(campaignConversions.id),
		})
		.from(campaignConversions)
		.where(
			and(
				eq(campaignConversions.organizacaoId, userOrgId),
				gte(campaignConversions.dataConversao, startDate),
				lte(campaignConversions.dataConversao, endDate),
			),
		);

	const convertidos = Number(totalConversions[0]?.total ?? 0);

	// Calculate conversion rates between stages
	const taxaEntrega = enviados > 0 ? (entregues / enviados) * 100 : 0;
	const taxaLeitura = entregues > 0 ? (lidos / entregues) * 100 : 0;
	const taxaConversaoGeral = enviados > 0 ? (convertidos / enviados) * 100 : 0;
	const taxaConversaoDeLidos = lidos > 0 ? (convertidos / lidos) * 100 : 0;

	return {
		data: {
			enviados,
			entregues,
			lidos,
			convertidos,
			taxaEntrega: Math.round(taxaEntrega * 100) / 100,
			taxaLeitura: Math.round(taxaLeitura * 100) / 100,
			taxaConversaoGeral: Math.round(taxaConversaoGeral * 100) / 100,
			taxaConversaoDeLidos: Math.round(taxaConversaoDeLidos * 100) / 100,
			periodoInicio: startDate,
			periodoFim: endDate,
		},
		message: "Funil de conversão recuperado com sucesso.",
	};
}

export type TGetCampaignFunnelOutput = Awaited<ReturnType<typeof getCampaignFunnel>>;

const getCampaignFunnelRoute = async (request: NextRequest) => {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");

	const searchParams = request.nextUrl.searchParams;
	const input = GetCampaignFunnelInputSchema.parse({
		startDate: searchParams.get("startDate") ?? undefined,
		endDate: searchParams.get("endDate") ?? undefined,
	});

	const result = await getCampaignFunnel({ input, session: session });
	return NextResponse.json(result, { status: 200 });
};

export const GET = appApiHandler({
	GET: getCampaignFunnelRoute,
});
