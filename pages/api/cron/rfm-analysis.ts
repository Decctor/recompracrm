import type { TSale } from "@/schemas/sales";
import dayjs, { type ManipulateType } from "dayjs";
import type { NextApiRequest, NextApiResponse } from "next";

import { generateCashbackForCampaign } from "@/lib/cashback/generate-campaign-cashback";
import { DASTJS_TIME_DURATION_UNITS_MAP, getPeriodAmountFromReferenceUnit, getPostponedDateFromReferenceDate } from "@/lib/dates";
import { type ImmediateProcessingData, delay, processSingleInteractionImmediately } from "@/lib/interactions";
import { TimeDurationUnitsEnum } from "@/schemas/enums";
import type { TTimeDurationUnitsEnum } from "@/schemas/enums";
import { type DBTransaction, db } from "@/services/drizzle";
import { type TSaleEntity, clients, interactions, organizations, products, saleItems, sales, utils } from "@/services/drizzle/schema";
import { type TRFMConfig, getRFMLabel } from "@/utils/rfm";
import { and, eq, gt, gte, lte, sql } from "drizzle-orm";
import createHttpError from "http-errors";

const intervalStart = dayjs().subtract(12, "month").startOf("day").toDate();
const intervalEnd = dayjs().endOf("day").toDate();

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

export default async function handleRFMAnalysis(req: NextApiRequest, res: NextApiResponse) {
	// Buscar todas as organizacoes
	const organizationsList = await db.query.organizations.findMany({
		columns: { id: true },
	});

	console.log(`[INFO] [RFM_ANALYSIS] Processing ${organizationsList.length} organizations`);

	for (const organization of organizationsList) {
		try {
			console.log(`[ORG: ${organization.id}] [INFO] [RFM_ANALYSIS] Starting RFM analysis`);

			const campaigns = await db.query.campaigns.findMany({
				where: (fields, { eq, and, or }) =>
					and(
						eq(fields.organizacaoId, organization.id),
						eq(fields.ativo, true),
						or(eq(fields.gatilhoTipo, "PERMANÊNCIA-SEGMENTAÇÃO"), eq(fields.gatilhoTipo, "ENTRADA-SEGMENTAÇÃO")),
					),
				with: {
					segmentacoes: true,
					whatsappTemplate: true,
				},
			});

			// Query whatsappConnection for immediate processing
			const whatsappConnection = await db.query.whatsappConnections.findFirst({
				where: (fields, { eq }) => eq(fields.organizacaoId, organization.id),
			});

			const campaignsForPermanenceInSegmentation = campaigns.filter((campaign) => campaign.gatilhoTipo === "PERMANÊNCIA-SEGMENTAÇÃO");
			const campaignsForEntryInSegmentation = campaigns.filter((campaign) => campaign.gatilhoTipo === "ENTRADA-SEGMENTAÇÃO");

			console.log(`[ORG: ${organization.id}] ${campaignsForPermanenceInSegmentation.length} campanhas de permanência em segmentação encontradas.`);
			console.log(`[ORG: ${organization.id}] ${campaignsForEntryInSegmentation.length} campanhas de entrada em segmentação encontradas.`);

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
						eq(sales.organizacaoId, organization.id),
						gte(sales.dataVenda, intervalStart),
						lte(sales.dataVenda, intervalEnd),
						eq(sales.natureza, "SN01"),
					),
				)
				.where(eq(clients.organizacaoId, organization.id))
				.groupBy(clients.id);

			// Query all-time totals for client metadata (no date filter)
			const allTimeTotalsByClient = await db
				.select({
					clientId: clients.id,
					allTimeTotalPurchases: sql<number>`COALESCE(sum(${sales.valorTotal}), 0)`,
					allTimePurchaseCount: sql<number>`COALESCE(count(${sales.id}), 0)`,
				})
				.from(clients)
				.leftJoin(sales, and(eq(sales.clienteId, clients.id), eq(sales.organizacaoId, organization.id), eq(sales.natureza, "SN01")))
				.where(eq(clients.organizacaoId, organization.id))
				.groupBy(clients.id);

			// Create a map for quick lookup
			const allTimeTotalsMap = new Map(allTimeTotalsByClient.map((r) => [r.clientId, r]));

			// Query most purchased product per client (by quantity)
			const mostPurchasedProductByClient = await db
				.select({
					clientId: saleItems.clienteId,
					produtoId: saleItems.produtoId,
					produtoGrupo: products.grupo,
					totalQuantity: sql<number>`sum(${saleItems.quantidade})`,
				})
				.from(saleItems)
				.innerJoin(products, eq(products.id, saleItems.produtoId))
				.innerJoin(sales, and(eq(sales.id, saleItems.vendaId), eq(sales.natureza, "SN01")))
				.where(eq(saleItems.organizacaoId, organization.id))
				.groupBy(saleItems.clienteId, saleItems.produtoId, products.grupo)
				.orderBy(sql`sum(${saleItems.quantidade}) DESC`);

			// Get the most purchased product for each client
			const mostPurchasedMap = new Map<string, { produtoId: string; produtoGrupo: string }>();
			for (const row of mostPurchasedProductByClient) {
				if (row.clientId && !mostPurchasedMap.has(row.clientId)) {
					mostPurchasedMap.set(row.clientId, {
						produtoId: row.produtoId,
						produtoGrupo: row.produtoGrupo,
					});
				}
			}

			console.log(`[ORG: ${organization.id}] [INFO] [RFM_ANALYSIS] Computed all-time metadata for ${allTimeTotalsByClient.length} clients`);

			const utilsRFMReturn = await db.query.utils.findFirst({
				where: eq(utils.identificador, "CONFIG_RFM"),
			});

			const rfmConfig = utilsRFMReturn?.valor.identificador === "CONFIG_RFM" ? utilsRFMReturn.valor : null;
			if (!rfmConfig) {
				console.error(`[ORG: ${organization.id}] [ERROR] Configuração RFM não encontrada.`);
				continue;
			}

			// Collect data for immediate processing
			const immediateProcessingDataList: ImmediateProcessingData[] = [];

			await db.transaction(async (tx) => {
				for (const [index, results] of accumulatedResultsByClient.entries()) {
					// If the index is a multiple of 25, logging the progress
					if ((index + 1) % 25 === 0) console.log(`Processando o cliente ${index + 1} de ${accumulatedResultsByClient.length}`);
					const calculatedRecency = dayjs().diff(dayjs(results.lastPurchaseDate), "days");
					const calculatedFrequency = results.purchaseCount;
					const calculatedMonetary = results.totalPurchases;

					const configRecency = Object.entries(rfmConfig.recencia).find(
						([key, value]) => calculatedRecency && calculatedRecency >= value.min && calculatedRecency <= value.max,
					);
					const configFrequency = Object.entries(rfmConfig.frequencia).find(
						([key, value]) => calculatedFrequency >= value.min && calculatedFrequency <= value.max,
					);
					const configMonetary = Object.entries(rfmConfig.monetario).find(
						([key, value]) => calculatedMonetary >= value.min && calculatedMonetary <= value.max,
					);

					const recencyScore = configRecency ? Number(configRecency[0]) : 1;
					const frequencyScore = configFrequency ? Number(configFrequency[0]) : 1;
					const monetaryScore = configMonetary ? Number(configMonetary[0]) : 1;

					const newRFMLabel = getRFMLabel({ monetary: monetaryScore, frequency: frequencyScore, recency: recencyScore });

					// Now, comparing the new label to the previous one
					const hasClientChangedRFMLabels = results.clientRFMCurrentLabel !== newRFMLabel;
					if (hasClientChangedRFMLabels) {
						console.log(`Cliente ${results.clientId} mudou de classificação RFM de ${results.clientRFMCurrentLabel} para ${newRFMLabel}.`);
						// If client has changed labels, checking for entry in campaing defined automations
						const applicableCampaigns = campaignsForEntryInSegmentation.filter(
							(c) => c.segmentacoes.some((s) => s.segmentacao === newRFMLabel) && c.gatilhoTipo === "ENTRADA-SEGMENTAÇÃO",
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

							if (!canSchedule) {
								console.log(
									`[ORG: ${organization.id}] [CAMPAIGN_FREQUENCY] Skipping campaign ${campaign.titulo} for client ${results.clientId} due to frequency limits.`,
								);
								continue;
							}

							// For the applicable campaigns, we will iterate over them and schedule the interactions
							const interactionScheduleDate = getPostponedDateFromReferenceDate({
								date: dayjs().toDate(),
								unit: campaign.execucaoAgendadaMedida,
								value: campaign.execucaoAgendadaValor,
							});
							const [insertedInteraction] = await tx
								.insert(interactions)
								.values({
									clienteId: results.clientId,
									campanhaId: campaign.id,
									organizacaoId: organization.id,
									titulo: `Envio de mensagem automática via campanha ${campaign.titulo}`,
									tipo: "ENVIO-MENSAGEM",
									descricao: `Cliente se enquadrou no parâmetro de entrada na classificação RFM ${newRFMLabel}.`,
									agendamentoDataReferencia: dayjs(interactionScheduleDate).format("YYYY-MM-DD"),
									agendamentoBlocoReferencia: campaign.execucaoAgendadaBloco,
								})
								.returning({ id: interactions.id });

							// Check for immediate processing (execucaoAgendadaValor === 0)
							if (campaign.execucaoAgendadaValor === 0 && campaign.whatsappTemplate && whatsappConnection && campaign.whatsappConexaoTelefoneId) {
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
									},
								});

								if (clientData) {
									immediateProcessingDataList.push({
										interactionId: insertedInteraction.id,
										organizationId: organization.id,
										client: {
											id: clientData.id,
											nome: clientData.nome,
											telefone: clientData.telefone,
											email: clientData.email,
											analiseRFMTitulo: clientData.analiseRFMTitulo,
											metadataProdutoMaisCompradoId: clientData.metadataProdutoMaisCompradoId,
											metadataGrupoProdutoMaisComprado: clientData.metadataGrupoProdutoMaisComprado,
										},
										campaign: {
											autorId: campaign.autorId,
											whatsappConexaoTelefoneId: campaign.whatsappConexaoTelefoneId,
											whatsappTemplate: campaign.whatsappTemplate,
										},
										whatsappToken: whatsappConnection.token ?? undefined,
										whatsappSessionId: whatsappConnection.gatewaySessaoId ?? undefined,
									});
								}
							}

							// Generate campaign cashback for ENTRADA-SEGMENTAÇÃO trigger (FIXO only)
							if (campaign.cashbackGeracaoAtivo && campaign.cashbackGeracaoTipo === "FIXO" && campaign.cashbackGeracaoValor) {
								await generateCashbackForCampaign({
									tx,
									organizationId: organization.id,
									clientId: results.clientId,
									campaignId: campaign.id,
									cashbackType: "FIXO",
									cashbackValue: campaign.cashbackGeracaoValor,
									saleId: null,
									saleValue: null,
									expirationMeasure: campaign.cashbackGeracaoExpiracaoMedida,
									expirationValue: campaign.cashbackGeracaoExpiracaoValor,
								});
							}
						}
					} else {
						const lastRFMLabelModification = results.clientRFMLastLabelModification;

						// If no previous modifications occurred, skipping
						if (!lastRFMLabelModification) continue;
						// If client has not changed labels, checking for permanence in campaing defined automations
						const applicableCampaigns = campaignsForPermanenceInSegmentation.filter((c) => {
							const isApplicableToSegmentation = c.segmentacoes.some((s) => s.segmentacao === newRFMLabel);
							const isApplicableAsPermanence = c.gatilhoTipo === "PERMANÊNCIA-SEGMENTAÇÃO";
							if (!c.gatilhoTempoPermanenciaMedida || !c.gatilhoTempoPermanenciaValor) return false;
							const isApplicableForPermanencePeriod =
								getPeriodAmountFromReferenceUnit({
									start: lastRFMLabelModification,
									end: dayjs().toDate(),
									unit: c.gatilhoTempoPermanenciaMedida,
								}) > c.gatilhoTempoPermanenciaValor;
							if (isApplicableToSegmentation && isApplicableAsPermanence && isApplicableForPermanencePeriod) return true;
							return false;
						});
						if (applicableCampaigns.length > 0)
							console.log(
								`${applicableCampaigns.length} campanhas de permanência em segmentação aplicáveis encontradas para o cliente ${results.clientId}.`,
							);
						for (const campaign of applicableCampaigns) {
							// Checking if there is already an interaction scheduled for this campaign and client since the last label modification
							const existingInteraction = await tx.query.interactions.findFirst({
								where: and(
									eq(interactions.clienteId, results.clientId),
									eq(interactions.campanhaId, campaign.id),
									eq(interactions.organizacaoId, organization.id),
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
									`[ORG: ${organization.id}] [CAMPAIGN_FREQUENCY] Skipping campaign ${campaign.titulo} for client ${results.clientId} due to frequency limits.`,
								);
								continue;
							}

							// For the applicable campaigns, we will iterate over them and schedule the interactions
							const interactionScheduleDate = getPostponedDateFromReferenceDate({
								date: dayjs().toDate(),
								unit: campaign.execucaoAgendadaMedida,
								value: campaign.execucaoAgendadaValor,
							});
							const [insertedInteraction] = await tx
								.insert(interactions)
								.values({
									clienteId: results.clientId,
									campanhaId: campaign.id,
									organizacaoId: organization.id,
									titulo: `Envio de mensagem automática via campanha ${campaign.titulo}`,
									tipo: "ENVIO-MENSAGEM",
									descricao: `Cliente se enquadrou no parâmetro de permanência na classificação RFM ${newRFMLabel}.`,
									agendamentoDataReferencia: dayjs(interactionScheduleDate).format("YYYY-MM-DD"),
									agendamentoBlocoReferencia: campaign.execucaoAgendadaBloco,
								})
								.returning({ id: interactions.id });

							// Check for immediate processing (execucaoAgendadaValor === 0)
							if (campaign.execucaoAgendadaValor === 0 && campaign.whatsappTemplate && whatsappConnection && campaign.whatsappConexaoTelefoneId) {
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
									},
								});

								if (clientData) {
									immediateProcessingDataList.push({
										interactionId: insertedInteraction.id,
										organizationId: organization.id,
										client: {
											id: clientData.id,
											nome: clientData.nome,
											telefone: clientData.telefone,
											email: clientData.email,
											analiseRFMTitulo: clientData.analiseRFMTitulo,
											metadataProdutoMaisCompradoId: clientData.metadataProdutoMaisCompradoId,
											metadataGrupoProdutoMaisComprado: clientData.metadataGrupoProdutoMaisComprado,
										},
										campaign: {
											autorId: campaign.autorId,
											whatsappConexaoTelefoneId: campaign.whatsappConexaoTelefoneId,
											whatsappTemplate: campaign.whatsappTemplate,
										},
										whatsappToken: whatsappConnection.token ?? undefined,
										whatsappSessionId: whatsappConnection.gatewaySessaoId ?? undefined,
									});
								}
							}

							// Generate campaign cashback for PERMANÊNCIA-SEGMENTAÇÃO trigger (FIXO only)
							if (campaign.cashbackGeracaoAtivo && campaign.cashbackGeracaoTipo === "FIXO" && campaign.cashbackGeracaoValor) {
								await generateCashbackForCampaign({
									tx,
									organizationId: organization.id,
									clientId: results.clientId,
									campaignId: campaign.id,
									cashbackType: "FIXO",
									cashbackValue: campaign.cashbackGeracaoValor,
									saleId: null,
									saleValue: null,
									expirationMeasure: campaign.cashbackGeracaoExpiracaoMedida,
									expirationValue: campaign.cashbackGeracaoExpiracaoValor,
								});
							}
						}
					}

					// Get all-time metadata for this client
					const allTimeData = allTimeTotalsMap.get(results.clientId);
					const mostPurchasedData = mostPurchasedMap.get(results.clientId);

					await tx
						.update(clients)
						.set({
							analiseRFMTitulo: newRFMLabel,
							analiseRFMNotasFrequencia: frequencyScore.toString(),
							analiseRFMNotasRecencia: recencyScore.toString(),
							analiseRFMNotasMonetario: monetaryScore.toString(),
							analiseRFMUltimaAtualizacao: new Date(),
							analiseRFMUltimaAlteracao: hasClientChangedRFMLabels ? new Date() : results.clientRFMLastLabelModification,
							// Client metadata updates
							metadataTotalCompras: allTimeData?.allTimePurchaseCount ?? 0,
							metadataValorTotalCompras: allTimeData?.allTimeTotalPurchases ?? 0,
							metadataProdutoMaisCompradoId: mostPurchasedData?.produtoId ?? null,
							metadataGrupoProdutoMaisComprado: mostPurchasedData?.produtoGrupo ?? null,
							metadataUltimaAtualizacao: new Date(),
						})
						.where(and(eq(clients.id, results.clientId), eq(clients.organizacaoId, organization.id)));
				}
			});

			// Process interactions immediately after transaction (with delay to avoid rate limiting)
			if (immediateProcessingDataList.length > 0) {
				console.log(`[ORG: ${organization.id}] [INFO] [RFM_ANALYSIS] Processing ${immediateProcessingDataList.length} immediate interactions`);
				for (const processingData of immediateProcessingDataList) {
					processSingleInteractionImmediately(processingData).catch((err) =>
						console.error(`[IMMEDIATE_PROCESS] Failed to process interaction ${processingData.interactionId}:`, err),
					);
					await delay(100); // Small delay between sends to avoid rate limiting
				}
			}

			console.log(`[ORG: ${organization.id}] [INFO] [RFM_ANALYSIS] RFM analysis completed successfully`);
		} catch (error) {
			console.error(`[ORG: ${organization.id}] [ERROR] [RFM_ANALYSIS] Error processing RFM analysis:`, error);
			// Continuar para proxima organizacao mesmo com erro
		}
	}

	return res.status(200).json("ANÁLISE RFM FEITA COM SUCESSO !");
}
