import { reverseSaleCashback } from "@/lib/cashback/reverse-sale-cashback";
import { formatPhoneAsBase, formatToCPForCNPJ, formatToPhone } from "@/lib/formatting";
import { OnlineSoftwareSaleImportationSchema } from "@/schemas/online-importation.schema";
import { db } from "@/services/drizzle";
import { clients, partners, products, saleItems, sales, sellers } from "@/services/drizzle/schema";
import axios from "axios";
import dayjs from "dayjs";
import dayjsCustomFormatter from "dayjs/plugin/customParseFormat";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import type { NextApiHandler } from "next";
import { z } from "zod";
dayjs.extend(dayjsCustomFormatter);

export const config = {
	maxDuration: 300, // 5 minutes - longer than data-collecting due to larger date range
};

/**
 * Fix Previous Sales Cron Job
 *
 * This cron job syncs sales from the previous 5 days (excluding today) to catch any ERP updates
 * missed by the real-time data-collecting cron.
 *
 * Key differences from data-collecting:
 * - Date range: Previous 5 days (excluding today) instead of current day only
 * - No campaign triggering (NOVA-COMPRA, PRIMEIRA-COMPRA, CASHBACK-ACUMULADO)
 * - No cashback program balance updates
 * - No conversion attribution processing
 * - Only updates client's ultimaCompraData and ultimaCompraId (not primeiraCompraData)
 *
 * Schedule: Daily at 4 AM (before RFM at 5 AM and reports at 6 AM)
 */
const handleFixPreviousSales: NextApiHandler<string> = async (req, res) => {
	// Security check
	const authHeader = req.headers.authorization;
	if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
		return res.status(401).json("Unauthorized" as unknown as string);
	}

	// Calculate date range: previous 5 days (excluding today)
	const startDate = dayjs().subtract(5, "day").startOf("day");
	const endDate = dayjs().subtract(1, "day").endOf("day");
	const startDateFormatted = '01022026'  // startDate.format("DDMMYYYY");
	const endDateFormatted = '28022026'  // endDate.format("DDMMYYYY");

	console.log(`[INFO] [FIX_PREVIOUS_SALES] Processing date range: ${startDateFormatted} to ${endDateFormatted}`);

	const organizations = await db.query.organizations.findMany({
		columns: {
			id: true,
			integracaoTipo: true,
			integracaoConfiguracao: true,
		},
	});

	for (const organization of organizations) {
		if (organization.integracaoTipo !== "ONLINE-SOFTWARE") {
			console.log(`[ORG: ${organization.id}] [INFO] [FIX_PREVIOUS_SALES] Organization does not have ONLINE-SOFTWARE integration type.`);
			continue;
		}

		try {
			const onlineSoftwareConfig = organization.integracaoConfiguracao as { tipo: "ONLINE-SOFTWARE"; token: string };
			// Fetching data from the online software API
			const { data: onlineAPIResponse } = await axios.post("https://onlinesoftware.com.br/planodecontas/apirestweb/vends/listvends.php", {
				token: onlineSoftwareConfig.token,
				rotina: "listarVendas001",
				dtinicio: startDateFormatted,
				dtfim: endDateFormatted,
			});

			const OnlineSoftwareSales = z
				.array(OnlineSoftwareSaleImportationSchema, {
					required_error: "Payload da Online não é uma lista.",
					invalid_type_error: "Tipo não permitido para o payload.",
				})
				.parse(onlineAPIResponse.resultado);

			console.log(`[ORG: ${organization.id}] [INFO] [FIX_PREVIOUS_SALES] ${OnlineSoftwareSales.length} vendas encontradas.`);

			const OnlineSoftwareSalesIds = OnlineSoftwareSales.map((sale) => sale.id);

			await db.transaction(async (tx) => {
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
						ultimaCompraData: true,
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
					},
				});

				const existingSalesMap = new Map(existingSales.map((sale) => [sale.idExterno, sale]));
				const existingClientsMap = new Map(
					existingClients.map((client) => [
						client.nome,
						{
							id: client.id,
							lastPurchaseDate: client.ultimaCompraData,
						},
					]),
				);
				const existingProductsMap = new Map(existingProducts.map((product) => [product.codigo, product.id]));
				const existingSellersMap = new Map(existingSellers.map((seller) => [seller.nome, seller.id]));
				const existingPartnersMap = new Map(existingPartners.map((partner) => [partner.identificador, partner.id]));

				let createdSalesCount = 0;
				let updatedSalesCount = 0;

				for (const [OnlineSaleIndex, OnlineSale] of OnlineSoftwareSales.entries()) {
					if (OnlineSaleIndex % 100 === 0) {
						console.log(`[ORG: ${organization.id}] [INFO] [FIX_PREVIOUS_SALES] Processing sale ${OnlineSaleIndex + 1} of ${OnlineSoftwareSales.length}...`);
					}

					const onlineBaseSaleDate = dayjs(OnlineSale.data, "DD/MM/YYYY");
					// Use the online sale date + 3 hours (to compensate for lack of time component in Online date field)
					const saleDate = onlineBaseSaleDate.add(3, "hours").toDate();
					const isValidSale = OnlineSale.natureza === "SN01";

					// First, we check for an existing client with the same name (in this case, our primary key for the integration)
					const isValidClient = OnlineSale.cliente !== "AO CONSUMIDOR";

					if (!isValidClient)
						console.log(`[ORG: ${organization.id}] [INFO] [DATA_COLLECTING] [CLIENT] Non-identified client detected: ${OnlineSale.cliente}`);

					const equivalentSaleClient = isValidClient ? existingClientsMap.get(OnlineSale.cliente) : null;
					// Initalize the saleClientId holder with the existing client (if any)
					let saleClientId = equivalentSaleClient?.id;


					if (!saleClientId && isValidClient) {
						console.log(`[ORG: ${organization.id}] [INFO] [FIX_PREVIOUS_SALES] Creating new client for ${OnlineSale.cliente}`);
						// If no existing client is found, we create a new one
						// Note: For fix-previous-sales, we don't set primeiraCompraData as this should be handled by data-collecting
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
						saleClientId = insertedClientId;
						existingClientsMap.set(OnlineSale.cliente, {
							id: insertedClientId,
							lastPurchaseDate: isValidSale ? saleDate : null,
						});
					}

					// Check for existing seller
					const isValidSeller = !!OnlineSale.vendedor && OnlineSale.vendedor !== "N/A" && OnlineSale.vendedor !== "0";
					const equivalentSaleSeller = isValidSeller ? existingSellersMap.get(OnlineSale.vendedor) : null;
					let saleSellerId = equivalentSaleSeller;

					if (!saleSellerId && isValidSeller) {
						const insertedSellerResponse = await tx
							.insert(sellers)
							.values({ organizacaoId: organization.id, nome: OnlineSale.vendedor || "N/A", identificador: OnlineSale.vendedor || "N/A" })
							.returning({ id: sellers.id });
						const insertedSellerId = insertedSellerResponse[0]?.id;
						if (!insertedSellerResponse) throw new createHttpError.InternalServerError("Oops, um erro ocorreu ao criar vendedor.");
						saleSellerId = insertedSellerId;
						existingSellersMap.set(OnlineSale.vendedor, insertedSellerId);
					}

					// Check for existing partner
					const isValidPartner = OnlineSale.parceiro && OnlineSale.parceiro !== "N/A" && OnlineSale.parceiro !== "0";
					const equivalentSalePartner = isValidPartner ? existingPartnersMap.get(OnlineSale.parceiro as string) : null;
					let salePartnerId = equivalentSalePartner;

					if (!salePartnerId && isValidPartner) {
						const insertedPartnerResponse = await tx
							.insert(partners)
							.values({
								organizacaoId: organization.id,
								nome: "NÃO DEFINIDO",
								identificador: OnlineSale.parceiro || "N/A",
								cpfCnpj: formatToCPForCNPJ(OnlineSale.parceiro || "N/A"),
							})
							.returning({ id: partners.id });
						const insertedPartnerId = insertedPartnerResponse[0]?.id;
						if (!insertedPartnerResponse) throw new createHttpError.InternalServerError("Oops, um erro ocorreu ao criar parceiro.");
						salePartnerId = insertedPartnerId;
						existingPartnersMap.set(OnlineSale.parceiro || "N/A", insertedPartnerId);
					}

					let saleId = null;
					const existingSale = existingSalesMap.get(OnlineSale.id);

					if (!existingSale) {
						// Create new sale
						const saleTotalCost = OnlineSale.itens.reduce((acc: number, current) => acc + Number(current.vcusto), 0);
						const insertedSaleResponse = await tx
							.insert(sales)
							.values({
								organizacaoId: organization.id,
								idExterno: OnlineSale.id,
								clienteId: saleClientId ?? null,
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
								dataVenda: saleDate,
							})
							.returning({
								id: sales.id,
							});
						const insertedSaleId = insertedSaleResponse[0]?.id;
						if (!insertedSaleResponse) throw new createHttpError.InternalServerError("Oops, um erro ocorreu ao criar venda.");

						// Insert sale items
						for (const item of OnlineSale.itens) {
							const equivalentProduct = existingProductsMap.get(item.codigo);
							let productId = equivalentProduct;

							if (!productId) {
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
								productId = insertedProductId;
								existingProductsMap.set(item.codigo, insertedProductId);
							}

							const quantidade = Number(item.qtde);
							const valorVendaUnitario = Number(item.valorunit);
							const valorVendaTotalBruto = valorVendaUnitario * quantidade;
							const valorTotalDesconto = Number(item.vdesc);
							const valorVendaTotalLiquido = valorVendaTotalBruto - valorTotalDesconto;
							const valorCustoTotal = Number(item.vcusto);

							await tx.insert(saleItems).values({
								organizacaoId: organization.id,
								vendaId: insertedSaleId,
								clienteId: saleClientId ?? null,
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

						saleId = insertedSaleId;
						createdSalesCount++;
					} else {
						// Update existing sale
						const saleTotalCost = OnlineSale.itens.reduce((acc: number, current) => acc + Number(current.vcusto), 0);
						await tx
							.update(sales)
							.set({
								organizacaoId: organization.id,
								idExterno: OnlineSale.id,
								clienteId: saleClientId ?? null,
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
								dataVenda: saleDate,
							})
							.where(eq(sales.id, existingSale.id));

						// Check if sale was canceled
						const wasPreviouslyValid = existingSale.natureza === "SN01" && existingSale.valorTotal > 0;
						const isNowCanceled = OnlineSale.natureza !== "SN01" || Number(OnlineSale.valor) === 0;

						if (wasPreviouslyValid && isNowCanceled && saleClientId) {
							console.log(
								`[ORG: ${organization.id}] [FIX_PREVIOUS_SALES] [SALE_CANCELED] ` + `Venda ${OnlineSale.id} foi cancelada. Revertendo cashback...`,
							);

							await reverseSaleCashback({
								tx,
								saleId: existingSale.id,
								clientId: saleClientId,
								organizationId: organization.id,
								reason: "VENDA_CANCELADA_RETROATIVA",
							});
						}

						// Delete existing items and re-insert
						await tx.delete(saleItems).where(and(eq(saleItems.vendaId, existingSale.id), eq(saleItems.organizacaoId, organization.id)));

						for (const item of OnlineSale.itens) {
							const equivalentProduct = existingProductsMap.get(item.codigo);
							let productId = equivalentProduct;

							if (!productId) {
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
								productId = insertedProductId;
								existingProductsMap.set(item.codigo, insertedProductId);
							}

							const quantidade = Number(item.qtde);
							const valorVendaUnitario = Number(item.valorunit);
							const valorVendaTotalBruto = valorVendaUnitario * quantidade;
							const valorTotalDesconto = Number(item.vdesc);
							const valorVendaTotalLiquido = valorVendaTotalBruto - valorTotalDesconto;
							const valorCustoTotal = Number(item.vcusto);

							await tx.insert(saleItems).values({
								organizacaoId: organization.id,
								vendaId: existingSale.id,
								clienteId: saleClientId ?? null,
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

						saleId = existingSale.id;
						updatedSalesCount++;
					}

					// Update client's last purchase date only (not first purchase date)
					if (isValidSale && saleClientId) {
						const clientLastPurchaseDate = existingClientsMap.get(OnlineSale.cliente)?.lastPurchaseDate;
						// Only update if this sale is more recent than the current last purchase date
						if (!clientLastPurchaseDate || saleDate > clientLastPurchaseDate) {
							await tx
								.update(clients)
								.set({
									ultimaCompraData: saleDate,
									ultimaCompraId: saleId,
								})
								.where(and(eq(clients.id, saleClientId), eq(clients.organizacaoId, organization.id)));

							// Update the map for subsequent iterations
							existingClientsMap.set(OnlineSale.cliente, {
								id: saleClientId,
								lastPurchaseDate: saleDate,
							});
						}
					}
				}

				console.log(`[ORG: ${organization.id}] [INFO] [FIX_PREVIOUS_SALES] Created ${createdSalesCount} sales and updated ${updatedSalesCount} sales.`);
			});
		} catch (error) {
			console.error(`[ORG: ${organization.id}] [ERROR] [FIX_PREVIOUS_SALES] Error processing organization:`, error);
		}
	}

	console.log("[INFO] [FIX_PREVIOUS_SALES] Processing concluded successfully.");
	return res.status(201).json("EXECUTADO COM SUCESSO");
};

export default handleFixPreviousSales;
