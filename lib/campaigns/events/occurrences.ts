import { recordCampaignEvent } from "./record";
import type { DBTransaction } from "@/services/drizzle";
import type { TCampaignEntity } from "@/services/drizzle/schema";
import type { TCampaignDispatchRecipientInput } from "@/lib/campaigns/dispatch/create";
import { resolveEventDispatchScheduledAt } from "@/lib/campaigns/dispatch/schedule";
import type { TCampaignOccurrencePayload } from "@/schemas/campaign-occurrences";

const eventTypes = {
	"ENTRADA-SEGMENTAÇÃO": "ENTRADA_SEGMENTACAO",
	"PERMANÊNCIA-SEGMENTAÇÃO": "PERMANENCIA_SEGMENTACAO",
	ANIVERSARIO_CLIENTE: "ANIVERSARIO_CLIENTE",
	"CASHBACK-EXPIRANDO": "CASHBACK_EXPIRANDO",
	"PIOR-DIA-VENDAS": "PIOR_DIA_VENDAS",
} as const;

/** Detectors retain their selection logic; only the worker creates dispatches. */
export async function recordCampaignOccurrence({
	tx,
	organizationId,
	campaign,
	janelaReferencia,
	recipients,
	scheduledAt,
	now = new Date(),
	validity = {},
	manual = false,
}: {
	tx: DBTransaction;
	organizationId: string;
	campaign: TCampaignEntity;
	janelaReferencia: string;
	recipients: TCampaignDispatchRecipientInput[];
	scheduledAt?: Date | null;
	now?: Date;
	validity?: Partial<
		Pick<
			TCampaignOccurrencePayload,
			"segmentacaoEsperada" | "nascimentoMes" | "nascimentoDia" | "expiracaoAte" | "expiracaoDe" | "expiracaoValorMinimo"
		>
	>;
	manual?: boolean;
}) {
	const tipo = manual ? "CAMPANHA_SOLICITADA" : eventTypes[campaign.gatilhoTipo as keyof typeof eventTypes];
	if (!tipo) throw new Error(`Detector não suportado: ${campaign.gatilhoTipo}`);
	const due = scheduledAt === undefined ? resolveEventDispatchScheduledAt({ campaign, now }) : scheduledAt;
	const eventId = await recordCampaignEvent({
		tx,
		input: {
			organizacaoId: organizationId,
			clienteId: (tipo === "ENTRADA_SEGMENTACAO" || tipo === "PERMANENCIA_SEGMENTACAO") && recipients.length === 1 ? recipients[0].clienteId : null,
			fonteTipo: "CAMPANHA",
			fonteId: campaign.id,
			tipo,
			versao: 1,
			chaveIdempotencia: `${campaign.id}:${janelaReferencia}`,
			dataEvento: now,
			contexto: {
				campanhaId: campaign.id,
				gatilho: campaign.gatilhoTipo,
				janelaReferencia,
				dataAgendada: due?.toISOString() ?? null,
				destinatarios: recipients,
				...validity,
			},
		},
	});
	return { eventId, captured: !!eventId, recipientsCaptured: eventId ? recipients.length : 0 };
}
