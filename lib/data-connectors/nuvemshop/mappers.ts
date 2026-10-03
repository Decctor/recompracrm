import { formatPhoneAsBase, formatToCPForCNPJ, formatToPhone } from "@/lib/formatting";
import { normalizeGtin } from "@/lib/products/gtin";
import dayjs from "dayjs";
import type {
	TCanonicalClient,
	TCanonicalDeliveryMode,
	TCanonicalConnectorBatch,
	TCanonicalImportWindow,
	TCanonicalProduct,
	TCanonicalSale,
	TCanonicalSaleItem,
} from "../types";
import type { TNuvemshopOrder, TNuvemshopOrderProduct, TNuvemshopProduct, TNuvemshopProductVariant } from "./types";

function stripBrazilCountryCode(phone: string) {
	const digits = phone.replace(/\D/g, "");
	if (digits.startsWith("55") && digits.length > 11) return digits.slice(2);
	return digits;
}

function toStringId(value: string | number | null | undefined) {
	if (value === null || value === undefined || value === "") return null;
	return String(value);
}

function compactJoin(values: Array<string | null | undefined>, separator = " - ") {
	return values.filter((value): value is string => !!value && value.trim().length > 0).join(separator);
}

function pickLocalizedValue(value: Record<string, string | null | undefined>) {
	return value.pt || value["pt-BR"] || value.es || value.en || Object.values(value).find((item) => !!item) || null;
}

function stripHtml(value: string | null) {
	if (!value) return null;
	const text = value
		.replace(/<[^>]*>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	return text.length > 0 ? text : null;
}

function parseOrderDate(order: TNuvemshopOrder) {
	const completedDate = order.completed_at?.date ? dayjs(order.completed_at.date.replace(" ", "T")) : null;
	if (completedDate?.isValid()) return completedDate.toDate();

	const createdAt = dayjs(order.created_at);
	if (!createdAt.isValid()) throw new Error(`Data inválida recebida da Nuvem Shop. pedido="${order.id}" created_at="${order.created_at}"`);
	return createdAt.toDate();
}

function mapDeliveryMode(order: TNuvemshopOrder): TCanonicalDeliveryMode {
	if (order.shipping_status || order.shipping_cost_customer > 0 || order.shipping_cost_owner > 0) return "ENTREGA";
	if (order.storefront === "pos") return "PRESENCIAL";
	return null;
}

function getClientName(order: TNuvemshopOrder) {
	return order.customer?.name || order.contact_name || order.billing_name || "CLIENTE NUVEM SHOP";
}

function getClientPhone(order: TNuvemshopOrder) {
	return order.customer?.phone || order.contact_phone || order.billing_phone || "";
}

export function mapNuvemshopClient(order: TNuvemshopOrder): TCanonicalClient | null {
	const phone = stripBrazilCountryCode(getClientPhone(order));
	const basePhone = formatPhoneAsBase(phone);
	const name = getClientName(order);
	const externalId = toStringId(order.customer?.id);

	if (!externalId && !basePhone && !name) return null;

	return {
		externalId,
		name,
		phone: formatToPhone(phone),
		basePhone,
		cpfCnpj: formatToCPForCNPJ(order.customer?.identification || order.contact_identification || ""),
		email: order.customer?.email || order.contact_email || null,
		location: {
			cep: order.customer?.billing_zipcode || order.billing_zipcode,
			state: order.customer?.billing_province || order.billing_province,
			city: order.customer?.billing_city || order.billing_city,
			neighborhood: order.customer?.billing_locality || order.billing_locality,
			street: order.customer?.billing_address || order.billing_address,
			number: order.customer?.billing_number || order.billing_number,
			complement: order.customer?.billing_floor || order.billing_floor,
		},
	};
}

function getProductCode(product: TNuvemshopOrderProduct) {
	return product.sku || toStringId(product.variant_id) || toStringId(product.product_id) || toStringId(product.id) || "PRODUTO-NUVEM-SHOP";
}

export function mapNuvemshopProduct(product: TNuvemshopOrderProduct): TCanonicalProduct {
	const productCode = getProductCode(product);

	return {
		externalId: toStringId(product.product_id),
		code: productCode,
		description: product.name_without_variants || product.name || productCode,
		unit: "UN",
		group: "Nuvem Shop",
		ncm: "N/A",
		type: "PRODUTO",
	};
}

function getCatalogProductCode(product: TNuvemshopProduct, variant: TNuvemshopProductVariant | null) {
	return variant?.sku || toStringId(variant?.id) || toStringId(variant?.product_id) || toStringId(product.id) || "PRODUTO-NUVEM-SHOP";
}

function getCatalogProductImageUrl(product: TNuvemshopProduct) {
	const images = product.images.filter((image) => !!image.src);
	if (images.length === 0) return null;

	let firstImage = images[0];
	for (const image of images) {
		if ((image.position ?? Number.MAX_SAFE_INTEGER) < (firstImage.position ?? Number.MAX_SAFE_INTEGER)) {
			firstImage = image;
		}
	}
	return firstImage.src;
}

function getCatalogProductGroup(product: TNuvemshopProduct) {
	const firstNamedCategory = product.categories.find(
		(category): category is Extract<(typeof product.categories)[number], { name: Record<string, string | null | undefined> }> =>
			typeof category === "object" && category !== null && "name" in category,
	);

	return (firstNamedCategory ? pickLocalizedValue(firstNamedCategory.name) : null) || product.brand || "Nuvem Shop";
}

// Nomes dos eixos vêm de product.attributes, pareados posicionalmente com cada variant.values.
function getCatalogAxisNames(product: TNuvemshopProduct): string[] {
	return (product.attributes ?? []).map((attribute, index) => pickLocalizedValue(attribute)?.trim() || `Opção ${index + 1}`);
}

// Estruturado = tem eixos declarados E variantes que carregam valores (ex: vestuário Cor × Tamanho).
function isStructuredCatalogProduct(product: TNuvemshopProduct): boolean {
	const axisCount = product.attributes?.length ?? 0;
	return axisCount > 0 && product.variants.some((variant) => (variant.values?.length ?? 0) > 0);
}

function buildVariantValueLabels(variant: TNuvemshopProductVariant, axisNames: string[]): Array<{ opcao: string; valor: string }> {
	const labels: Array<{ opcao: string; valor: string }> = [];
	variant.values.forEach((value, index) => {
		const valor = pickLocalizedValue(value)?.trim();
		if (!valor) return;
		labels.push({ opcao: axisNames[index] ?? `Opção ${index + 1}`, valor });
	});
	return labels;
}

function variantSalePrice(variant: TNuvemshopProductVariant | null) {
	return variant?.promotional_price && variant.promotional_price > 0 ? variant.promotional_price : (variant?.price ?? 0);
}

export type TNuvemshopCatalogOption = { nome: string; valores: string[] };
export type TNuvemshopCatalogVariant = {
	idExterno: string;
	codigo: string;
	// GTIN validado (`normalizeGtin`); código inválido ou ausente vira null.
	codigoBarras: string | null;
	nome: string;
	precoVenda: number;
	precoCusto: number | null;
	quantidade: number | null;
	controlaEstoque: boolean;
	ativo: boolean;
	imagemCapaUrl: string | null;
	valores: Array<{ opcao: string; valor: string }>;
};
export type TNuvemshopCatalogProduct = {
	idExterno: string;
	codigo: string;
	// GTIN validado (`normalizeGtin`); código inválido ou ausente vira null.
	codigoBarras: string | null;
	nome: string;
	descricao: string | null;
	imagemCapaUrl: string | null;
	unidade: string;
	grupo: string;
	ncm: string;
	tipo: string;
	ativo: boolean;
	controlaEstoque: boolean;
	precoVenda: number;
	precoCusto: number | null;
	quantidade: number | null;
	options: TNuvemshopCatalogOption[];
	variants: TNuvemshopCatalogVariant[];
};

export function mapNuvemshopCatalogProduct(product: TNuvemshopProduct): TNuvemshopCatalogProduct {
	const productId = toStringId(product.id) ?? getCatalogProductCode(product, null);
	const productName = pickLocalizedValue(product.name) || `Produto ${productId}`;
	const baseFields = {
		nome: productName,
		descricao: stripHtml(pickLocalizedValue(product.description)),
		imagemCapaUrl: getCatalogProductImageUrl(product),
		unidade: "UN",
		grupo: getCatalogProductGroup(product),
		ncm: "N/A",
		tipo: "PRODUTO",
		ativo: product.published,
	};

	// Produto simples (sem eixos): a única variante vira o próprio produto, como antes.
	if (!isStructuredCatalogProduct(product)) {
		const variant = product.variants[0] ?? null;
		return {
			idExterno: productId,
			codigo: getCatalogProductCode(product, variant),
			codigoBarras: normalizeGtin(variant?.barcode),
			...baseFields,
			controlaEstoque: variant?.stock_management ?? false,
			precoVenda: variantSalePrice(variant),
			precoCusto: variant?.cost ?? null,
			quantidade: variant?.stock ?? null,
			options: [],
			variants: [],
		};
	}

	const axisNames = getCatalogAxisNames(product);

	const options: TNuvemshopCatalogOption[] = axisNames.map((nome, axisIndex) => {
		const valores: string[] = [];
		for (const variant of product.variants) {
			const valor = pickLocalizedValue(variant.values[axisIndex] ?? {})?.trim();
			if (valor && !valores.includes(valor)) valores.push(valor);
		}
		return { nome, valores };
	});

	const variants: TNuvemshopCatalogVariant[] = product.variants.map((variant) => {
		const valores = buildVariantValueLabels(variant, axisNames);
		return {
			idExterno: toStringId(variant.id) ?? getCatalogProductCode(product, variant),
			codigo: getCatalogProductCode(product, variant),
			codigoBarras: normalizeGtin(variant.barcode),
			nome: valores.length > 0 ? valores.map((value) => value.valor).join(" / ") : productName,
			precoVenda: variantSalePrice(variant),
			precoCusto: variant.cost ?? null,
			quantidade: variant.stock ?? null,
			controlaEstoque: variant.stock_management ?? false,
			ativo: product.published,
			imagemCapaUrl: null,
			valores,
		};
	});

	// Preço base do pai = menor preço entre as variantes (somente para exibição na listagem).
	const precoVenda = variants.reduce((min, variant) => (variant.precoVenda < min ? variant.precoVenda : min), variants[0]?.precoVenda ?? 0);

	return {
		idExterno: productId,
		codigo: `NS-${productId}`,
		// Produto com variantes: cada variante carrega o próprio GTIN.
		codigoBarras: null,
		...baseFields,
		controlaEstoque: product.variants.some((variant) => variant.stock_management),
		precoVenda,
		precoCusto: null,
		quantidade: null,
		options,
		variants,
	};
}

export function mapNuvemshopStructuredCatalog(products: TNuvemshopProduct[]): TNuvemshopCatalogProduct[] {
	return uniqueBy(products.map(mapNuvemshopCatalogProduct), (product) => product.codigo);
}

export function mapNuvemshopSaleItem(product: TNuvemshopOrderProduct): TCanonicalSaleItem {
	const quantity = product.quantity;
	const unitSaleValue = product.price;
	const unitCostValue = product.cost;
	const grossSaleValue = unitSaleValue * quantity;
	const totalCostValue = unitCostValue * quantity;

	return {
		productExternalId: toStringId(product.product_id),
		productCode: getProductCode(product),
		quantity,
		unitSaleValue,
		unitCostValue,
		grossSaleValue,
		discountValue: 0,
		netSaleValue: grossSaleValue,
		totalCostValue,
		metadata: {
			lineItemId: toStringId(product.id),
			variantId: toStringId(product.variant_id),
			barcode: product.barcode,
			properties: product.properties,
		},
	};
}

export function isValidNuvemshopSale(order: TNuvemshopOrder) {
	return order.status !== "cancelled" && (order.payment_status === "paid" || order.payment_status === "partially_paid");
}

export function mapNuvemshopSale(order: TNuvemshopOrder): TCanonicalSale {
	const totalCost = order.products.reduce((acc, product) => acc + product.cost * product.quantity, 0);
	const isValidSale = isValidNuvemshopSale(order);
	const isCanceled = order.status === "cancelled" || order.payment_status === "voided" || order.payment_status === "refunded";

	return {
		sourceSaleId: String(order.id),
		displayId: toStringId(order.number),
		totalValue: order.total,
		totalCost,
		totalDiscount: order.discount,
		totalSurcharge: order.shipping_cost_customer + order.shipping_cost_owner,
		sellerName: "NUVEM SHOP",
		channel: order.storefront,
		deliveryMode: mapDeliveryMode(order),
		partnerIdentifier: null,
		key: "N/A",
		document: toStringId(order.number) ?? "N/A",
		model: "NUVEM-SHOP",
		movement: order.storefront ?? "N/A",
		nature: isValidSale ? "SN01" : "SN99",
		series: "N/A",
		statusText: compactJoin([order.status, order.payment_status, order.shipping_status]),
		type: "VENDA",
		notes: order.note,
		occurredAt: parseOrderDate(order),
		client: mapNuvemshopClient(order),
		seller: null,
		partner: null,
		items: order.products.map(mapNuvemshopSaleItem),
		isValidSale,
		isCanceled,
		raw: order,
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

export function toCanonicalNuvemshopImportBatch({
	organizationId,
	window,
	orders,
}: {
	organizationId: string;
	window: TCanonicalImportWindow;
	orders: TNuvemshopOrder[];
}): TCanonicalConnectorBatch {
	const sales = orders.map(mapNuvemshopSale);
	const products = uniqueBy(
		orders.flatMap((order) => order.products.map(mapNuvemshopProduct)),
		(product) => product.code,
	);

	return {
		source: "NUVEM-SHOP",
		organizationId,
		window,
		policies: {
			saleItemRewritePolicy: "REPLACE_ON_EVERY_SYNC",
			clientResolutionStrategy: "EXTERNAL_ID_THEN_PHONE",
		},
		sales,
		products,
		sellers: [],
		partners: [],
		productAddOns: [],
		productAddOnOptions: [],
		raw: orders,
	};
}
