import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { triggerBatchFlow } from "@/lib/campaign-flows";
import { db } from "@/services/drizzle";
import { campaignFlows } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// ============================================================================
// POST: Execute a campaign flow (one-time or manual batch trigger)
// ============================================================================

const ExecuteCampaignFlowInputSchema = z.object({
	campaignFlowId: z.string({
		required_error: "ID do fluxo de campanha não informado.",
		invalid_type_error: "Tipo não válido para o ID do fluxo de campanha.",
	}),
});
export type TExecuteCampaignFlowInput = z.infer<typeof ExecuteCampaignFlowInputSchema>;

async function executeCampaignFlow({ input, session }: { input: TExecuteCampaignFlowInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const campaign = await db.query.campaignFlows.findFirst({
		where: and(eq(campaignFlows.id, input.campaignFlowId), eq(campaignFlows.organizacaoId, userOrgId)),
	});

	if (!campaign) throw new createHttpError.NotFound("Fluxo de campanha não encontrado.");
	if (campaign.status !== "ATIVO") throw new createHttpError.BadRequest("O fluxo de campanha precisa estar ativo para ser executado.");

	if (campaign.tipo === "UNICA" && campaign.unicaExecutada) {
		throw new createHttpError.BadRequest("Este fluxo de campanha única já foi executado.");
	}

	const result = await triggerBatchFlow({
		campanhaId: campaign.id,
		organizacaoId: userOrgId,
	});

	// Mark one-time campaign as executed
	if (campaign.tipo === "UNICA") {
		await db
			.update(campaignFlows)
			.set({ unicaExecutada: true })
			.where(eq(campaignFlows.id, campaign.id));
	}

	return {
		data: {
			executionId: result.executionId,
			totalClients: result.totalClients,
		},
		message: `Execução iniciada para ${result.totalClients} cliente(s).`,
	};
}
export type TExecuteCampaignFlowOutput = Awaited<ReturnType<typeof executeCampaignFlow>>;

async function executeCampaignFlowRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");

	const payload = await request.json();
	const input = ExecuteCampaignFlowInputSchema.parse(payload);
	const result = await executeCampaignFlow({ input, session });
	return NextResponse.json(result, { status: 201 });
}

export const POST = appApiHandler({ POST: executeCampaignFlowRoute });
