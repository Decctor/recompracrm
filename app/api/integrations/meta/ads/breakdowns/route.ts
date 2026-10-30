import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { canViewIntegrations } from "@/lib/integrations/mask";
import { fetchMetaAdsBreakdown } from "@/lib/integrations/meta/ads/breakdowns";
import { resolveMetaAdsIntegration, withMetaAdsAccessTracking } from "@/lib/integrations/meta/ads/config";
import { MetaAdsPeriodInputSchema, readMetaAdsPeriodParams, resolveMetaAdsPeriods } from "@/lib/integrations/meta/ads/period-input";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const GetMetaAdsBreakdownsInputSchema = MetaAdsPeriodInputSchema.extend({
	type: z.enum(["demographics", "geography", "placements", "dayparting"], {
		required_error: "Tipo de recorte não informado.",
		invalid_type_error: "Tipo inválido para o recorte.",
	}),
	// Recorta um anúncio, conjunto ou campanha. Sem ele, a conta inteira.
	objectId: z.string({ invalid_type_error: "Tipo inválido para o ID da entidade." }).optional().nullable(),
}).transform(resolveMetaAdsPeriods);
export type TGetMetaAdsBreakdownsInput = z.infer<typeof GetMetaAdsBreakdownsInputSchema>;

async function getMetaAdsBreakdowns({ input, organizacaoId }: { input: TGetMetaAdsBreakdownsInput; organizacaoId: string }) {
	const { integrationId, config } = await resolveMetaAdsIntegration({ organizacaoId, integrationId: input.integrationId });
	const breakdown = await withMetaAdsAccessTracking(integrationId, () =>
		fetchMetaAdsBreakdown({ config, type: input.type, objectId: input.objectId, ...input.period }),
	);
	return { data: { breakdown }, message: "Recorte buscado com sucesso." };
}
export type TGetMetaAdsBreakdownsOutput = Awaited<ReturnType<typeof getMetaAdsBreakdowns>>;

async function getMetaAdsBreakdownsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar as métricas do Meta Ads.");
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.BadRequest("Você precisa estar vinculado a uma organização.");
	if (!canViewIntegrations(session.membership?.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para visualizar integrações.");

	const searchParams = request.nextUrl.searchParams;
	const input = GetMetaAdsBreakdownsInputSchema.parse({
		...readMetaAdsPeriodParams(searchParams),
		type: searchParams.get("type"),
		objectId: searchParams.get("objectId"),
	});
	const result = await getMetaAdsBreakdowns({ input, organizacaoId });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getMetaAdsBreakdownsRoute });
