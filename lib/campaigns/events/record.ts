import type { DBTransaction } from "@/services/drizzle";
import { campaignEvents } from "@/services/drizzle/schema";
import { CampaignEventEnvelopeSchema, parseCampaignEventPayload, type TRecordCampaignEventInput } from "@/schemas/campaign-events";
import { isCampaignEventCaptureEnabled } from "./policy";

/**
 * The producer's transaction owns capture. A duplicate preserves the original payload.
 * Capture with publication disabled (manual integration runs) is stored already DESCARTADA: the
 * idempotency key still blocks a later capture of the same occurrence, but the row never enters
 * the pending index, the ordering gate or the recovery sweep.
 */
export async function recordCampaignEvent({ tx, input }: { tx: DBTransaction; input: TRecordCampaignEventInput }) {
	if (!isCampaignEventCaptureEnabled(input.organizacaoId)) return null;
	parseCampaignEventPayload(input);
	CampaignEventEnvelopeSchema.parse(input);
	const publicationDisabled = input.publicacaoPermitida === false;
	const [event] = await tx
		.insert(campaignEvents)
		.values({
			...input,
			...(publicationDisabled ? { status: "DESCARTADA" as const, erro: "Publicação desativada na captura.", dataProcessamento: input.dataEvento } : {}),
		})
		.onConflictDoNothing({ target: [campaignEvents.organizacaoId, campaignEvents.tipo, campaignEvents.chaveIdempotencia] })
		.returning({ id: campaignEvents.id });
	return event?.id ?? null;
}
