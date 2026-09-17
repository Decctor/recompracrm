import { createCampaignDispatch, insertCampaignDispatchRecipients, type TCampaignDispatchRecipientInput } from "@/lib/campaigns/dispatch/create";
import { publishCampaignDispatchSend } from "@/lib/campaigns/dispatch/queue";
import { isDispatchDue, resolveEventDispatchScheduledAt, type TEventScheduleConfig } from "@/lib/campaigns/dispatch/schedule";
import type { DBTransaction } from "@/services/drizzle";
import { campaignDispatches } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";

/**
 * Disparos de evento (compra, aniversário, entrada em segmento...): um disparo por ocorrência do
 * gatilho, criado dentro da transação do chamador. A publicação na fila acontece DEPOIS do commit
 * (`publishEventDispatches`) — publicar dentro da transação enviaria trabalho que pode dar rollback.
 */

export type TEventDispatchCampaign = TEventScheduleConfig & { id: string };

export type TEventDispatchResult = {
	dispatchId: string;
	created: boolean;
	// Sem atraso configurado (ou hora já vencida): publicar assim que o commit sair. Com atraso, o
	// relógio publica quando `dataAgendada` chegar.
	immediate: boolean;
	inserted: number;
	skipped: number;
};

export async function createEventCampaignDispatch({
	tx,
	organizationId,
	campaign,
	janelaReferencia,
	recipients,
	scheduledAt,
	now = new Date(),
}: {
	tx: DBTransaction;
	organizationId: string;
	campaign: TEventDispatchCampaign;
	janelaReferencia: string;
	recipients: TCampaignDispatchRecipientInput[];
	// Sobrescreve a agenda derivada da campanha (gatilhos "ANTES": aniversário, pior dia).
	scheduledAt?: Date | null;
	now?: Date;
}): Promise<TEventDispatchResult> {
	const dataAgendada = scheduledAt === undefined ? resolveEventDispatchScheduledAt({ campaign, now }) : scheduledAt;
	const immediate = isDispatchDue({ scheduledAt: dataAgendada, now });

	const dispatch = await createCampaignDispatch({ tx, organizationId, campaignId: campaign.id, origem: "EVENTO", janelaReferencia, dataAgendada });
	if (!dispatch.created) {
		// Já existe (gatilho reprocessado, venda reimportada): nada a fazer — o disparo original
		// segue seu curso.
		return { dispatchId: dispatch.dispatchId, created: false, immediate, inserted: 0, skipped: 0 };
	}

	const { inserted, skipped } = await insertCampaignDispatchRecipients({
		tx,
		dispatchId: dispatch.dispatchId,
		organizationId,
		campaignId: campaign.id,
		recipients,
	});

	if (inserted === 0) {
		await tx
			.update(campaignDispatches)
			.set({ status: "CONCLUIDA", dataConclusao: now, dataAtualizacao: now })
			.where(eq(campaignDispatches.id, dispatch.dispatchId));
	} else if (immediate) {
		// ENFILEIRADA já na criação: o relógio não republica disparos imediatos, e a varredura de
		// parados recupera o caso em que o publish falhou depois do commit.
		await tx.update(campaignDispatches).set({ status: "ENFILEIRADA", dataAtualizacao: now }).where(eq(campaignDispatches.id, dispatch.dispatchId));
	}

	return { dispatchId: dispatch.dispatchId, created: true, immediate, inserted, skipped };
}

// Publica os disparos imediatos criados na transação já commitada. Nunca lança: uma falha de
// publicação deixa o disparo ENFILEIRADA, e o relógio o republica na varredura de parados.
export async function publishEventDispatches(results: TEventDispatchResult[]) {
	const publishable = results.filter((result) => result.created && result.immediate && result.inserted > 0);
	await Promise.all(
		publishable.map((result) =>
			publishCampaignDispatchSend({ dispatchId: result.dispatchId, generation: "event" }).catch((error) => {
				console.error(`[CAMPAIGN_DISPATCH] Falha ao publicar o disparo de evento ${result.dispatchId}:`, error);
			}),
		),
	);
	return publishable.length;
}
