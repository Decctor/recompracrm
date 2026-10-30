import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { canViewIntegrations } from "@/lib/integrations/mask";
import { resolveMetaAdsIntegration, withMetaAdsAccessTracking } from "@/lib/integrations/meta/ads/config";
import { fetchMetaAdsRichEntities, fetchMetaAdsRichTotals } from "@/lib/integrations/meta/ads/insights";
import { MetaAdsPeriodInputSchema, readMetaAdsPeriodParams, resolveMetaAdsPeriods } from "@/lib/integrations/meta/ads/period-input";
import type { TMetaAdsRichEntity, TMetaAdsRichMetrics } from "@/lib/integrations/meta/ads/types";
import { db } from "@/services/drizzle";
import { mediaAds } from "@/services/drizzle/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const GetMetaAdsInsightsInputSchema = MetaAdsPeriodInputSchema.extend({
	level: z
		.enum(["account", "campaign", "adset", "ad"], { invalid_type_error: "Tipo inválido para o nível." })
		.optional()
		.nullable()
		.transform((v) => v ?? "account"),
	campaignId: z.string({ invalid_type_error: "Tipo inválido para o ID da campanha." }).optional().nullable(),
}).transform(resolveMetaAdsPeriods);
export type TGetMetaAdsInsightsInput = z.infer<typeof GetMetaAdsInsightsInputSchema>;

type TCampaignCatalogInfo = { campanhaStatus: string | null; campanhaObjetivo: string | null };

/** Status e objetivo das campanhas vêm do catálogo: evita uma chamada a `/{act}/campaigns` por visita. */
async function getCampaignCatalogInfo(integrationId: string) {
	const rows = await db
		.selectDistinctOn([mediaAds.campanhaId], {
			campanhaId: mediaAds.campanhaId,
			campanhaStatus: mediaAds.campanhaStatus,
			campanhaObjetivo: mediaAds.campanhaObjetivo,
		})
		.from(mediaAds)
		.where(and(eq(mediaAds.integracaoId, integrationId), isNotNull(mediaAds.campanhaId)));
	return new Map<string, TCampaignCatalogInfo>(rows.map((row) => [row.campanhaId as string, row]));
}

function entityKey(entity: TMetaAdsRichEntity) {
	return entity.adId ?? entity.adsetId ?? entity.campaignId ?? "";
}

async function getMetaAdsInsights({ input, organizacaoId }: { input: TGetMetaAdsInsightsInput; organizacaoId: string }) {
	const { integrationId, config } = await resolveMetaAdsIntegration({ organizacaoId, integrationId: input.integrationId });

	return await withMetaAdsAccessTracking(integrationId, async () => {
		if (input.level === "account") {
			const [current, comparing] = await Promise.all([
				fetchMetaAdsRichTotals({ config, ...input.period, objectId: input.campaignId }),
				input.comparing ? fetchMetaAdsRichTotals({ config, ...input.comparing, objectId: input.campaignId }) : Promise.resolve(null),
			]);
			return {
				data: { account: { metrics: current, comparing }, rows: null },
				message: "Métricas da conta buscadas com sucesso.",
			};
		}

		const level = input.level;
		const [current, comparing, catalog] = await Promise.all([
			fetchMetaAdsRichEntities({ config, level, ...input.period, campaignId: input.campaignId, includeVideo: level === "ad" }),
			input.comparing
				? fetchMetaAdsRichEntities({ config, level, ...input.comparing, campaignId: input.campaignId, includeVideo: level === "ad" })
				: Promise.resolve(null),
			level === "campaign" ? getCampaignCatalogInfo(integrationId) : Promise.resolve(null),
		]);
		const comparingByKey = new Map<string, TMetaAdsRichMetrics>((comparing ?? []).map((entity) => [entityKey(entity), entity.metrics]));
		const rows = current
			.map((entity) => {
				const info = entity.campaignId ? catalog?.get(entity.campaignId) : undefined;
				return {
					...entity,
					campanhaStatus: info?.campanhaStatus ?? null,
					campanhaObjetivo: info?.campanhaObjetivo ?? null,
					// Entidade sem entrega no período de comparação: `null`, nunca zero.
					comparing: input.comparing ? (comparingByKey.get(entityKey(entity)) ?? null) : null,
				};
			})
			.sort((a, b) => b.metrics.spend - a.metrics.spend);
		return { data: { account: null, rows }, message: "Métricas buscadas com sucesso." };
	});
}
export type TGetMetaAdsInsightsOutput = Awaited<ReturnType<typeof getMetaAdsInsights>>;
export type TMetaAdsInsightsRow = NonNullable<TGetMetaAdsInsightsOutput["data"]["rows"]>[number];

async function getMetaAdsInsightsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar as métricas do Meta Ads.");
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.BadRequest("Você precisa estar vinculado a uma organização.");
	if (!canViewIntegrations(session.membership?.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para visualizar integrações.");

	const searchParams = request.nextUrl.searchParams;
	const input = GetMetaAdsInsightsInputSchema.parse({
		...readMetaAdsPeriodParams(searchParams),
		level: searchParams.get("level"),
		campaignId: searchParams.get("campaignId"),
	});
	const result = await getMetaAdsInsights({ input, organizacaoId });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getMetaAdsInsightsRoute });
