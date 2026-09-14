import { appApiHandler } from "@/lib/app-api";
import { applyCampaignBatchEffectsToInteractionMetadata } from "@/lib/campaigns/interaction-metadata";
import { resolveCampaignAudienceClientIdsForCampaign } from "@/lib/campaigns/filters";
import {
	ENQUEUE_CHUNK_SIZE,
	MAX_ENQUEUE_ATTEMPTS,
	chunkArray,
	enqueueChunkWithRetries,
	getEnqueueErrorMessage,
	processEnqueuedChunkImmediateInteractions,
} from "@/lib/campaigns/shared";
import {
	loadPromotionProductCandidates,
	resolvePromotionMetadataByClientId,
	type TPromotionProductCandidate,
} from "@/lib/campaigns/promotion-suggestion";
import { INTERACTIONS_CRON_TIMEZONE, getCurrentTimeBlock, type TInteractionCronTimeBlock } from "@/lib/campaigns/time-blocks";
import type { TInteractionContextMetadados } from "@/lib/message-templates";
import { assertCronAuthorized } from "@/lib/cron/assert-cron-authorized";
import { notifyCampaignEnqueueFailure } from "@/lib/cron/notify-campaign-enqueue-failure";
import { createCampaignWeeklyLimitCache } from "@/lib/interactions/campaign-weekly-limits";
import { db } from "@/services/drizzle";
import { campaigns, interactions } from "@/services/drizzle/schema";
import type { TCampaignEntity, TInteractionEntity } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, count, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

type TOrganizationSingleUseSummary = {
	activeCampaigns: number;
	claimedCampaigns: number;
	targetClients: number;
	interactionsInserted: number;
	interactionsQueuedForImmediateProcessing: number;
	immediateEligibleWithoutDeliveryConfig: number;
	immediateEligibleWithoutClientData: number;
	cashbacksGenerated: number;
};

type TSingleUseCampaign = Awaited<ReturnType<typeof getSingleUseCampaignsForBlock>>[number];

function createOrganizationSummary(): TOrganizationSingleUseSummary {
	return {
		activeCampaigns: 0,
		claimedCampaigns: 0,
		targetClients: 0,
		interactionsInserted: 0,
		interactionsQueuedForImmediateProcessing: 0,
		immediateEligibleWithoutDeliveryConfig: 0,
		immediateEligibleWithoutClientData: 0,
		cashbacksGenerated: 0,
	};
}

// Campanhas de disparo único agendadas para a janela atual. Os dois gatilhos aqui — uso único e
// promoção de produtos — compartilham a mesma mecânica (data + bloco, claim atômico, enfileiramento
// em lotes); só a origem da data e o contexto por cliente diferem.
async function getSingleUseCampaignsForBlock({
	organizationId,
	currentDate,
	currentTimeBlock,
}: {
	organizationId: string;
	currentDate: string;
	currentTimeBlock: TInteractionCronTimeBlock;
}) {
	return db.query.campaigns.findMany({
		where: (fields, { and, eq, or }) =>
			and(
				eq(fields.organizacaoId, organizationId),
				eq(fields.ativo, true),
				or(
					and(eq(fields.gatilhoTipo, "USO-UNICO"), eq(fields.gatilhoUsoUnicoDataReferencia, currentDate)),
					and(eq(fields.gatilhoTipo, "PROMOCAO-PRODUTOS"), eq(fields.gatilhoPromocaoDataReferencia, currentDate)),
				),
				eq(fields.execucaoAgendadaBloco, currentTimeBlock as TCampaignEntity["execucaoAgendadaBloco"]),
			),
		with: {
			segmentacoes: true,
			whatsappTemplate: true,
			whatsappConexaoTelefone: {
				columns: {
					id: true,
				},
				with: {
					conexao: { columns: { token: true, gatewaySessaoId: true } },
				},
			},
		},
	});
}

// Inserts a chunk of interactions (and their FIXO cashback) in a single short transaction.
// Clients already enqueued for this single-use campaign are skipped so repeated attempts do not
// create duplicates.
async function enqueueCampaignChunk({
	organizationId,
	campaign,
	clientIds,
	currentDate,
	currentTimeBlock,
	interactionTitle,
	baseMetadataByClientId,
}: {
	organizationId: string;
	campaign: TSingleUseCampaign;
	clientIds: string[];
	currentDate: string;
	currentTimeBlock: TInteractionCronTimeBlock;
	interactionTitle: string;
	// Contexto-base por cliente (produto sugerido da promoção). Os efeitos de cashback/cupom são
	// mesclados por cima antes do insert.
	baseMetadataByClientId?: Map<string, TInteractionContextMetadados>;
}): Promise<{
	inserted: { id: string; clienteId: string }[];
	cashbackGenerated: number;
	metadadosByClientId: Map<string, TInteractionContextMetadados>;
}> {
	return db.transaction(async (tx) => {
		let clientIdsToInsert = clientIds;

		if (clientIdsToInsert.length > 0) {
			const existing = await tx
				.select({ clienteId: interactions.clienteId })
				.from(interactions)
				.where(
					and(
						eq(interactions.organizacaoId, organizationId),
						eq(interactions.campanhaId, campaign.id),
						inArray(interactions.clienteId, clientIdsToInsert),
					),
				);
			const existingClientIds = new Set(existing.map((row) => row.clienteId));
			clientIdsToInsert = clientIdsToInsert.filter((clientId) => !existingClientIds.has(clientId));
		}

		if (clientIdsToInsert.length === 0) {
			return { inserted: [], cashbackGenerated: 0, metadadosByClientId: new Map<string, TInteractionContextMetadados>() };
		}

		// IDs pré-gerados: os efeitos rodam ANTES do insert (o contexto deles — novo saldo, código do
		// cupom — precisa estar no metadados da interação), mas as transações de cashback já gravam
		// metadados.interacaoId para permitir estorno em bloqueio de envio. Tudo na mesma transação,
		// então falha em qualquer etapa desfaz efeito e interação juntos.
		const interactionIdByClientId = new Map(clientIdsToInsert.map((clientId) => [clientId, crypto.randomUUID()]));

		const { cashbackGenerated, metadadosByClientId } = await applyCampaignBatchEffectsToInteractionMetadata({
			tx,
			organizationId,
			campaign,
			clientIds: clientIdsToInsert,
			interactionIdByClientId,
			baseMetadataByClientId,
		});

		const inserted = await tx
			.insert(interactions)
			.values(
				clientIdsToInsert.map((clientId) => ({
					id: interactionIdByClientId.get(clientId),
					clienteId: clientId,
					campanhaId: campaign.id,
					organizacaoId: organizationId,
					titulo: `${interactionTitle}: ${campaign.titulo}`,
					tipo: "ENVIO-MENSAGEM" as const,
					descricao: campaign.descricao ?? `Campanha de ${interactionTitle.toLowerCase()}: ${campaign.titulo}`,
					agendamentoDataReferencia: currentDate,
					agendamentoBlocoReferencia: currentTimeBlock as TInteractionEntity["agendamentoBlocoReferencia"],
					metadados: metadadosByClientId.get(clientId) ?? null,
				})),
			)
			.returning({ id: interactions.id, clienteId: interactions.clienteId });

		return { inserted, cashbackGenerated, metadadosByClientId };
	});
}

async function countPersistedInteractionsForCampaignChunk({
	organizationId,
	campaignId,
	interactionIds,
}: {
	organizationId: string;
	campaignId: string;
	interactionIds: string[];
}) {
	if (interactionIds.length === 0) return 0;

	const [row] = await db
		.select({ total: count(interactions.id) })
		.from(interactions)
		.where(and(eq(interactions.organizacaoId, organizationId), eq(interactions.campanhaId, campaignId), inArray(interactions.id, interactionIds)));

	return Number(row?.total ?? 0);
}

// Releases the atomic claim so the campaign is not silently lost after an enqueue failure:
// while the schedule window still matches, a later run can re-claim it and enqueue only the
// missing clients (enqueueCampaignChunk deduplicates per client); once the window has passed,
// the campaign stays visibly active so it can be rescheduled manually. Never throws.
async function reactivateCampaignAfterEnqueueFailure({ organizationId, campaignId }: { organizationId: string; campaignId: string }) {
	try {
		await db
			.update(campaigns)
			.set({ ativo: true })
			.where(and(eq(campaigns.id, campaignId), eq(campaigns.organizacaoId, organizationId)));
		console.log(`[ORG: ${organizationId}] [CAMPAIGN: ${campaignId}] Campaign reactivated after enqueue failure.`);
		return true;
	} catch (error) {
		console.error(`[ORG: ${organizationId}] [CAMPAIGN: ${campaignId}] Failed to reactivate campaign after enqueue failure:`, error);
		return false;
	}
}

async function processSingleUseCampaign({
	organizationId,
	campaign,
	currentDate,
	currentTimeBlock,
	summary,
}: {
	organizationId: string;
	campaign: TSingleUseCampaign;
	currentDate: string;
	currentTimeBlock: TInteractionCronTimeBlock;
	summary: TOrganizationSingleUseSummary;
}) {
	// Atomic claim up front guards against overlapping cron runs processing the same campaign twice.
	// Every failure path below releases the claim via reactivateCampaignAfterEnqueueFailure.
	const [claimedCampaign] = await db
		.update(campaigns)
		.set({ ativo: false })
		.where(and(eq(campaigns.id, campaign.id), eq(campaigns.organizacaoId, organizationId), eq(campaigns.ativo, true)))
		.returning({ id: campaigns.id });

	if (!claimedCampaign) {
		console.log(`[ORG: ${organizationId}] [CAMPAIGN: ${campaign.id}] Campaign was already claimed. Skipping.`);
		return;
	}

	summary.claimedCampaigns += 1;

	const isPromotionCampaign = campaign.gatilhoTipo === "PROMOCAO-PRODUTOS";
	const interactionTitle = isPromotionCampaign ? "Promoção de produtos" : "Uso único";

	// Catálogo dos produtos promovidos, lido uma única vez por campanha. Produtos apagados ou
	// inativados desde o salvamento são descartados; sobrando lista vazia, a campanha não tem o que
	// promover e é tratada como falha de configuração (mesmo caminho da falha de audiência):
	// libera o claim e notifica, em vez de disparar mensagens sem produto.
	let promotionCandidates: TPromotionProductCandidate[] = [];
	if (isPromotionCampaign) {
		try {
			promotionCandidates = await loadPromotionProductCandidates({
				organizationId,
				promotionProducts: campaign.gatilhoPromocaoProdutos ?? [],
			});
		} catch (error) {
			console.error(`[ORG: ${organizationId}] [CAMPAIGN: ${campaign.id}] Failed to load promotion products:`, error);
		}

		if (promotionCandidates.length === 0) {
			console.error(`[ORG: ${organizationId}] [CAMPAIGN: ${campaign.id}] Promotion campaign has no available products. Skipping.`);
			const reactivated = await reactivateCampaignAfterEnqueueFailure({ organizationId, campaignId: campaign.id });
			await notifyCampaignEnqueueFailure({
				organizationId,
				campaignId: campaign.id,
				campaignTitle: campaign.titulo,
				audienceSize: 0,
				enqueuedCount: 0,
				failedClientIds: [],
				errors: ["Nenhum produto disponível na lista da promoção (produtos removidos ou inativados)."],
				notes: [
					"Nenhum cliente foi enfileirado: revise os produtos da promoção antes de reagendar.",
					reactivated
						? "A campanha foi reativada e será reprocessada enquanto a janela agendada estiver vigente."
						: "ATENÇÃO: a campanha NÃO pôde ser reativada; reative-a manualmente.",
				],
			});
			return;
		}
	}

	let targetClientIds: string[];
	try {
		targetClientIds = await resolveCampaignAudienceClientIdsForCampaign({
			executor: db,
			organizationId,
			campaign,
		});
	} catch (error) {
		console.error(`[ORG: ${organizationId}] [CAMPAIGN: ${campaign.id}] Failed to resolve campaign audience:`, error);
		const reactivated = await reactivateCampaignAfterEnqueueFailure({ organizationId, campaignId: campaign.id });
		await notifyCampaignEnqueueFailure({
			organizationId,
			campaignId: campaign.id,
			campaignTitle: campaign.titulo,
			audienceSize: 0,
			enqueuedCount: 0,
			failedClientIds: [],
			errors: [getEnqueueErrorMessage(error)],
			notes: [
				"Falha ao resolver a audiência da campanha; nenhum cliente foi enfileirado.",
				reactivated
					? "A campanha foi reativada e será reprocessada enquanto a janela agendada estiver vigente."
					: "ATENÇÃO: a campanha NÃO pôde ser reativada; reative-a manualmente.",
			],
		});
		return;
	}
	summary.targetClients += targetClientIds.length;

	console.log(`[ORG: ${organizationId}] [CAMPAIGN: ${campaign.id}] Found ${targetClientIds.length} matching clients.`);

	if (targetClientIds.length === 0) return;

	const hasDeliveryConfig = !!campaign.whatsappTemplate;
	const cashbackValue = campaign.cashbackGeracaoValor ?? 0;
	const cashbackActive = campaign.cashbackGeracaoAtivo && campaign.cashbackGeracaoTipo === "FIXO" && cashbackValue > 0;
	const weeklyLimitCache = createCampaignWeeklyLimitCache();

	let campaignEnqueuedCount = 0;
	const failedClientIds: string[] = [];
	const enqueueErrors: string[] = [];

	const chunks = chunkArray(targetClientIds, ENQUEUE_CHUNK_SIZE);
	for (const chunk of chunks) {
		// Produto sugerido por cliente, resolvido antes do insert para ser congelado na interação.
		// Falha aqui não derruba o lote: sem contexto, o template ainda envia (as variáveis da
		// promoção renderizam vazias), o que é preferível a perder a campanha inteira.
		let promotionMetadataByClientId: Map<string, TInteractionContextMetadados> | undefined;
		if (isPromotionCampaign) {
			try {
				promotionMetadataByClientId = await resolvePromotionMetadataByClientId({
					organizationId,
					clientIds: chunk,
					candidates: promotionCandidates,
				});
			} catch (error) {
				console.error(`[ORG: ${organizationId}] [CAMPAIGN: ${campaign.id}] Failed to resolve promotion suggestions for chunk:`, error);
			}
		}

		const enqueueResult = await enqueueChunkWithRetries({
			enqueue: () =>
				enqueueCampaignChunk({
					organizationId,
					campaign,
					clientIds: chunk,
					currentDate,
					currentTimeBlock,
					interactionTitle,
					baseMetadataByClientId: promotionMetadataByClientId,
				}),
			logPrefix: `[ORG: ${organizationId}] [CAMPAIGN: ${campaign.id}]`,
		});

		if (!enqueueResult.success) {
			failedClientIds.push(...chunk);
			enqueueErrors.push(enqueueResult.error);
			continue;
		}

		// O contexto final (promoção + efeitos de cashback/cupom) volta do enfileiramento: é o mesmo
		// que foi congelado em interactions.metadados e deve seguir para o envio imediato.
		const { inserted, cashbackGenerated, metadadosByClientId } = enqueueResult.result;
		summary.cashbacksGenerated += cashbackGenerated;
		summary.interactionsInserted += inserted.length;
		campaignEnqueuedCount += inserted.length;

		if (inserted.length === 0) continue;

		// From here on the chunk is already persisted: diagnostics/send errors must not abort the
		// loop, otherwise the remaining chunks would never be enqueued.
		try {
			const persistedInteractionsCount = await countPersistedInteractionsForCampaignChunk({
				organizationId,
				campaignId: campaign.id,
				interactionIds: inserted.map((row) => row.id),
			});

			console.log(`[ORG: ${organizationId}] [CAMPAIGN: ${campaign.id}] [SINGLE_USE_CAMPAIGNS] Enqueue chunk persisted check`, {
				requestedClients: chunk.length,
				insertedInteractions: inserted.length,
				persistedInteractions: persistedInteractionsCount,
				cashbackActive,
				sampleInteractionIds: inserted.slice(0, 3).map((row) => row.id),
			});

			if (persistedInteractionsCount !== inserted.length) {
				console.error(`[ORG: ${organizationId}] [CAMPAIGN: ${campaign.id}] [SINGLE_USE_CAMPAIGNS] Enqueue persistence mismatch`, {
					insertedInteractions: inserted.length,
					persistedInteractions: persistedInteractionsCount,
					sampleInteractionIds: inserted.slice(0, 5).map((row) => row.id),
				});
			}

			if (!hasDeliveryConfig) {
				summary.immediateEligibleWithoutDeliveryConfig += inserted.length;
				continue;
			}

			const immediateResult = await processEnqueuedChunkImmediateInteractions({
				organizationId,
				inserted,
				campaign: {
					autorId: campaign.autorId,
					whatsappConexaoTelefoneId: campaign.whatsappConexaoTelefoneId,
					whatsappTemplate: campaign.whatsappTemplate,
				},
				whatsappToken: campaign.whatsappConexaoTelefone?.conexao?.token ?? undefined,
				whatsappSessionId: campaign.whatsappConexaoTelefone?.conexao?.gatewaySessaoId ?? undefined,
				weeklyLimitCache,
				logTag: "SINGLE_USE_CAMPAIGNS",
				contextMetadadosByClientId: metadadosByClientId,
			});
			summary.interactionsQueuedForImmediateProcessing += immediateResult.queuedForImmediateProcessing;
			summary.immediateEligibleWithoutClientData += immediateResult.missingClientData;
		} catch (error) {
			// The enqueued interactions stay pending and will be drained by the process-interactions cron.
			console.error(`[ORG: ${organizationId}] [CAMPAIGN: ${campaign.id}] [SINGLE_USE_CAMPAIGNS] Post-enqueue processing failed for chunk:`, error);
		}
	}

	if (failedClientIds.length > 0) {
		console.error(
			`[ORG: ${organizationId}] [CAMPAIGN: ${campaign.id}] Failed to enqueue ${failedClientIds.length} clients after ${MAX_ENQUEUE_ATTEMPTS} attempts.`,
		);
		const reactivated = await reactivateCampaignAfterEnqueueFailure({ organizationId, campaignId: campaign.id });
		await notifyCampaignEnqueueFailure({
			organizationId,
			campaignId: campaign.id,
			campaignTitle: campaign.titulo,
			audienceSize: targetClientIds.length,
			enqueuedCount: campaignEnqueuedCount,
			failedClientIds,
			errors: enqueueErrors,
			notes: [
				reactivated
					? "A campanha foi reativada: enquanto a janela agendada estiver vigente, uma nova execução enfileirará apenas os clientes faltantes (deduplicação por cliente)."
					: "ATENÇÃO: a campanha NÃO pôde ser reativada após a falha; reative-a manualmente.",
			],
		});
	}
}

async function getProcessSingleUseCampaignsRoute(_req: NextRequest) {
	console.log("[INFO] [SINGLE_USE_CAMPAIGNS] Starting single-use campaigns processing");

	try {
		const nowInCronTimezone = dayjs().tz(INTERACTIONS_CRON_TIMEZONE);
		const currentDateAsISO8601 = nowInCronTimezone.format("YYYY-MM-DD");
		const currentTimeBlock = getCurrentTimeBlock(nowInCronTimezone);

		console.log("[INFO] [SINGLE_USE_CAMPAIGNS] Current processing window", {
			timezone: INTERACTIONS_CRON_TIMEZONE,
			nowInTimezone: nowInCronTimezone.format(),
			currentDate: currentDateAsISO8601,
			currentTimeBlock,
		});

		const organizationsList = await db.query.organizations.findMany({
			columns: { id: true },
		});

		for (const organization of organizationsList) {
			const organizationSummary = createOrganizationSummary();

			console.log(`[ORG: ${organization.id}] [INFO] [SINGLE_USE_CAMPAIGNS] Processing organization`);

			const singleUseCampaigns = await getSingleUseCampaignsForBlock({
				organizationId: organization.id,
				currentDate: currentDateAsISO8601,
				currentTimeBlock,
			});
			organizationSummary.activeCampaigns = singleUseCampaigns.length;

			if (singleUseCampaigns.length === 0) {
				console.log(`[ORG: ${organization.id}] [INFO] [SINGLE_USE_CAMPAIGNS] No active campaigns for this block`);
				console.log(`[ORG: ${organization.id}] [INFO] [SINGLE_USE_CAMPAIGNS] Organization processing summary`, organizationSummary);
				continue;
			}

			for (const campaign of singleUseCampaigns) {
				await processSingleUseCampaign({
					organizationId: organization.id,
					campaign,
					currentDate: currentDateAsISO8601,
					currentTimeBlock,
					summary: organizationSummary,
				});
			}

			console.log(`[ORG: ${organization.id}] [INFO] [SINGLE_USE_CAMPAIGNS] Organization processing summary`, organizationSummary);
		}

		console.log("[INFO] [SINGLE_USE_CAMPAIGNS] All organizations processed successfully");
		return NextResponse.json("EXECUTADO COM SUCESSO", { status: 200 });
	} catch (error) {
		console.error("[ERROR] [SINGLE_USE_CAMPAIGNS] Fatal error:", error);
		return NextResponse.json(
			{
				error: "Failed to process single-use campaigns",
				message: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 },
		);
	}
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const GET = appApiHandler({
	GET: async (req) => {
		assertCronAuthorized(req);
		return getProcessSingleUseCampaignsRoute(req);
	},
});
