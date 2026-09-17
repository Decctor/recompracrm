import {
	getSendQuotaSkipReasonMessage,
	releaseSendQuota,
	reserveSendQuota,
	resolveSendQuotaLimits,
	type TSendQuotaLimits,
} from "@/lib/interactions/send-counters";
import type { TInteractionContextMetadados } from "@/lib/message-templates";
import type { TCampaignDispatchSkipReasonEnum } from "@/schemas/enums";
import type { TInteractionMetadata } from "@/schemas/interactions";
import { type DBTransaction, db } from "@/services/drizzle";
import {
	type TCampaignDispatchEntity,
	type TCampaignDispatchRecipientEntity,
	campaignDispatchRecipients,
	campaignDispatches,
	campaigns,
	clients,
	interactions,
} from "@/services/drizzle/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { chunkArray } from "../shared";
import {
	grantCampaignBonusOnSend,
	loadOrganizationCashbackProgramForSend,
	projectCampaignSendContext,
	type TCampaignSendBonusProgram,
} from "./bonus";
import { deliverCampaignMessage, resolveOrganizationHubAccess, type TCampaignDeliveryClient, type TChatPromiseCache } from "./deliver";
import { publishCampaignDispatchSend } from "./queue";

/**
 * Consumer de envio (`campaign-dispatch-send`). Idempotente e retomável:
 *  1. reivindica um lote de destinatários AGUARDANDO com FOR UPDATE SKIP LOCKED (mutex contra a
 *     reentrega at-least-once da fila e entre workers paralelos) e reserva quota na mesma transação;
 *  2. entrega ao provedor com a chave de idempotência do destinatário;
 *  3. registra: interação + bônus + destinatário ENVIADA numa transação; ou FALHOU/PULADA com a
 *     quota devolvida.
 * Ao esgotar o orçamento de tempo com trabalho sobrando, publica uma continuação.
 */

export const CAMPAIGN_DISPATCH_SEND_BATCH_SIZE = 50;
export const CAMPAIGN_DISPATCH_SEND_CONCURRENCY = 10;
export const CAMPAIGN_DISPATCH_MAX_SEND_WORKERS = 4;
const RUNTIME_BUDGET_MS = 240_000;

export type TCampaignDispatchSendSummary = {
	dispatchId: string;
	claimed: number;
	sent: number;
	queued: number;
	failed: number;
	skipped: number;
	stoppedByTimeBudget: boolean;
	finalized: boolean;
};

type TSendCampaign = NonNullable<Awaited<ReturnType<typeof loadCampaignForSend>>>;

async function loadCampaignForSend({ organizationId, campaignId }: { organizationId: string; campaignId: string }) {
	return db.query.campaigns.findFirst({
		where: and(eq(campaigns.id, campaignId), eq(campaigns.organizacaoId, organizationId)),
		with: {
			whatsappTemplate: true,
			whatsappConexaoTelefone: {
				columns: { id: true },
				with: { conexao: { columns: { tipoConexao: true, token: true, gatewaySessaoId: true } } },
			},
		},
	});
}

export function buildDispatchInteractionTitle({
	origem,
	campaign,
}: {
	origem: TCampaignDispatchEntity["origem"];
	campaign: { titulo: string; gatilhoTipo: string };
}) {
	if (origem === "RECORRENTE") return `Recorrente: ${campaign.titulo}`;
	if (origem === "AGENDADA") return `${campaign.gatilhoTipo === "PROMOCAO-PRODUTOS" ? "Promoção de produtos" : "Uso único"}: ${campaign.titulo}`;
	return `Envio de mensagem automática via campanha ${campaign.titulo}`;
}

async function touchDispatch(executor: DBTransaction | typeof db, dispatchId: string, patch: Partial<TCampaignDispatchEntity>) {
	await executor
		.update(campaignDispatches)
		.set({ ...patch, dataAtualizacao: new Date() })
		.where(eq(campaignDispatches.id, dispatchId));
}

// Marca todos os AGUARDANDO restantes como PULADA (quota esgotada, campanha pausada, campanha
// sem template) e devolve quantos foram.
async function skipRemainingRecipients({
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

type TClaimedBatch = {
	reserved: TCampaignDispatchRecipientEntity[];
	quotaExhaustedBy: TCampaignDispatchSkipReasonEnum | null;
};

async function claimRecipientBatch({
	dispatch,
	limits,
	batchSize,
}: {
	dispatch: Pick<TCampaignDispatchEntity, "id" | "organizacaoId" | "campanhaId">;
	limits: TSendQuotaLimits;
	batchSize: number;
}): Promise<TClaimedBatch> {
	return db.transaction(async (tx) => {
		const now = new Date();
		const claimed = (await tx.execute(sql`
			UPDATE ${campaignDispatchRecipients} r
			SET status = 'RESERVADA', data_reserva = ${now.toISOString()}::timestamp, tentativas = tentativas + 1, erro = NULL
			WHERE r.id IN (
				SELECT c.id FROM ${campaignDispatchRecipients} c
				WHERE c.dispatch_id = ${dispatch.id} AND c.status = 'AGUARDANDO'
				ORDER BY c.data_insercao ASC, c.id ASC
				LIMIT ${batchSize}
				FOR UPDATE SKIP LOCKED
			)
			RETURNING r.*
		`)) as unknown as Record<string, unknown>[];

		if (claimed.length === 0) return { reserved: [], quotaExhaustedBy: null };

		// `execute` devolve colunas cruas (snake_case); recarregamos pelo Drizzle para tipar.
		const claimedIds = claimed.map((row) => String(row.id));
		const reservedRows = await tx.query.campaignDispatchRecipients.findMany({ where: inArray(campaignDispatchRecipients.id, claimedIds) });
		const ordered = claimedIds.map((id) => reservedRows.find((row) => row.id === id)).filter((row): row is TCampaignDispatchRecipientEntity => !!row);

		const reservation = await reserveSendQuota({
			tx,
			organizationId: dispatch.organizacaoId,
			campaignId: dispatch.campanhaId,
			requested: ordered.length,
			limits,
			at: now,
		});
		const reserved = ordered.slice(0, reservation.granted);
		const overQuota = ordered.slice(reservation.granted);

		if (overQuota.length > 0 && reservation.exhaustedBy) {
			const message = getSendQuotaSkipReasonMessage(reservation.exhaustedBy);
			await tx
				.update(campaignDispatchRecipients)
				.set({ status: "PULADA", motivoPulo: reservation.exhaustedBy, erro: message, dataReserva: null })
				.where(
					inArray(
						campaignDispatchRecipients.id,
						overQuota.map((row) => row.id),
					),
				);
			// Quota esgotada: o resto do disparo também não sai nesta janela. Marcar tudo agora
			// responde "por que não recebeu?" imediatamente, em vez de deixar linhas aguardando
			// uma virada de semana que a campanha não espera.
			const remaining = await skipRemainingRecipients({ executor: tx, dispatchId: dispatch.id, motivoPulo: reservation.exhaustedBy, erro: message });
			await tx
				.update(campaignDispatches)
				.set({ totalPulados: sql`${campaignDispatches.totalPulados} + ${overQuota.length}`, dataAtualizacao: new Date() })
				.where(eq(campaignDispatches.id, dispatch.id));
			console.warn(
				`[CAMPAIGN_DISPATCH] [${dispatch.id}] Quota esgotada (${reservation.exhaustedBy}): ${overQuota.length + remaining} destinatários pulados.`,
			);
		}

		return { reserved, quotaExhaustedBy: overQuota.length > 0 ? reservation.exhaustedBy : null };
	});
}

const DELIVERY_CLIENT_COLUMNS = {
	id: true,
	nome: true,
	telefone: true,
	email: true,
	analiseRFMTitulo: true,
	metadataProdutoMaisCompradoId: true,
	metadataGrupoProdutoMaisComprado: true,
	metadataProdutoSugeridoId: true,
} as const;

async function loadDeliveryClients(clientIds: string[]): Promise<Map<string, TCampaignDeliveryClient>> {
	if (clientIds.length === 0) return new Map();
	const rows = await db.query.clients.findMany({ where: inArray(clients.id, clientIds), columns: DELIVERY_CLIENT_COLUMNS });
	return new Map(rows.map((row) => [row.id, row]));
}

type TRecordOutcome = "SENT" | "QUEUED" | "FAILED" | "SKIPPED";

async function recordRecipientOutcome({
	dispatch,
	campaign,
	recipient,
	client,
	context,
	delivery,
}: {
	dispatch: Pick<TCampaignDispatchEntity, "id" | "organizacaoId" | "campanhaId" | "origem">;
	campaign: TSendCampaign;
	recipient: TCampaignDispatchRecipientEntity;
	client: TCampaignDeliveryClient | null;
	context: TInteractionContextMetadados;
	delivery: Awaited<ReturnType<typeof deliverCampaignMessage>> | null;
}): Promise<TRecordOutcome> {
	const now = new Date();
	const organizationId = dispatch.organizacaoId;
	const reservedAt = recipient.dataReserva ?? now;

	// Cliente sumiu entre o enfileiramento e o envio, ou sem canal de contato.
	if (!client || !delivery || delivery.outcome === "NO_CONTACT") {
		const erro = delivery?.error ?? "Cliente não encontrado para o envio.";
		await db.transaction(async (tx) => {
			await tx
				.update(campaignDispatchRecipients)
				.set({ status: "PULADA", motivoPulo: "SEM_CONTATO", erro })
				.where(eq(campaignDispatchRecipients.id, recipient.id));
			await releaseSendQuota({ tx, organizationId, campaignId: dispatch.campanhaId, reservedAt });
			await touchDispatch(tx, dispatch.id, { totalPulados: sql`${campaignDispatches.totalPulados} + 1` as unknown as number });
		});
		return "SKIPPED";
	}

	if (delivery.outcome === "FAILED") {
		await db.transaction(async (tx) => {
			await tx
				.update(campaignDispatchRecipients)
				.set({ status: "FALHOU", erro: delivery.error ?? "Houve uma falha ao enviar a mensagem." })
				.where(eq(campaignDispatchRecipients.id, recipient.id));
			await releaseSendQuota({ tx, organizationId, campaignId: dispatch.campanhaId, reservedAt });
			await touchDispatch(tx, dispatch.id, { totalFalhados: sql`${campaignDispatches.totalFalhados} + 1` as unknown as number });
		});
		return "FAILED";
	}

	// Envio saiu: interação + bônus + destinatário na mesma transação. O id da interação é a chave
	// de idempotência do destinatário, então uma reentrega que já registrou não duplica.
	await db.transaction(async (tx) => {
		const existing = await tx.query.interactions.findFirst({ where: eq(interactions.id, recipient.chaveIdempotencia), columns: { id: true } });
		if (!existing) {
			const bonus = await grantCampaignBonusOnSend({
				tx,
				organizationId,
				clientId: recipient.clienteId,
				campaign,
				interactionId: recipient.chaveIdempotencia,
				saleId: recipient.vendaId,
				saleValue: recipient.contexto?.compraValor ?? null,
				context,
			});
			const metadados: TInteractionMetadata = {
				...bonus.metadata,
				dispatchId: dispatch.id,
				dispatchRecipientId: recipient.id,
				whatsappTemplateId: campaign.whatsappTemplate.id,
				messageTemplateId: campaign.whatsappTemplate.id,
				channelsAttempted: delivery.channelsAttempted as TInteractionMetadata["channelsAttempted"],
				channelsSkipped: delivery.channelsSkipped,
				channelsSent: delivery.channelsSent as TInteractionMetadata["channelsSent"],
				channelErrors: delivery.channelErrors,
				...(delivery.whatsappMessageId ? { whatsappMessageId: delivery.whatsappMessageId } : {}),
				...(delivery.emailMessageId ? { emailMessageId: delivery.emailMessageId } : {}),
				...(delivery.jobId ? { jobId: delivery.jobId } : {}),
				...(delivery.clientMessageId ? { clientMessageId: delivery.clientMessageId } : {}),
				...(delivery.chatMessageId ? { chatMessageId: delivery.chatMessageId } : {}),
				...(delivery.whatsappStatus ? { whatsappStatus: delivery.whatsappStatus } : {}),
				...(delivery.emailStatus ? { emailStatus: delivery.emailStatus } : {}),
			};
			await tx.insert(interactions).values({
				id: recipient.chaveIdempotencia,
				organizacaoId: organizationId,
				clienteId: recipient.clienteId,
				campanhaId: dispatch.campanhaId,
				titulo: buildDispatchInteractionTitle({ origem: dispatch.origem, campaign }),
				descricao: recipient.descricao ?? campaign.descricao ?? null,
				tipo: "ENVIO-MENSAGEM",
				autorId: campaign.autorId,
				canal: delivery.channelsSent.includes("WHATSAPP") ? "WHATSAPP" : "EMAIL",
				direcao: "SAIDA",
				iniciadoPor: "AUTOMACAO",
				dataInteracao: now,
				status: "REALIZADA",
				dataExecucao: now,
				dataEnvio: now,
				statusEnvio: delivery.statusEnvio,
				erroEnvio: delivery.error,
				metadados,
			});
		}
		await tx
			.update(campaignDispatchRecipients)
			.set({ status: "ENVIADA", interacaoId: recipient.chaveIdempotencia, dataEnvio: now, erro: delivery.error })
			.where(eq(campaignDispatchRecipients.id, recipient.id));
		await touchDispatch(tx, dispatch.id, { totalEnviados: sql`${campaignDispatches.totalEnviados} + 1` as unknown as number });
	});

	return delivery.outcome === "QUEUED" ? "QUEUED" : "SENT";
}

async function sendReservedRecipients({
	dispatch,
	campaign,
	program,
	recipients,
	hasHubAccess,
	chatIdCache,
	summary,
}: {
	dispatch: TCampaignDispatchEntity;
	campaign: TSendCampaign;
	program: TCampaignSendBonusProgram;
	recipients: TCampaignDispatchRecipientEntity[];
	hasHubAccess: boolean;
	chatIdCache: TChatPromiseCache;
	summary: TCampaignDispatchSendSummary;
}) {
	const clientsById = await loadDeliveryClients(recipients.map((recipient) => recipient.clienteId));
	const connection = campaign.whatsappConexaoTelefone?.conexao;
	const whatsappToken = connection?.tipoConexao === "META_CLOUD_API" ? (connection.token ?? undefined) : undefined;
	const whatsappSessionId = connection?.tipoConexao === "INTERNAL_GATEWAY" ? (connection.gatewaySessaoId ?? undefined) : undefined;

	for (const batch of chunkArray(recipients, CAMPAIGN_DISPATCH_SEND_CONCURRENCY)) {
		await Promise.all(
			batch.map(async (recipient) => {
				try {
					const client = clientsById.get(recipient.clienteId) ?? null;
					const context = await projectCampaignSendContext({
						organizationId: dispatch.organizacaoId,
						clientId: recipient.clienteId,
						campaign,
						program,
						baseContext: recipient.contexto,
						saleValue: recipient.contexto?.compraValor ?? null,
					});
					const delivery = client
						? await deliverCampaignMessage({
								organizationId: dispatch.organizacaoId,
								client,
								campaign: {
									autorId: campaign.autorId,
									whatsappConexaoTelefoneId: campaign.whatsappConexaoTelefoneId,
									whatsappTemplate: campaign.whatsappTemplate,
								},
								whatsappToken,
								whatsappSessionId,
								contextMetadados: context,
								messageKey: recipient.chaveIdempotencia,
								hasHubAccess,
								chatIdCache,
							})
						: null;
					const outcome = await recordRecipientOutcome({ dispatch, campaign, recipient, client, context, delivery });
					if (outcome === "SENT") summary.sent += 1;
					else if (outcome === "QUEUED") summary.queued += 1;
					else if (outcome === "FAILED") summary.failed += 1;
					else summary.skipped += 1;
				} catch (error) {
					// Falha ao registrar: o destinatário fica RESERVADA e a varredura do relógio o
					// devolve a AGUARDANDO. Não relançamos para não derrubar o lote inteiro.
					console.error(`[CAMPAIGN_DISPATCH] [${dispatch.id}] Falha inesperada no destinatário ${recipient.id}:`, error);
					summary.failed += 1;
				}
			}),
		);
	}
}

// Fecha o disparo quando não resta fila. O guard `status = ENVIANDO` garante que só um worker
// finaliza; campanhas de disparo único são desativadas aqui — depois de rodar, nunca antes.
export async function finalizeCampaignDispatchIfDone({ dispatchId }: { dispatchId: string }): Promise<boolean> {
	return db.transaction(async (tx) => {
		const [pending] = await tx
			.select({ total: sql<number>`count(*)::int` })
			.from(campaignDispatchRecipients)
			.where(and(eq(campaignDispatchRecipients.dispatchId, dispatchId), inArray(campaignDispatchRecipients.status, ["AGUARDANDO", "RESERVADA"])));
		if (Number(pending?.total ?? 0) > 0) return false;

		const [finalized] = await tx
			.update(campaignDispatches)
			.set({ status: "CONCLUIDA", dataConclusao: new Date(), dataAtualizacao: new Date() })
			.where(and(eq(campaignDispatches.id, dispatchId), inArray(campaignDispatches.status, ["ENVIANDO", "ENFILEIRADA"])))
			.returning({
				campanhaId: campaignDispatches.campanhaId,
				origem: campaignDispatches.origem,
				totalDestinatarios: campaignDispatches.totalDestinatarios,
			});
		if (!finalized) return false;

		if (finalized.origem === "AGENDADA" && finalized.totalDestinatarios > 0) {
			await tx.update(campaigns).set({ ativo: false }).where(eq(campaigns.id, finalized.campanhaId));
		}
		return true;
	});
}

export async function runCampaignDispatchSend({
	dispatchId,
	worker = 0,
}: {
	dispatchId: string;
	worker?: number;
}): Promise<TCampaignDispatchSendSummary> {
	const startedAt = Date.now();
	const summary: TCampaignDispatchSendSummary = {
		dispatchId,
		claimed: 0,
		sent: 0,
		queued: 0,
		failed: 0,
		skipped: 0,
		stoppedByTimeBudget: false,
		finalized: false,
	};
	const logPrefix = `[CAMPAIGN_DISPATCH] [${dispatchId}] [worker ${worker}]`;

	const dispatch = await db.query.campaignDispatches.findFirst({ where: eq(campaignDispatches.id, dispatchId) });
	if (!dispatch) {
		console.warn(`${logPrefix} Disparo não encontrado; mensagem descartada.`);
		return summary;
	}
	if (dispatch.status === "CONCLUIDA" || dispatch.status === "FALHOU" || dispatch.status === "CANCELADA") {
		return { ...summary, finalized: true };
	}
	if (dispatch.status === "PENDENTE" || dispatch.status === "RESOLVENDO") {
		// Um disparo agendado ainda não expandido não tem destinatários; a expansão publica o envio.
		if (dispatch.origem !== "EVENTO") return summary;
	}

	const campaign = await loadCampaignForSend({ organizationId: dispatch.organizacaoId, campaignId: dispatch.campanhaId });
	if (!campaign || !campaign.whatsappTemplate) {
		const erro = campaign ? "Campanha sem template de mensagem configurado." : "Campanha não encontrada.";
		await db.transaction(async (tx) => {
			await skipRemainingRecipients({ executor: tx, dispatchId, motivoPulo: "CAMPANHA_INATIVA", erro });
			await touchDispatch(tx, dispatchId, { status: "FALHOU", erro, dataConclusao: new Date() });
		});
		console.error(`${logPrefix} ${erro}`);
		return { ...summary, finalized: true };
	}
	if (!campaign.ativo) {
		const erro = getSendQuotaSkipReasonMessage("CAMPANHA_INATIVA");
		await db.transaction(async (tx) => {
			await skipRemainingRecipients({ executor: tx, dispatchId, motivoPulo: "CAMPANHA_INATIVA", erro });
			await touchDispatch(tx, dispatchId, { status: "CANCELADA", erro, dataConclusao: new Date() });
		});
		console.warn(`${logPrefix} Campanha pausada; disparo cancelado.`);
		return { ...summary, finalized: true };
	}

	await touchDispatch(db, dispatchId, { status: "ENVIANDO" });

	const [limits, program, hasHubAccess] = await Promise.all([
		resolveSendQuotaLimits({ organizationId: dispatch.organizacaoId, campaignId: dispatch.campanhaId }),
		loadOrganizationCashbackProgramForSend(dispatch.organizacaoId),
		resolveOrganizationHubAccess(dispatch.organizacaoId),
	]);
	const chatIdCache: TChatPromiseCache = new Map();

	while (Date.now() - startedAt < RUNTIME_BUDGET_MS) {
		const batch = await claimRecipientBatch({ dispatch, limits, batchSize: CAMPAIGN_DISPATCH_SEND_BATCH_SIZE });
		if (batch.reserved.length === 0 && !batch.quotaExhaustedBy) break;
		summary.claimed += batch.reserved.length;

		if (batch.reserved.length > 0) {
			await sendReservedRecipients({ dispatch, campaign, program, recipients: batch.reserved, hasHubAccess, chatIdCache, summary });
		}
		if (batch.quotaExhaustedBy) break;
	}

	if (Date.now() - startedAt >= RUNTIME_BUDGET_MS) {
		const [remaining] = await db
			.select({ total: sql<number>`count(*)::int` })
			.from(campaignDispatchRecipients)
			.where(and(eq(campaignDispatchRecipients.dispatchId, dispatchId), eq(campaignDispatchRecipients.status, "AGUARDANDO")));
		if (Number(remaining?.total ?? 0) > 0) {
			summary.stoppedByTimeBudget = true;
			await publishCampaignDispatchSend({ dispatchId, generation: `cont-${remaining?.total}-${Date.now()}` });
			console.log(`${logPrefix} Orçamento de tempo esgotado; continuação publicada.`, summary);
			return summary;
		}
	}

	summary.finalized = await finalizeCampaignDispatchIfDone({ dispatchId });
	console.log(`${logPrefix} Lote processado.`, summary);
	return summary;
}
