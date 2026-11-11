import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { resolveNextDispatch } from "@/lib/campaigns/dispatch/schedule";
import { db } from "@/services/drizzle";
import { campaignDispatches, campaigns } from "@/services/drizzle/schema";
import { and, eq, gt, min } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const GetCampaignNextDispatchInputSchema = z.object({
	campaignId: z.string({ required_error: "ID da campanha não informado.", invalid_type_error: "Tipo inválido para o ID da campanha." }),
});
export type TGetCampaignNextDispatchInput = z.infer<typeof GetCampaignNextDispatchInputSchema>;

async function getCampaignNextDispatch({ input, session }: { input: TGetCampaignNextDispatchInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const campaign = await db.query.campaigns.findFirst({
		where: and(eq(campaigns.id, input.campaignId), eq(campaigns.organizacaoId, organizationId)),
		columns: {
			ativo: true,
			gatilhoTipo: true,
			execucaoAgendadaBloco: true,
			gatilhoUsoUnicoDataReferencia: true,
			gatilhoPromocaoDataReferencia: true,
			gatilhoPesquisaDataReferencia: true,
			recorrenciaTipo: true,
			recorrenciaIntervalo: true,
			recorrenciaDiasSemana: true,
			recorrenciaDiasMes: true,
			dataInsercao: true,
		},
	});
	if (!campaign) throw new createHttpError.NotFound("Campanha não encontrada.");

	const now = new Date();
	const [pending] = await db
		.select({ dataAgendada: min(campaignDispatches.dataAgendada) })
		.from(campaignDispatches)
		.where(
			and(
				eq(campaignDispatches.organizacaoId, organizationId),
				eq(campaignDispatches.campanhaId, input.campaignId),
				eq(campaignDispatches.status, "PENDENTE"),
				gt(campaignDispatches.dataAgendada, now),
			),
		);

	const next = resolveNextDispatch({ campaign, pendingDispatchAt: pending?.dataAgendada ?? null, now });

	return {
		data: { fonte: next.fonte, dataPrevista: next.data, bloco: campaign.execucaoAgendadaBloco },
		message: "Próximo disparo da campanha recuperado com sucesso.",
	};
}
export type TGetCampaignNextDispatchOutput = Awaited<ReturnType<typeof getCampaignNextDispatch>>;

async function getCampaignNextDispatchRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	const input = GetCampaignNextDispatchInputSchema.parse({
		campaignId: request.nextUrl.searchParams.get("campaignId") ?? undefined,
	});
	const result = await getCampaignNextDispatch({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getCampaignNextDispatchRoute });
