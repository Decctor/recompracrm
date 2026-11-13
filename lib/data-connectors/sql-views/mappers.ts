import { formatPhoneAsBase, formatToCEP, formatToCPForCNPJ, formatToPhone } from "@/lib/formatting";
import { RECORD_ONLY_INTEGRATION_CHANNELS } from "@/lib/sales/fulfillment-channels/policy";
import type {
	TCanonicalClient,
	TCanonicalConnectorBatch,
	TCanonicalDeliveryMode,
	TCanonicalImportWindow,
	TCanonicalProduct,
	TCanonicalSale,
	TCanonicalSaleItem,
	TCanonicalSalePayment,
	TCanonicalSeller,
} from "../types";
import {
	PaymentMethodEnum,
	type TPaymentMethodEnum,
	type TSqlViewsClientPhoneFieldEnum,
	type TSqlViewsPaymentTranslationEnum,
} from "@/schemas/enums";
import type { TSaleIntegrationMetadata } from "@/schemas/sales";
import {
	SQL_VIEWS_ANONYMOUS_CLIENT_NAMES,
	type TSqlViewsClientRow,
	type TSqlViewsMetadataRow,
	type TSqlViewsProductRow,
	type TSqlViewsSaleItemRow,
	type TSqlViewsSalePaymentRow,
	type TSqlViewsSaleRow,
} from "./types";

const DELIVERY_MODES = new Set<NonNullable<TCanonicalDeliveryMode>>(["PRESENCIAL", "RETIRADA", "ENTREGA", "COMANDA"]);

const CHANNEL_LABELS: Record<string, string> = {
	LOJA: "Loja Física",
	DELIVERY: "Delivery",
};

function normalizeName(value: string) {
	return value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();
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

/** Primeiro telefone aproveitável, na ordem: cadastro, secundário do cadastro, linha da venda. */
function pickClientPhone({ sale, client }: { sale: TSqlViewsSaleRow; client: TSqlViewsClientRow | null | undefined }) {
	const candidates: Array<{ field: TSqlViewsClientPhoneFieldEnum; value: string | null | undefined }> = [
		{ field: "TELEFONE", value: client?.telefone },
		{ field: "TELEFONE_SECUNDARIO", value: client?.telefone_secundario },
		{ field: "CLIENTE_TELEFONE", value: sale.cliente_telefone },
	];
	for (const { field, value } of candidates) {
		const basePhone = formatPhoneAsBase(value ?? "");
		if (basePhone && !isPlaceholderPhone(basePhone)) return { rawPhone: value as string, basePhone, field };
	}
	return { rawPhone: "", basePhone: "", field: null };
}

/** Cliente canônico e a coluna de onde saiu o telefone (`phoneField`, null sem telefone). */
export function mapSqlViewsClient({
	sale,
	client,
	anonymousClientIds,
}: {
	sale: TSqlViewsSaleRow;
	client: TSqlViewsClientRow | null | undefined;
	anonymousClientIds: string[];
}): { client: TCanonicalClient | null; phoneField: TSqlViewsClientPhoneFieldEnum | null } {
	const name = client?.nome || client?.nome_fantasia || sale.cliente_nome;
	if (isSqlViewsAnonymousClient({ clientId: sale.cliente_id, name, anonymousClientIds })) return { client: null, phoneField: null };

	const { rawPhone, basePhone, field } = pickClientPhone({ sale, client });
	const birthDate = client?.data_nascimento ? new Date(`${client.data_nascimento}T00:00:00.000Z`) : null;

	const canonicalClient: TCanonicalClient = {
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
	return { client: canonicalClient, phoneField: field };
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

/** Chave da tradução de formas: maiúsculas, sem acento, espaços colapsados ("Convênio " → "CONVENIO"). */
export function normalizePaymentFormLabel(value: string) {
	return normalizeName(value).replace(/\s+/g, " ");
}

/**
 * Forma da fonte → `PaymentMethodEnum`: a tradução configurada na integração para o rótulo original
 * vence; sem ela, a forma que a própria fonte mandou; forma fora do enum vira OUTRO.
 */
export function translateSqlViewsPaymentMethod(
	payment: TSqlViewsSalePaymentRow,
	paymentMethodMapping: Record<string, TPaymentMethodEnum>,
): { original: string | null; metodo: TPaymentMethodEnum; traducao: TSqlViewsPaymentTranslationEnum } {
	const original = payment.forma_pagamento_original ?? payment.forma_pagamento;
	const normalizedMapping = Object.fromEntries(
		Object.entries(paymentMethodMapping).map(([label, metodo]) => [normalizePaymentFormLabel(label), metodo]),
	);
	const configured = original ? normalizedMapping[normalizePaymentFormLabel(original)] : undefined;
	if (configured) return { original, metodo: configured, traducao: "MAPEAMENTO_INTEGRACAO" };
	const sourceMethod = PaymentMethodEnum.safeParse(payment.forma_pagamento?.toUpperCase());
	if (sourceMethod.success) return { original, metodo: sourceMethod.data, traducao: "FONTE" };
	return { original, metodo: "OUTRO", traducao: "PADRAO_OUTRO" };
}

export function mapSqlViewsSalePayment(
	payment: TSqlViewsSalePaymentRow,
	paymentMethodMapping: Record<string, TPaymentMethodEnum>,
): TCanonicalSalePayment {
	const { original, metodo } = translateSqlViewsPaymentMethod(payment, paymentMethodMapping);
	return {
		metodo,
		valor: payment.valor,
		pagoOnline: payment.pago_online ?? false,
		descricao: original,
		trocoPara: payment.troco_para,
		formaOriginal: original,
	};
}

/**
 * `sales.integracaoMetadados` da venda vinda das views: a base comum preenchida de forma neutra
 * (venda de balcão do ERP: sem frete, desconto de canal nem taxa) e o bloco `sqlViews` com os
 * dados de entrada de cada decisão da importação. `pagamentos` só existe quando a fonte expõe a
 * view de pagamentos, e cada forma entra como a fonte mandou, já traduzida para `metodo`.
 */
function buildSqlViewsIntegrationMetadata({
	sale,
	source,
	phoneField,
	payments,
	canonicalPayments,
	paymentMethodMapping,
}: {
	sale: TSqlViewsSaleRow;
	source: TSqlViewsMetadataRow | null;
	phoneField: TSqlViewsClientPhoneFieldEnum | null;
	payments: TSqlViewsSalePaymentRow[] | null;
	canonicalPayments: TCanonicalSalePayment[] | null;
	paymentMethodMapping: Record<string, TPaymentMethodEnum>;
}): TSaleIntegrationMetadata {
	return {
		versao: 1,
		canal: RECORD_ONLY_INTEGRATION_CHANNELS.SQL_VIEWS,
		entrega: { realizadaPor: null, valorFrete: 0 },
		descontos: { loja: 0, patrocinados: [] },
		taxasCanal: [],
		// Opcional só presente com valor: a assinatura de importação omite chaves ausentes.
		...(canonicalPayments
			? {
					pagamentos: {
						prePago: 0,
						pendente: 0,
						metodos: canonicalPayments.map(({ metodo, valor, pagoOnline, descricao, trocoPara }) => ({
							metodo,
							valor,
							pagoOnline,
							descricao: descricao ?? null,
							...(trocoPara ? { trocoPara } : {}),
						})),
					},
				}
			: {}),
		sqlViews: {
			sistema: source?.sistema_nome ?? null,
			contratoVersao: source?.contrato_versao ?? null,
			lojaId: sale.loja_id,
			statusCodigo: sale.status_codigo,
			statusOriginal: sale.status_original,
			clienteId: sale.cliente_id,
			telefoneCampo: phoneField,
			formasPagamento: payments?.map((payment) => translateSqlViewsPaymentMethod(payment, paymentMethodMapping)) ?? null,
		},
	};
}

export function mapSqlViewsSale({
	sale,
	items,
	client,
	anonymousClientIds,
	payments = null,
	paymentMethodMapping = {},
	source = null,
}: {
	sale: TSqlViewsSaleRow;
	items: TSqlViewsSaleItemRow[];
	client: TSqlViewsClientRow | null | undefined;
	anonymousClientIds: string[];
	/** null = a fonte não expõe a view de pagamentos. */
	payments?: TSqlViewsSalePaymentRow[] | null;
	paymentMethodMapping?: Record<string, TPaymentMethodEnum>;
	/** Linha de `vw_recompra_metadados` do lote (sistema e versão do contrato). */
	source?: TSqlViewsMetadataRow | null;
}): TCanonicalSale {
	const canonicalItems = items.map(mapSqlViewsSaleItem);
	const status = sale.status_codigo?.toUpperCase() ?? null;
	const isCanceled = status === "CANCELADA";
	const isValidSale = status === "CONCLUIDA" && sale.valor_total > 0;
	const channel = sale.canal ? (CHANNEL_LABELS[sale.canal.toUpperCase()] ?? sale.canal) : null;
	const { client: canonicalClient, phoneField } = mapSqlViewsClient({ sale, client, anonymousClientIds });
	const canonicalPayments = payments ? payments.map((payment) => mapSqlViewsSalePayment(payment, paymentMethodMapping)) : null;

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
		client: canonicalClient,
		seller: mapSqlViewsSeller(sale),
		partner: null,
		items: canonicalItems,
		isValidSale,
		isCanceled,
		payments: canonicalPayments,
		integrationMetadata: buildSqlViewsIntegrationMetadata({ sale, source, phoneField, payments, canonicalPayments, paymentMethodMapping }),
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
	payments = null,
	paymentMethodMapping = {},
	source = null,
}: {
	organizationId: string;
	window: TCanonicalImportWindow;
	sales: TSqlViewsSaleRow[];
	items: TSqlViewsSaleItemRow[];
	clients: TSqlViewsClientRow[];
	products: TSqlViewsProductRow[];
	anonymousClientIds: string[];
	/** null = a fonte não expõe a view de pagamentos; toda venda chega com `payments = null`. */
	payments?: TSqlViewsSalePaymentRow[] | null;
	paymentMethodMapping?: Record<string, TPaymentMethodEnum>;
	source?: TSqlViewsMetadataRow | null;
}): TCanonicalConnectorBatch {
	const itemsBySaleId = new Map<string, TSqlViewsSaleItemRow[]>();
	for (const item of [...items].sort((left, right) => left.sequencia - right.sequencia)) {
		itemsBySaleId.set(item.venda_id, [...(itemsBySaleId.get(item.venda_id) ?? []), item]);
	}
	const paymentsBySaleId = new Map<string, TSqlViewsSalePaymentRow[]>();
	for (const payment of payments ?? []) {
		paymentsBySaleId.set(payment.venda_id, [...(paymentsBySaleId.get(payment.venda_id) ?? []), payment]);
	}
	const clientsById = new Map(clients.map((client) => [client.cliente_id, client]));

	const canonicalSales = sales.map((sale) =>
		mapSqlViewsSale({
			sale,
			items: itemsBySaleId.get(sale.venda_id) ?? [],
			client: sale.cliente_id ? clientsById.get(sale.cliente_id) : null,
			anonymousClientIds,
			payments: payments ? (paymentsBySaleId.get(sale.venda_id) ?? []) : null,
			paymentMethodMapping,
			source,
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
