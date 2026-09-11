import dayjs from "dayjs";

import { filterCommunicationPausedClientIds, resolveCampaignAudienceClientIds } from "@/lib/campaigns/filters";
import { applyCampaignBonusToInteractionMetadata, buildBaseCashbackInteractionMetadata } from "@/lib/campaigns/interaction-metadata";
import { DASTJS_TIME_DURATION_UNITS_MAP, getPeriodAmountFromReferenceUnit, getPostponedDateFromReferenceDate } from "@/lib/dates";
import { type ImmediateProcessingData, processOrganizationInteractionsBatch } from "@/lib/interactions";
import { createCampaignWeeklyLimitCache } from "@/lib/interactions/campaign-weekly-limits";
import type { TTimeDurationUnitsEnum } from "@/schemas/enums";
import { type DBTransaction, db } from "@/services/drizzle";
import { clients, interactions, sales, utils } from "@/services/drizzle/schema";
import { getRFMLabel } from "@/utils/rfm";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import type { TAuthUserSession } from "@/lib/authentication/types";
import createHttpError from "http-errors";
import { formatDurationMs } from "@/lib/formatting";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { appApiHandler } from "@/lib/app-api";

/**
 * Helper function to check if a campaign can be scheduled for a client based on frequency rules
 * @param tx - Database transaction instance
 * @param clienteId - Client ID
 * @param campanhaId - Campaign ID
 * @param permitirRecorrencia - Whether the campaign allows recurrence
 * @param frequenciaIntervaloValor - Frequency interval value
 * @param frequenciaIntervaloMedida - Frequency interval unit (DIAS, HORAS, etc.)
 * @returns true if the campaign can be scheduled, false otherwise
 */
async function canScheduleCampaignForClient(
	tx: DBTransaction,
	clienteId: string,
	campanhaId: string,
	permitirRecorrencia: boolean,
	frequenciaIntervaloValor: number | null,
	frequenciaIntervaloMedida: string | null,
): Promise<boolean> {
	// Check if campaign allows recurrence
	if (!permitirRecorrencia) {
		const previousInteraction = await tx.query.interactions.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.clienteId, clienteId), eq(fields.campanhaId, campanhaId)),
		});
		if (previousInteraction) {
			console.log(`[CAMPAIGN_FREQUENCY] Campaign ${campanhaId} does not allow recurrence. Skipping for client ${clienteId}.`);
			return false;
		}
	}

	// Check for time interval (Frequency Cap)
	if (permitirRecorrencia && frequenciaIntervaloValor && frequenciaIntervaloValor > 0 && frequenciaIntervaloMedida) {
		// Map the enum to dayjs units
		const dayjsUnit = DASTJS_TIME_DURATION_UNITS_MAP[frequenciaIntervaloMedida as TTimeDurationUnitsEnum] || "day";

		// Calculate the cutoff date based on the campaign's interval settings
		const cutoffDate = dayjs().subtract(frequenciaIntervaloValor, dayjsUnit).toDate();

		const recentInteraction = await tx.query.interactions.findFirst({
			where: (fields, { and, eq, gt }) => and(eq(fields.clienteId, clienteId), eq(fields.campanhaId, campanhaId), gt(fields.dataInsercao, cutoffDate)),
		});

		if (recentInteraction) {
			console.log(
				`[CAMPAIGN_FREQUENCY] Campaign ${campanhaId} frequency limit reached for client ${clienteId}. Last interaction was at ${recentInteraction.dataInsercao}.`,
			);
			return false;
		}
	}

	return true;
}

type TRFMClientUpdateEntry = {
	clientId: string;
	analiseRFMTitulo: string;
	analiseRFMNotasFrequencia: string;
	analiseRFMNotasRecencia: string;
	analiseRFMNotasMonetario: string;
	analiseRFMUltimaAtualizacao: Date;
	analiseRFMUltimaAlteracao: Date | null;
};

const intervalStart = dayjs().subtract(12, "month").startOf("day").toDate();
const intervalEnd = dayjs().endOf("day").toDate();
const RFM_UPDATE_BATCH_SIZE = 100;

const SyncSegmentationsInputSchema = z.object({
	runCampaigns: z
		.string({ required_error: "O ID da campanha deve ser informado." })
		.default("false")
		.transform((v) => v === "true"),
});
export type TSyncSegmentationsInput = z.infer<typeof SyncSegmentationsInputSchema>;

async function syncSegmentations({ input, session }: { input: TSyncSegmentationsInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	const organizationId = userOrgId;

	console.log(`[ORG: ${userOrgId}] [INFO] [RFM_ANALYSIS] Starting RFM analysis`);

	const startedAt = Date.now();
	let analyzedClientsCount = 0;
	let updatedClientsCount = 0;
	let immediateInteractionsCount = 0;

	const campaigns = await db.query.campaigns.findMany({
		where: (fields, { eq, and, or }) =>
			and(
				eq(fields.organizacaoId, userOrgId),
				eq(fields.ativo, true),
				or(eq(fields.gatilhoTipo, "PERMANÊNCIA-SEGMENTAÇÃO"), eq(fields.gatilhoTipo, "ENTRADA-SEGMENTAÇÃO")),
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

	const campaignsForPermanenceInSegmentation = campaigns.filter((campaign) => campaign.gatilhoTipo === "PERMANÊNCIA-SEGMENTAÇÃO");
	const campaignsForEntryInSegmentation = campaigns.filter((campaign) => campaign.gatilhoTipo === "ENTRADA-SEGMENTAÇÃO");
	const filterAudienceEntries = await Promise.all(
		campaigns.map(async (campaign) => {
			const clientIds = await resolveCampaignAudienceClientIds({
				organizationId: userOrgId,
				segmentations: [],
				filters: campaign.filtros,
			});
			const deliverableClientIds = await filterCommunicationPausedClientIds({
				organizationId: userOrgId,
				clientIds,
			});
			return [campaign.id, new Set(deliverableClientIds)] as const;
		}),
	);
	const filterAudiencesByCampaignId = new Map(filterAudienceEntries);

	console.log(`[ORG: ${userOrgId}] ${campaignsForPermanenceInSegmentation.length} campanhas de permanência em segmentação encontradas.`);
	console.log(`[ORG: ${userOrgId}] ${campaignsForEntryInSegmentation.length} campanhas de entrada em segmentação encontradas.`);

	const accumulatedResultsByClient = await db
		.select({
			clientId: clients.id,
			clientRFMCurrentLabel: clients.analiseRFMTitulo,
			clientRFMLastLabelModification: clients.analiseRFMUltimaAlteracao,
			totalPurchases: sql<number>`sum(${sales.valorTotal})`,
			purchaseCount: sql<number>`count(${sales.id})`,
			lastPurchaseDate: sql<Date>`max(${sales.dataVenda})`,
		})
		.from(clients)
		.leftJoin(
			sales,
			and(
				eq(sales.clienteId, clients.id),
				eq(sales.organizacaoId, userOrgId),
				gte(sales.dataVenda, intervalStart),
				lte(sales.dataVenda, intervalEnd),
				eq(sales.statusVenda, "CONFIRMADA"),
			),
		)
		.where(eq(clients.organizacaoId, userOrgId))
		.groupBy(clients.id);

	console.log(`[ORG: ${userOrgId}] [INFO] [RFM_ANALYSIS] Loaded ${accumulatedResultsByClient.length} clients for RFM evaluation`);

	const utilsRFMReturn = await db.query.utils.findFirst({
		where: and(eq(utils.identificador, "CONFIG_RFM"), eq(utils.organizacaoId, userOrgId)),
	});

	const rfmConfig = utilsRFMReturn?.valor.identificador === "CONFIG_RFM" ? utilsRFMReturn.valor : null;
	if (!rfmConfig) {
		console.error(`[ORG: ${userOrgId}] [ERROR] Configuração RFM não encontrada.`);
		throw new createHttpError.InternalServerError("Configuração RFM não encontrada.");
	}
	console.log(`[ORG: ${userOrgId}] [INFO] [RFM_ANALYSIS] RFM config found:`, rfmConfig);

	// Collect data for immediate processing
	const immediateProcessingDataList: ImmediateProcessingData[] = [];
	const pendingRFMClientUpdates: TRFMClientUpdateEntry[] = [];
	let flushedRFMUpdateBatchesCount = 0;
	let scheduledInteractionsCount = 0;
	let generatedCashbacksCount = 0;
	const transactionStartedAt = Date.now();

	await db.transaction(async (tx) => {
		const cashbackProgram = await tx.query.cashbackPrograms.findFirst({
			where: (fields, { eq }) => eq(fields.organizacaoId, userOrgId),
			columns: { terminologia: true },
		});
		const cashbackTerminology = cashbackProgram?.terminologia ?? "DINHEIRO";
		const runningBalanceByClientId = new Map<string, { available: number; accumulated: number }>();
		const clientBalanceCache = new Map<string, { saldoValorDisponivel: number; saldoValorAcumuladoTotal: number; saldoValorResgatadoTotal: number }>();

		async function getClientBalance(clientId: string) {
			const cached = clientBalanceCache.get(clientId);
			if (cached) return cached;

			const balance = await tx.query.cashbackProgramBalances.findFirst({
				where: (fields, { and, eq }) => and(eq(fields.organizacaoId, organizationId), eq(fields.clienteId, clientId)),
				columns: {
					saldoValorDisponivel: true,
					saldoValorAcumuladoTotal: true,
					saldoValorResgatadoTotal: true,
				},
			});
			const normalizedBalance = {
				saldoValorDisponivel: balance?.saldoValorDisponivel ?? 0,
				saldoValorAcumuladoTotal: balance?.saldoValorAcumuladoTotal ?? 0,
				saldoValorResgatadoTotal: balance?.saldoValorResgatadoTotal ?? 0,
			};
			clientBalanceCache.set(clientId, normalizedBalance);
			return normalizedBalance;
		}

		for (const [_index, results] of accumulatedResultsByClient.entries()) {
			// `null`, não NaN, quando o cliente não comprou na janela — e o guard abaixo é
			// `!== null`, não truthiness: recência 0 (comprou hoje) é falsy e derrubava o
			// cliente para a pior nota, invertendo o rótulo dele a cada sincronização.
			const calculatedRecency = results.lastPurchaseDate ? dayjs().diff(dayjs(results.lastPurchaseDate), "days") : null;
			const calculatedFrequency = results.purchaseCount;
			const calculatedMonetary = results.totalPurchases;

			const configRecency = Object.entries(rfmConfig.recencia).find(
				([_key, value]) => calculatedRecency !== null && calculatedRecency >= value.min && calculatedRecency <= value.max,
			);
			const configFrequency = Object.entries(rfmConfig.frequencia).find(
				([_key, value]) => calculatedFrequency >= value.min && calculatedFrequency <= value.max,
			);
			const configMonetary = Object.entries(rfmConfig.monetario).find(
				([_key, value]) => calculatedMonetary >= value.min && calculatedMonetary <= value.max,
			);

			const recencyScore = configRecency ? Number(configRecency[0]) : 1;
			const frequencyScore = configFrequency ? Number(configFrequency[0]) : 1;
			const monetaryScore = configMonetary ? Number(configMonetary[0]) : 1;

			const newRFMLabel = getRFMLabel({ monetary: monetaryScore, frequency: frequencyScore, recency: recencyScore });

			// Now, comparing the new label to the previous one
			const hasClientChangedRFMLabels = results.clientRFMCurrentLabel !== newRFMLabel;

			if (input.runCampaigns) {
				if (hasClientChangedRFMLabels) {
					// If client has changed labels, checking for entry in campaing defined automations
					const applicableCampaigns = campaignsForEntryInSegmentation.filter(
						(c) =>
							c.segmentacoes.length > 0 &&
							c.segmentacoes.some((s) => s.segmentacao === newRFMLabel) &&
							(filterAudiencesByCampaignId.get(c.id)?.has(results.clientId) ?? false) &&
							c.gatilhoTipo === "ENTRADA-SEGMENTAÇÃO",
					);
					if (applicableCampaigns.length > 0)
						console.log(`${applicableCampaigns.length} campanhas de entrada em segmentação aplicáveis encontradas para o cliente ${results.clientId}.`);
					for (const campaign of applicableCampaigns) {
						// Validate campaign frequency before scheduling
						const canSchedule = await canScheduleCampaignForClient(
							tx,
							results.clientId,
							campaign.id,
							campaign.permitirRecorrencia,
							campaign.frequenciaIntervaloValor,
							campaign.frequenciaIntervaloMedida,
						);

						if (!canSchedule) continue;

						// For the applicable campaigns, we will iterate over them and schedule the interactions
						const interactionScheduleDate = getPostponedDateFromReferenceDate({
							date: dayjs().toDate(),
							unit: campaign.execucaoAgendadaMedida,
							value: campaign.execucaoAgendadaValor,
						});
						const clientBalance = await getClientBalance(results.clientId);
						const running = runningBalanceByClientId.get(results.clientId) ?? {
							available: clientBalance.saldoValorDisponivel,
							accumulated: clientBalance.saldoValorAcumuladoTotal,
						};
						const interactionId = crypto.randomUUID();
						const bonusResult = await applyCampaignBonusToInteractionMetadata({
							tx,
							baseMetadata: buildBaseCashbackInteractionMetadata({
								terminologia: cashbackTerminology,
								availableBalance: running.available,
								accumulatedTotal: running.accumulated,
								redeemedTotal: clientBalance.saldoValorResgatadoTotal,
							}),
							campaign,
							organizationId: userOrgId,
							clientId: results.clientId,
							saleId: null,
							saleValue: null,
							interactionId,
							enabled: campaign.cashbackGeracaoTipo === "FIXO",
						});
						runningBalanceByClientId.set(results.clientId, {
							available: bonusResult.runningAvailableBalance,
							accumulated: bonusResult.runningAccumulatedTotal,
						});
						const interactionContextMetadados = bonusResult.metadata;
						if (bonusResult.bonusAmount !== null) {
							generatedCashbacksCount += 1;
						}
						const [insertedInteraction] = await tx
							.insert(interactions)
							.values({
								id: interactionId,
								clienteId: results.clientId,
								campanhaId: campaign.id,
								organizacaoId: userOrgId,
								titulo: `Envio de mensagem automática via campanha ${campaign.titulo}`,
								tipo: "ENVIO-MENSAGEM",
								descricao: `Cliente se enquadrou no parâmetro de entrada na classificação RFM ${newRFMLabel}.`,
								agendamentoDataReferencia: dayjs(interactionScheduleDate).format("YYYY-MM-DD"),
								agendamentoBlocoReferencia: campaign.execucaoAgendadaBloco,
								metadados: interactionContextMetadados,
							})
							.returning({ id: interactions.id });
						scheduledInteractionsCount += 1;

						// Check for immediate processing (execucaoAgendadaValor === 0)
						if (campaign.execucaoAgendadaValor === 0 && campaign.whatsappTemplate) {
							// Query client data for immediate processing
							const clientData = await tx.query.clients.findFirst({
								where: (fields, { eq }) => eq(fields.id, results.clientId),
								columns: {
									id: true,
									nome: true,
									telefone: true,
									email: true,
									analiseRFMTitulo: true,
									metadataProdutoMaisCompradoId: true,
									metadataGrupoProdutoMaisComprado: true,
									metadataProdutoSugeridoId: true,
								},
							});

							if (clientData) {
								immediateProcessingDataList.push({
									interactionId: insertedInteraction.id,
									organizationId: userOrgId,
									client: {
										id: clientData.id,
										nome: clientData.nome,
										telefone: clientData.telefone,
										email: clientData.email,
										analiseRFMTitulo: clientData.analiseRFMTitulo,
										metadataProdutoMaisCompradoId: clientData.metadataProdutoMaisCompradoId,
										metadataGrupoProdutoMaisComprado: clientData.metadataGrupoProdutoMaisComprado,
										metadataProdutoSugeridoId: clientData.metadataProdutoSugeridoId,
									},
									campaign: {
										autorId: campaign.autorId,
										whatsappConexaoTelefoneId: campaign.whatsappConexaoTelefoneId,
										whatsappTemplate: campaign.whatsappTemplate,
									},
									whatsappToken: campaign.whatsappConexaoTelefone?.conexao?.token ?? undefined,
									whatsappSessionId: campaign.whatsappConexaoTelefone?.conexao?.gatewaySessaoId ?? undefined,
									contextMetadados: interactionContextMetadados,
								});
							}
						}
					}
				} else {
					const lastRFMLabelModification = results.clientRFMLastLabelModification;

					// If no previous modifications occurred, skipping
					if (!lastRFMLabelModification) continue;
					// If client has not changed labels, checking for permanence in campaing defined automations
					const applicableCampaigns = campaignsForPermanenceInSegmentation.filter((c) => {
						const isApplicableToSegmentation = c.segmentacoes.length > 0 && c.segmentacoes.some((s) => s.segmentacao === newRFMLabel);
						const isApplicableToFilters = filterAudiencesByCampaignId.get(c.id)?.has(results.clientId) ?? false;
						const isApplicableAsPermanence = c.gatilhoTipo === "PERMANÊNCIA-SEGMENTAÇÃO";
						if (!c.gatilhoTempoPermanenciaMedida || !c.gatilhoTempoPermanenciaValor) return false;
						const isApplicableForPermanencePeriod =
							getPeriodAmountFromReferenceUnit({
								start: lastRFMLabelModification,
								end: dayjs().toDate(),
								unit: c.gatilhoTempoPermanenciaMedida,
							}) > c.gatilhoTempoPermanenciaValor;
						if (isApplicableToSegmentation && isApplicableToFilters && isApplicableAsPermanence && isApplicableForPermanencePeriod) return true;
						return false;
					});
					if (applicableCampaigns.length > 0)
						console.log(`${applicableCampaigns.length} campanhas de permanência em segmentação aplicáveis encontradas para o cliente ${results.clientId}.`);
					for (const campaign of applicableCampaigns) {
						// Checking if there is already an interaction scheduled for this campaign and client since the last label modification
						const existingInteraction = await tx.query.interactions.findFirst({
							where: and(
								eq(interactions.clienteId, results.clientId),
								eq(interactions.campanhaId, campaign.id),
								eq(interactions.organizacaoId, userOrgId),
								gte(interactions.dataInsercao, lastRFMLabelModification),
							),
						});

						if (existingInteraction) continue;

						// Validate campaign frequency before scheduling
						const canSchedule = await canScheduleCampaignForClient(
							tx,
							results.clientId,
							campaign.id,
							campaign.permitirRecorrencia,
							campaign.frequenciaIntervaloValor,
							campaign.frequenciaIntervaloMedida,
						);

						if (!canSchedule) {
							console.log(
								`[ORG: ${userOrgId}] [CAMPAIGN_FREQUENCY] Skipping campaign ${campaign.titulo} for client ${results.clientId} due to frequency limits.`,
							);
							continue;
						}

						// For the applicable campaigns, we will iterate over them and schedule the interactions
						const interactionScheduleDate = getPostponedDateFromReferenceDate({
							date: dayjs().toDate(),
							unit: campaign.execucaoAgendadaMedida,
							value: campaign.execucaoAgendadaValor,
						});
						const clientBalance = await getClientBalance(results.clientId);
						const running = runningBalanceByClientId.get(results.clientId) ?? {
							available: clientBalance.saldoValorDisponivel,
							accumulated: clientBalance.saldoValorAcumuladoTotal,
						};
						const interactionId = crypto.randomUUID();
						const bonusResult = await applyCampaignBonusToInteractionMetadata({
							tx,
							baseMetadata: buildBaseCashbackInteractionMetadata({
								terminologia: cashbackTerminology,
								availableBalance: running.available,
								accumulatedTotal: running.accumulated,
								redeemedTotal: clientBalance.saldoValorResgatadoTotal,
							}),
							campaign,
							organizationId: userOrgId,
							clientId: results.clientId,
							saleId: null,
							saleValue: null,
							interactionId,
							enabled: campaign.cashbackGeracaoTipo === "FIXO",
						});
						runningBalanceByClientId.set(results.clientId, {
							available: bonusResult.runningAvailableBalance,
							accumulated: bonusResult.runningAccumulatedTotal,
						});
						const interactionContextMetadados = bonusResult.metadata;
						if (bonusResult.bonusAmount !== null) {
							generatedCashbacksCount += 1;
						}
						const [insertedInteraction] = await tx
							.insert(interactions)
							.values({
								id: interactionId,
								clienteId: results.clientId,
								campanhaId: campaign.id,
								organizacaoId: userOrgId,
								titulo: `Envio de mensagem automática via campanha ${campaign.titulo}`,
								tipo: "ENVIO-MENSAGEM",
								descricao: `Cliente se enquadrou no parâmetro de permanência na classificação RFM ${newRFMLabel}.`,
								agendamentoDataReferencia: dayjs(interactionScheduleDate).format("YYYY-MM-DD"),
								agendamentoBlocoReferencia: campaign.execucaoAgendadaBloco,
								metadados: interactionContextMetadados,
							})
							.returning({ id: interactions.id });
						scheduledInteractionsCount += 1;

						// Check for immediate processing (execucaoAgendadaValor === 0)
						if (campaign.execucaoAgendadaValor === 0 && campaign.whatsappTemplate) {
							// Query client data for immediate processing
							const clientData = await tx.query.clients.findFirst({
								where: (fields, { eq }) => eq(fields.id, results.clientId),
								columns: {
									id: true,
									nome: true,
									telefone: true,
									email: true,
									analiseRFMTitulo: true,
									metadataProdutoMaisCompradoId: true,
									metadataGrupoProdutoMaisComprado: true,
									metadataProdutoSugeridoId: true,
								},
							});

							if (clientData) {
								immediateProcessingDataList.push({
									interactionId: insertedInteraction.id,
									organizationId: userOrgId,
									client: {
										id: clientData.id,
										nome: clientData.nome,
										telefone: clientData.telefone,
										email: clientData.email,
										analiseRFMTitulo: clientData.analiseRFMTitulo,
										metadataProdutoMaisCompradoId: clientData.metadataProdutoMaisCompradoId,
										metadataGrupoProdutoMaisComprado: clientData.metadataGrupoProdutoMaisComprado,
										metadataProdutoSugeridoId: clientData.metadataProdutoSugeridoId,
									},
									campaign: {
										autorId: campaign.autorId,
										whatsappConexaoTelefoneId: campaign.whatsappConexaoTelefoneId,
										whatsappTemplate: campaign.whatsappTemplate,
									},
									whatsappToken: campaign.whatsappConexaoTelefone?.conexao?.token ?? undefined,
									whatsappSessionId: campaign.whatsappConexaoTelefone?.conexao?.gatewaySessaoId ?? undefined,
									contextMetadados: interactionContextMetadados,
								});
							}
						}
					}
				}
			}

			pendingRFMClientUpdates.push({
				clientId: results.clientId,
				analiseRFMTitulo: newRFMLabel,
				analiseRFMNotasFrequencia: frequencyScore.toString(),
				analiseRFMNotasRecencia: recencyScore.toString(),
				analiseRFMNotasMonetario: monetaryScore.toString(),
				analiseRFMUltimaAtualizacao: new Date(),
				analiseRFMUltimaAlteracao: hasClientChangedRFMLabels ? new Date() : results.clientRFMLastLabelModification,
			});

			if (pendingRFMClientUpdates.length >= RFM_UPDATE_BATCH_SIZE) {
				const flushSummary = await flushPendingRFMClientUpdates({
					tx,
					organizationId: userOrgId,
					pendingUpdates: pendingRFMClientUpdates,
				});
				if (flushSummary.updatedClientsCount > 0) {
					flushedRFMUpdateBatchesCount += 1;
					console.log(
						`[ORG: ${userOrgId}] [INFO] [RFM_ANALYSIS] Flushed RFM update batch ${flushedRFMUpdateBatchesCount} (${flushSummary.updatedClientsCount} clients) in ${formatDurationMs(flushSummary.durationMs)}`,
					);
				}
				pendingRFMClientUpdates.length = 0;
			}
		}

		const finalFlushSummary = await flushPendingRFMClientUpdates({
			tx,
			organizationId: userOrgId,
			pendingUpdates: pendingRFMClientUpdates,
		});
		if (finalFlushSummary.updatedClientsCount > 0) {
			flushedRFMUpdateBatchesCount += 1;
			console.log(
				`[ORG: ${userOrgId}] [INFO] [RFM_ANALYSIS] Flushed RFM update batch ${flushedRFMUpdateBatchesCount} (${finalFlushSummary.updatedClientsCount} clients) in ${formatDurationMs(finalFlushSummary.durationMs)}`,
			);
		}
	});

	console.log(
		`[ORG: ${userOrgId}] [INFO] [RFM_ANALYSIS] Transaction completed in ${formatDurationMs(Date.now() - transactionStartedAt)} | clients=${accumulatedResultsByClient.length} | updateBatches=${flushedRFMUpdateBatchesCount} | scheduledInteractions=${scheduledInteractionsCount} | generatedCashbacks=${generatedCashbacksCount}`,
	);

	// Process interactions immediately after transaction (with delay to avoid rate limiting)
	if (immediateProcessingDataList.length > 0) {
		console.log(`[ORG: ${userOrgId}] [INFO] [RFM_ANALYSIS] Processing ${immediateProcessingDataList.length} immediate interactions`);
		const immediateProcessingStartedAt = Date.now();
		const processingSummary = await processOrganizationInteractionsBatch({
			organizationId: userOrgId,
			interactions: immediateProcessingDataList,
			weeklyLimitCache: createCampaignWeeklyLimitCache(),
		});
		if (processingSummary.failed > 0 || processingSummary.blocked > 0) {
			for (const failedResult of processingSummary.results.filter((itemResult) => !itemResult.success)) {
				console.error(`[IMMEDIATE_PROCESS] Failed to process interaction ${failedResult.interactionId}:`, failedResult.error);
			}
		}
		console.log(
			`[ORG: ${userOrgId}] [INFO] [RFM_ANALYSIS] Finished immediate interactions in ${formatDurationMs(Date.now() - immediateProcessingStartedAt)}`,
		);
	}

	analyzedClientsCount += accumulatedResultsByClient.length;
	updatedClientsCount += accumulatedResultsByClient.length;
	immediateInteractionsCount += immediateProcessingDataList.length;

	console.log(
		`[ORG: ${userOrgId}] [INFO] [RFM_ANALYSIS] RFM analysis completed successfully in ${formatDurationMs(Date.now() - startedAt)} | clients=${accumulatedResultsByClient.length} | immediateInteractions=${immediateProcessingDataList.length}`,
	);

	return {
		data: {
			analyzedClientsCount,
			updatedClientsCount,
			immediateInteractionsCount,
		},
		message: "Segmentações sincronizadas com sucesso.",
	};
}

export type TSyncSegmentationsOutput = Awaited<ReturnType<typeof syncSegmentations>>;

async function syncSegmentationsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	const searchParams = request.nextUrl.searchParams;

	const input = SyncSegmentationsInputSchema.parse({
		runCampaigns: searchParams.get("runCampaigns"),
	});
	const result = await syncSegmentations({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: syncSegmentationsRoute });

async function flushPendingRFMClientUpdates({
	tx,
	organizationId,
	pendingUpdates,
}: {
	tx: DBTransaction;
	organizationId: string;
	pendingUpdates: TRFMClientUpdateEntry[];
}) {
	if (pendingUpdates.length === 0) return { updatedClientsCount: 0, durationMs: 0 };
	const startedAt = Date.now();

	await tx.execute(sql`
		update ${clients} as c
		set
			analise_rfm_titulo = v.analise_rfm_titulo::text,
			analise_rfm_notas_frequencia = v.analise_rfm_notas_frequencia::text,
			analise_rfm_notas_recencia = v.analise_rfm_notas_recencia::text,
			analise_rfm_notas_monetario = v.analise_rfm_notas_monetario::text,
			analise_rfm_ultima_atualizacao = v.analise_rfm_ultima_atualizacao::timestamp,
			analise_rfm_ultima_alteracao = v.analise_rfm_ultima_alteracao::timestamp
		from (
			values
				${sql.join(
					pendingUpdates.map(
						(entry) => sql`(
							${entry.clientId},
							${organizationId},
							${entry.analiseRFMTitulo},
							${entry.analiseRFMNotasFrequencia},
							${entry.analiseRFMNotasRecencia},
							${entry.analiseRFMNotasMonetario},
							${entry.analiseRFMUltimaAtualizacao.toISOString()},
							${entry.analiseRFMUltimaAlteracao?.toISOString() ?? null}
						)`,
					),
					sql`, `,
				)}
		) as v(
			client_id,
			organization_id,
			analise_rfm_titulo,
			analise_rfm_notas_frequencia,
			analise_rfm_notas_recencia,
			analise_rfm_notas_monetario,
			analise_rfm_ultima_atualizacao,
			analise_rfm_ultima_alteracao
		)
		where c.id = v.client_id
			and c.organizacao_id = v.organization_id
	`);

	return {
		updatedClientsCount: pendingUpdates.length,
		durationMs: Date.now() - startedAt,
	};
}
