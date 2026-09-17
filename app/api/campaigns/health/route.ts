import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getOrganizationSendQuotaUsage } from "@/lib/interactions/send-counters";
import { db } from "@/services/drizzle";
import { campaignDispatchRecipients } from "@/services/drizzle/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * Saúde operacional das campanhas para o dashboard: destinatários do dia por desfecho (enviados,
 * falhas, pulados por motivo, aguardando) lidos do journal de disparos, e a quota consumida contra
 * os limites da organização em cada janela (dia e semana). O cliente manda o início do "hoje" no
 * seu fuso; as janelas de quota seguem as chaves do contador (fuso do cron).
 */
const GetCampaignsHealthInputSchema = z.object({
	dayStart: z
		.string({ required_error: "Início do dia não informado.", invalid_type_error: "Tipo inválido para o início do dia." })
		.datetime({ message: "Tipo inválido para o início do dia." })
		.transform((v) => new Date(v)),
});
export type TGetCampaignsHealthInput = z.infer<typeof GetCampaignsHealthInputSchema>;

async function getCampaignsHealth({ input, session }: { input: TGetCampaignsHealthInput; session: TAuthUserSession }) {
	const membership = session.membership;
	if (!membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	if (!membership.organizacao.configuracao.recursos.campanhas.acesso)
		throw new createHttpError.Forbidden("Sua organização não possui acesso a campanhas.");
	const organizacaoId = membership.organizacao.id;

	const dayEnd = new Date(input.dayStart.getTime() + 24 * 60 * 60 * 1000);

	const [porStatus, quota] = await Promise.all([
		db
			.select({ status: campaignDispatchRecipients.status, motivoPulo: campaignDispatchRecipients.motivoPulo, qtde: sql<number>`count(*)` })
			.from(campaignDispatchRecipients)
			.where(
				and(
					eq(campaignDispatchRecipients.organizacaoId, organizacaoId),
					gte(campaignDispatchRecipients.dataInsercao, input.dayStart),
					lte(campaignDispatchRecipients.dataInsercao, dayEnd),
				),
			)
			.groupBy(campaignDispatchRecipients.status, campaignDispatchRecipients.motivoPulo),
		getOrganizationSendQuotaUsage({ organizationId: organizacaoId }),
	]);

	const countWhere = (predicate: (row: (typeof porStatus)[number]) => boolean) =>
		porStatus.filter(predicate).reduce((acc, row) => acc + Number(row.qtde), 0);
	const hoje = {
		total: countWhere(() => true),
		enviadas: countWhere((row) => row.status === "ENVIADA"),
		falhas: countWhere((row) => row.status === "FALHOU"),
		puladas: countWhere((row) => row.status === "PULADA"),
		puladasPorQuota: countWhere((row) => row.status === "PULADA" && (row.motivoPulo?.startsWith("QUOTA_") ?? false)),
		aguardando: countWhere((row) => row.status === "AGUARDANDO" || row.status === "RESERVADA"),
	};

	const preferencias = membership.organizacao.configuracao.preferencias;
	return {
		data: {
			hoje,
			quotaDiaria: {
				periodoChave: quota.DIARIO.periodoChave,
				usados: quota.DIARIO.usados,
				limite: preferencias.limiteMensagensDiariasViaCampanhas ?? null,
			},
			quotaSemanal: {
				semanaChave: quota.SEMANAL.periodoChave,
				usados: quota.SEMANAL.usados,
				limite: preferencias.limiteMensagensSemanaisViaCampanhas ?? null,
			},
		},
		message: "Saúde das campanhas recuperada com sucesso.",
	};
}
export type TGetCampaignsHealthOutput = Awaited<ReturnType<typeof getCampaignsHealth>>;

async function getCampaignsHealthRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const input = GetCampaignsHealthInputSchema.parse({ dayStart: request.nextUrl.searchParams.get("dayStart") });
	const result = await getCampaignsHealth({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getCampaignsHealthRoute });
