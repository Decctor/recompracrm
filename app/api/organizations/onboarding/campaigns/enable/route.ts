import { captureServerEvent } from "@/lib/analytics/posthog-server";
import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { assertCanActivateCampaigns } from "@/lib/campaigns/access";
import { getJourney, reconcileOnboardingCampaigns, updateJourneyProgress } from "@/lib/onboarding";
import { db } from "@/services/drizzle";
import { campaigns } from "@/services/drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// Liberação explícita de envios. Grava a intenção na jornada e reconcilia: a campanha só vira
// `ativo` se também estiver pronta. Resolver uma dependência depois nunca dispara sem esta escolha.
const EnableOnboardingCampaignsInputSchema = z.object({
	chaves: z.array(z.string({ invalid_type_error: "Tipo não válido para a chave da campanha." })),
	habilitar: z.boolean({ invalid_type_error: "Tipo não válido para habilitar." }).default(true),
});
export type TEnableOnboardingCampaignsInput = z.infer<typeof EnableOnboardingCampaignsInputSchema>;

async function enableOnboardingCampaigns({ input, session }: { input: TEnableOnboardingCampaignsInput; session: TAuthUserSession }) {
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para liberar campanhas.");

	const journey = await getJourney({ executor: db, organizationId: organizacaoId, produto: "CRM" });
	if (!journey) throw new createHttpError.NotFound("Jornada CRM não encontrada.");

	const current = new Set(journey.respostas.campanhasComEnvioHabilitado);
	for (const chave of input.chaves) {
		if (input.habilitar) current.add(chave);
		else current.delete(chave);
	}

	await db.transaction(async (tx) => {
		await updateJourneyProgress({
			executor: tx,
			organizationId: organizacaoId,
			produto: "CRM",
			respostas: { campanhasComEnvioHabilitado: Array.from(current) },
		});
		if (!input.habilitar && input.chaves.length)
			await tx
				.update(campaigns)
				.set({ ativo: false })
				.where(and(eq(campaigns.organizacaoId, organizacaoId), inArray(campaigns.chavePreset, input.chaves)));
	});

	const { readiness, changes } = await reconcileOnboardingCampaigns({ executor: db, organizationId: organizacaoId });

	for (const chave of input.chaves) {
		try {
			await captureServerEvent({
				distinctId: session.user.id,
				event: input.habilitar ? "campaign_enabled" : "campaign_disabled",
				properties: { organization_id: organizacaoId, chave, activated: changes.some((change) => change.chave === chave && change.ativo) },
			});
		} catch (error) {
			console.error("[WARN] [ONBOARDING_CAMPAIGNS_ENABLE] Falha ao capturar evento:", error);
		}
	}

	const activated = changes.filter((change) => change.ativo).length;
	const message = !input.habilitar
		? "Envios desabilitados."
		: activated > 0
			? `${activated === 1 ? "1 campanha começou a enviar" : `${activated} campanhas começaram a enviar`}.`
			: "Envios liberados. As campanhas começam assim que as dependências forem resolvidas.";

	return { data: { campaigns: readiness.campanhas, changes }, message };
}
export type TEnableOnboardingCampaignsOutput = Awaited<ReturnType<typeof enableOnboardingCampaigns>>;

async function enableOnboardingCampaignsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	// Liberar ou suspender envios é ativar/pausar campanhas.
	assertCanActivateCampaigns(session);
	const input = EnableOnboardingCampaignsInputSchema.parse(await request.json());
	const result = await enableOnboardingCampaigns({ input, session });
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: enableOnboardingCampaignsRoute });

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
