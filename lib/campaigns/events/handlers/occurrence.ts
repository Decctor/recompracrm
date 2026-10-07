import {
	CampaignOccurrencePayloadSchema,
	ScheduledCampaignPayloadSchema,
	type TCampaignOccurrencePayload,
	type TScheduledCampaignPayload,
} from "@/schemas/campaign-occurrences";
import { campaigns, clients, cashbackProgramTransactions, campaignDispatches } from "@/services/drizzle/schema";
import { and, eq, gt, inArray, lte, sql } from "drizzle-orm";
import { chunkArray } from "@/lib/campaigns/shared";
import { filterClientIdsByFrequencyCap, createEventCampaignDispatch } from "@/lib/campaigns/engine";
import { resolveCampaignAudiencesByCampaignId } from "@/lib/campaigns/filters";
import { createCampaignDispatch } from "@/lib/campaigns/dispatch/create";
import { CAMPAIGN_EVENT_MAX_AGE_MS } from "../policy";
import { memoize, type TCampaignEventHandler, type TCampaignEventRecipientBlock, type TCampaignEventRecipientValidationContext } from "../types";

const MAX_RECOVERY_AGE_MS = CAMPAIGN_EVENT_MAX_AGE_MS;
const RECIPIENT_CLIENT_COLUMNS = { id: true, comunicacaoPausadaAte: true, analiseRFMTitulo: true, dataNascimento: true } as const;

/**
 * Shared by detector occurrences and scheduled campaigns. `expires` is the detector rule: a
 * birthday or expiring-cashback message a day late has no value. Scheduled/recurring campaigns
 * keep their pre-event behavior and go out whenever the pipeline recovers.
 */
async function validateOccurrenceRecipient(
	{ executor, event, payload, recipient, client, scheduledAt, now, memo }: TCampaignEventRecipientValidationContext<TScheduledCampaignPayload>,
	{ expires }: { expires: boolean },
): Promise<TCampaignEventRecipientBlock | null> {
	if (expires && now.getTime() - (scheduledAt ?? event.dataEvento).getTime() > MAX_RECOVERY_AGE_MS)
		return { motivo: "EVENTO_EXPIRADO", erro: "Ocorrência fora da janela de envio." };
	if (recipient.campanhaId && recipient.campanhaId !== payload.campanhaId)
		return { motivo: "EVENTO_INVALIDO", erro: "Destinatário de outra campanha." };
	const campaign = await memoize(memo, "campaign", () =>
		executor.query.campaigns.findFirst({
			where: and(eq(campaigns.id, payload.campanhaId), eq(campaigns.organizacaoId, event.organizacaoId)),
			columns: { ativo: true, gatilhoTipo: true },
		}),
	);
	if (!campaign?.ativo) return { motivo: "CAMPANHA_INATIVA", erro: "Campanha pausada ou removida." };
	if (event.fonteTipo !== "CAMPANHA" || event.fonteId !== payload.campanhaId || campaign.gatilhoTipo !== payload.gatilho)
		return { motivo: "EVENTO_INVALIDO", erro: "Campanha da ocorrência foi alterada." };
	const resolvedClient =
		client !== undefined
			? client
			: await executor.query.clients.findFirst({
					where: and(eq(clients.id, recipient.clienteId), eq(clients.organizacaoId, event.organizacaoId)),
					columns: RECIPIENT_CLIENT_COLUMNS,
				});
	if (!resolvedClient) return { motivo: "EVENTO_INVALIDO", erro: "Cliente da ocorrência não encontrado." };
	if (resolvedClient.comunicacaoPausadaAte && resolvedClient.comunicacaoPausadaAte > now)
		return { motivo: "COMUNICACAO_PAUSADA", erro: "Comunicação com o cliente está pausada." };
	if (payload.segmentacaoEsperada && resolvedClient.analiseRFMTitulo !== payload.segmentacaoEsperada)
		return { motivo: "EVENTO_INVALIDO", erro: "Cliente mudou de segmentação." };
	if (payload.nascimentoMes && payload.nascimentoDia) {
		const date = resolvedClient.dataNascimento;
		if (!date || date.getUTCMonth() + 1 !== payload.nascimentoMes || date.getUTCDate() !== payload.nascimentoDia)
			return { motivo: "EVENTO_INVALIDO", erro: "Data de aniversário foi alterada." };
	}
	if (payload.expiracaoAte) {
		const [balance] = await executor
			.select({ valor: sql<number>`coalesce(sum(${cashbackProgramTransactions.valorRestante}), 0)`.mapWith(Number) })
			.from(cashbackProgramTransactions)
			.where(
				and(
					eq(cashbackProgramTransactions.organizacaoId, event.organizacaoId),
					eq(cashbackProgramTransactions.clienteId, resolvedClient.id),
					eq(cashbackProgramTransactions.tipo, "ACÚMULO"),
					eq(cashbackProgramTransactions.status, "ATIVO"),
					gt(cashbackProgramTransactions.valorRestante, 0),
					gt(cashbackProgramTransactions.expiracaoData, now),
					lte(cashbackProgramTransactions.expiracaoData, new Date(payload.expiracaoAte)),
				),
			);
		if (!balance?.valor || balance.valor < (payload.expiracaoValorMinimo ?? 0))
			return { motivo: "EVENTO_INVALIDO", erro: "Cashback da ocorrência foi consumido ou expirou." };
	}
	return null;
}

export const campaignOccurrenceHandler: TCampaignEventHandler<TCampaignOccurrencePayload> = {
	parse: (payload) => CampaignOccurrencePayloadSchema.parse(payload),
	validateRecipient: async (context) => {
		// Membership set built once per event; the payload lists every recipient of the occurrence.
		const members = await memoize(
			context.memo,
			"recipients",
			async () => new Set(context.payload.destinatarios.map((recipient) => recipient.clienteId)),
		);
		if (!members.has(context.recipient.clienteId)) return { motivo: "EVENTO_INVALIDO", erro: "Destinatário não pertence à ocorrência." };
		return validateOccurrenceRecipient(context, { expires: true });
	},
	process: async ({ tx, event, payload, now }) => {
		if (now.getTime() - event.dataEvento.getTime() > MAX_RECOVERY_AGE_MS) return { dispatches: [], discardReason: "Ocorrência expirada." };
		const campaign = await tx.query.campaigns.findFirst({
			where: and(eq(campaigns.id, payload.campanhaId), eq(campaigns.organizacaoId, event.organizacaoId)),
			with: { segmentacoes: true },
		});
		if (!campaign?.ativo || campaign.gatilhoTipo !== payload.gatilho || event.fonteTipo !== "CAMPANHA" || event.fonteId !== campaign.id)
			return { dispatches: [], discardReason: "Campanha da ocorrência inválida ou inativa." };
		const ids = [...new Set(payload.destinatarios.map((recipient) => recipient.clienteId))].sort();
		const audience = await resolveCampaignAudiencesByCampaignId({
			executor: tx,
			organizationId: event.organizacaoId,
			campaigns: [campaign],
			restrictToClientIds: ids,
		});
		const eligible = payload.destinatarios.filter(
			(recipient) => event.tipo === "CAMPANHA_SOLICITADA" || recipient.motivoPulo || audience.get(campaign.id)?.has(recipient.clienteId),
		);
		const frequency =
			event.tipo === "CAMPANHA_SOLICITADA"
				? { blocked: [] }
				: await filterClientIdsByFrequencyCap({
						executor: tx,
						campaign,
						clientIds: eligible.filter((recipient) => !recipient.motivoPulo).map((recipient) => recipient.clienteId),
						now,
					});
		const blocked = new Set(frequency.blocked);
		const validClients = new Set<string>();
		for (const chunk of chunkArray(ids, 5000)) {
			const rows = await tx.query.clients.findMany({
				where: and(eq(clients.organizacaoId, event.organizacaoId), inArray(clients.id, chunk)),
				columns: { id: true, analiseRFMTitulo: true, dataNascimento: true },
			});
			for (const client of rows) {
				if (payload.segmentacaoEsperada && client.analiseRFMTitulo !== payload.segmentacaoEsperada) continue;
				if (
					payload.nascimentoMes &&
					payload.nascimentoDia &&
					(!client.dataNascimento ||
						client.dataNascimento.getUTCMonth() + 1 !== payload.nascimentoMes ||
						client.dataNascimento.getUTCDate() !== payload.nascimentoDia)
				)
					continue;
				validClients.add(client.id);
			}
		}
		if (payload.expiracaoAte) {
			const expiringClients = new Set<string>();
			for (const chunk of chunkArray(ids, 5000)) {
				const balances = await tx
					.select({
						clienteId: cashbackProgramTransactions.clienteId,
						valor: sql<number>`sum(${cashbackProgramTransactions.valorRestante})`.mapWith(Number),
					})
					.from(cashbackProgramTransactions)
					.where(
						and(
							eq(cashbackProgramTransactions.organizacaoId, event.organizacaoId),
							inArray(cashbackProgramTransactions.clienteId, chunk),
							eq(cashbackProgramTransactions.tipo, "ACÚMULO"),
							eq(cashbackProgramTransactions.status, "ATIVO"),
							gt(cashbackProgramTransactions.valorRestante, 0),
							gt(cashbackProgramTransactions.expiracaoData, now),
							lte(cashbackProgramTransactions.expiracaoData, new Date(payload.expiracaoAte)),
						),
					)
					.groupBy(cashbackProgramTransactions.clienteId);
				for (const balance of balances) if (balance.valor >= (payload.expiracaoValorMinimo ?? 0)) expiringClients.add(balance.clienteId);
			}
			for (const id of validClients) if (!expiringClients.has(id)) validClients.delete(id);
		}
		const recipients = [];
		for (const recipient of eligible) {
			recipients.push({
				...recipient,
				campanhaEventoId: event.id,
				motivoPulo:
					recipient.motivoPulo ??
					(!validClients.has(recipient.clienteId) ? ("EVENTO_INVALIDO" as const) : blocked.has(recipient.clienteId) ? ("FREQUENCIA" as const) : null),
			});
		}
		const dispatch = await createEventCampaignDispatch({
			tx,
			organizationId: event.organizacaoId,
			campaign,
			janelaReferencia: payload.janelaReferencia,
			scheduledAt: payload.dataAgendada ? new Date(payload.dataAgendada) : null,
			recipients,
			campanhaEventoId: event.id,
			now,
		});
		return { dispatches: [dispatch] };
	},
};

export const scheduledCampaignHandler: TCampaignEventHandler<TScheduledCampaignPayload> = {
	parse: (payload) => ScheduledCampaignPayloadSchema.parse(payload),
	// Scheduled and recurring dispatches never expire at send time: before events they had no due
	// time and went out whenever the pipeline recovered. Only the capture window is bounded.
	validateRecipient: (context) => validateOccurrenceRecipient(context, { expires: false }),
	process: async ({ tx, event, payload, now }) => {
		const campaign = await tx.query.campaigns.findFirst({
			where: and(eq(campaigns.id, payload.campanhaId), eq(campaigns.organizacaoId, event.organizacaoId)),
		});
		if (
			event.clienteId ||
			event.fonteTipo !== "CAMPANHA" ||
			event.fonteId !== payload.campanhaId ||
			!campaign?.ativo ||
			campaign.gatilhoTipo !== payload.gatilho
		)
			return { dispatches: [], discardReason: "Campanha agendada inválida ou inativa." };
		if (now.getTime() - event.dataEvento.getTime() > MAX_RECOVERY_AGE_MS) return { dispatches: [], discardReason: "Janela agendada expirada." };
		const result = await createCampaignDispatch({
			tx,
			organizationId: event.organizacaoId,
			campaignId: campaign.id,
			origem: payload.gatilho === "RECORRENTE" ? "RECORRENTE" : "AGENDADA",
			janelaReferencia: payload.janelaReferencia,
			// Kept null as before the migration: the window is in the key, and a non-null due time
			// would make the stale-dispatch and send paths treat the round as a delayed event.
			dataAgendada: null,
			campanhaEventoId: event.id,
		});
		if (result.created)
			await tx.update(campaignDispatches).set({ status: "RESOLVENDO", dataAtualizacao: now }).where(eq(campaignDispatches.id, result.dispatchId));
		return { dispatches: [{ ...result, immediate: true, inserted: 0, skipped: 0, expand: true }] };
	},
};
