import { createCardapioWebClient, fetchAllCardapioWebOrders, fetchOrderDetailsInBatches } from ".";
import { computeListingSignature, partitionListingByKnownSignature } from "../listing-signature";
import type {
	TCanonicalClient,
	TCanonicalDeliveryMode,
	TCanonicalConnectorBatch,
	TCanonicalImportWindow,
	TCanonicalPartner,
	TCanonicalProduct,
	TCanonicalProductAddOn,
	TCanonicalProductAddOnOption,
	TCanonicalSale,
	TCanonicalSaleItem,
	TDataConnectorFetchInput,
} from "../types";
import { extractAllCardapioWebData, type MappedCardapioWebClient, type MappedCardapioWebPartner, type MappedCardapioWebSale } from "./mappers";
import type { TCardapioWebConfig, TGetCardapioWebOrderDetailsOutput, TGetCardapioWebOrderHistoryOutput } from "./types";

function mapDeliveryMode(value: string): TCanonicalDeliveryMode {
	if (value === "PRESENCIAL" || value === "RETIRADA" || value === "ENTREGA" || value === "COMANDA") return value;
	return null;
}

function toCanonicalClient(client: MappedCardapioWebClient | null): TCanonicalClient | null {
	if (!client) return null;

	return {
		externalId: client.idExterno,
		name: client.nome,
		phone: client.telefone,
		basePhone: client.telefoneBase,
		location: {
			cep: client.localizacaoCep,
			state: client.localizacaoEstado,
			city: client.localizacaoCidade,
			neighborhood: client.localizacaoBairro,
			street: client.localizacaoLogradouro,
			number: client.localizacaoNumero,
			latitude: client.localizacaoLatitude,
			longitude: client.localizacaoLongitude,
		},
	};
}

function toCanonicalPartner(partner: MappedCardapioWebPartner | null): TCanonicalPartner | null {
	if (!partner) return null;

	return {
		identifier: partner.identificador,
		name: partner.nome,
		affiliateCode: partner.identificador,
	};
}

function toCanonicalSaleItem(item: MappedCardapioWebSale["itens"][number]): TCanonicalSaleItem {
	return {
		productExternalId: item.produtoIdExterno,
		productCode: item.produtoCodigo,
		quantity: item.quantidade,
		unitSaleValue: item.valorVendaUnitario,
		unitCostValue: 0,
		grossSaleValue: item.valorVendaTotalBruto,
		discountValue: item.valorTotalDesconto,
		netSaleValue: item.valorVendaTotalLiquido,
		totalCostValue: 0,
		notes: item.observacao,
		modifiers: item.options.map((option) => ({
			addOnExternalId: option.addOnIdExterno,
			optionExternalId: option.optionIdExterno,
			quantity: option.quantidade,
			unitValue: option.valorUnitario,
		})),
	};
}

function toCanonicalSale(sale: MappedCardapioWebSale): TCanonicalSale {
	const totalSurcharge = sale.taxaEntrega + sale.taxaServico + sale.taxaAdicional;

	return {
		sourceSaleId: sale.idExterno,
		displayId: sale.displayId,
		totalValue: sale.valorTotal,
		totalCost: sale.custoTotal,
		totalDiscount: sale.descontoTotal,
		totalSurcharge,
		sellerName: "CARDAPIO WEB",
		channel: sale.salesChannel,
		deliveryMode: mapDeliveryMode(sale.entregaModalidade),
		partnerIdentifier: sale.parceiro?.identificador ?? null,
		key: "N/A",
		document: sale.documento ?? "N/A",
		model: "CARDAPIO-WEB",
		movement: sale.timing,
		nature: sale.natureza,
		series: "N/A",
		statusText: sale.natureza,
		type: sale.tipo,
		notes: sale.observacao,
		occurredAt: sale.dataVenda,
		client: toCanonicalClient(sale.cliente),
		seller: null,
		partner: toCanonicalPartner(sale.parceiro),
		items: sale.itens.map(toCanonicalSaleItem),
		isValidSale: sale.isValidSale,
		isCanceled: sale.isCanceled,
	};
}

export function toCanonicalCardapioWebImportBatch({
	organizationId,
	window,
	orders,
}: {
	organizationId: string;
	window: TCanonicalImportWindow;
	orders: TGetCardapioWebOrderDetailsOutput[];
}): TCanonicalConnectorBatch {
	const extracted = extractAllCardapioWebData(orders);

	return {
		source: "CARDAPIO-WEB",
		organizationId,
		window,
		policies: {
			saleItemRewritePolicy: "INSERT_ONLY_FOR_NEW_SALES",
			clientResolutionStrategy: "EXTERNAL_ID_THEN_PHONE",
		},
		sales: extracted.sales.map(toCanonicalSale),
		products: extracted.products.map<TCanonicalProduct>((product) => ({
			externalId: product.idExterno,
			code: product.codigo,
			description: product.nome,
			unit: product.unidade,
			group: product.grupo,
			ncm: product.ncm,
			type: product.tipo,
		})),
		sellers: [],
		partners: extracted.partners.map((partner) => ({
			identifier: partner.identificador,
			name: partner.nome,
			affiliateCode: partner.identificador,
		})),
		productAddOns: extracted.productAddOns.map<TCanonicalProductAddOn>((addOn) => ({
			externalId: addOn.idExterno,
			name: addOn.nome,
			minOptions: addOn.minOpcoes,
			maxOptions: addOn.maxOpcoes,
		})),
		productAddOnOptions: extracted.productAddOnOptions.map<TCanonicalProductAddOnOption>((option) => ({
			externalId: option.idExterno,
			addOnExternalId: option.addOnIdExterno,
			name: option.nome,
			code: option.codigo,
			priceDelta: option.precoDelta,
			maxQuantityPerItem: option.maxQtdePorItem,
		})),
		raw: orders,
	};
}

/**
 * A listagem só traz pedidos fechados ou cancelados (estados finais), com `status` e `updated_at`:
 * um pedido que mudou depois de gravado muda um dos dois.
 */
export function getCardapioWebListingSignature(order: Pick<TGetCardapioWebOrderHistoryOutput["orders"][number], "status" | "updated_at">) {
	return computeListingSignature("CARDAPIO-WEB", { status: order.status, updatedAt: order.updated_at });
}

export async function fetchCardapioWebImportBatch({
	organizationId,
	integrationId,
	config,
	window,
	resolveKnownListingSignatures,
}: {
	organizationId: string;
	integrationId: string;
	config: TCardapioWebConfig;
	window: TCanonicalImportWindow;
	resolveKnownListingSignatures?: TDataConnectorFetchInput["resolveKnownListingSignatures"];
}) {
	const client = createCardapioWebClient(config);
	const orderSummaries = await fetchAllCardapioWebOrders(client, window.startDate.toISOString(), window.endDate.toISOString(), ["closed", "canceled"]);
	if (orderSummaries.length === 0) return toCanonicalCardapioWebImportBatch({ organizationId, window, orders: [] });

	const known = resolveKnownListingSignatures ? await resolveKnownListingSignatures(orderSummaries.map((order) => order.id.toString())) : null;
	const { toFetch, unchanged } = partitionListingByKnownSignature({
		items: orderSummaries,
		getSourceSaleId: (order) => order.id.toString(),
		getSignature: getCardapioWebListingSignature,
		known,
	});
	if (known) {
		console.log(
			`[CARDAPIO-WEB] [INTEGRATION: ${integrationId}] ${unchanged.length} pedido(s) já gravado(s) sem mudança na listagem; detalhando ${toFetch.length}.`,
		);
	}

	const orders = await fetchOrderDetailsInBatches(
		client,
		toFetch.map((order) => order.id),
	);
	const listingSignatures = new Map(toFetch.map((order) => [order.id.toString(), getCardapioWebListingSignature(order)]));
	const batch = toCanonicalCardapioWebImportBatch({ organizationId, window, orders });
	return {
		...batch,
		// Pedido cujo detalhe falhou nem entra no lote (é refeito no próximo run): toda venda do lote
		// veio do detalhe e pode ser carimbada.
		sales: batch.sales.map((sale) => {
			const listingSignature = listingSignatures.get(sale.sourceSaleId);
			return listingSignature ? { ...sale, listingSignature } : sale;
		}),
	};
}
