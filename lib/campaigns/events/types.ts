import type { DBTransaction, db } from "@/services/drizzle";
import type { TCampaignEventEntity, TCampaignDispatchRecipientEntity, TClientEntity } from "@/services/drizzle/schema";
import type { TCampaignDispatchSkipReasonEnum } from "@/schemas/enums";
import type { createEventCampaignDispatch } from "@/lib/campaigns/engine";

export type TCampaignEventDispatch = Awaited<ReturnType<typeof createEventCampaignDispatch>> & { expand?: boolean };
export type TCampaignEventRecipient = Pick<TCampaignDispatchRecipientEntity, "campanhaEventoId" | "organizacaoId" | "clienteId" | "vendaId"> & {
	campanhaId?: string;
};
export type TCampaignEventRecipientBlock = { motivo: TCampaignDispatchSkipReasonEnum; erro: string };

/** Client facts the send guards revalidate; the send loop pre-loads them in one batched query. */
export type TCampaignEventRecipientClient = Pick<TClientEntity, "id" | "comunicacaoPausadaAte" | "analiseRFMTitulo" | "dataNascimento">;

export type TCampaignEventHandlerContext<T> = {
	tx: DBTransaction;
	event: TCampaignEventEntity;
	payload: T;
	now: Date;
};

export type TCampaignEventRecipientValidationContext<T> = {
	executor: typeof db | DBTransaction;
	event: TCampaignEventEntity;
	payload: T;
	recipient: TCampaignEventRecipient;
	/** Pre-loaded client row; `null` means the client no longer exists. Undefined = load it. */
	client?: TCampaignEventRecipientClient | null;
	scheduledAt: Date | null;
	now: Date;
	/** Per-event memo shared by every recipient of a dispatch (campaign row, recipient set, sale state). */
	memo: Map<string, unknown>;
};

export type TCampaignEventHandler<T = unknown> = {
	parse: (payload: unknown) => T;
	process: (context: TCampaignEventHandlerContext<T>) => Promise<{ dispatches: TCampaignEventDispatch[]; discardReason?: string }>;
	validateRecipient: (context: TCampaignEventRecipientValidationContext<T>) => Promise<TCampaignEventRecipientBlock | null>;
};

/** Memoizes one async lookup per event for all recipients of the same dispatch. */
export async function memoize<T>(memo: Map<string, unknown>, key: string, load: () => Promise<T>): Promise<T> {
	if (!memo.has(key)) memo.set(key, load());
	return memo.get(key) as Promise<T>;
}
