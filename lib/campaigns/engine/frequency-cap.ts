import { DASTJS_TIME_DURATION_UNITS_MAP } from "@/lib/dates";
import type { TTimeDurationUnitsEnum } from "@/schemas/enums";
import { type DBTransaction, db } from "@/services/drizzle";
import { campaignDispatchRecipients, interactions } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, eq, gt, inArray } from "drizzle-orm";
import { chunkArray } from "../shared";

type TFrequencyCapExecutor = typeof db | DBTransaction;

export type TFrequencyCapCampaign = {
	id: string;
	permitirRecorrencia: boolean;
	frequenciaIntervaloValor: number | null;
	frequenciaIntervaloMedida: string | null;
};

// Função pura: a partir de quando um contato anterior bloqueia. Null = qualquer contato bloqueia
// (campanha sem recorrência); undefined = não há cap.
export function resolveFrequencyCapCutoff({ campaign, now }: { campaign: TFrequencyCapCampaign; now: Date }): Date | null | undefined {
	if (!campaign.permitirRecorrencia) return null;
	if (!campaign.frequenciaIntervaloValor || campaign.frequenciaIntervaloValor <= 0 || !campaign.frequenciaIntervaloMedida) return undefined;
	const unit = DASTJS_TIME_DURATION_UNITS_MAP[campaign.frequenciaIntervaloMedida as TTimeDurationUnitsEnum] || "day";
	return dayjs(now).subtract(campaign.frequenciaIntervaloValor, unit).toDate();
}

const LOOKUP_CHUNK_SIZE = 5000;

/**
 * O único `canScheduleCampaignForClient` (antes eram 9 cópias). Em lote: devolve os clientes que
 * ainda podem receber a campanha. Considera o registro (interações já enviadas) E a fila
 * (destinatários aguardando/reservados/enviados), para que dois gatilhos no mesmo intervalo não
 * enfileirem duas vezes antes de o primeiro sair.
 */
export async function filterClientIdsByFrequencyCap({
	executor = db,
	campaign,
	clientIds,
	now = new Date(),
}: {
	executor?: TFrequencyCapExecutor;
	campaign: TFrequencyCapCampaign;
	clientIds: string[];
	now?: Date;
}): Promise<{ allowed: string[]; blocked: string[] }> {
	const uniqueClientIds = Array.from(new Set(clientIds));
	if (uniqueClientIds.length === 0) return { allowed: [], blocked: [] };

	const cutoff = resolveFrequencyCapCutoff({ campaign, now });
	if (cutoff === undefined) return { allowed: uniqueClientIds, blocked: [] };

	const blockedClientIds = new Set<string>();
	for (const chunk of chunkArray(uniqueClientIds, LOOKUP_CHUNK_SIZE)) {
		const [recentInteractions, queuedRecipients] = await Promise.all([
			executor
				.selectDistinct({ clienteId: interactions.clienteId })
				.from(interactions)
				.where(
					and(
						eq(interactions.campanhaId, campaign.id),
						inArray(interactions.clienteId, chunk),
						...(cutoff ? [gt(interactions.dataInsercao, cutoff)] : []),
					),
				),
			executor
				.selectDistinct({ clienteId: campaignDispatchRecipients.clienteId })
				.from(campaignDispatchRecipients)
				.where(
					and(
						eq(campaignDispatchRecipients.campanhaId, campaign.id),
						inArray(campaignDispatchRecipients.clienteId, chunk),
						inArray(campaignDispatchRecipients.status, ["AGUARDANDO", "RESERVADA", "ENVIADA"]),
						...(cutoff ? [gt(campaignDispatchRecipients.dataInsercao, cutoff)] : []),
					),
				),
		]);
		for (const row of recentInteractions) blockedClientIds.add(row.clienteId);
		for (const row of queuedRecipients) blockedClientIds.add(row.clienteId);
	}

	return {
		allowed: uniqueClientIds.filter((clientId) => !blockedClientIds.has(clientId)),
		blocked: uniqueClientIds.filter((clientId) => blockedClientIds.has(clientId)),
	};
}

export async function canScheduleCampaignForClient(params: {
	executor?: TFrequencyCapExecutor;
	campaign: TFrequencyCapCampaign;
	clientId: string;
	now?: Date;
}) {
	const result = await filterClientIdsByFrequencyCap({ ...params, clientIds: [params.clientId] });
	return result.allowed.length === 1;
}
