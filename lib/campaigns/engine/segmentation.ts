import { buildBaseCashbackInteractionMetadata } from "@/lib/campaigns/interaction-metadata";
import { getPeriodAmountFromReferenceUnit } from "@/lib/dates";
import type { TCashbackProgramTerminologyEnum, TTimeDurationUnitsEnum } from "@/schemas/enums";
import type { DBTransaction } from "@/services/drizzle";
import type { TCampaignEntity, TCampaignSegmentationEntity } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { createEventCampaignDispatch, type TEventDispatchResult } from "./event-dispatch";
import { canScheduleCampaignForClient } from "./frequency-cap";

/**
 * Gatilhos de segmentação RFM (ENTRADA-SEGMENTAÇÃO e PERMANÊNCIA-SEGMENTAÇÃO), compartilhados
 * pelo cron `rfm-analysis` e pela sincronização manual `segmentations/sync` — antes eram duas
 * cópias de ~150 linhas com a mesma lógica.
 */

export type TSegmentationCampaign = TCampaignEntity & { segmentacoes: TCampaignSegmentationEntity[] };

export type TSegmentationClientEvaluation = {
	clientId: string;
	newLabel: string;
	labelChanged: boolean;
	lastLabelModification: Date | null;
};

// Função pura: quais campanhas de segmentação se aplicam ao cliente avaliado.
export function resolveSegmentationCampaigns({
	entryCampaigns,
	permanenceCampaigns,
	filterAudiencesByCampaignId,
	client,
	now,
}: {
	entryCampaigns: TSegmentationCampaign[];
	permanenceCampaigns: TSegmentationCampaign[];
	filterAudiencesByCampaignId: Map<string, Set<string>>;
	client: TSegmentationClientEvaluation;
	now: Date;
}): { campaign: TSegmentationCampaign; kind: "ENTRADA" | "PERMANENCIA" }[] {
	const matchesSegment = (campaign: TSegmentationCampaign) =>
		campaign.segmentacoes.length > 0 && campaign.segmentacoes.some((s) => s.segmentacao === client.newLabel);
	const matchesFilters = (campaign: TSegmentationCampaign) => filterAudiencesByCampaignId.get(campaign.id)?.has(client.clientId) ?? false;

	if (client.labelChanged) {
		return entryCampaigns
			.filter((campaign) => matchesSegment(campaign) && matchesFilters(campaign))
			.map((campaign) => ({ campaign, kind: "ENTRADA" as const }));
	}

	const lastModification = client.lastLabelModification;
	if (!lastModification) return [];
	return permanenceCampaigns
		.filter((campaign) => {
			if (!matchesSegment(campaign) || !matchesFilters(campaign)) return false;
			if (!campaign.gatilhoTempoPermanenciaMedida || !campaign.gatilhoTempoPermanenciaValor) return false;
			return (
				getPeriodAmountFromReferenceUnit({ start: lastModification, end: now, unit: campaign.gatilhoTempoPermanenciaMedida as TTimeDurationUnitsEnum }) >
				campaign.gatilhoTempoPermanenciaValor
			);
		})
		.map((campaign) => ({ campaign, kind: "PERMANENCIA" as const }));
}

/**
 * Cria os disparos de segmentação de um cliente dentro da transação da análise RFM.
 * Chaves de janela naturais deduplicam por construção:
 *  - ENTRADA: uma por (campanha, cliente, segmento, dia da mudança);
 *  - PERMANÊNCIA: uma por (campanha, cliente, última mudança de segmento) — a checagem antiga de
 *    "já existe interação desde a última mudança" vira a própria chave única.
 */
export async function scheduleSegmentationDispatches({
	tx,
	organizationId,
	client,
	entryCampaigns,
	permanenceCampaigns,
	filterAudiencesByCampaignId,
	cashbackTerminology,
	now = new Date(),
}: {
	tx: DBTransaction;
	organizationId: string;
	client: TSegmentationClientEvaluation;
	entryCampaigns: TSegmentationCampaign[];
	permanenceCampaigns: TSegmentationCampaign[];
	filterAudiencesByCampaignId: Map<string, Set<string>>;
	cashbackTerminology: TCashbackProgramTerminologyEnum;
	now?: Date;
}): Promise<TEventDispatchResult[]> {
	const applicable = resolveSegmentationCampaigns({ entryCampaigns, permanenceCampaigns, filterAudiencesByCampaignId, client, now });
	if (applicable.length === 0) return [];

	const results: TEventDispatchResult[] = [];
	const dayKey = dayjs(now).format("YYYY-MM-DD");
	for (const { campaign, kind } of applicable) {
		if (!(await canScheduleCampaignForClient({ executor: tx, campaign, clientId: client.clientId, now }))) continue;

		const janelaReferencia =
			kind === "ENTRADA"
				? `entrada:${client.clientId}:${client.newLabel}:${dayKey}`
				: `permanencia:${client.clientId}:${client.lastLabelModification?.toISOString() ?? dayKey}`;
		const dispatch = await createEventCampaignDispatch({
			tx,
			organizationId,
			campaign,
			janelaReferencia,
			recipients: [
				{
					clienteId: client.clientId,
					// Saldos são preenchidos no envio (projectCampaignSendContext); aqui só a terminologia.
					contexto: buildBaseCashbackInteractionMetadata({ terminologia: cashbackTerminology }),
					descricao: `Cliente se enquadrou no parâmetro de ${kind === "ENTRADA" ? "entrada" : "permanência"} na classificação RFM ${client.newLabel}.`,
				},
			],
			now,
		});
		if (dispatch.created) results.push(dispatch);
	}
	return results;
}
