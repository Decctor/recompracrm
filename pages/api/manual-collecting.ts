import { generateCashbackForCampaign } from "@/lib/cashback/generate-campaign-cashback";
import { reverseSaleCashback } from "@/lib/cashback/reverse-sale-cashback";
import { processConversionAttribution } from "@/lib/conversions/attribution";
import { fetchCardapioWebOrdersWithDetails } from "@/lib/data-connectors/cardapio-web";
import { type MappedCardapioWebSale, extractAllCardapioWebData } from "@/lib/data-connectors/cardapio-web/mappers";
import type { TCardapioWebConfig } from "@/lib/data-connectors/cardapio-web/types";
import { DASTJS_TIME_DURATION_UNITS_MAP, getPostponedDateFromReferenceDate } from "@/lib/dates";
import { formatPhoneAsBase, formatToCPForCNPJ, formatToPhone } from "@/lib/formatting";
import { type ImmediateProcessingData, delay, processSingleInteractionImmediately } from "@/lib/interactions";
import { linkPartnerToClient } from "@/lib/partners/link-partner-to-client";
import type { TTimeDurationUnitsEnum } from "@/schemas/enums";
import { OnlineSoftwareSaleImportationSchema } from "@/schemas/online-importation.schema";
import { type DBTransaction, db } from "@/services/drizzle";
import {
	cashbackProgramBalances,
	cashbackProgramTransactions,
	clients,
	interactions,
	partners,
	productAddOnOptions,
	productAddOns,
	products,
	saleItems,
	sales,
	sellers,
	utils,
} from "@/services/drizzle/schema";
import axios from "axios";
import dayjs from "dayjs";
import dayjsCustomFormatter from "dayjs/plugin/customParseFormat";
import { and, eq, gt } from "drizzle-orm";
import createHttpError from "http-errors";
import type { NextApiHandler, NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
dayjs.extend(dayjsCustomFormatter);

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

/**
 * Type definition for cashback balance entries stored in the local Map cache
 */
type TCashbackBalanceEntry = {
	clienteId: string;
	programaId: string;
	saldoValorDisponivel: number;
	saldoValorAcumuladoTotal: number;
};

/**
 * Helper function to update the local cashback balance Map cache.
 * This ensures consistency when tracking balances across multiple sales iterations.
 * @param map - The Map storing cashback balances by clientId
 * @param clientId - Client ID (key for the Map)
 * @param programId - Cashback program ID
 * @param availableBalance - New available balance value
 * @param accumulatedTotal - New accumulated total value
 */
function updateCashbackBalanceInMap(
	map: Map<string, TCashbackBalanceEntry>,
	clientId: string,
	programId: string,
	availableBalance: number,
	accumulatedTotal: number,
): void {
	map.set(clientId, {
		clienteId: clientId,
		programaId: programId,
		saldoValorDisponivel: availableBalance,
		saldoValorAcumuladoTotal: accumulatedTotal,
	});
}

/**
 * Type for campaigns with relations (used by both ONLINE-SOFTWARE and CARDAPIO-WEB handlers)
 */
type TCampaignWithRelations = Awaited<
	ReturnType<typeof db.query.campaigns.findMany<{ with: { segmentacoes: true; whatsappTemplate: true } }>>
>[number];

/**
 * Handler for CARDAPIO-WEB integration.
 * Fetches orders for the current day and processes them following the same patterns as ONLINE-SOFTWARE.
 */
async function handleCardapioWebImportation(
	organizationId: string,
	config: TCardapioWebConfig,
	campaignsForNewPurchase: TCampaignWithRelations[],
	campaignsForFirstPurchase: TCampaignWithRelations[],
	campaignsForCashbackAccumulation: TCampaignWithRelations[],
	whatsappConnection: Awaited<ReturnType<typeof db.query.whatsappConnections.findFirst>>,
	immediateProcessingDataList: ImmediateProcessingData[],
) {
	// Fetch orders for today (start of day until now)
	const startDate = "2025-10-01T00:00:00.000Z";
	const endDate = dayjs().subtract(1, "year").endOf("year").toISOString();

	console.log(`[ORG: ${organizationId}] [CARDAPIO-WEB] Fetching orders from ${startDate} to ${endDate}`);

	// Fetch all orders with details from CardapioWeb API
	const orderDetails = await fetchCardapioWebOrdersWithDetails(config, startDate, endDate);

	if (orderDetails.length === 0) {
		console.log(`[ORG: ${organizationId}] [CARDAPIO-WEB] No orders found.`);
		return;
	}

	// Log the raw response for debugging
	await db
		.insert(utils)
		.values({
			organizacaoId: organizationId,
			identificador: "CARDAPIO_WEB_IMPORTATION" as const,
			valor: {
				identificador: "CARDAPIO_WEB_IMPORTATION" as const,
				dados: {
					organizacaoId: organizationId,
					data: dayjs().format("YYYY-MM-DD"),
					conteudo: orderDetails,
				},
			},
		})
		.returning({ id: utils.id });

	// Extract and map all data
	const {
		sales: mappedSales,
		products: mappedProducts,
		partners: mappedPartners,
		productAddOns: mappedAddOns,
		productAddOnOptions: mappedAddOnOptions,
	} = extractAllCardapioWebData(orderDetails);

	console.log(
		`[ORG: ${organizationId}] [CARDAPIO-WEB] Mapped ${mappedSales.length} sales, ${mappedProducts.length} products, ${mappedPartners.length} partners`,
	);
	console.log(`[ORG: ${organizationId}] [CARDAPIO-WEB] Mapped ${mappedAddOns.length} add-ons, ${mappedAddOnOptions.length} add-on options`);

	const cardapioWebSalesIds = mappedSales.map((sale) => sale.idExterno);

	await db.transaction(async (tx) => {
		// Fetch existing data
		const cashbackProgram = await tx.query.cashbackPrograms.findFirst({
			where: (fields, { eq }) => eq(fields.organizacaoId, organizationId),
			columns: {
				id: true,
				acumuloTipo: true,
				acumuloRegraValorMinimo: true,
				acumuloValor: true,
				expiracaoRegraValidadeValor: true,
				acumuloPermitirViaIntegracao: true,
			},
		});
		const cashbackProgramAllowsAccumulationViaIntegration = cashbackProgram?.acumuloPermitirViaIntegracao;

		const existingSales = await tx.query.sales.findMany({
			where: (fields, { and, eq, inArray }) => and(eq(fields.organizacaoId, organizationId), inArray(fields.idExterno, cardapioWebSalesIds)),
			with: { itens: true },
		});

		const existingClients = await tx.query.clients.findMany({
			where: (fields, { eq }) => eq(fields.organizacaoId, organizationId),
			columns: { id: true, nome: true, primeiraCompraData: true, ultimaCompraData: true, analiseRFMTitulo: true },
		});

		const existingProducts = await tx.query.products.findMany({
			where: (fields, { eq }) => eq(fields.organizacaoId, organizationId),
			columns: { id: true, codigo: true },
		});

		const existingPartners = await tx.query.partners.findMany({
			where: (fields, { eq }) => eq(fields.organizacaoId, organizationId),
			columns: { id: true, identificador: true },
		});

		const existingAddOns = await tx.query.productAddOns.findMany({
			where: (fields, { eq }) => eq(fields.organizacaoId, organizationId),
			columns: { id: true, idExterno: true },
		});

		const existingAddOnOptions = await tx.query.productAddOnOptions.findMany({
			where: (fields, { eq }) => eq(fields.organizacaoId, organizationId),
			columns: { id: true, idExterno: true, produtoAddOnId: true },
		});

		const existingCashbackProgramBalances = cashbackProgram
			? await tx.query.cashbackProgramBalances.findMany({
					where: (fields, { and, eq }) => and(eq(fields.organizacaoId, organizationId), eq(fields.programaId, cashbackProgram.id)),
					columns: { programaId: true, clienteId: true, saldoValorDisponivel: true, saldoValorAcumuladoTotal: true },
				})
			: [];

		// Create maps for quick lookups
		const existingSalesMap = new Map(existingSales.map((sale) => [sale.idExterno, sale]));
		const existingClientsMap = new Map(
			existingClients.map((client) => [
				client.nome,
				{ id: client.id, firstPurchaseDate: client.primeiraCompraData, lastPurchaseDate: client.ultimaCompraData, rfmTitle: client.analiseRFMTitulo },
			]),
		);
		const existingProductsMap = new Map(existingProducts.map((product) => [product.codigo, product.id]));
		const existingPartnersMap = new Map(existingPartners.map((partner) => [partner.identificador, partner.id]));
		const existingAddOnsMap = new Map(existingAddOns.map((addon) => [addon.idExterno, addon.id]));
		const existingAddOnOptionsMap = new Map(
			existingAddOnOptions.map((option) => [option.idExterno, { id: option.id, addOnId: option.produtoAddOnId }]),
		);
		const existingCashbackProgramBalancesMap = new Map(existingCashbackProgramBalances.map((balance) => [balance.clienteId, balance]));

		// Sync Products
		for (const product of mappedProducts) {
			if (!existingProductsMap.has(product.codigo)) {
				const [inserted] = await tx
					.insert(products)
					.values({
						organizacaoId: organizationId,
						codigo: product.codigo,
						descricao: product.descricao,
						unidade: product.unidade,
						grupo: product.grupo,
						ncm: product.ncm,
						tipo: product.tipo,
					})
					.returning({ id: products.id });
				existingProductsMap.set(product.codigo, inserted.id);
			}
		}

		// Sync Partners
		for (const partner of mappedPartners) {
			if (!existingPartnersMap.has(partner.identificador)) {
				const linkage = await linkPartnerToClient({
					tx,
					orgId: organizationId,
					partner: {
						nome: partner.nome,
					},
					createClientIfNotFound: true,
				});

				const [inserted] = await tx
					.insert(partners)
					.values({
						organizacaoId: organizationId,
						identificador: partner.identificador,
						codigoAfiliacao: partner.identificador,
						nome: partner.nome,
						clienteId: linkage.clientId,
					})
					.returning({ id: partners.id });
				existingPartnersMap.set(partner.identificador, inserted.id);
			}
		}

		// Sync ProductAddOns
		for (const addon of mappedAddOns) {
			if (!existingAddOnsMap.has(addon.idExterno)) {
				const [inserted] = await tx
					.insert(productAddOns)
					.values({
						organizacaoId: organizationId,
						idExterno: addon.idExterno,
						nome: addon.nome,
						minOpcoes: addon.minOpcoes,
						maxOpcoes: addon.maxOpcoes,
					})
					.returning({ id: productAddOns.id });
				existingAddOnsMap.set(addon.idExterno, inserted.id);
			}
		}

		// Sync ProductAddOnOptions
		for (const option of mappedAddOnOptions) {
			if (!existingAddOnOptionsMap.has(option.idExterno)) {
				const addOnId = existingAddOnsMap.get(option.addOnIdExterno);
				if (addOnId) {
					const [inserted] = await tx
						.insert(productAddOnOptions)
						.values({
							organizacaoId: organizationId,
							produtoAddOnId: addOnId,
							idExterno: option.idExterno,
							nome: option.nome,
							codigo: option.codigo,
							precoDelta: option.precoDelta,
							maxQtdePorItem: option.maxQtdePorItem,
						})
						.returning({ id: productAddOnOptions.id });
					existingAddOnOptionsMap.set(option.idExterno, { id: inserted.id, addOnId });
				}
			}
		}

		let createdSalesCount = 0;
		let updatedSalesCount = 0;

		// Process each sale
		for (const cardapioWebSale of mappedSales) {
			let isNewClient = false;
			let isNewSale = false;

			const saleDate = cardapioWebSale.dataVenda;
			const isValidSale = cardapioWebSale.isValidSale;
			const clientName = cardapioWebSale.cliente?.nome;
			const isValidClient = !!clientName && clientName !== "CLIENTE CARDAPIO WEB";

			// Sync Client
			const equivalentSaleClient = clientName ? existingClientsMap.get(clientName) : undefined;
			let saleClientId = equivalentSaleClient?.id;

			if (!saleClientId && isValidClient && cardapioWebSale.cliente) {
				console.log(`[ORG: ${organizationId}] [CARDAPIO-WEB] Creating new client: ${clientName}`);
				const [insertedClient] = await tx
					.insert(clients)
					.values({
						nome: clientName,
						organizacaoId: organizationId,
						telefone: cardapioWebSale.cliente.telefone,
						telefoneBase: cardapioWebSale.cliente.telefoneBase,
						primeiraCompraData: isValidSale ? saleDate : null,
						ultimaCompraData: isValidSale ? saleDate : null,
						analiseRFMTitulo: "CLIENTES RECENTES",
					})
					.returning({ id: clients.id });

				saleClientId = insertedClient.id;
				isNewClient = true;
				existingClientsMap.set(clientName, {
					id: insertedClient.id,
					firstPurchaseDate: isValidSale ? saleDate : null,
					lastPurchaseDate: isValidSale ? saleDate : null,
					rfmTitle: "CLIENTES RECENTES",
				});

				if (cashbackProgram) {
					await tx.insert(cashbackProgramBalances).values({
						clienteId: insertedClient.id,
						programaId: cashbackProgram.id,
						organizacaoId: organizationId,
						saldoValorDisponivel: 0,
						saldoValorAcumuladoTotal: 0,
					});
					updateCashbackBalanceInMap(existingCashbackProgramBalancesMap, insertedClient.id, cashbackProgram.id, 0, 0);
				}
			}

			// Sync Partner
			const partnerId = cardapioWebSale.parceiro ? existingPartnersMap.get(cardapioWebSale.parceiro.identificador) : null;

			let saleId: string | null = null;
			const existingSale = existingSalesMap.get(cardapioWebSale.idExterno);

			if (!existingSale) {
				isNewSale = true;
				console.log(
					`[ORG: ${organizationId}] [CARDAPIO-WEB] Creating new sale ${cardapioWebSale.idExterno} with ${cardapioWebSale.itens.length} items...`,
				);

				const [insertedSale] = await tx
					.insert(sales)
					.values({
						organizacaoId: organizationId,
						idExterno: cardapioWebSale.idExterno,
						clienteId: saleClientId,
						valorTotal: cardapioWebSale.valorTotal,
						custoTotal: cardapioWebSale.custoTotal,
						vendedorNome: "CARDAPIO WEB",
						vendedorId: null,
						parceiro: cardapioWebSale.parceiro?.nome || "N/A",
						parceiroId: partnerId,
						chave: "N/A",
						documento: cardapioWebSale.documento || "N/A",
						modelo: "CARDAPIO-WEB",
						movimento: cardapioWebSale.tipo,
						natureza: cardapioWebSale.natureza,
						serie: "N/A",
						situacao: cardapioWebSale.natureza === "SN01" ? "FECHADO" : cardapioWebSale.natureza,
						tipo: cardapioWebSale.tipo,
						dataVenda: saleDate,
					})
					.returning({ id: sales.id });

				saleId = insertedSale.id;

				// Insert sale items
				for (const item of cardapioWebSale.itens) {
					const productId = existingProductsMap.get(item.produtoIdExterno);
					if (productId) {
						await tx.insert(saleItems).values({
							organizacaoId: organizationId,
							vendaId: saleId,
							clienteId: saleClientId,
							produtoId: productId,
							quantidade: item.quantidade,
							valorVendaUnitario: item.valorVendaUnitario,
							valorCustoUnitario: 0,
							valorVendaTotalBruto: item.valorVendaTotalBruto,
							valorTotalDesconto: item.valorTotalDesconto,
							valorVendaTotalLiquido: item.valorVendaTotalLiquido,
							valorCustoTotal: 0,
							metadados: {
								observacao: item.observacao,
								options: item.options,
							},
						});
					}
				}

				// Process conversion attribution for new valid sales
				if (saleId && isValidSale && saleClientId) {
					await processConversionAttribution(tx, {
						vendaId: saleId,
						clienteId: saleClientId,
						organizacaoId: organizationId,
						valorVenda: cardapioWebSale.valorTotal,
						dataVenda: saleDate,
					});
				}

				createdSalesCount++;
			} else {
				isNewSale = false;
				console.log(`[ORG: ${organizationId}] [CARDAPIO-WEB] Updating sale ${cardapioWebSale.idExterno}...`);

				// Check if sale was canceled
				const wasPreviouslyValid = existingSale.natureza === "SN01" && existingSale.valorTotal > 0;
				const isNowCanceled = cardapioWebSale.isCanceled || cardapioWebSale.valorTotal === 0;

				if (wasPreviouslyValid && isNowCanceled && saleClientId) {
					console.log(`[ORG: ${organizationId}] [CARDAPIO-WEB] Sale ${cardapioWebSale.idExterno} was canceled. Reversing cashback...`);
					await reverseSaleCashback({
						tx,
						saleId: existingSale.id,
						clientId: saleClientId,
						organizationId: organizationId,
						reason: "VENDA_CANCELADA",
					});
				}

				await tx
					.update(sales)
					.set({
						valorTotal: cardapioWebSale.valorTotal,
						natureza: cardapioWebSale.natureza,
						situacao: cardapioWebSale.natureza === "SN01" ? "FECHADO" : cardapioWebSale.natureza,
					})
					.where(eq(sales.id, existingSale.id));

				saleId = existingSale.id;
				updatedSalesCount++;
			}

			// Campaign processing for PRIMEIRA-COMPRA
			if (isNewSale && isNewClient && isValidSale && saleClientId) {
				const applicableCampaigns = campaignsForFirstPurchase.filter((campaign) =>
					campaign.segmentacoes.some((s) => s.segmentacao === "CLIENTES RECENTES"),
				);
				if (applicableCampaigns.length > 0) {
					console.log(`[ORG: ${organizationId}] [CARDAPIO-WEB] ${applicableCampaigns.length} first purchase campaigns found`);
					for (const campaign of applicableCampaigns) {
						const canSchedule = await canScheduleCampaignForClient(
							tx,
							saleClientId,
							campaign.id,
							campaign.permitirRecorrencia,
							campaign.frequenciaIntervaloValor,
							campaign.frequenciaIntervaloMedida,
						);
						if (!canSchedule) continue;

						const interactionScheduleDate = getPostponedDateFromReferenceDate({
							date: dayjs().toDate(),
							unit: campaign.execucaoAgendadaMedida,
							value: campaign.execucaoAgendadaValor,
						});

						const [insertedInteraction] = await tx
							.insert(interactions)
							.values({
								clienteId: saleClientId,
								campanhaId: campaign.id,
								organizacaoId: organizationId,
								titulo: `Envio de mensagem automática via campanha ${campaign.titulo}`,
								tipo: "ENVIO-MENSAGEM",
								descricao: "Cliente realizou sua primeira compra via CardapioWeb.",
								agendamentoDataReferencia: dayjs(interactionScheduleDate).format("YYYY-MM-DD"),
								agendamentoBlocoReferencia: campaign.execucaoAgendadaBloco,
							})
							.returning({ id: interactions.id });

						if (campaign.execucaoAgendadaValor === 0 && campaign.whatsappTemplate && whatsappConnection && campaign.whatsappConexaoTelefoneId) {
							const clientData = await tx.query.clients.findFirst({
								where: (fields, { eq }) => eq(fields.id, saleClientId),
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
									organizationId: organizationId,
									client: clientData,
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

						if (cashbackProgram && campaign.cashbackGeracaoAtivo && campaign.cashbackGeracaoTipo && campaign.cashbackGeracaoValor) {
							const cashbackResult = await generateCashbackForCampaign({
								tx,
								organizationId,
								clientId: saleClientId,
								campaignId: campaign.id,
								cashbackType: campaign.cashbackGeracaoTipo,
								cashbackValue: campaign.cashbackGeracaoValor,
								saleId,
								saleValue: cardapioWebSale.valorTotal,
								expirationMeasure: campaign.cashbackGeracaoExpiracaoMedida,
								expirationValue: campaign.cashbackGeracaoExpiracaoValor,
							});
							if (cashbackResult) {
								updateCashbackBalanceInMap(
									existingCashbackProgramBalancesMap,
									saleClientId,
									cashbackProgram.id,
									cashbackResult.clientNewAvailableBalance,
									cashbackResult.clientNewAccumulatedTotal,
								);
							}
						}
					}
				}
			}

			// Campaign processing for NOVA-COMPRA
			if (isNewSale && !isNewClient && isValidSale && saleClientId) {
				const clientRfmTitle = existingClientsMap.get(clientName || "")?.rfmTitle ?? "CLIENTES RECENTES";
				const applicableCampaigns = campaignsForNewPurchase.filter((campaign) => {
					const meetsValueTrigger =
						campaign.gatilhoNovaCompraValorMinimo === null ||
						campaign.gatilhoNovaCompraValorMinimo === undefined ||
						cardapioWebSale.valorTotal >= campaign.gatilhoNovaCompraValorMinimo;
					const meetsSegmentation = campaign.segmentacoes.some((s) => s.segmentacao === clientRfmTitle);
					return meetsValueTrigger && meetsSegmentation;
				});

				if (applicableCampaigns.length > 0) {
					console.log(`[ORG: ${organizationId}] [CARDAPIO-WEB] ${applicableCampaigns.length} new purchase campaigns found`);
					for (const campaign of applicableCampaigns) {
						const canSchedule = await canScheduleCampaignForClient(
							tx,
							saleClientId,
							campaign.id,
							campaign.permitirRecorrencia,
							campaign.frequenciaIntervaloValor,
							campaign.frequenciaIntervaloMedida,
						);
						if (!canSchedule) continue;

						const interactionScheduleDate = getPostponedDateFromReferenceDate({
							date: dayjs().toDate(),
							unit: campaign.execucaoAgendadaMedida,
							value: campaign.execucaoAgendadaValor,
						});

						const [insertedInteraction] = await tx
							.insert(interactions)
							.values({
								clienteId: saleClientId,
								campanhaId: campaign.id,
								organizacaoId: organizationId,
								titulo: `Envio de mensagem automática via campanha ${campaign.titulo}`,
								tipo: "ENVIO-MENSAGEM",
								descricao: `Cliente realizou nova compra via CardapioWeb. Segmento: ${clientRfmTitle}.`,
								agendamentoDataReferencia: dayjs(interactionScheduleDate).format("YYYY-MM-DD"),
								agendamentoBlocoReferencia: campaign.execucaoAgendadaBloco,
							})
							.returning({ id: interactions.id });

						if (campaign.execucaoAgendadaValor === 0 && campaign.whatsappTemplate && whatsappConnection && campaign.whatsappConexaoTelefoneId) {
							const clientData = await tx.query.clients.findFirst({
								where: (fields, { eq }) => eq(fields.id, saleClientId),
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
									organizationId: organizationId,
									client: clientData,
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

						if (campaign.cashbackGeracaoAtivo && campaign.cashbackGeracaoTipo && campaign.cashbackGeracaoValor) {
							const cashbackResult = await generateCashbackForCampaign({
								tx,
								organizationId,
								clientId: saleClientId,
								campaignId: campaign.id,
								cashbackType: campaign.cashbackGeracaoTipo,
								cashbackValue: campaign.cashbackGeracaoValor,
								saleId,
								saleValue: cardapioWebSale.valorTotal,
								expirationMeasure: campaign.cashbackGeracaoExpiracaoMedida,
								expirationValue: campaign.cashbackGeracaoExpiracaoValor,
							});
							if (cashbackResult) {
								const clientBalance = existingCashbackProgramBalancesMap.get(saleClientId);
								if (clientBalance) {
									updateCashbackBalanceInMap(
										existingCashbackProgramBalancesMap,
										saleClientId,
										clientBalance.programaId,
										cashbackResult.clientNewAvailableBalance,
										cashbackResult.clientNewAccumulatedTotal,
									);
								}
							}
						}
					}
				}
			}

			// Cashback accumulation for valid new sales
			if (cashbackProgram && cashbackProgramAllowsAccumulationViaIntegration && isValidSale && isNewSale && saleClientId) {
				const clientBalance = existingCashbackProgramBalancesMap.get(saleClientId);
				if (clientBalance) {
					const saleValue = cardapioWebSale.valorTotal;
					const previousAvailable = clientBalance.saldoValorDisponivel;
					const previousAccumulated = clientBalance.saldoValorAcumuladoTotal;

					let accumulatedBalance = 0;
					if (cashbackProgram.acumuloTipo === "FIXO") {
						if (saleValue >= cashbackProgram.acumuloRegraValorMinimo) {
							accumulatedBalance = cashbackProgram.acumuloValor;
						}
					} else if (cashbackProgram.acumuloTipo === "PERCENTUAL") {
						if (saleValue >= cashbackProgram.acumuloRegraValorMinimo) {
							accumulatedBalance = (saleValue * cashbackProgram.acumuloValor) / 100;
						}
					}

					if (accumulatedBalance > 0) {
						const newAvailable = previousAvailable + accumulatedBalance;
						const newAccumulated = previousAccumulated + accumulatedBalance;

						await tx
							.update(cashbackProgramBalances)
							.set({ saldoValorDisponivel: newAvailable, saldoValorAcumuladoTotal: newAccumulated })
							.where(
								and(
									eq(cashbackProgramBalances.clienteId, saleClientId),
									eq(cashbackProgramBalances.programaId, cashbackProgram.id),
									eq(cashbackProgramBalances.organizacaoId, organizationId),
								),
							);

						await tx.insert(cashbackProgramTransactions).values({
							organizacaoId: organizationId,
							clienteId: saleClientId,
							vendaId: saleId,
							programaId: cashbackProgram.id,
							tipo: "ACÚMULO",
							valor: accumulatedBalance,
							valorRestante: accumulatedBalance,
							saldoValorAnterior: previousAvailable,
							saldoValorPosterior: newAvailable,
							expiracaoData: dayjs().add(cashbackProgram.expiracaoRegraValidadeValor, "day").toDate(),
							dataInsercao: saleDate,
							status: "ATIVO",
						});

						updateCashbackBalanceInMap(existingCashbackProgramBalancesMap, saleClientId, cashbackProgram.id, newAvailable, newAccumulated);

						// CASHBACK-ACUMULADO campaigns
						if (campaignsForCashbackAccumulation.length > 0) {
							const clientRfmTitle = existingClientsMap.get(clientName || "")?.rfmTitle ?? "CLIENTES RECENTES";
							const applicableCampaigns = campaignsForCashbackAccumulation.filter((campaign) => {
								const meetsNewThreshold =
									campaign.gatilhoNovoCashbackAcumuladoValorMinimo == null || accumulatedBalance >= campaign.gatilhoNovoCashbackAcumuladoValorMinimo;
								const meetsTotalThreshold =
									campaign.gatilhoTotalCashbackAcumuladoValorMinimo == null || newAvailable >= campaign.gatilhoTotalCashbackAcumuladoValorMinimo;
								const meetsSegmentation = campaign.segmentacoes.some((s) => s.segmentacao === clientRfmTitle);
								return meetsNewThreshold && meetsTotalThreshold && meetsSegmentation;
							});

							for (const campaign of applicableCampaigns) {
								const canSchedule = await canScheduleCampaignForClient(
									tx,
									saleClientId,
									campaign.id,
									campaign.permitirRecorrencia,
									campaign.frequenciaIntervaloValor,
									campaign.frequenciaIntervaloMedida,
								);
								if (!canSchedule) continue;

								const interactionScheduleDate = getPostponedDateFromReferenceDate({
									date: dayjs().toDate(),
									unit: campaign.execucaoAgendadaMedida,
									value: campaign.execucaoAgendadaValor,
								});

								const [insertedInteraction] = await tx
									.insert(interactions)
									.values({
										clienteId: saleClientId,
										campanhaId: campaign.id,
										organizacaoId: organizationId,
										titulo: `Envio de mensagem automática via campanha ${campaign.titulo}`,
										tipo: "ENVIO-MENSAGEM",
										descricao: `Cliente acumulou R$ ${(accumulatedBalance / 100).toFixed(2)} em cashback via CardapioWeb. Total: R$ ${(newAccumulated / 100).toFixed(2)}.`,
										agendamentoDataReferencia: dayjs(interactionScheduleDate).format("YYYY-MM-DD"),
										agendamentoBlocoReferencia: campaign.execucaoAgendadaBloco,
										metadados: { cashbackAcumuladoValor: accumulatedBalance },
									})
									.returning({ id: interactions.id });

								if (campaign.execucaoAgendadaValor === 0 && campaign.whatsappTemplate && whatsappConnection && campaign.whatsappConexaoTelefoneId) {
									const clientData = await tx.query.clients.findFirst({
										where: (fields, { eq }) => eq(fields.id, saleClientId),
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
											organizationId: organizationId,
											client: clientData,
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

								if (campaign.cashbackGeracaoAtivo && campaign.cashbackGeracaoTipo === "FIXO" && campaign.cashbackGeracaoValor) {
									const cashbackResult = await generateCashbackForCampaign({
										tx,
										organizationId,
										clientId: saleClientId,
										campaignId: campaign.id,
										cashbackType: "FIXO",
										cashbackValue: campaign.cashbackGeracaoValor,
										saleId,
										saleValue,
										expirationMeasure: campaign.cashbackGeracaoExpiracaoMedida,
										expirationValue: campaign.cashbackGeracaoExpiracaoValor,
									});
									if (cashbackResult) {
										updateCashbackBalanceInMap(
											existingCashbackProgramBalancesMap,
											saleClientId,
											cashbackProgram.id,
											cashbackResult.clientNewAvailableBalance,
											cashbackResult.clientNewAccumulatedTotal,
										);
									}
								}
							}
						}
					}
				}
			}

			// Update client's last purchase date
			if (isValidSale && saleClientId && isNewSale) {
				await tx
					.update(clients)
					.set({ ultimaCompraData: saleDate, ultimaCompraId: saleId })
					.where(and(eq(clients.id, saleClientId), eq(clients.organizacaoId, organizationId)));
			}
		}

		console.log(`[ORG: ${organizationId}] [CARDAPIO-WEB] Created ${createdSalesCount} sales, updated ${updatedSalesCount} sales.`);
	});

	// Process immediate interactions after transaction
	if (immediateProcessingDataList.length > 0) {
		console.log(`[ORG: ${organizationId}] [CARDAPIO-WEB] Processing ${immediateProcessingDataList.length} immediate interactions`);
		for (const processingData of immediateProcessingDataList) {
			processSingleInteractionImmediately(processingData).catch((err) =>
				console.error(`[CARDAPIO-WEB] Failed to process interaction ${processingData.interactionId}:`, err),
			);
			await delay(100);
		}
	}
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	const orgId = "27817d9a-cb04-4704-a1f4-15b81a3610d3";

	const config = await db.query.organizations.findFirst({
		where: (fields, { eq }) => eq(fields.id, orgId),
		columns: {
			integracaoConfiguracao: true,
		},
	});
	if (!config) {
		return res.status(404).json({ error: "Configuração não encontrada" });
	}

	const configData = config.integracaoConfiguracao as TCardapioWebConfig;

	await handleCardapioWebImportation(orgId, configData, [], [], [], undefined, []);

	return res.status(200).json({ configData, message: "Importação concluída" });
}
