import { syncControlLifecycleSafely } from "@/lib/control/sync";
import { waitUntil } from "@vercel/functions";
import { captureServerEvent } from "@/lib/analytics/posthog-server";
import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { updateJourneyProgress, getOnboardingReadiness } from "@/lib/onboarding";
import { OnboardingProductEnum } from "@/schemas/enums";
import { OnboardingAnswersSchema } from "@/schemas/onboarding";
import { db } from "@/services/drizzle";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// Grava navegação e respostas da jornada. É a única escrita da etapa atual: o cliente chama a
// cada avanço, recuo ou adiamento, e antes de sair para um OAuth, para a volta cair no lugar.
const UpdateJourneyProgressInputSchema = z.object({
	produto: OnboardingProductEnum,
	etapaAtual: z.string({ invalid_type_error: "Tipo não válido para a etapa atual." }).optional().nullable(),
	adiarEtapa: z.string({ invalid_type_error: "Tipo não válido para a etapa a adiar." }).optional().nullable(),
	retomarEtapa: z.string({ invalid_type_error: "Tipo não válido para a etapa a retomar." }).optional().nullable(),
	respostas: OnboardingAnswersSchema.partial().optional(),
});
export type TUpdateJourneyProgressInput = z.infer<typeof UpdateJourneyProgressInputSchema>;

async function updateProgress({ input, session }: { input: TUpdateJourneyProgressInput; session: TAuthUserSession }) {
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para atualizar o onboarding.");
	if (input.produto === "ERP") {
		const readiness = await getOnboardingReadiness({ executor: db, organizationId: organizacaoId });
		if (!readiness.erp.acesso) throw new createHttpError.Forbidden("A jornada ERP não está disponível no plano atual.");
		if (input.respostas?.erpSimulacaoConcluidaEm && readiness.erp.produtosUtilizaveis < 5) throw new createHttpError.BadRequest("Cadastre cinco produtos utilizáveis antes de concluir a prévia.");
	}

	const journey = await updateJourneyProgress({
		executor: db,
		organizationId: organizacaoId,
		produto: input.produto,
		etapaAtual: input.etapaAtual,
		adiarEtapa: input.adiarEtapa,
		retomarEtapa: input.retomarEtapa,
		respostas: input.respostas,
	});
	if (input.respostas?.erpSimulacaoConcluidaEm) {
		try { await captureServerEvent({ distinctId: session.user.id, event: "erp_simulation_completed", properties: { organization_id: organizacaoId } }); } catch (error) { console.error("[ONBOARDING] Falha ao registrar prévia.", error); }
	}

	if (input.adiarEtapa) {
		try {
			await captureServerEvent({
				distinctId: session.user.id,
				event: "onboarding_stage_deferred",
				properties: { organization_id: organizacaoId, produto: input.produto, etapa: input.adiarEtapa },
			});
		} catch (error) {
			console.error("[WARN] [ONBOARDING_PROGRESS] Falha ao capturar evento:", error);
		}
	}

	return { data: { journey }, message: "Progresso salvo." };
}
export type TUpdateJourneyProgressOutput = Awaited<ReturnType<typeof updateProgress>>;

async function updateProgressRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const input = UpdateJourneyProgressInputSchema.parse(await request.json());
	const result = await updateProgress({ input, session });
	if (session.membership) waitUntil(syncControlLifecycleSafely(session.membership.organizacao.id));
	return NextResponse.json(result);
}

export const PUT = appApiHandler({ PUT: updateProgressRoute });

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
