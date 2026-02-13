import { calculateAccumulatedCashbackValue } from "@/lib/cashback/accumulation";
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
import type { NextApiHandler } from "next";
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

async function ensureCashbackBalanceEntry({
	tx,
	map,
	organizationId,
	clientId,
	programId,
}: {
	tx: DBTransaction;
	map: Map<string, TCashbackBalanceEntry>;
	organizationId: string;
	clientId: string;
	programId: string;
}): Promise<TCashbackBalanceEntry> {
	const fromMap = map.get(clientId);
	if (fromMap) return fromMap;

	const existingBalance = await tx.query.cashbackProgramBalances.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.organizacaoId, organizationId), eq(fields.clienteId, clientId), eq(fields.programaId, programId)),
		columns: {
			clienteId: true,
			programaId: true,
			saldoValorDisponivel: true,
			saldoValorAcumuladoTotal: true,
		},
	});

	if (existingBalance) {
		updateCashbackBalanceInMap(
			map,
			existingBalance.clienteId,
			existingBalance.programaId,
			existingBalance.saldoValorDisponivel,
			existingBalance.saldoValorAcumuladoTotal,
		);
		return {
			clienteId: existingBalance.clienteId,
			programaId: existingBalance.programaId,
			saldoValorDisponivel: existingBalance.saldoValorDisponivel,
			saldoValorAcumuladoTotal: existingBalance.saldoValorAcumuladoTotal,
		};
	}

	await tx.insert(cashbackProgramBalances).values({
		organizacaoId: organizationId,
		clienteId: clientId,
		programaId: programId,
		saldoValorDisponivel: 0,
		saldoValorAcumuladoTotal: 0,
		saldoValorResgatadoTotal: 0,
	});

	updateCashbackBalanceInMap(map, clientId, programId, 0, 0);
	return {
		clienteId: clientId,
		programaId: programId,
		saldoValorDisponivel: 0,
		saldoValorAcumuladoTotal: 0,
	};
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
	campaignsForTotalPurchaseCount: TCampaignWithRelations[],
	campaignsForTotalPurchaseValue: TCampaignWithRelations[],
	whatsappConnection: Awaited<ReturnType<typeof db.query.whatsappConnections.findFirst>>,
	immediateProcessingDataList: ImmediateProcessingData[],
) {
	// Fetch orders for today (start of day until now)
	const startDate = dayjs().startOf("day").toISOString();
	const endDate = dayjs().toISOString();

	console.log(`[ORG: ${organizationId}] [CARDAPIO-WEB] Fetching orders from ${startDate} to ${endDate}`);

	// Fetch all orders with details from CardapioWeb API
	const orderDetails = await fetchCardapioWebOrdersWithDetails(config, startDate, endDate);

	if (orderDetails.length === 0) {
		console.log(`[ORG: ${organizationId}] [CARDAPIO-WEB] No orders found.`);
		return;
	}

	// Log the raw response for debugging
	// await db
	// 	.insert(utils)
	// 	.values({
	// 		organizacaoId: organizationId,
	// 		identificador: "CARDAPIO_WEB_IMPORTATION" as const,
	// 		valor: {
	// 			identificador: "CARDAPIO_WEB_IMPORTATION" as const,
	// 			dados: {
	// 				organizacaoId: organizationId,
	// 				data: dayjs().format("YYYY-MM-DD"),
	// 				conteudo: orderDetails,
	// 			},
	// 		},
	// 	})
	// 	.returning({ id: utils.id });

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
				acumuloValorParceiro: true,
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
			columns: {
				id: true,
				idExterno: true,
				nome: true,
				primeiraCompraData: true,
				ultimaCompraData: true,
				analiseRFMTitulo: true,
				metadataTotalCompras: true,
				metadataValorTotalCompras: true,
			},
		});

		const existingProducts = await tx.query.products.findMany({
			where: (fields, { eq }) => eq(fields.organizacaoId, organizationId),
			columns: { id: true, codigo: true },
		});

		const existingPartners = await tx.query.partners.findMany({
			where: (fields, { eq }) => eq(fields.organizacaoId, organizationId),
			columns: { id: true, identificador: true, clienteId: true },
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
				{
					id: client.id,
					externalId: client.idExterno,
					firstPurchaseDate: client.primeiraCompraData,
					lastPurchaseDate: client.ultimaCompraData,
					rfmTitle: client.analiseRFMTitulo,
					metadataTotalCompras: client.metadataTotalCompras ?? 0,
					metadataValorTotalCompras: client.metadataValorTotalCompras ?? 0,
				},
			]),
		);
		const existingProductsMap = new Map(existingProducts.map((product) => [product.codigo, product.id]));
		const existingPartnersMap = new Map(existingPartners.map((partner) => [partner.identificador, { id: partner.id, clienteId: partner.clienteId }]));
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
				existingPartnersMap.set(partner.identificador, { id: inserted.id, clienteId: linkage.clientId });
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
						idExterno: cardapioWebSale.cliente.idExterno,
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
					externalId: cardapioWebSale.cliente.idExterno,
					firstPurchaseDate: isValidSale ? saleDate : null,
					lastPurchaseDate: isValidSale ? saleDate : null,
					rfmTitle: "CLIENTES RECENTES",
					metadataTotalCompras: 0,
					metadataValorTotalCompras: 0,
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
			const matchedPartner = cardapioWebSale.parceiro ? existingPartnersMap.get(cardapioWebSale.parceiro.identificador) : null;
			const partnerId = matchedPartner?.id ?? null;
			const partnerClientId = matchedPartner?.clienteId ?? null;

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
						entregaModalidade: cardapioWebSale.entregaModalidade,
						tipo: cardapioWebSale.tipo,
						canal: cardapioWebSale.salesChannel,
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
						canal: cardapioWebSale.salesChannel,
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

					const accumulatedBalance = calculateAccumulatedCashbackValue({
						accumulationType: cashbackProgram.acumuloTipo,
						accumulationValue: cashbackProgram.acumuloValor,
						minimumSaleValue: cashbackProgram.acumuloRegraValorMinimo,
						saleValue,
					});

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

						const shouldAccumulateForPartner = !!partnerClientId && partnerClientId !== saleClientId;
						if (shouldAccumulateForPartner) {
							const partnerBalance = await ensureCashbackBalanceEntry({
								tx,
								map: existingCashbackProgramBalancesMap,
								organizationId,
								clientId: partnerClientId,
								programId: cashbackProgram.id,
							});

							const partnerAccumulatedBalance = calculateAccumulatedCashbackValue({
								accumulationType: cashbackProgram.acumuloTipo,
								accumulationValue: cashbackProgram.acumuloValorParceiro,
								minimumSaleValue: cashbackProgram.acumuloRegraValorMinimo,
								saleValue,
							});

							if (partnerAccumulatedBalance > 0) {
								const partnerPreviousAvailable = partnerBalance.saldoValorDisponivel;
								const partnerPreviousAccumulated = partnerBalance.saldoValorAcumuladoTotal;
								const partnerNewAvailable = partnerPreviousAvailable + partnerAccumulatedBalance;
								const partnerNewAccumulated = partnerPreviousAccumulated + partnerAccumulatedBalance;

								await tx
									.update(cashbackProgramBalances)
									.set({ saldoValorDisponivel: partnerNewAvailable, saldoValorAcumuladoTotal: partnerNewAccumulated })
									.where(
										and(
											eq(cashbackProgramBalances.clienteId, partnerClientId),
											eq(cashbackProgramBalances.programaId, cashbackProgram.id),
											eq(cashbackProgramBalances.organizacaoId, organizationId),
										),
									);

								await tx.insert(cashbackProgramTransactions).values({
									organizacaoId: organizationId,
									clienteId: partnerClientId,
									vendaId: saleId,
									programaId: cashbackProgram.id,
									tipo: "ACÚMULO",
									valor: partnerAccumulatedBalance,
									valorRestante: partnerAccumulatedBalance,
									saldoValorAnterior: partnerPreviousAvailable,
									saldoValorPosterior: partnerNewAvailable,
									expiracaoData: dayjs().add(cashbackProgram.expiracaoRegraValidadeValor, "day").toDate(),
									dataInsercao: saleDate,
									status: "ATIVO",
									metadados: {
										ator: "PARCEIRO",
										parceiroId: partnerId,
										clienteCompradorId: saleClientId,
									},
								});

								updateCashbackBalanceInMap(
									existingCashbackProgramBalancesMap,
									partnerClientId,
									cashbackProgram.id,
									partnerNewAvailable,
									partnerNewAccumulated,
								);
							}
						}

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

const handleOnlineSoftwareImportation: NextApiHandler<string> = async (req, res) => {
	const currentDateFormatted = dayjs().subtract(5, "hour").format("DD/MM/YYYY").replaceAll("/", "");
	console.log("DATE BEING USED", dayjs().format("DD/MM/YYYY HH:mm"), dayjs().subtract(5, "hour").format("DD/MM/YYYY HH:mm"), currentDateFormatted);

	const organizations = await db.query.organizations.findMany({
		columns: {
			id: true,
			integracaoTipo: true,
			integracaoConfiguracao: true,
		},
	});

	for (const organization of organizations) {
		const campaigns = await db.query.campaigns.findMany({
			where: (fields, { and, or, eq }) =>
				and(
					eq(fields.organizacaoId, organization.id),
					eq(fields.ativo, true),
					or(
						eq(fields.gatilhoTipo, "NOVA-COMPRA"),
						eq(fields.gatilhoTipo, "PRIMEIRA-COMPRA"),
						eq(fields.gatilhoTipo, "CASHBACK-ACUMULADO"),
						eq(fields.gatilhoTipo, "QUANTIDADE-TOTAL-COMPRAS"),
						eq(fields.gatilhoTipo, "VALOR-TOTAL-COMPRAS"),
					),
				),
			with: {
				segmentacoes: true,
				whatsappTemplate: true,
			},
		});
		const campaignsForNewPurchase = campaigns.filter((campaign) => campaign.gatilhoTipo === "NOVA-COMPRA");
		const campaignsForFirstPurchase = campaigns.filter((campaign) => campaign.gatilhoTipo === "PRIMEIRA-COMPRA");
		const campaignsForCashbackAccumulation = campaigns.filter((campaign) => campaign.gatilhoTipo === "CASHBACK-ACUMULADO");
		const campaignsForTotalPurchaseCount = campaigns.filter((campaign) => campaign.gatilhoTipo === "QUANTIDADE-TOTAL-COMPRAS");
		const campaignsForTotalPurchaseValue = campaigns.filter((campaign) => campaign.gatilhoTipo === "VALOR-TOTAL-COMPRAS");
		console.log(`[ORG: ${organization.id}] ${campaignsForNewPurchase.length} campanhas de nova compra encontradas.`);
		console.log(`[ORG: ${organization.id}] ${campaignsForFirstPurchase.length} campanhas de primeira compra encontradas.`);
		console.log(`[ORG: ${organization.id}] ${campaignsForCashbackAccumulation.length} campanhas de cashback acumulado encontradas.`);
		console.log(`[ORG: ${organization.id}] ${campaignsForTotalPurchaseCount.length} campanhas de quantidade total de compras encontradas.`);
		console.log(`[ORG: ${organization.id}] ${campaignsForTotalPurchaseValue.length} campanhas de valor total de compras encontradas.`);

		// Query whatsappConnection for immediate processing
		const whatsappConnection = await db.query.whatsappConnections.findFirst({
			where: (fields, { eq }) => eq(fields.organizacaoId, organization.id),
		});

		// Collect data for immediate processing
		const immediateProcessingDataList: ImmediateProcessingData[] = [];

		// Handle CARDAPIO-WEB integration
		if (organization.integracaoTipo === "CARDAPIO-WEB") {
			console.log(`[ORG: ${organization.id}] [INFO] [DATA_COLLECTING] [CARDAPIO-WEB] Starting CardapioWeb integration`);
			try {
				await handleCardapioWebImportation(
					organization.id,
					organization.integracaoConfiguracao as TCardapioWebConfig,
					campaignsForNewPurchase,
					campaignsForFirstPurchase,
					campaignsForCashbackAccumulation,
					campaignsForTotalPurchaseCount,
					campaignsForTotalPurchaseValue,
					whatsappConnection,
					immediateProcessingDataList,
				);
			} catch (error) {
				console.error(`[ORG: ${organization.id}] [ERROR] CARDAPIO-WEB integration error`, error);
				// await db
				// 	.insert(utils)
				// 	.values({
				// 		organizacaoId: organization.id,
				// 		identificador: "CARDAPIO_WEB_IMPORTATION" as const,
				// 		valor: {
				// 			identificador: "CARDAPIO_WEB_IMPORTATION" as const,
				// 			dados: {
				// 				organizacaoId: organization.id,
				// 				data: dayjs().format("YYYY-MM-DD"),
				// 				erro: JSON.stringify(error, Object.getOwnPropertyNames(error)),
				// 				descricao: "Tentativa de importação de pedidos do CardapioWeb.",
				// 			},
				// 		},
				// 	})
				// 	.returning({ id: utils.id });
			}
			continue;
		}

		if (organization.integracaoTipo !== "ONLINE-SOFTWARE") {
			console.log(`[INFO] [DATA_COLLECTING] [ORGANIZATION] Organization ${organization.id} does not have a supported integration type.`);
			continue;
		}
		try {
			console.log(`[ORG: ${organization.id}] [INFO] [DATA_COLLECTING] [ONLINE-SOFTWARE] Starting OnlineSoftware integration`);
			// Fetching data from the online software API
			const onlineSoftwareConfig = organization.integracaoConfiguracao as { tipo: "ONLINE-SOFTWARE"; token: string };
			const { data: onlineAPIResponse } = await axios.post("https://onlinesoftware.com.br/planodecontas/apirestweb/vends/listvends.php", {
				token: onlineSoftwareConfig.token,
				rotina: "listarVendas001",
				dtinicio: currentDateFormatted,
				dtfim: currentDateFormatted,
			});
			// await db
			// 	.insert(utils)
			// 	.values({
			// 		organizacaoId: organization.id,
			// 		identificador: "ONLINE_IMPORTATION",
			// 		valor: {
			// 			identificador: "ONLINE_IMPORTATION",
			// 			dados: {
			// 				organizacaoId: organization.id,
			// 				data: currentDateFormatted,
			// 				conteudo: onlineAPIResponse,
			// 			},
			// 		},
			// 	})
			// 	.returning({ id: utils.id });
			const OnlineSoftwareSales = z
				.array(OnlineSoftwareSaleImportationSchema, {
					required_error: "Payload da Online não é uma lista.",
					invalid_type_error: "Tipo não permitido para o payload.",
				})
				.parse(onlineAPIResponse.resultado);

			console.log(`[ORG: ${organization.id}] ${OnlineSoftwareSales.length} vendas encontradas.`);

			const OnlineSoftwareSalesIds = OnlineSoftwareSales.map((sale) => sale.id);

			await db.transaction(async (tx) => {
				const cashbackProgram = await tx.query.cashbackPrograms.findFirst({
					where: (fields, { eq }) => eq(fields.organizacaoId, organization.id),
					columns: {
						id: true,
						acumuloTipo: true,
						acumuloRegraValorMinimo: true,
						acumuloValor: true,
						acumuloValorParceiro: true,
						expiracaoRegraValidadeValor: true,
						acumuloPermitirViaIntegracao: true,
					},
				});
				const cashbackProgramAllowsAccumulationViaIntegration = cashbackProgram?.acumuloPermitirViaIntegracao;
				const existingSales = await tx.query.sales.findMany({
					where: (fields, { and, eq, inArray }) => and(eq(fields.organizacaoId, organization.id), inArray(fields.idExterno, OnlineSoftwareSalesIds)),
					with: {
						itens: true,
					},
				});

				const existingClients = await tx.query.clients.findMany({
					where: (fields, { eq }) => eq(fields.organizacaoId, organization.id),
					columns: {
						id: true,
						nome: true,
						primeiraCompraData: true,
						ultimaCompraData: true,
						analiseRFMTitulo: true,
						metadataTotalCompras: true,
						metadataValorTotalCompras: true,
					},
				});
				const existingProducts = await tx.query.products.findMany({
					where: (fields, { eq }) => eq(fields.organizacaoId, organization.id),
					columns: {
						id: true,
						codigo: true,
					},
				});
				const existingSellers = await tx.query.sellers.findMany({
					where: (fields, { eq }) => eq(fields.organizacaoId, organization.id),
					columns: {
						id: true,
						nome: true,
					},
				});
				const existingPartners = await tx.query.partners.findMany({
					where: (fields, { eq }) => eq(fields.organizacaoId, organization.id),
					columns: {
						id: true,
						identificador: true,
						clienteId: true,
					},
				});
				const existingCashbackProgramBalances = cashbackProgram
					? await tx.query.cashbackProgramBalances.findMany({
							where: (fields, { and, eq }) => and(eq(fields.organizacaoId, organization.id), eq(fields.programaId, cashbackProgram.id)),
							columns: {
								programaId: true,
								clienteId: true,
								saldoValorDisponivel: true,
								saldoValorAcumuladoTotal: true,
							},
						})
					: [];

				const existingSalesMap = new Map(existingSales.map((sale) => [sale.idExterno, sale]));
				const existingClientsMap = new Map(
					existingClients.map((client) => [
						client.nome,
						{
							id: client.id,
							firstPurchaseDate: client.primeiraCompraData,
							lastPurchaseDate: client.ultimaCompraData,
							rfmTitle: client.analiseRFMTitulo,
							metadataTotalCompras: client.metadataTotalCompras ?? 0,
							metadataValorTotalCompras: client.metadataValorTotalCompras ?? 0,
						},
					]),
				);
				const existingProductsMap = new Map(existingProducts.map((product) => [product.codigo, product.id]));
				const existingSellersMap = new Map(existingSellers.map((seller) => [seller.nome, seller.id]));
				const existingPartnersMap = new Map(existingPartners.map((partner) => [partner.identificador, { id: partner.id, clienteId: partner.clienteId }]));
				const existingCashbackProgramBalancesMap = new Map(existingCashbackProgramBalances.map((balance) => [balance.clienteId, balance]));

				let createdSalesCount = 0;
				let updatedSalesCount = 0;
				for (const OnlineSale of OnlineSoftwareSales) {
					let isNewClient = false;
					let isNewSale = false;

					const onlineBaseSaleDate = dayjs(OnlineSale.data, "DD/MM/YYYY");
					// If the Online sale date is the same as the current date, we use the current date (with time frame component, since cron runs every 5 minutes, we get approximately real time),
					// Otherwise we use the online sale date + 3 hours (to compensate for lack of time component in Online date field)
					const saleDate = dayjs().isSame(onlineBaseSaleDate, "day") ? dayjs().toDate() : onlineBaseSaleDate.add(3, "hours").toDate();
					const isValidSale = OnlineSale.natureza === "SN01";
					// First, we check for an existing client with the same name (in this case, our primary key for the integration)
					const equivalentSaleClient = existingClientsMap.get(OnlineSale.cliente);
					const isValidClient = OnlineSale.cliente !== "AO CONSUMIDOR";
					// Initalize the saleClientId holder with the existing client (if any)
					let saleClientId = equivalentSaleClient?.id;
					if (!saleClientId && isValidClient) {
						console.log(`[ORG: ${organization.id}] [INFO] [DATA_COLLECTING] [CLIENT] Creating new client for ${OnlineSale.cliente}`);
						// If no existing client is found, we create a new one
						const insertedClientResponse = await tx
							.insert(clients)
							.values({
								nome: OnlineSale.cliente,
								organizacaoId: organization.id,
								telefone: formatToPhone(OnlineSale.clientefone || OnlineSale.clientecelular || ""),
								telefoneBase: formatPhoneAsBase(OnlineSale.clientefone || OnlineSale.clientecelular || ""),
								primeiraCompraData: isValidSale ? saleDate : null,
								ultimaCompraData: isValidSale ? saleDate : null,
							})
							.returning({
								id: clients.id,
							});
						const insertedClientId = insertedClientResponse[0]?.id;
						if (!insertedClientResponse) throw new createHttpError.InternalServerError("Oops, um erro ocorreu ao criar cliente.");
						// Define the saleClientId with the newly created client id
						saleClientId = insertedClientId;
						isNewClient = true;
						// Add the new client to the existing clients map
						existingClientsMap.set(OnlineSale.cliente, {
							id: insertedClientId,
							firstPurchaseDate: isValidSale ? saleDate : null,
							lastPurchaseDate: isValidSale ? saleDate : null,
							rfmTitle: "CLIENTES RECENTES",
							metadataTotalCompras: 0,
							metadataValorTotalCompras: 0,
						});

						if (cashbackProgram) {
							// If there is a cashback program, we need to create a new balance for the client
							await tx.insert(cashbackProgramBalances).values({
								clienteId: insertedClientId,
								programaId: cashbackProgram.id,
								organizacaoId: organization.id,
								saldoValorDisponivel: 0,
								saldoValorAcumuladoTotal: 0,
							});
							updateCashbackBalanceInMap(existingCashbackProgramBalancesMap, insertedClientId, cashbackProgram.id, 0, 0);
						}
					}

					// Then, we check for an existing seller with the same name (in this case, our primary key for the integration)
					const isValidSeller = !!OnlineSale.vendedor && OnlineSale.vendedor !== "N/A" && OnlineSale.vendedor !== "0";
					const equivalentSaleSeller = isValidSeller ? existingSellersMap.get(OnlineSale.vendedor) : null;
					// Initalize the saleSellerId holder with the existing seller (if any)
					let saleSellerId = equivalentSaleSeller;
					if (!saleSellerId && isValidSeller) {
						// If no existing seller is found, we create a new one
						const insertedSellerResponse = await tx
							.insert(sellers)
							.values({ organizacaoId: organization.id, nome: OnlineSale.vendedor || "N/A", identificador: OnlineSale.vendedor || "N/A" })
							.returning({ id: sellers.id });
						const insertedSellerId = insertedSellerResponse[0]?.id;
						if (!insertedSellerResponse) throw new createHttpError.InternalServerError("Oops, um erro ocorreu ao criar vendedor.");
						// Define the saleSellerId with the newly created seller id
						saleSellerId = insertedSellerId;
						// Add the new seller to the existing sellers map
						existingSellersMap.set(OnlineSale.vendedor, insertedSellerId);
					}

					// Then, we check for an existing partner with the same identificador (in this case, our primary key for the integration)
					const isValidPartner = OnlineSale.parceiro && OnlineSale.parceiro !== "N/A" && OnlineSale.parceiro !== "0";
					const equivalentSalePartner = isValidPartner ? existingPartnersMap.get(OnlineSale.parceiro as string) : null;
					let salePartnerId = equivalentSalePartner?.id ?? null;
					let salePartnerClientId = equivalentSalePartner?.clienteId ?? null;
					if (!salePartnerId && isValidPartner) {
						const partnerIdentifier = OnlineSale.parceiro || "N/A";
						const partnerDocument = formatToCPForCNPJ(partnerIdentifier);
						const linkage = await linkPartnerToClient({
							tx,
							orgId: organization.id,
							partner: {
								nome: "NÃO DEFINIDO",
								cpfCnpj: partnerDocument,
							},
							createClientIfNotFound: true,
						});

						// If no existing partner is found, we create a new one
						const insertedPartnerResponse = await tx
							.insert(partners)
							.values({
								organizacaoId: organization.id,
								nome: "NÃO DEFINIDO",
								identificador: partnerIdentifier,
								codigoAfiliacao: partnerIdentifier,
								cpfCnpj: partnerDocument,
								clienteId: linkage.clientId,
							})
							.returning({ id: partners.id });
						const insertedPartnerId = insertedPartnerResponse[0]?.id;
						if (!insertedPartnerResponse) throw new createHttpError.InternalServerError("Oops, um erro ocorreu ao criar parceiro.");
						// Define the salePartnerId with the newly created partner id
						salePartnerId = insertedPartnerId;
						salePartnerClientId = linkage.clientId;
						// Add the new partner to the existing partners map
						existingPartnersMap.set(OnlineSale.parceiro || "N/A", { id: insertedPartnerId, clienteId: linkage.clientId });
					}

					let saleId = null;
					const existingSale = existingSalesMap.get(OnlineSale.id);
					if (!existingSale) {
						isNewSale = true; // MARCA COMO NOVA VENDA
						console.log(
							`[ORG: ${organization.id}] [INFO] [DATA_COLLECTING] [SALE] Creating new sale ${OnlineSale.id} with ${OnlineSale.itens.length} items...`,
						);
						// Now, we extract the data to compose the sale entity
						const saleTotalCost = OnlineSale.itens.reduce((acc: number, current) => acc + Number(current.vcusto), 0);
						// Insert the sale entity into the database
						const insertedSaleResponse = await tx
							.insert(sales)
							.values({
								organizacaoId: organization.id,
								idExterno: OnlineSale.id,
								clienteId: saleClientId,
								valorTotal: Number(OnlineSale.valor),
								custoTotal: saleTotalCost,
								vendedorNome: OnlineSale.vendedor || "N/A",
								vendedorId: saleSellerId,
								parceiro: OnlineSale.parceiro || "N/A",
								parceiroId: salePartnerId,
								chave: OnlineSale.chave || "N/A",
								documento: OnlineSale.documento || "N/A",
								modelo: OnlineSale.modelo || "N/A",
								movimento: OnlineSale.movimento || "N/A",
								natureza: OnlineSale.natureza || "N/A",
								serie: OnlineSale.serie || "N/A",
								situacao: OnlineSale.situacao || "N/A",
								tipo: OnlineSale.tipo,
								canal: "Loja Física",
								entregaModalidade: "PRESENCIAL",
								dataVenda: saleDate,
							})
							.returning({
								id: sales.id,
							});
						const insertedSaleId = insertedSaleResponse[0]?.id;
						if (!insertedSaleResponse) throw new createHttpError.InternalServerError("Oops, um erro ocorreu ao criar venda.");

						// Now, we iterate over the items to insert the sale items entities into the database
						for (const item of OnlineSale.itens) {
							// First, we check for an existing product with the same code (in this case, our primary key for the integration)
							// Initalize the productId holder with the existing product (if any)
							const equivalentProduct = existingProductsMap.get(item.codigo);
							let productId = equivalentProduct;
							if (!productId) {
								// If no existing product is found, we create a new one
								const insertedProductResponse = await tx
									.insert(products)
									.values({
										organizacaoId: organization.id,
										codigo: item.codigo,
										descricao: item.descricao,
										unidade: item.unidade,
										grupo: item.grupo,
										ncm: item.ncm,
										tipo: item.tipo,
									})
									.returning({
										id: products.id,
									});
								const insertedProductId = insertedProductResponse[0]?.id;
								if (!insertedProductResponse) throw new createHttpError.InternalServerError("Oops, um erro ocorreu ao criar produto.");
								// Define the productId with the newly created product id
								productId = insertedProductId;
								// Add the new product to the existing products map
								existingProductsMap.set(item.codigo, insertedProductId);
							}

							// Now, we extract the data to compose the sale item entity
							const quantidade = Number(item.qtde);
							const valorVendaUnitario = Number(item.valorunit);
							const valorVendaTotalBruto = valorVendaUnitario * quantidade;
							const valorTotalDesconto = Number(item.vdesc);
							const valorVendaTotalLiquido = valorVendaTotalBruto - valorTotalDesconto;
							const valorCustoTotal = Number(item.vcusto);

							// Insert the sale item entity into the database
							await tx.insert(saleItems).values({
								organizacaoId: organization.id,
								vendaId: insertedSaleId,
								clienteId: saleClientId,
								produtoId: productId,
								quantidade: Number(item.qtde),
								valorVendaUnitario: valorVendaUnitario,
								valorCustoUnitario: valorCustoTotal / quantidade,
								valorVendaTotalBruto,
								valorTotalDesconto,
								valorVendaTotalLiquido,
								valorCustoTotal,
								metadados: {
									baseicms: item.baseicms,
									percent: item.percent,
									icms: item.icms,
									cst_icms: item.cst_icms,
									csosn: item.csosn,
									cst_pis: item.cst_pis,
									cfop: item.cfop,
									vfrete: item.vfrete,
									vseg: item.vseg,
									voutro: item.voutro,
									vipi: item.vipi,
									vicmsst: item.vicmsst,
									vicms_desonera: item.vicms_desonera,
									cest: item.cest,
								},
							});
						}
						// Defining the saleId
						saleId = insertedSaleId;

						// Process conversion attribution for new valid sales (and valid client)
						if (insertedSaleId && isValidSale && saleClientId) {
							await processConversionAttribution(tx, {
								vendaId: insertedSaleId,
								clienteId: saleClientId,
								organizacaoId: organization.id,
								valorVenda: Number(OnlineSale.valor),
								dataVenda: saleDate,
							});
						}

						createdSalesCount++;
					} else {
						isNewSale = false; // É APENAS ATUALIZAÇÃO
						console.log(
							`[ORG: ${organization.id}] [INFO] [DATA_COLLECTING] [SALE] Updating sale ${OnlineSale.id} with ${OnlineSale.itens.length} items...`,
						);
						// Handle sales updates
						const saleTotalCost = OnlineSale.itens.reduce((acc: number, current) => acc + Number(current.vcusto), 0);
						const saleDate = dayjs(OnlineSale.data, "DD/MM/YYYY").add(3, "hours").toDate();
						await tx
							.update(sales)
							.set({
								organizacaoId: organization.id,
								idExterno: OnlineSale.id,
								clienteId: saleClientId,
								valorTotal: Number(OnlineSale.valor),
								custoTotal: saleTotalCost,
								vendedorNome: OnlineSale.vendedor || "N/A",
								vendedorId: saleSellerId,
								parceiro: OnlineSale.parceiro || "N/A",
								parceiroId: salePartnerId,
								chave: OnlineSale.chave || "N/A",
								documento: OnlineSale.documento || "N/A",
								modelo: OnlineSale.modelo || "N/A",
								movimento: OnlineSale.movimento || "N/A",
								natureza: OnlineSale.natureza || "N/A",
								serie: OnlineSale.serie || "N/A",
								situacao: OnlineSale.situacao || "N/A",
								tipo: OnlineSale.tipo,
								canal: "Loja Física",
								entregaModalidade: "PRESENCIAL",
								dataVenda: saleDate,
							})
							.where(eq(sales.id, existingSale.id));

						// Check if sale was canceled
						const wasPreviouslyValid = existingSale.natureza === "SN01" && existingSale.valorTotal > 0;
						const isNowCanceled = OnlineSale.natureza !== "SN01" || Number(OnlineSale.valor) === 0;

						if (wasPreviouslyValid && isNowCanceled && saleClientId) {
							console.log(`[ORG: ${organization.id}] [SALE_CANCELED] Venda ${OnlineSale.id} foi cancelada. Revertendo cashback e cancelando interações...`);

							await reverseSaleCashback({
								tx,
								saleId: existingSale.id,
								clientId: saleClientId,
								organizationId: organization.id,
								reason: "VENDA_CANCELADA",
							});
						}

						// Now, since we can reliably update sale items, we will delete all previous items and insert the new ones

						await tx.delete(saleItems).where(and(eq(saleItems.vendaId, existingSale.id), eq(saleItems.organizacaoId, organization.id)));
						// Now, we iterate over the items to insert the sale items entities into the database
						for (const item of OnlineSale.itens) {
							// First, we check for an existing product with the same code (in this case, our primary key for the integration)
							// Initalize the productId holder with the existing product (if any)
							const equivalentProduct = existingProductsMap.get(item.codigo);
							let productId = equivalentProduct;
							if (!productId) {
								// If no existing product is found, we create a new one
								const insertedProductResponse = await tx
									.insert(products)
									.values({
										organizacaoId: organization.id,
										codigo: item.codigo,
										descricao: item.descricao,
										unidade: item.unidade,
										grupo: item.grupo,
										ncm: item.ncm,
										tipo: item.tipo,
									})
									.returning({
										id: products.id,
									});
								const insertedProductId = insertedProductResponse[0]?.id;
								if (!insertedProductResponse) throw new createHttpError.InternalServerError("Oops, um erro ocorreu ao criar produto.");
								// Define the productId with the newly created product id
								productId = insertedProductId;
								// Add the new product to the existing products map
								existingProductsMap.set(item.codigo, insertedProductId);
							}

							// Now, we extract the data to compose the sale item entity
							const quantidade = Number(item.qtde);
							const valorVendaUnitario = Number(item.valorunit);
							const valorVendaTotalBruto = valorVendaUnitario * quantidade;
							const valorTotalDesconto = Number(item.vdesc);
							const valorVendaTotalLiquido = valorVendaTotalBruto - valorTotalDesconto;
							const valorCustoTotal = Number(item.vcusto);

							// Insert the sale item entity into the database
							await tx.insert(saleItems).values({
								organizacaoId: organization.id,
								vendaId: existingSale.id,
								clienteId: saleClientId,
								produtoId: productId,
								quantidade: Number(item.qtde),
								valorVendaUnitario: valorVendaUnitario,
								valorCustoUnitario: valorCustoTotal / quantidade,
								valorVendaTotalBruto,
								valorTotalDesconto,
								valorVendaTotalLiquido,
								valorCustoTotal,
								metadados: {
									baseicms: item.baseicms,
									percent: item.percent,
									icms: item.icms,
									cst_icms: item.cst_icms,
									csosn: item.csosn,
									cst_pis: item.cst_pis,
									cfop: item.cfop,
									vfrete: item.vfrete,
									vseg: item.vseg,
									voutro: item.voutro,
									vipi: item.vipi,
									vicmsst: item.vicmsst,
									vicms_desonera: item.vicms_desonera,
									cest: item.cest,
								},
							});
						}
						// Defining the saleId
						saleId = existingSale.id;
						updatedSalesCount++;
					}

					// Checking for applicable campaigns for first purchases
					if (isNewSale && isNewClient && isValidSale && saleClientId) {
						// Checking for applicable campaigns for new purchase
						const applicableCampaigns = campaignsForFirstPurchase.filter((campaign) =>
							campaign.segmentacoes.some((s) => s.segmentacao === "CLIENTES RECENTES"),
						);
						if (applicableCampaigns.length > 0 && isValidSale) {
							console.log(
								`[ORG: ${organization.id}] ${applicableCampaigns.length} campanhas de primeira compra aplicáveis encontradas para o cliente ${OnlineSale.cliente}.`,
							);
							for (const campaign of applicableCampaigns) {
								// Validate campaign frequency before scheduling
								const canSchedule = await canScheduleCampaignForClient(
									tx,
									saleClientId,
									campaign.id,
									campaign.permitirRecorrencia,
									campaign.frequenciaIntervaloValor,
									campaign.frequenciaIntervaloMedida,
								);

								if (!canSchedule) {
									console.log(
										`[ORG: ${organization.id}] [CAMPAIGN_FREQUENCY] Skipping campaign ${campaign.titulo} for client ${OnlineSale.cliente} due to frequency limits.`,
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
										clienteId: saleClientId,
										campanhaId: campaign.id,
										organizacaoId: organization.id,
										titulo: `Envio de mensagem automática via campanha ${campaign.titulo}`,
										tipo: "ENVIO-MENSAGEM",
										descricao: "Cliente realizou sua primeira compra.",
										agendamentoDataReferencia: dayjs(interactionScheduleDate).format("YYYY-MM-DD"),
										agendamentoBlocoReferencia: campaign.execucaoAgendadaBloco,
									})
									.returning({ id: interactions.id });

								// Check for immediate processing (execucaoAgendadaValor === 0)
								if (campaign.execucaoAgendadaValor === 0 && campaign.whatsappTemplate && whatsappConnection && campaign.whatsappConexaoTelefoneId) {
									// Query client data for immediate processing
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

								// Generate campaign cashback for PRIMEIRA-COMPRA trigger
								if (cashbackProgram && campaign.cashbackGeracaoAtivo && campaign.cashbackGeracaoTipo && campaign.cashbackGeracaoValor) {
									const saleValue = Number(OnlineSale.valor);
									const cashbackGenerationResult = await generateCashbackForCampaign({
										tx,
										organizationId: organization.id,
										clientId: saleClientId,
										campaignId: campaign.id,
										cashbackType: campaign.cashbackGeracaoTipo,
										cashbackValue: campaign.cashbackGeracaoValor,
										saleId: saleId,
										saleValue: saleValue,
										expirationMeasure: campaign.cashbackGeracaoExpiracaoMedida,
										expirationValue: campaign.cashbackGeracaoExpiracaoValor,
									});

									if (cashbackGenerationResult) {
										updateCashbackBalanceInMap(
											existingCashbackProgramBalancesMap,
											saleClientId,
											cashbackProgram.id,
											cashbackGenerationResult.clientNewAvailableBalance,
											cashbackGenerationResult.clientNewAccumulatedTotal,
										);
									}
								}
							}
						}
					}
					// Checking for applicable campaigns for new purchase
					if (isNewSale && !isNewClient && isValidSale) {
						const applicableCampaigns = campaignsForNewPurchase.filter((campaign) => {
							// Validate campaign trigger for new purchase
							const meetsNewPurchaseValueTrigger =
								campaign.gatilhoNovaCompraValorMinimo === null ||
								campaign.gatilhoNovaCompraValorMinimo === undefined ||
								Number(OnlineSale.valor) >= campaign.gatilhoNovaCompraValorMinimo;

							const meetsSegmentationTrigger = campaign.segmentacoes.some(
								(s) => s.segmentacao === (existingClientsMap.get(OnlineSale.cliente)?.rfmTitle ?? "CLIENTES RECENTES"),
							);

							return meetsNewPurchaseValueTrigger && meetsSegmentationTrigger;
						});
						if (applicableCampaigns.length > 0) {
							console.log(
								`[ORG: ${organization.id}] ${applicableCampaigns.length} campanhas de nova compra aplicáveis encontradas para o cliente ${OnlineSale.cliente}.`,
							);
							for (const campaign of applicableCampaigns) {
								if (!saleClientId) continue; // If no sale client id is found, skip the campaign
								// Validate campaign frequency before scheduling
								const canSchedule = await canScheduleCampaignForClient(
									tx,
									saleClientId,
									campaign.id,
									campaign.permitirRecorrencia,
									campaign.frequenciaIntervaloValor,
									campaign.frequenciaIntervaloMedida,
								);

								if (!canSchedule) {
									console.log(
										`[ORG: ${organization.id}] [CAMPAIGN_FREQUENCY] Skipping campaign ${campaign.titulo} for client ${OnlineSale.cliente} due to frequency limits.`,
									);
									continue;
								}

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
										organizacaoId: organization.id,
										titulo: `Envio de mensagem automática via campanha ${campaign.titulo}`,
										tipo: "ENVIO-MENSAGEM",
										descricao: `Cliente se enquadrou no parâmetro de nova compra ${existingClientsMap.get(OnlineSale.cliente)?.rfmTitle}.`,
										agendamentoDataReferencia: dayjs(interactionScheduleDate).format("YYYY-MM-DD"),
										agendamentoBlocoReferencia: campaign.execucaoAgendadaBloco,
									})
									.returning({ id: interactions.id });

								// Check for immediate processing (execucaoAgendadaValor === 0)
								if (campaign.execucaoAgendadaValor === 0 && campaign.whatsappTemplate && whatsappConnection && campaign.whatsappConexaoTelefoneId) {
									// Query client data for immediate processing
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

								// Generate campaign cashback for NOVA-COMPRA trigger
								if (campaign.cashbackGeracaoAtivo && campaign.cashbackGeracaoTipo && campaign.cashbackGeracaoValor) {
									const saleValue = Number(OnlineSale.valor);
									const cashbackGenerationResult = await generateCashbackForCampaign({
										tx,
										organizationId: organization.id,
										clientId: saleClientId,
										campaignId: campaign.id,
										cashbackType: campaign.cashbackGeracaoTipo,
										cashbackValue: campaign.cashbackGeracaoValor,
										saleId: saleId,
										saleValue: saleValue,
										expirationMeasure: campaign.cashbackGeracaoExpiracaoMedida,
										expirationValue: campaign.cashbackGeracaoExpiracaoValor,
									});

									if (cashbackGenerationResult) {
										const clientCashbackProgramBalance = existingCashbackProgramBalancesMap.get(saleClientId);
										if (clientCashbackProgramBalance) {
											updateCashbackBalanceInMap(
												existingCashbackProgramBalancesMap,
												saleClientId,
												clientCashbackProgramBalance.programaId,
												cashbackGenerationResult.clientNewAvailableBalance,
												cashbackGenerationResult.clientNewAccumulatedTotal,
											);
										}
									}
								}
							}
						}
					}
					// Process QUANTIDADE-TOTAL-COMPRAS and VALOR-TOTAL-COMPRAS campaigns
					if (isNewSale && isValidSale && saleClientId) {
						const clientData = existingClientsMap.get(OnlineSale.cliente);
						const previousPurchaseCount = clientData?.metadataTotalCompras ?? 0;
						const previousPurchaseValue = clientData?.metadataValorTotalCompras ?? 0;
						const newTotalPurchaseCount = previousPurchaseCount + 1;
						const newTotalPurchaseValue = previousPurchaseValue + Number(OnlineSale.valor);
						const clientRfmTitle = clientData?.rfmTitle ?? "CLIENTES RECENTES";

						// Process QUANTIDADE-TOTAL-COMPRAS campaigns
						if (campaignsForTotalPurchaseCount.length > 0) {
							const applicableCampaigns = campaignsForTotalPurchaseCount.filter((campaign) => {
								const meetsThreshold =
									campaign.gatilhoQuantidadeTotalCompras !== null &&
									campaign.gatilhoQuantidadeTotalCompras !== undefined &&
									newTotalPurchaseCount >= campaign.gatilhoQuantidadeTotalCompras;
								const meetsSegmentation = campaign.segmentacoes.length === 0 || campaign.segmentacoes.some((s) => s.segmentacao === clientRfmTitle);
								return meetsThreshold && meetsSegmentation;
							});

							if (applicableCampaigns.length > 0) {
								console.log(
									`[ORG: ${organization.id}] ${applicableCampaigns.length} campanhas de quantidade total de compras aplicáveis encontradas para o cliente ${OnlineSale.cliente}.`,
								);
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
											organizacaoId: organization.id,
											titulo: `Envio de mensagem automática via campanha ${campaign.titulo}`,
											tipo: "ENVIO-MENSAGEM",
											descricao: `Cliente atingiu ${newTotalPurchaseCount} compras totais (gatilho: ${campaign.gatilhoQuantidadeTotalCompras}).`,
											agendamentoDataReferencia: dayjs(interactionScheduleDate).format("YYYY-MM-DD"),
											agendamentoBlocoReferencia: campaign.execucaoAgendadaBloco,
										})
										.returning({ id: interactions.id });

									if (campaign.execucaoAgendadaValor === 0 && campaign.whatsappTemplate && whatsappConnection && campaign.whatsappConexaoTelefoneId) {
										const clientDetails = await tx.query.clients.findFirst({
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
										if (clientDetails) {
											immediateProcessingDataList.push({
												interactionId: insertedInteraction.id,
												organizationId: organization.id,
												client: clientDetails,
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
											organizationId: organization.id,
											clientId: saleClientId,
											campaignId: campaign.id,
											cashbackType: campaign.cashbackGeracaoTipo,
											cashbackValue: campaign.cashbackGeracaoValor,
											saleId,
											saleValue: Number(OnlineSale.valor),
											expirationMeasure: campaign.cashbackGeracaoExpiracaoMedida,
											expirationValue: campaign.cashbackGeracaoExpiracaoValor,
										});
										if (cashbackResult && cashbackProgram) {
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

						// Process VALOR-TOTAL-COMPRAS campaigns
						if (campaignsForTotalPurchaseValue.length > 0) {
							const applicableCampaigns = campaignsForTotalPurchaseValue.filter((campaign) => {
								const meetsThreshold =
									campaign.gatilhoValorTotalCompras !== null &&
									campaign.gatilhoValorTotalCompras !== undefined &&
									newTotalPurchaseValue >= campaign.gatilhoValorTotalCompras;
								const meetsSegmentation = campaign.segmentacoes.length === 0 || campaign.segmentacoes.some((s) => s.segmentacao === clientRfmTitle);
								return meetsThreshold && meetsSegmentation;
							});

							if (applicableCampaigns.length > 0) {
								console.log(
									`[ORG: ${organization.id}] ${applicableCampaigns.length} campanhas de valor total de compras aplicáveis encontradas para o cliente ${OnlineSale.cliente}.`,
								);
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
											organizacaoId: organization.id,
											titulo: `Envio de mensagem automática via campanha ${campaign.titulo}`,
											tipo: "ENVIO-MENSAGEM",
											descricao: `Cliente atingiu R$ ${newTotalPurchaseValue.toFixed(2)} em compras totais (gatilho: R$ ${campaign.gatilhoValorTotalCompras?.toFixed(2)}).`,
											agendamentoDataReferencia: dayjs(interactionScheduleDate).format("YYYY-MM-DD"),
											agendamentoBlocoReferencia: campaign.execucaoAgendadaBloco,
										})
										.returning({ id: interactions.id });

									if (campaign.execucaoAgendadaValor === 0 && campaign.whatsappTemplate && whatsappConnection && campaign.whatsappConexaoTelefoneId) {
										const clientDetails = await tx.query.clients.findFirst({
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
										if (clientDetails) {
											immediateProcessingDataList.push({
												interactionId: insertedInteraction.id,
												organizationId: organization.id,
												client: clientDetails,
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
											organizationId: organization.id,
											clientId: saleClientId,
											campaignId: campaign.id,
											cashbackType: campaign.cashbackGeracaoTipo,
											cashbackValue: campaign.cashbackGeracaoValor,
											saleId,
											saleValue: Number(OnlineSale.valor),
											expirationMeasure: campaign.cashbackGeracaoExpiracaoMedida,
											expirationValue: campaign.cashbackGeracaoExpiracaoValor,
										});
										if (cashbackResult && cashbackProgram) {
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

						// Update client metadata in the map for subsequent sales in the same batch
						if (clientData) {
							existingClientsMap.set(OnlineSale.cliente, {
								...clientData,
								metadataTotalCompras: newTotalPurchaseCount,
								metadataValorTotalCompras: newTotalPurchaseValue,
							});
						}
					}

					// Checking for applicable cashback program balance updates
					if (cashbackProgram && cashbackProgramAllowsAccumulationViaIntegration && isValidSale && isNewSale) {
						if (!saleClientId) continue; // If no sale client id is found, skip the cashback program balance update
						const buyerClientId = saleClientId;
						const clientCashbackProgramBalance = existingCashbackProgramBalancesMap.get(buyerClientId);

						if (clientCashbackProgramBalance) {
							const saleValue = Number(OnlineSale.valor);
							const previousOverallAvailableBalance = clientCashbackProgramBalance.saldoValorDisponivel;
							const previousOverallAccumulatedBalance = clientCashbackProgramBalance.saldoValorAcumuladoTotal;

							const accumulatedBalance = calculateAccumulatedCashbackValue({
								accumulationType: cashbackProgram.acumuloTipo,
								accumulationValue: cashbackProgram.acumuloValor,
								minimumSaleValue: cashbackProgram.acumuloRegraValorMinimo,
								saleValue,
							});

							const newOverallAvailableBalance = previousOverallAvailableBalance + accumulatedBalance;
							const newOverallAccumulatedBalance = previousOverallAccumulatedBalance + accumulatedBalance;

							if (accumulatedBalance > 0) {
								await tx
									.update(cashbackProgramBalances)
									.set({
										saldoValorDisponivel: newOverallAvailableBalance,
										saldoValorAcumuladoTotal: newOverallAccumulatedBalance,
									})
									.where(
										and(
											eq(cashbackProgramBalances.clienteId, buyerClientId),
											eq(cashbackProgramBalances.programaId, cashbackProgram.id),
											eq(cashbackProgramBalances.organizacaoId, organization.id),
										),
									);

								await tx.insert(cashbackProgramTransactions).values({
									organizacaoId: organization.id,
									clienteId: buyerClientId,
									vendaId: saleId,
									programaId: cashbackProgram.id,
									tipo: "ACÚMULO",
									valor: accumulatedBalance,
									valorRestante: accumulatedBalance,
									saldoValorAnterior: previousOverallAvailableBalance,
									saldoValorPosterior: newOverallAvailableBalance,
									expiracaoData: dayjs().add(cashbackProgram.expiracaoRegraValidadeValor, "day").toDate(),
									dataInsercao: saleDate,
									status: "ATIVO",
								});

								// Update the map for subsequent iterations
								updateCashbackBalanceInMap(
									existingCashbackProgramBalancesMap,
									buyerClientId,
									cashbackProgram.id,
									newOverallAvailableBalance,
									newOverallAccumulatedBalance,
								);

								if (salePartnerClientId && salePartnerClientId !== buyerClientId) {
									const partnerClientId = salePartnerClientId;
									const partnerCashbackProgramBalance = await ensureCashbackBalanceEntry({
										tx,
										map: existingCashbackProgramBalancesMap,
										organizationId: organization.id,
										clientId: partnerClientId,
										programId: cashbackProgram.id,
									});

									const partnerAccumulatedBalance = calculateAccumulatedCashbackValue({
										accumulationType: cashbackProgram.acumuloTipo,
										accumulationValue: cashbackProgram.acumuloValorParceiro,
										minimumSaleValue: cashbackProgram.acumuloRegraValorMinimo,
										saleValue,
									});

									if (partnerAccumulatedBalance > 0) {
										const partnerPreviousAvailableBalance = partnerCashbackProgramBalance.saldoValorDisponivel;
										const partnerPreviousAccumulatedBalance = partnerCashbackProgramBalance.saldoValorAcumuladoTotal;
										const partnerNewAvailableBalance = partnerPreviousAvailableBalance + partnerAccumulatedBalance;
										const partnerNewAccumulatedBalance = partnerPreviousAccumulatedBalance + partnerAccumulatedBalance;

										await tx
											.update(cashbackProgramBalances)
											.set({
												saldoValorDisponivel: partnerNewAvailableBalance,
												saldoValorAcumuladoTotal: partnerNewAccumulatedBalance,
											})
											.where(
												and(
													eq(cashbackProgramBalances.clienteId, partnerClientId),
													eq(cashbackProgramBalances.programaId, cashbackProgram.id),
													eq(cashbackProgramBalances.organizacaoId, organization.id),
												),
											);

										await tx.insert(cashbackProgramTransactions).values({
											organizacaoId: organization.id,
											clienteId: partnerClientId,
											vendaId: saleId,
											programaId: cashbackProgram.id,
											tipo: "ACÚMULO",
											valor: partnerAccumulatedBalance,
											valorRestante: partnerAccumulatedBalance,
											saldoValorAnterior: partnerPreviousAvailableBalance,
											saldoValorPosterior: partnerNewAvailableBalance,
											expiracaoData: dayjs().add(cashbackProgram.expiracaoRegraValidadeValor, "day").toDate(),
											dataInsercao: saleDate,
											status: "ATIVO",
											metadados: {
												ator: "PARCEIRO",
												parceiroId: salePartnerId,
												clienteCompradorId: buyerClientId,
											},
										});

										updateCashbackBalanceInMap(
											existingCashbackProgramBalancesMap,
											partnerClientId,
											cashbackProgram.id,
											partnerNewAvailableBalance,
											partnerNewAccumulatedBalance,
										);
									}
								}

								// Checking for applicable campaigns for cashback accumulation
								if (campaignsForCashbackAccumulation.length > 0) {
									const applicableCampaigns = campaignsForCashbackAccumulation.filter((campaign) => {
										// Check if the new accumulated cashback meets the minimum threshold (if defined)
										const meetsNewCashbackThreshold =
											campaign.gatilhoNovoCashbackAcumuladoValorMinimo === null ||
											campaign.gatilhoNovoCashbackAcumuladoValorMinimo === undefined ||
											accumulatedBalance >= campaign.gatilhoNovoCashbackAcumuladoValorMinimo;

										// Check if the total accumulated cashback meets the minimum threshold (if defined)
										const meetsTotalCashbackThreshold =
											campaign.gatilhoTotalCashbackAcumuladoValorMinimo === null ||
											campaign.gatilhoTotalCashbackAcumuladoValorMinimo === undefined ||
											newOverallAvailableBalance >= campaign.gatilhoTotalCashbackAcumuladoValorMinimo;

										const meetsSegmentationTrigger = campaign.segmentacoes.some(
											(s) => s.segmentacao === (existingClientsMap.get(OnlineSale.cliente)?.rfmTitle ?? "CLIENTES RECENTES"),
										);
										// All conditions must be met (if defined)
										return meetsNewCashbackThreshold && meetsTotalCashbackThreshold && meetsSegmentationTrigger;
									});

									if (applicableCampaigns.length > 0) {
										console.log(
											`[ORG: ${organization.id}] ${applicableCampaigns.length} campanhas de cashback acumulado aplicáveis encontradas para o cliente ${OnlineSale.cliente}.`,
										);
									}

									for (const campaign of applicableCampaigns) {
										// Validate campaign frequency before scheduling
										const canSchedule = await canScheduleCampaignForClient(
											tx,
											buyerClientId,
											campaign.id,
											campaign.permitirRecorrencia,
											campaign.frequenciaIntervaloValor,
											campaign.frequenciaIntervaloMedida,
										);

										if (!canSchedule) {
											console.log(
												`[ORG: ${organization.id}] [CAMPAIGN_FREQUENCY] Skipping campaign ${campaign.titulo} for client ${OnlineSale.cliente} due to frequency limits.`,
											);
											continue;
										}

										const interactionScheduleDate = getPostponedDateFromReferenceDate({
											date: dayjs().toDate(),
											unit: campaign.execucaoAgendadaMedida,
											value: campaign.execucaoAgendadaValor,
										});

										const [insertedInteraction] = await tx
											.insert(interactions)
											.values({
												clienteId: buyerClientId,
												campanhaId: campaign.id,
												organizacaoId: organization.id,
												titulo: `Envio de mensagem automática via campanha ${campaign.titulo}`,
												tipo: "ENVIO-MENSAGEM",
												descricao: `Cliente acumulou R$ ${(accumulatedBalance / 100).toFixed(2)} em cashback. Total acumulado: R$ ${(newOverallAccumulatedBalance / 100).toFixed(2)}.`,
												agendamentoDataReferencia: dayjs(interactionScheduleDate).format("YYYY-MM-DD"),
												agendamentoBlocoReferencia: campaign.execucaoAgendadaBloco,
												metadados: {
													cashbackAcumuladoValor: accumulatedBalance,
													whatsappMensagemId: null,
													whatsappTemplateId: null,
												},
											})
											.returning({ id: interactions.id });

										// Check for immediate processing (execucaoAgendadaValor === 0)
										if (campaign.execucaoAgendadaValor === 0 && campaign.whatsappTemplate && whatsappConnection && campaign.whatsappConexaoTelefoneId) {
											// Query client data for immediate processing
											const clientData = await tx.query.clients.findFirst({
												where: (fields, { eq }) => eq(fields.id, buyerClientId),
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

										// Generate campaign cashback for CASHBACK-ACUMULADO trigger (FIXO only)
										if (campaign.cashbackGeracaoAtivo && campaign.cashbackGeracaoTipo === "FIXO" && campaign.cashbackGeracaoValor) {
											const cashbackGenerationResult = await generateCashbackForCampaign({
												tx,
												organizationId: organization.id,
												clientId: saleClientId,
												campaignId: campaign.id,
												cashbackType: "FIXO",
												cashbackValue: campaign.cashbackGeracaoValor,
												saleValue: saleValue,
												saleId: saleId,
												expirationMeasure: campaign.cashbackGeracaoExpiracaoMedida,
												expirationValue: campaign.cashbackGeracaoExpiracaoValor,
											});

											if (cashbackGenerationResult) {
												updateCashbackBalanceInMap(
													existingCashbackProgramBalancesMap,
													saleClientId,
													cashbackProgram.id,
													cashbackGenerationResult.clientNewAvailableBalance,
													cashbackGenerationResult.clientNewAccumulatedTotal,
												);
											}
										}
									}
								}
							}
						}
					}
					if (isValidSale && saleClientId && isNewSale) {
						const clientData = existingClientsMap.get(OnlineSale.cliente);
						const newTotalPurchaseCount = (clientData?.metadataTotalCompras ?? 0) + 1;
						const newTotalPurchaseValue = (clientData?.metadataValorTotalCompras ?? 0) + Number(OnlineSale.valor);
						await tx
							.update(clients)
							.set({
								ultimaCompraData: saleDate,
								ultimaCompraId: saleId,
								metadataTotalCompras: newTotalPurchaseCount,
								metadataValorTotalCompras: newTotalPurchaseValue,
							})
							.where(and(eq(clients.id, saleClientId), eq(clients.organizacaoId, organization.id)));
					}
				}

				console.log(
					`[ORG: ${organization.id}] [INFO] [DATA_COLLECTING] [SALES] Created ${createdSalesCount} sales and updated ${updatedSalesCount} sales.`,
				);
			});

			// Process interactions immediately after transaction (with delay to avoid rate limiting)
			if (immediateProcessingDataList.length > 0) {
				console.log(`[ORG: ${organization.id}] [INFO] Processing ${immediateProcessingDataList.length} immediate interactions`);
				for (const processingData of immediateProcessingDataList) {
					processSingleInteractionImmediately(processingData).catch((err) =>
						console.error(`[IMMEDIATE_PROCESS] Failed to process interaction ${processingData.interactionId}:`, err),
					);
					await delay(100); // Small delay between sends to avoid rate limiting
				}
			}
		} catch (error) {
			console.error(`[ORG: ${organization.id}] [ERROR] Running into error for the data collecting cron`, error);
			await db.insert(utils).values({
				organizacaoId: organization.id,
				identificador: "ONLINE_IMPORTATION",
				valor: {
					identificador: "ONLINE_IMPORTATION",
					dados: {
						organizacaoId: organization.id,
						data: currentDateFormatted,
						erro: JSON.stringify(error, Object.getOwnPropertyNames(error)),
						descricao: `Tentativa de importação de vendas do Online Software ${currentDateFormatted}.`,
					},
				},
			});
		}
	}

	console.log("[INFO] [DATA_COLLECTING] Processing Concluded successfully.");
	return res.status(201).json("EXECUTADO COM SUCESSO");
};

export default handleOnlineSoftwareImportation;
