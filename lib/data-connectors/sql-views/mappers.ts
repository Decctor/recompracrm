import { formatPhoneAsBase, formatToCEP, formatToCPForCNPJ, formatToPhone } from "@/lib/formatting";
import type {
	TCanonicalClient,
	TCanonicalConnectorBatch,
	TCanonicalDeliveryMode,
	TCanonicalImportWindow,
	TCanonicalProduct,
	TCanonicalSale,
	TCanonicalSaleItem,
	TCanonicalSeller,
} from "../types";
import {
	SQL_VIEWS_ANONYMOUS_CLIENT_NAMES,
	type TSqlViewsClientRow,
	type TSqlViewsProductRow,
	type TSqlViewsSaleItemRow,
	type TSqlViewsSaleRow,
} from "./types";

const DELIVERY_MODES = new Set<NonNullable<TCanonicalDeliveryMode>>(["PRESENCIAL", "RETIRADA", "ENTREGA", "COMANDA"]);

const CHANNEL_LABELS: Record<string, string> = {
	LOJA: "Loja Física",
	DELIVERY: "Delivery",
};

function normalizeName(value: string) {
	return value
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.trim()
		.toUpperCase();
}

const ANONYMOUS_CLIENT_NAMES = new Set(SQL_VIEWS_ANONYMOUS_CLIENT_NAMES);

/**
 * Venda ao "CLIENTE PADRÃO" é venda sem cliente. O cadastro genérico costuma ter um telefone
 * fictício, e importá-lo juntaria pelo telefone clientes reais ao genérico.
 */
export function isSqlViewsAnonymousClient({
	clientId,
	name,
	anonymousClientIds,
}: {
	clientId: string | null;
	name: string | null;
	anonymousClientIds: string[];
}) {
	if (!clientId && !name) return true;
	if (clientId && anonymousClientIds.includes(clientId)) return true;
	return !!name && ANONYMOUS_CLIENT_NAMES.has(normalizeName(name));
}

/**
 * Telefone de preenchimento ("3433333333", "3400000000", "9999999999"): o assinante (o que vem
 * depois do DDD) é um dígito só repetido. Muitos clientes do ERP dividem o mesmo número fictício
 * e, como o casamento cai para o telefone, todos virariam um cliente só.
 */
export function isPlaceholderPhone(basePhone: string) {
	const subscriber = basePhone.slice(2);
	return subscriber.length >= 8 && /^(\d)\1+$/.test(subscriber);
}

function pickClientPhone(candidates: Array<string | null | undefined>) {
	for (const candidate of candidates) {
		const basePhone = formatPhoneAsBase(candidate ?? "");
		if (basePhone && !isPlaceholderPhone(basePhone)) return { rawPhone: candidate as string, basePhone };
	}
	return { rawPhone: "", basePhone: "" };
}

export function mapSqlViewsClient({
	sale,
	client,
	anonymousClientIds,
}: {
	sale: TSqlViewsSaleRow;
	client: TSqlViewsClientRow | null | undefined;
	anonymousClientIds: string[];
}): TCanonicalClient | null {
	const name = client?.nome || client?.nome_fantasia || sale.cliente_nome;
	if (isSqlViewsAnonymousClient({ clientId: sale.cliente_id, name, anonymousClientIds })) return null;

	const { rawPhone, basePhone } = pickClientPhone([client?.telefone, client?.telefone_secundario, sale.cliente_telefone]);
	const birthDate = client?.data_nascimento ? new Date(`${client.data_nascimento}T00:00:00.000Z`) : null;

	return {
		externalId: sale.cliente_id,
		name: name || (basePhone ? `CLIENTE ${basePhone}` : `CLIENTE ${sale.cliente_id}`),
		phone: basePhone ? formatToPhone(rawPhone) : "",
		basePhone,
		cpfCnpj: formatToCPForCNPJ(client?.cpf_cnpj || sale.cliente_cpf_cnpj || "") || null,
		stateRegistration: client?.inscricao_estadual,
		email: client?.email,
		birthDate,
		location: client
			? {
					cep: client.cep ? formatToCEP(client.cep) : null,
					state: client.estado,
					city: client.cidade,
					neighborhood: client.bairro,
					street: client.logradouro,
					number: client.numero,
					complement: client.complemento,
				}
			: undefined,
	};
}

export function mapSqlViewsSeller(sale: TSqlViewsSaleRow): TCanonicalSeller | null {
	if (!sale.vendedor_id) return null;
	return { identifier: sale.vendedor_id, name: sale.vendedor_nome || sale.vendedor_id };
}

function getItemProductCode(item: TSqlViewsSaleItemRow) {
	return item.produto_codigo || item.produto_id || "PRODUTO-ERP";
}

export function mapSqlViewsSaleItem(item: TSqlViewsSaleItemRow): TCanonicalSaleItem {
	const quantity = item.quantidade || 1;
	const grossSaleValue = item.valor_bruto || item.valor_unitario * quantity;
	const netSaleValue = item.valor_liquido || Math.max(grossSaleValue - item.valor_desconto, 0);
	const totalCostValue = item.custo_total || item.custo_unitario * quantity;

	return {
		productExternalId: item.produto_id,
		productCode: getItemProductCode(item),
		quantity,
		unitSaleValue: item.valor_unitario || grossSaleValue / quantity,
		unitCostValue: item.custo_unitario || totalCostValue / quantity,
		grossSaleValue,
		discountValue: item.valor_desconto,
		netSaleValue,
		totalCostValue,
		metadata: {
			itemId: item.item_id,
			sequence: item.sequencia,
			description: item.produto_descricao,
			unit: item.unidade,
		},
	};
}

export function mapSqlViewsProduct(product: TSqlViewsProductRow): TCanonicalProduct {
	const code = product.codigo || product.produto_id;
	const description = [product.descricao, product.variante_descricao].filter(Boolean).join(" - ");
	return {
		externalId: product.produto_id,
		code,
		description: description || code,
		unit: product.unidade || "UN",
		group: product.grupo || "N/A",
		ncm: product.ncm || "N/A",
		type: product.tipo || "PRODUTO",
	};
}

function mapItemProduct(item: TSqlViewsSaleItemRow): TCanonicalProduct {
	const code = getItemProductCode(item);
	return {
		externalId: item.produto_id,
		code,
		description: item.produto_descricao || code,
		unit: item.unidade || "UN",
		group: "N/A",
		ncm: "N/A",
		type: "PRODUTO",
	};
}

function mapDeliveryMode(value: string | null): TCanonicalDeliveryMode {
	const normalized = value?.toUpperCase() as TCanonicalDeliveryMode;
	return normalized && DELIVERY_MODES.has(normalized) ? normalized : null;
}

export function mapSqlViewsSale({
	sale,
	items,
	client,
	anonymousClientIds,
}: {
	sale: TSqlViewsSaleRow;
	items: TSqlViewsSaleItemRow[];
	client: TSqlViewsClientRow | null | undefined;
	anonymousClientIds: string[];
}): TCanonicalSale {
	const canonicalItems = items.map(mapSqlViewsSaleItem);
	const status = sale.status_codigo?.toUpperCase() ?? null;
	const isCanceled = status === "CANCELADA";
	const isValidSale = status === "CONCLUIDA" && sale.valor_total > 0;
	const channel = sale.canal ? (CHANNEL_LABELS[sale.canal.toUpperCase()] ?? sale.canal) : null;

	return {
		sourceSaleId: sale.venda_id,
		displayId: sale.venda_numero,
		totalValue: sale.valor_total,
		totalCost: canonicalItems.reduce((total, item) => total + item.totalCostValue, 0),
		totalDiscount: canonicalItems.reduce((total, item) => total + item.discountValue, 0),
		totalSurcharge: 0,
		sellerName: sale.vendedor_nome || "N/A",
		channel,
		deliveryMode: mapDeliveryMode(sale.modalidade_entrega),
		partnerIdentifier: null,
		key: sale.documento_fiscal_chave || "N/A",
		document: sale.documento_fiscal_numero || sale.venda_numero || sale.venda_id,
		model: sale.documento_fiscal_modelo || "N/A",
		movement: "VENDA",
		nature: isValidSale ? "SN01" : "SN99",
		series: sale.documento_fiscal_serie || "N/A",
		statusText: sale.status_original || status || "N/A",
		type: "VENDA",
		occurredAt: sale.data_venda,
		client: mapSqlViewsClient({ sale, client, anonymousClientIds }),
		seller: mapSqlViewsSeller(sale),
		partner: null,
		items: canonicalItems,
		isValidSale,
		isCanceled,
		raw: sale,
	};
}

function uniqueBy<T>(values: T[], getKey: (value: T) => string | null | undefined) {
	const map = new Map<string, T>();
	for (const value of values) {
		const key = getKey(value);
		if (!key || map.has(key)) continue;
		map.set(key, value);
	}
	return Array.from(map.values());
}

export function toCanonicalSqlViewsImportBatch({
	organizationId,
	window,
	sales,
	items,
	clients,
	products,
	anonymousClientIds,
}: {
	organizationId: string;
	window: TCanonicalImportWindow;
	sales: TSqlViewsSaleRow[];
	items: TSqlViewsSaleItemRow[];
	clients: TSqlViewsClientRow[];
	products: TSqlViewsProductRow[];
	anonymousClientIds: string[];
}): TCanonicalConnectorBatch {
	const itemsBySaleId = new Map<string, TSqlViewsSaleItemRow[]>();
	for (const item of [...items].sort((left, right) => left.sequencia - right.sequencia)) {
		itemsBySaleId.set(item.venda_id, [...(itemsBySaleId.get(item.venda_id) ?? []), item]);
	}
	const clientsById = new Map(clients.map((client) => [client.cliente_id, client]));

	const canonicalSales = sales.map((sale) =>
		mapSqlViewsSale({
			sale,
			items: itemsBySaleId.get(sale.venda_id) ?? [],
			client: sale.cliente_id ? clientsById.get(sale.cliente_id) : null,
			anonymousClientIds,
		}),
	);

	return {
		source: "SQL-VIEWS",
		organizationId,
		window,
		policies: {
			saleItemRewritePolicy: "REPLACE_ON_EVERY_SYNC",
			clientResolutionStrategy: "EXTERNAL_ID_THEN_PHONE",
		},
		sales: canonicalSales,
		// Cadastro da view primeiro: o fallback do item só cobre produto ausente da view.
		products: uniqueBy([...products.map(mapSqlViewsProduct), ...items.map(mapItemProduct)], (product) => product.code),
		sellers: uniqueBy(
			canonicalSales.map((sale) => sale.seller).filter((seller): seller is TCanonicalSeller => !!seller),
			(seller) => seller.identifier,
		),
		partners: [],
		productAddOns: [],
		productAddOnOptions: [],
		raw: { sales, items },
	};
}
