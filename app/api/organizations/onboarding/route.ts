import { syncControlLifecycleSafely } from "@/lib/control/sync";
import { waitUntil } from "@vercel/functions";
import { notifyInternalsOnNewOrganization } from "@/config/internal-coms";
import { welcomeOrganizationOwnerOnOnboarding } from "@/config/onboarding";
import { captureServerEvent } from "@/lib/analytics/posthog-server";
import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { concludeJourney, getJourneys, getOnboardingReadiness } from "@/lib/onboarding";
import { OnboardingProductEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { organizations, shopSettings } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// ---------------------------------------------------------------------------------------------
// GET: uma chamada para retomar. Devolve as jornadas da organização e a prontidão derivada das
// tabelas reais. O servidor de /onboarding chama a função de serviço diretamente.
// ---------------------------------------------------------------------------------------------
const GetOnboardingInputSchema = z.object({
	produto: OnboardingProductEnum.optional().nullable(),
});
export type TGetOnboardingInput = z.infer<typeof GetOnboardingInputSchema>;

async function getOnboarding({ input, session }: { input: TGetOnboardingInput; session: TAuthUserSession }) {
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar o onboarding.");

	const [journeys, readiness] = await Promise.all([
		getJourneys({ executor: db, organizationId: organizacaoId }),
		getOnboardingReadiness({ executor: db, organizationId: organizacaoId }),
	]);

	return {
		data: {
			journeys: input.produto ? journeys.filter((journey) => journey.produto === input.produto) : journeys,
			readiness,
		},
		message: "Onboarding carregado.",
	};
}
export type TGetOnboardingOutput = Awaited<ReturnType<typeof getOnboarding>>;

async function getOnboardingRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const input = GetOnboardingInputSchema.parse({ produto: request.nextUrl.searchParams.get("produto") });
	const result = await getOnboarding({ input, session });
	return NextResponse.json(result);
}

// ---------------------------------------------------------------------------------------------
// POST: conclui a jornada de um produto. Não exige pendências resolvidas: a continuidade
// acontece no painel de ativação. A primeira conclusão da organização carimba
// `dataOnboardingConclusao` (gate do /dashboard) e dispara os efeitos de boas-vindas uma vez.
// ---------------------------------------------------------------------------------------------
const CompleteOnboardingInputSchema = z.object({
	produto: OnboardingProductEnum.default("CRM"),
});
export type TCompleteOnboardingInput = z.infer<typeof CompleteOnboardingInputSchema>;

async function completeOnboarding({ input, session }: { input: TCompleteOnboardingInput; session: TAuthUserSession }) {
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para concluir o onboarding.");

	const organization = await db.query.organizations.findFirst({
		where: (fields, { eq }) => eq(fields.id, organizacaoId),
	});
	if (!organization) throw new createHttpError.NotFound("Organização não encontrada.");

	const { firstConclusion, alreadyConcluded } = await db.transaction(async (tx) => {
		await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, organizacaoId)).for("update");
		if (input.produto === "ERP") {
			const ready = await getOnboardingReadiness({ executor: tx, organizationId: organizacaoId });
			if (!ready.erp.acesso) throw new createHttpError.Forbidden("A jornada ERP não está disponível no plano atual.");
			if (ready.erp.pendenciasLancamento.length) throw new createHttpError.BadRequest("Resolva as pendências do canal antes de começar a vender.");
			if (ready.erp.canal === "CATALOGO") await tx.update(shopSettings).set({ ativo: true }).where(eq(shopSettings.organizacaoId, organizacaoId));
		}
		return concludeJourney({ executor: tx, organizationId: organizacaoId, produto: input.produto });
	});
	const readiness = await getOnboardingReadiness({ executor: db, organizationId: organizacaoId });
	const pendencias = readiness.campanhas.reduce(
		(total, campaign) =>
			total + campaign.dependencias.filter((dependency) => dependency.status === "PENDENTE" || dependency.status === "FALHOU").length,
		0,
	);

	if (alreadyConcluded) {
		return { data: { redirectTo: "/dashboard", pendencias }, message: "Onboarding já concluído." };
	}

	if (firstConclusion) {
		void notifyInternalsOnNewOrganization({
			organization: {
				nome: organization.nome,
				cnpj: organization.cnpj,
				email: organization.email ?? session.user.email,
				telefone: organization.telefone ?? "NÃO INFORMADO",
				atuacaoNicho: organization.atuacaoNicho ?? "NÃO INFORMADO",
				tamanhoBaseClientes: organization.tamanhoBaseClientes ?? null,
				plataformasUtilizadas: organization.plataformasUtilizadas ?? "NÃO INFORMADO",
			},
			subscription: organization.assinaturaPlano ?? "FREE-TRIAL",
		}).catch((err) => console.error("[WARN] [COMPLETE_ONBOARDING] Falha ao notificar fundadores:", err));

		void welcomeOrganizationOwnerOnOnboarding({ orgOwner: session.user }).catch((err) =>
			console.error("[WARN] [COMPLETE_ONBOARDING] Falha ao enviar boas-vindas ao dono da organização:", err),
		);
	}

	try {
		if (input.produto === "ERP") await captureServerEvent({ distinctId: session.user.id, event: "erp_channel_launched", properties: { organization_id: organizacaoId, canal: readiness.erp.canal } });
		await captureServerEvent({
			distinctId: session.user.id,
			event: "onboarding_concluded",
			properties: {
				organization_id: organizacaoId,
				produto: input.produto,
				pendencias,
				subscription: organization.assinaturaPlano ?? "FREE-TRIAL",
			},
		});
	} catch (error) {
		console.error("[WARN] [COMPLETE_ONBOARDING] Falha ao capturar evento onboarding_concluded:", error);
	}

	const message =
		pendencias > 0
			? `Onboarding concluído. ${pendencias === 1 ? "1 pendência aguarda você" : `${pendencias} pendências aguardam você`} no painel.`
			: "Onboarding concluído.";

	return { data: { redirectTo: "/dashboard", pendencias }, message };
}
export type TCompleteOnboardingOutput = Awaited<ReturnType<typeof completeOnboarding>>;

async function completeOnboardingRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const body = await request.json().catch(() => ({}));
	const input = CompleteOnboardingInputSchema.parse(body ?? {});
	const result = await completeOnboarding({ input, session });
	if (session.membership) waitUntil(syncControlLifecycleSafely(session.membership.organizacao.id));
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getOnboardingRoute });
export const POST = appApiHandler({ POST: completeOnboardingRoute });

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
