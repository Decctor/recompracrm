import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { publishCampaignDispatchExpand, publishCampaignDispatchSend } from "@/lib/campaigns/dispatch/queue";
import { CampaignDispatchSkipReasonEnum, type TCampaignDispatchSkipReasonEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { campaignDispatchRecipients, campaignDispatches } from "@/services/drizzle/schema";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * Painel de disparos de uma campanha (docs/dev-planning/campaigns-interactions-redesign-plan.md,
 * 2.7): lista as rodadas com status, totais, erro e o detalhamento dos pulos por motivo, e permite
 * reexecutar um disparo parado/falho ou reenfileirar um destinatário. Substitui o antigo script de
 * recuperação por UUID hardcoded.
 */

const GetCampaignDispatchesInputSchema = z.object({
	campaignId: z.string({ required_error: "ID da campanha não informado.", invalid_type_error: "Tipo inválido para o ID da campanha." }),
	page: z
		.string({ invalid_type_error: "Tipo inválido para página." })
		.optional()
		.nullable()
		.transform((v) => (v ? Number(v) : 1)),
});
export type TGetCampaignDispatchesInput = z.infer<typeof GetCampaignDispatchesInputSchema>;

const PAGE_SIZE = 10;

async function getCampaignDispatches({ input, session }: { input: TGetCampaignDispatchesInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const conditions = and(eq(campaignDispatches.organizacaoId, organizationId), eq(campaignDispatches.campanhaId, input.campaignId));
	const safePage = Number.isFinite(input.page) && input.page > 0 ? input.page : 1;

	const [[{ total }], dispatches] = await Promise.all([
		db.select({ total: count() }).from(campaignDispatches).where(conditions),
		db.query.campaignDispatches.findMany({
			where: conditions,
			orderBy: [desc(campaignDispatches.dataInsercao)],
			limit: PAGE_SIZE,
			offset: PAGE_SIZE * (safePage - 1),
		}),
	]);

	const dispatchIds = dispatches.map((dispatch) => dispatch.id);
	const skipRows =
		dispatchIds.length > 0
			? await db
					.select({ dispatchId: campaignDispatchRecipients.dispatchId, motivoPulo: campaignDispatchRecipients.motivoPulo, qtde: sql<number>`count(*)` })
					.from(campaignDispatchRecipients)
					.where(and(inArray(campaignDispatchRecipients.dispatchId, dispatchIds), eq(campaignDispatchRecipients.status, "PULADA")))
					.groupBy(campaignDispatchRecipients.dispatchId, campaignDispatchRecipients.motivoPulo)
			: [];

	const items = dispatches.map((dispatch) => ({
		...dispatch,
		pulosPorMotivo: skipRows
			.filter((row) => row.dispatchId === dispatch.id && row.motivoPulo)
			.map((row) => ({ motivo: row.motivoPulo as TCampaignDispatchSkipReasonEnum, qtde: Number(row.qtde) })),
	}));

	return {
		data: { items, dispatchesMatched: total, totalPages: Math.ceil(total / PAGE_SIZE) },
		message: "Disparos da campanha recuperados com sucesso.",
	};
}
export type TGetCampaignDispatchesOutput = Awaited<ReturnType<typeof getCampaignDispatches>>;
export type TGetCampaignDispatchesOutputItems = TGetCampaignDispatchesOutput["data"]["items"];

const RetryCampaignDispatchInputSchema = z.object({
	dispatchId: z.string({ required_error: "ID do disparo não informado.", invalid_type_error: "Tipo inválido para o ID do disparo." }),
	// Sem motivos: reenfileira só os FALHOU. Com motivos (ex.: QUOTA_ORG_SEMANAL na semana seguinte),
	// também os PULADA daqueles motivos.
	skipReasons: z.array(CampaignDispatchSkipReasonEnum).optional().nullable(),
});
export type TRetryCampaignDispatchInput = z.infer<typeof RetryCampaignDispatchInputSchema>;

async function retryCampaignDispatch({ input, session }: { input: TRetryCampaignDispatchInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const dispatch = await db.query.campaignDispatches.findFirst({
		where: and(eq(campaignDispatches.id, input.dispatchId), eq(campaignDispatches.organizacaoId, organizationId)),
		with: { campanha: { columns: { ativo: true } } },
	});
	if (!dispatch) throw new createHttpError.NotFound("Disparo não encontrado.");
	if (!dispatch.campanha?.ativo) throw new createHttpError.BadRequest("Ative a campanha antes de reexecutar o disparo.");

	// Disparo agendado que nunca chegou a expandir: volta para a expansão.
	if (dispatch.origem !== "EVENTO" && dispatch.totalDestinatarios === 0) {
		await db
			.update(campaignDispatches)
			.set({ status: "PENDENTE", erro: null, dataConclusao: null, dataAtualizacao: new Date() })
			.where(eq(campaignDispatches.id, dispatch.id));
		await publishCampaignDispatchExpand({ dispatchId: dispatch.id, attempt: `retry-${Date.now()}` });
		return { data: { dispatchId: dispatch.id, requeued: 0 }, message: "Disparo reenviado para expansão da audiência." };
	}

	const requeued = await db.transaction(async (tx) => {
		const skipReasons = input.skipReasons ?? [];
		const rows = await tx
			.update(campaignDispatchRecipients)
			.set({ status: "AGUARDANDO", motivoPulo: null, erro: null, dataReserva: null })
			.where(
				and(
					eq(campaignDispatchRecipients.dispatchId, dispatch.id),
					skipReasons.length > 0
						? sql`(${campaignDispatchRecipients.status} = 'FALHOU' OR (${campaignDispatchRecipients.status} = 'PULADA' AND ${campaignDispatchRecipients.motivoPulo} IN (${sql.join(
								skipReasons.map((reason) => sql`${reason}`),
								sql`, `,
							)})))`
						: eq(campaignDispatchRecipients.status, "FALHOU"),
				),
			)
			.returning({ status: campaignDispatchRecipients.status });

		// Os totais de falhados/pulados são recontados a partir das linhas, para não acumular
		// diferenças entre reexecuções.
		const [totals] = await tx
			.select({
				falhados: sql<number>`count(*) filter (where ${campaignDispatchRecipients.status} = 'FALHOU')::int`,
				pulados: sql<number>`count(*) filter (where ${campaignDispatchRecipients.status} = 'PULADA')::int`,
			})
			.from(campaignDispatchRecipients)
			.where(eq(campaignDispatchRecipients.dispatchId, dispatch.id));
		await tx
			.update(campaignDispatches)
			.set({
				status: rows.length > 0 ? "ENFILEIRADA" : dispatch.status,
				erro: null,
				dataConclusao: rows.length > 0 ? null : dispatch.dataConclusao,
				totalFalhados: Number(totals?.falhados ?? 0),
				totalPulados: Number(totals?.pulados ?? 0),
				dataAtualizacao: new Date(),
			})
			.where(eq(campaignDispatches.id, dispatch.id));
		return rows.length;
	});

	if (requeued === 0 && (dispatch.status === "ENFILEIRADA" || dispatch.status === "ENVIANDO" || dispatch.status === "PENDENTE")) {
		// Disparo parado sem destinatários a reenfileirar: só republica o envio.
		await publishCampaignDispatchSend({ dispatchId: dispatch.id, generation: `retry-${Date.now()}` });
		return { data: { dispatchId: dispatch.id, requeued: 0 }, message: "Envio do disparo republicado." };
	}
	if (requeued === 0) {
		return { data: { dispatchId: dispatch.id, requeued: 0 }, message: "Nenhum destinatário elegível para reenvio neste disparo." };
	}

	await publishCampaignDispatchSend({ dispatchId: dispatch.id, generation: `retry-${Date.now()}` });
	return { data: { dispatchId: dispatch.id, requeued }, message: `${requeued} destinatário(s) reenfileirado(s) para envio.` };
}
export type TRetryCampaignDispatchOutput = Awaited<ReturnType<typeof retryCampaignDispatch>>;

async function getCampaignDispatchesRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	const searchParams = request.nextUrl.searchParams;
	const input = GetCampaignDispatchesInputSchema.parse({
		campaignId: searchParams.get("campaignId") ?? undefined,
		page: searchParams.get("page") ?? undefined,
	});
	const result = await getCampaignDispatches({ input, session });
	return NextResponse.json(result);
}

async function retryCampaignDispatchRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	const input = RetryCampaignDispatchInputSchema.parse(await request.json());
	const result = await retryCampaignDispatch({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getCampaignDispatchesRoute });
export const POST = appApiHandler({ POST: retryCampaignDispatchRoute });
