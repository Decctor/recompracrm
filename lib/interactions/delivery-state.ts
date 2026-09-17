import type { TInteractionsStatusEnum } from "@/schemas/interactions";
import { db } from "@/services/drizzle";
import { interactions } from "@/services/drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import { adjustSendQuota } from "./send-counters";

const PROGRESSIVE_DELIVERY_STATUS_RANK: Partial<Record<TInteractionsStatusEnum, number>> = {
	PENDENTE: 0,
	ENVIADO: 1,
	ENTREGUE: 2,
	LIDO: 3,
};

const QUOTA_CONSUMING_STATUSES: TInteractionsStatusEnum[] = ["PENDENTE", "ENVIADO", "ENTREGUE", "LIDO"];

function resolveNextDeliveryStatus({
	current,
	incoming,
	preventStatusDowngrade,
}: {
	current: TInteractionsStatusEnum | null;
	incoming: TInteractionsStatusEnum;
	preventStatusDowngrade: boolean;
}) {
	if (!preventStatusDowngrade || current == null) return incoming;

	const currentRank = PROGRESSIVE_DELIVERY_STATUS_RANK[current];
	const incomingRank = PROGRESSIVE_DELIVERY_STATUS_RANK[incoming];
	if (incomingRank != null && currentRank != null && currentRank > incomingRank) return current;
	if ((current === "ENTREGUE" || current === "LIDO") && incoming === "FALHOU") return current;

	return incoming;
}

function asMetadataRecord(value: unknown): Record<string, unknown> {
	return value != null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

type TUpdateInteractionDeliveryStateInput = {
	interactionId: string;
	organizationId?: string;
	statusEnvio: TInteractionsStatusEnum;
	erroEnvio?: string | null;
	metadataPatch?: Record<string, unknown>;
	occurredAt?: Date;
	preventStatusDowngrade?: boolean;
};

type TUpdateInteractionDeliveryStateOutput = {
	updated: boolean;
	interactionId: string;
	previousStatus: TInteractionsStatusEnum | null;
	nextStatus: TInteractionsStatusEnum;
	statusChanged: boolean;
};

// Serializa transições concorrentes da mesma interação com FOR UPDATE. A mudança de status e o
// eventual delta de quota são confirmados na mesma transação, evitando liberação duplicada por
// webhooks repetidos ou concorrentes.
//
// Regra de status com preventStatusDowngrade ativo:
//   - status atual nulo OU prevenção desligada    -> aplica o incoming
//   - rank(atual) > rank(incoming)                -> mantém o atual (PENDENTE<ENVIADO<ENTREGUE<LIDO)
//   - atual em (ENTREGUE, LIDO) e incoming FALHOU -> mantém o atual
//   - caso contrário                              -> aplica o incoming
//
// Quota: FALHOU reportado pelo provedor devolve todas as janelas que o envio consumiu (nas chaves
// da reserva); a volta para um status entregue reconsome.
export async function updateInteractionDeliveryState({
	interactionId,
	organizationId,
	statusEnvio,
	erroEnvio,
	metadataPatch,
	occurredAt,
	preventStatusDowngrade = true,
}: TUpdateInteractionDeliveryStateInput): Promise<TUpdateInteractionDeliveryStateOutput> {
	const incoming = statusEnvio;
	const transitionDate = occurredAt ?? new Date();

	const result = await db.transaction(async (tx) => {
		const [currentInteraction] = await tx
			.select({
				statusEnvio: interactions.statusEnvio,
				organizacaoId: interactions.organizacaoId,
				campanhaId: interactions.campanhaId,
				tipo: interactions.tipo,
				dataExecucao: interactions.dataExecucao,
				dataEnvio: interactions.dataEnvio,
				metadados: interactions.metadados,
				erroEnvio: interactions.erroEnvio,
			})
			.from(interactions)
			.where(
				organizationId ? and(eq(interactions.id, interactionId), eq(interactions.organizacaoId, organizationId)) : eq(interactions.id, interactionId),
			)
			.for("update");

		if (!currentInteraction) return null;

		const previousStatus = currentInteraction.statusEnvio;
		const nextStatus = resolveNextDeliveryStatus({ current: previousStatus, incoming, preventStatusDowngrade });
		const statusChanged = previousStatus !== nextStatus;
		const previouslyConsumedQuota = previousStatus != null && QUOTA_CONSUMING_STATUSES.includes(previousStatus);
		const nextConsumesQuota = QUOTA_CONSUMING_STATUSES.includes(nextStatus);
		const isTestSend = asMetadataRecord(currentInteraction.metadados).teste === true;

		if (
			statusChanged &&
			previouslyConsumedQuota !== nextConsumesQuota &&
			!isTestSend &&
			currentInteraction.tipo === "ENVIO-MENSAGEM" &&
			currentInteraction.campanhaId != null &&
			currentInteraction.organizacaoId != null
		) {
			await adjustSendQuota({
				tx,
				organizationId: currentInteraction.organizacaoId,
				campaignId: currentInteraction.campanhaId,
				claimedAt: currentInteraction.dataExecucao ?? transitionDate,
				delta: nextConsumesQuota ? 1 : -1,
			});
		}

		const incomingWasApplied = nextStatus === incoming;
		const nextError = incomingWasApplied
			? erroEnvio !== undefined
				? erroEnvio
				: nextStatus === "FALHOU"
					? currentInteraction.erroEnvio
					: null
			: currentInteraction.erroEnvio;
		const writesDeliveryDates = nextStatus === "ENVIADO" || nextStatus === "ENTREGUE" || nextStatus === "LIDO";

		const [updatedInteraction] = await tx
			.update(interactions)
			.set({
				statusEnvio: nextStatus,
				erroEnvio: nextError,
				dataExecucao: writesDeliveryDates ? (currentInteraction.dataExecucao ?? transitionDate) : currentInteraction.dataExecucao,
				dataEnvio: writesDeliveryDates ? (currentInteraction.dataEnvio ?? transitionDate) : currentInteraction.dataEnvio,
				metadados: { ...asMetadataRecord(currentInteraction.metadados), ...metadataPatch },
			})
			.where(eq(interactions.id, interactionId))
			.returning({ statusEnvio: interactions.statusEnvio });

		if (!updatedInteraction) {
			throw new Error(`A interação ${interactionId} deixou de existir durante a atualização do estado de entrega.`);
		}
		if (updatedInteraction.statusEnvio !== nextStatus) {
			throw new Error(
				`Status persistido inesperado para a interação ${interactionId}: esperado ${nextStatus}, recebido ${updatedInteraction.statusEnvio}.`,
			);
		}

		return { previousStatus, nextStatus, statusChanged };
	});

	if (!result) {
		return {
			updated: false,
			interactionId,
			previousStatus: null,
			nextStatus: statusEnvio,
			statusChanged: false,
		};
	}

	return {
		updated: true,
		interactionId,
		...result,
	};
}

export function markInteractionFailed(params: Omit<TUpdateInteractionDeliveryStateInput, "statusEnvio">) {
	return updateInteractionDeliveryState({ ...params, statusEnvio: "FALHOU" });
}

export type TProviderMessageStatus = "pending" | "sent" | "delivered" | "read" | "failed";

const PROVIDER_STATUS_TO_DELIVERY_STATUS: Record<TProviderMessageStatus, TInteractionsStatusEnum> = {
	pending: "PENDENTE",
	sent: "ENVIADO",
	delivered: "ENTREGUE",
	read: "LIDO",
	failed: "FALHOU",
};

export function mapProviderStatusToInteractionStatus(status: TProviderMessageStatus): TInteractionsStatusEnum {
	return PROVIDER_STATUS_TO_DELIVERY_STATUS[status] ?? "PENDENTE";
}

type TApplyProviderStatusUpdateInput = {
	// Um dos dois identifica a interação: o wamid gravado em metadados.whatsappMessageId, ou o
	// clientMessageId (gateway interno), que é o próprio id da interação.
	whatsappMessageId?: string | null;
	clientMessageId?: string | null;
	status: TProviderMessageStatus;
	errorMessage?: string | null;
	metadataPatch?: Record<string, unknown>;
};

/**
 * Ponto único de aplicação de status de entrega vindos de um provedor (Meta Cloud API e
 * gateway interno). Resolve a interação, mapeia o status e delega a transição (com quota) a
 * updateInteractionDeliveryState. Devolve null quando nenhuma interação corresponde — mensagens
 * de chat comuns também geram esses webhooks e não têm interação.
 */
export async function applyProviderStatusUpdate({
	whatsappMessageId,
	clientMessageId,
	status,
	errorMessage,
	metadataPatch,
}: TApplyProviderStatusUpdateInput): Promise<TUpdateInteractionDeliveryStateOutput | null> {
	let interaction: { id: string; organizacaoId: string | null } | undefined;

	if (clientMessageId) {
		interaction = await db.query.interactions.findFirst({
			where: (fields, { eq: eqFilter }) => eqFilter(fields.id, clientMessageId),
			columns: { id: true, organizacaoId: true },
		});
	}
	if (!interaction && whatsappMessageId) {
		interaction = await db.query.interactions.findFirst({
			where: sql`${interactions.metadados}->>'whatsappMessageId' = ${whatsappMessageId}`,
			columns: { id: true, organizacaoId: true },
		});
	}
	if (!interaction) return null;

	if (!interaction.organizacaoId) {
		console.warn("[INTERACTIONS] Interação sem organizacaoId; atualizando estado de entrega apenas por id:", {
			interactionId: interaction.id,
			whatsappMessageId,
			clientMessageId,
		});
	}

	const statusEnvio = mapProviderStatusToInteractionStatus(status);
	return updateInteractionDeliveryState({
		interactionId: interaction.id,
		organizationId: interaction.organizacaoId ?? undefined,
		statusEnvio,
		erroEnvio: statusEnvio === "FALHOU" ? (errorMessage ?? "Mensagem não entregue pelo WhatsApp.") : null,
		metadataPatch: {
			...(whatsappMessageId ? { whatsappMessageId } : {}),
			...(clientMessageId ? { clientMessageId } : {}),
			whatsappStatus: statusEnvio,
			...metadataPatch,
		},
	});
}
