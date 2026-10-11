import { recordCampaignEvent } from "./record";
import { clients } from "@/services/drizzle/schema";
import type { DBTransaction } from "@/services/drizzle";
import type { TSaleCampaignEventSnapshot } from "@/schemas/sale-campaign-events";
import { and, eq } from "drizzle-orm";

/** Imported/POI facts are already computed per occurrence: never reconstruct a batch's totals. */
export async function recordPurchaseCampaignEvent({
	tx,
	organizationId,
	clientId,
	sourceId,
	sourceType = "VENDA",
	type = "COMPRA_CONFIRMADA",
	idempotencyKey,
	occurredAt = new Date(),
	publicationAllowed = true,
	snapshot,
}: {
	tx: DBTransaction;
	organizationId: string;
	clientId: string;
	sourceId: string;
	sourceType?: "VENDA" | "TRANSACAO_CASHBACK" | "CLIENTE";
	type?: "COMPRA_CONFIRMADA" | "CASHBACK_ACUMULADO";
	idempotencyKey: string;
	occurredAt?: Date;
	publicationAllowed?: boolean;
	snapshot: Omit<TSaleCampaignEventSnapshot, "segmentacao"> & { segmentacao?: string | null };
}) {
	const client = await tx.query.clients.findFirst({
		where: and(eq(clients.id, clientId), eq(clients.organizacaoId, organizationId)),
		columns: { analiseRFMTitulo: true },
	});
	if (!client) return null;
	return recordCampaignEvent({
		tx,
		input: {
			organizacaoId: organizationId,
			clienteId: clientId,
			fonteTipo: sourceType,
			fonteId: sourceId,
			tipo: type,
			versao: 1,
			chaveIdempotencia: idempotencyKey,
			dataEvento: occurredAt,
			publicacaoPermitida: publicationAllowed,
			contexto: { ...snapshot, segmentacao: snapshot.segmentacao === undefined ? client.analiseRFMTitulo : snapshot.segmentacao },
		},
	});
}
