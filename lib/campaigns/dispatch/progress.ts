import type { TCampaignDispatchSkipReasonEnum } from "@/schemas/enums";
import { type DBTransaction, db } from "@/services/drizzle";
import { type TCampaignDispatchEntity, campaignDispatchRecipients, campaignDispatches } from "@/services/drizzle/schema";
import { and, eq, sql } from "drizzle-orm";

/** Escritas de progresso do disparo compartilhadas pelo consumer de envio e pela interrupção. */

export async function touchDispatch(executor: DBTransaction | typeof db, dispatchId: string, patch: Partial<TCampaignDispatchEntity>) {
	await executor
		.update(campaignDispatches)
		.set({ ...patch, dataAtualizacao: new Date() })
		.where(eq(campaignDispatches.id, dispatchId));
}

// Marca todos os AGUARDANDO restantes como PULADA (quota esgotada, campanha pausada, campanha
// sem template, envio interrompido) e devolve quantos foram.
export async function skipRemainingRecipients({
	executor,
	dispatchId,
	motivoPulo,
	erro,
}: {
	executor: DBTransaction | typeof db;
	dispatchId: string;
	motivoPulo: TCampaignDispatchSkipReasonEnum;
	erro: string;
}) {
	const rows = await executor
		.update(campaignDispatchRecipients)
		.set({ status: "PULADA", motivoPulo, erro })
		.where(and(eq(campaignDispatchRecipients.dispatchId, dispatchId), eq(campaignDispatchRecipients.status, "AGUARDANDO")))
		.returning({ id: campaignDispatchRecipients.id });
	if (rows.length > 0) {
		await executor
			.update(campaignDispatches)
			.set({ totalPulados: sql`${campaignDispatches.totalPulados} + ${rows.length}`, dataAtualizacao: new Date() })
			.where(eq(campaignDispatches.id, dispatchId));
	}
	return rows.length;
}
