import type { TCampaignEventEntity } from "@/services/drizzle/schema/campaign-events";
import type { TSaleCampaignEventSnapshot } from "@/schemas/sale-campaign-events";
import { CAMPAIGN_EVENT_MAX_AGE_MS } from "../policy";
export const SALE_CAMPAIGN_EVENT_MAX_AGE_MS = CAMPAIGN_EVENT_MAX_AGE_MS;

export function getSaleCampaignEventDiscardReason({
	event,
	snapshot,
	sale,
	now,
}: {
	event: Pick<TCampaignEventEntity, "clienteId" | "dataEvento">;
	snapshot: TSaleCampaignEventSnapshot;
	sale: { clienteId: string | null; statusVenda: string | null } | null | undefined;
	now: Date;
}): string | null {
	if (!sale || (sale.statusVenda !== "CONFIRMADA" && !(snapshot.origem === "REGISTRO" && sale.statusVenda === null)))
		return "Venda não está confirmada.";
	if (sale.clienteId !== event.clienteId) return "Cliente da venda foi alterado.";
	if (snapshot.compraValor <= 0 && !snapshot.origem) return "Venda sem valor positivo.";
	if (now.getTime() - event.dataEvento.getTime() > SALE_CAMPAIGN_EVENT_MAX_AGE_MS) return "Evento expirado; envio retroativo descartado.";
	return null;
}
