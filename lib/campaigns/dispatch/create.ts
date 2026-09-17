import type { TInteractionContextMetadados } from "@/lib/message-templates";
import type { TCampaignDispatchOriginEnum, TCampaignDispatchSkipReasonEnum } from "@/schemas/enums";
import type { DBTransaction } from "@/services/drizzle";
import { campaignDispatchRecipients, campaignDispatches } from "@/services/drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import { chunkArray } from "../shared";

/**
 * Criação idempotente de disparos e destinatários. A chave única (campanha, janela) do disparo e
 * (disparo, cliente) do destinatário são os claims: ON CONFLICT DO NOTHING em vez de
 * SELECT-then-INSERT, então dois relógios/consumers concorrentes nunca duplicam.
 */

export type TCreateCampaignDispatchResult = {
	dispatchId: string;
	// false = já existia (outro run criou); quem recebe false NÃO publica trabalho.
	created: boolean;
};

export async function createCampaignDispatch({
	tx,
	organizationId,
	campaignId,
	origem,
	janelaReferencia,
	dataAgendada = null,
}: {
	tx: DBTransaction;
	organizationId: string;
	campaignId: string;
	origem: TCampaignDispatchOriginEnum;
	janelaReferencia: string;
	dataAgendada?: Date | null;
}): Promise<TCreateCampaignDispatchResult> {
	const [inserted] = await tx
		.insert(campaignDispatches)
		.values({ organizacaoId: organizationId, campanhaId: campaignId, origem, janelaReferencia, dataAgendada })
		.onConflictDoNothing({ target: [campaignDispatches.campanhaId, campaignDispatches.janelaReferencia] })
		.returning({ id: campaignDispatches.id });

	if (inserted) return { dispatchId: inserted.id, created: true };

	const existing = await tx.query.campaignDispatches.findFirst({
		where: and(eq(campaignDispatches.campanhaId, campaignId), eq(campaignDispatches.janelaReferencia, janelaReferencia)),
		columns: { id: true },
	});
	if (!existing) throw new Error(`Disparo da campanha ${campaignId} para a janela ${janelaReferencia} não pôde ser criado nem localizado.`);
	return { dispatchId: existing.id, created: false };
}

export type TCampaignDispatchRecipientInput = {
	clienteId: string;
	contexto?: TInteractionContextMetadados | null;
	vendaId?: string | null;
	descricao?: string | null;
	// Destinatários já decididos como pulados na expansão (frequência, pausa de comunicação):
	// entram como PULADA para responder "por que não recebeu?" com uma linha.
	motivoPulo?: TCampaignDispatchSkipReasonEnum | null;
};

// Lotes curtos: cada linha tem ~12 colunas e o Postgres limita 65535 parâmetros por statement.
const RECIPIENT_INSERT_CHUNK_SIZE = 1000;

/**
 * Insere destinatários em lotes, ignorando clientes já presentes no disparo. Devolve quantos
 * entraram como AGUARDANDO e quantos como PULADA — os totais do disparo são atualizados aqui
 * mesmo, no mesmo statement de contagem, para que a expansão possa ser reexecutada com segurança.
 */
export async function insertCampaignDispatchRecipients({
	tx,
	dispatchId,
	organizationId,
	campaignId,
	recipients,
}: {
	tx: DBTransaction;
	dispatchId: string;
	organizationId: string;
	campaignId: string;
	recipients: TCampaignDispatchRecipientInput[];
}): Promise<{ inserted: number; skipped: number }> {
	let inserted = 0;
	let skipped = 0;

	for (const chunk of chunkArray(recipients, RECIPIENT_INSERT_CHUNK_SIZE)) {
		const rows = await tx
			.insert(campaignDispatchRecipients)
			.values(
				chunk.map((recipient) => ({
					dispatchId,
					organizacaoId: organizationId,
					campanhaId: campaignId,
					clienteId: recipient.clienteId,
					status: recipient.motivoPulo ? ("PULADA" as const) : ("AGUARDANDO" as const),
					motivoPulo: recipient.motivoPulo ?? null,
					vendaId: recipient.vendaId ?? null,
					descricao: recipient.descricao ?? null,
					// A chave de idempotência nasce aqui e vira o id da interação no envio: o gateway
					// interno recebe-a como clientMessageId, então um reenvio após queda deduplica.
					chaveIdempotencia: crypto.randomUUID(),
					contexto: recipient.contexto ?? null,
				})),
			)
			.onConflictDoNothing({ target: [campaignDispatchRecipients.dispatchId, campaignDispatchRecipients.clienteId] })
			.returning({ status: campaignDispatchRecipients.status });

		for (const row of rows) {
			if (row.status === "PULADA") skipped += 1;
			else inserted += 1;
		}
	}

	if (inserted > 0 || skipped > 0) {
		await tx
			.update(campaignDispatches)
			.set({
				totalDestinatarios: sql`${campaignDispatches.totalDestinatarios} + ${inserted + skipped}`,
				totalPulados: sql`${campaignDispatches.totalPulados} + ${skipped}`,
				dataAtualizacao: new Date(),
			})
			.where(eq(campaignDispatches.id, dispatchId));
	}

	return { inserted, skipped };
}
