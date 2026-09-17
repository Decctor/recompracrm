import { releaseSendQuota } from "@/lib/interactions/send-counters";
import { db } from "@/services/drizzle";
import { campaignDispatchRecipients, campaignDispatches, campaigns } from "@/services/drizzle/schema";
import { and, eq, inArray, isNotNull, lte, or, sql } from "drizzle-orm";
import { createCampaignDispatch } from "./create";
import { publishCampaignDispatchExpand, publishCampaignDispatchSend } from "./queue";
import { buildScheduledWindowReference, resolveScheduledWindowsForNow, shouldRecurrentCampaignRunOnDate } from "./schedule";

/**
 * O relógio (cron `campaign-dispatches`): barato e determinístico, termina em segundos mesmo com
 * muitas organizações. Não resolve audiência nem envia nada — cria os claims (INSERT ... ON
 * CONFLICT DO NOTHING) e publica trabalho para os consumers.
 *
 *  1. campanhas agendadas/recorrentes devidas nos blocos já vencidos de hoje → disparo + expand;
 *  2. disparos de evento com atraso cuja hora chegou → send;
 *  3. varredura: disparos parados (publicação perdida, consumer morto) → republica;
 *  4. varredura: reservas paradas (queda entre o envio e o registro) → voltam à fila.
 */

const STALE_DISPATCH_MINUTES = 30;
const STALE_RESERVATION_MINUTES = 15;

export type TCampaignDispatchClockSummary = {
	scheduledDispatchesCreated: number;
	dueEventDispatchesPublished: number;
	staleDispatchesRepublished: number;
	staleReservationsRequeued: number;
};

async function createScheduledDispatches(now: Date, summary: TCampaignDispatchClockSummary) {
	const { dateKey, arrivedBlocks } = resolveScheduledWindowsForNow(now);

	const dueCampaigns = await db.query.campaigns.findMany({
		where: and(
			eq(campaigns.ativo, true),
			inArray(campaigns.execucaoAgendadaBloco, arrivedBlocks),
			or(
				and(eq(campaigns.gatilhoTipo, "USO-UNICO"), eq(campaigns.gatilhoUsoUnicoDataReferencia, dateKey)),
				and(eq(campaigns.gatilhoTipo, "PROMOCAO-PRODUTOS"), eq(campaigns.gatilhoPromocaoDataReferencia, dateKey)),
				eq(campaigns.gatilhoTipo, "RECORRENTE"),
			),
		),
		columns: {
			id: true,
			organizacaoId: true,
			gatilhoTipo: true,
			execucaoAgendadaBloco: true,
			recorrenciaTipo: true,
			recorrenciaIntervalo: true,
			recorrenciaDiasSemana: true,
			recorrenciaDiasMes: true,
			dataInsercao: true,
		},
	});

	for (const campaign of dueCampaigns) {
		if (!campaign.organizacaoId) continue;
		const isRecurrent = campaign.gatilhoTipo === "RECORRENTE";
		if (isRecurrent && !shouldRecurrentCampaignRunOnDate(campaign, now)) continue;

		const janelaReferencia = buildScheduledWindowReference({ dateKey, block: campaign.execucaoAgendadaBloco });
		const dispatch = await db.transaction((tx) =>
			createCampaignDispatch({
				tx,
				organizationId: campaign.organizacaoId as string,
				campaignId: campaign.id,
				origem: isRecurrent ? "RECORRENTE" : "AGENDADA",
				janelaReferencia,
			}),
		);
		if (!dispatch.created) continue;

		summary.scheduledDispatchesCreated += 1;
		await publishCampaignDispatchExpand({ dispatchId: dispatch.dispatchId });
	}
}

async function publishDueEventDispatches(now: Date, summary: TCampaignDispatchClockSummary) {
	const due = await db
		.update(campaignDispatches)
		.set({ status: "ENFILEIRADA", dataAtualizacao: now })
		.where(
			and(
				eq(campaignDispatches.status, "PENDENTE"),
				eq(campaignDispatches.origem, "EVENTO"),
				isNotNull(campaignDispatches.dataAgendada),
				lte(campaignDispatches.dataAgendada, now),
			),
		)
		.returning({ id: campaignDispatches.id });

	for (const dispatch of due) {
		await publishCampaignDispatchSend({ dispatchId: dispatch.id, generation: "clock" });
		summary.dueEventDispatchesPublished += 1;
	}
}

async function republishStaleDispatches(now: Date, summary: TCampaignDispatchClockSummary) {
	const staleBefore = new Date(now.getTime() - STALE_DISPATCH_MINUTES * 60_000);
	const stale = await db.query.campaignDispatches.findMany({
		where: and(inArray(campaignDispatches.status, ["RESOLVENDO", "ENFILEIRADA", "ENVIANDO"]), lte(campaignDispatches.dataAtualizacao, staleBefore)),
		columns: { id: true, status: true, origem: true },
	});

	const bucket = Math.floor(now.getTime() / (STALE_DISPATCH_MINUTES * 60_000));
	for (const dispatch of stale) {
		await db.update(campaignDispatches).set({ dataAtualizacao: now }).where(eq(campaignDispatches.id, dispatch.id));
		if (dispatch.status === "RESOLVENDO" && dispatch.origem !== "EVENTO") {
			await publishCampaignDispatchExpand({ dispatchId: dispatch.id, attempt: `stale-${bucket}` });
		} else {
			await publishCampaignDispatchSend({ dispatchId: dispatch.id, generation: `stale-${bucket}` });
		}
		summary.staleDispatchesRepublished += 1;
	}
}

async function requeueStaleReservations(now: Date, summary: TCampaignDispatchClockSummary) {
	const staleBefore = new Date(now.getTime() - STALE_RESERVATION_MINUTES * 60_000);
	const stale = await db.query.campaignDispatchRecipients.findMany({
		where: and(
			eq(campaignDispatchRecipients.status, "RESERVADA"),
			isNotNull(campaignDispatchRecipients.dataReserva),
			lte(campaignDispatchRecipients.dataReserva, staleBefore),
		),
		columns: { id: true, organizacaoId: true, campanhaId: true, dataReserva: true, dispatchId: true },
	});

	for (const recipient of stale) {
		await db.transaction(async (tx) => {
			const [requeued] = await tx
				.update(campaignDispatchRecipients)
				.set({ status: "AGUARDANDO", dataReserva: null, erro: "Reserva expirada; devolvida à fila." })
				.where(and(eq(campaignDispatchRecipients.id, recipient.id), eq(campaignDispatchRecipients.status, "RESERVADA")))
				.returning({ id: campaignDispatchRecipients.id });
			if (!requeued) return;
			// A quota reservada volta; se a mensagem chegou a sair, o webhook do provedor ainda
			// encontra a interação pela chave de idempotência quando o reenvio registrar.
			await releaseSendQuota({
				tx,
				organizationId: recipient.organizacaoId,
				campaignId: recipient.campanhaId,
				reservedAt: recipient.dataReserva ?? now,
			});
			await tx
				.update(campaignDispatches)
				.set({ dataAtualizacao: sql`LEAST(${campaignDispatches.dataAtualizacao}, ${staleBefore.toISOString()}::timestamp)` })
				.where(eq(campaignDispatches.id, recipient.dispatchId));
		});
		summary.staleReservationsRequeued += 1;
	}
}

export async function runCampaignDispatchClock({ now = new Date() }: { now?: Date } = {}): Promise<TCampaignDispatchClockSummary> {
	const summary: TCampaignDispatchClockSummary = {
		scheduledDispatchesCreated: 0,
		dueEventDispatchesPublished: 0,
		staleDispatchesRepublished: 0,
		staleReservationsRequeued: 0,
	};

	await createScheduledDispatches(now, summary);
	await publishDueEventDispatches(now, summary);
	// Reservas paradas primeiro: ao voltarem à fila, o disparo delas fica elegível à republicação.
	await requeueStaleReservations(now, summary);
	await republishStaleDispatches(now, summary);

	console.log("[CAMPAIGN_DISPATCH] [CLOCK] Tick concluído.", summary);
	return summary;
}
