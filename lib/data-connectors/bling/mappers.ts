import { formatPhoneAsBase, formatToCEP, formatToCPForCNPJ, formatToPhone } from "@/lib/formatting";
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
import type { TBlingContact, TBlingProduct, TBlingSale, TBlingSaleItem } from "./types";

function toStringId(value: string | number | null | undefined) {
	if (value === null || value === undefined || value === "") return null;
	return String(value);
}

function compactJoin(values: Array<string | null | undefined>, separator = " - ") {
	return values.filter((value): value is string => !!value && value.trim().length > 0).join(separator);
}

function getSaleStatusText(sale: TBlingSale) {
	return compactJoin([toStringId(sale.situacao?.nome), toStringId(sale.situacao?.valor), toStringId(sale.situacao?.id)]) || "N/A";
}

function parseSaleDate(sale: TBlingSale) {
	const rawDate = sale.dataSaida || sale.data || sale.dataPrevista;
	const parsedDate = rawDate ? dayjs(rawDate) : null;
	if (!parsedDate?.isValid()) throw new Error(`Data inválida recebida do Bling. pedido="${toStringId(sale.id) ?? "N/A"}" data="${rawDate ?? "N/A"}"`);
	return parsedDate.toDate();
}

function getStatusSearchText(status: string | number | null | undefined) {
	return String(status ?? "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toUpperCase();
}

export function isBlingCanceledSaleStatus(status: string | number | null | undefined) {
	const value = getStatusSearchText(status);
	return value.includes("CANCEL") || value === "2";
}

export function isBlingValidSaleStatus(status: string | number | null | undefined) {
	const value = getStatusSearchText(status);
	if (!value || isBlingCanceledSaleStatus(value)) return false;
	if (value.includes("RASCUNHO") || value.includes("ORCAMENTO")) return false;
	return value.includes("CONFIRM") || value.includes("FATUR") || value.includes("ATEND") || value === "1" || value === "9";
}

function normalizeSituacaoNumber(value: string | number | null | undefined) {
	if (value === null || value === undefined || value === "") return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

/**
 * `situacao.valor` é o tipo padrão do Bling, herdado também pelas situações personalizadas;
 * `situacao.id` identifica a situação (as padrão têm id fixo). O detalhe do pedido não traz `nome`.
 */
const BLING_SITUACAO_VALOR = { EM_ABERTO: 0, ATENDIDO: 1, CANCELADO: 2 } as const;
const BLING_SITUACAO_ID = { EM_ABERTO: 6, ATENDIDO: 9, CANCELADO: 12 } as const;

/**
 * Classifica pelos números da situação. Até 2026-11-21 a regra comparava o texto montado
 * "valor - id" (ex.: "1 - 9") com "1"/"9" isolados e nunca casava: pedido Atendido ficava sem
 * status (deixava de contar como compra) e Cancelado não era reconhecido como cancelamento.
 *
 * - Atendido (valor 1, qualquer id): venda válida.
 * - Em aberto: válida só na situação padrão (id 6), não nas personalizadas derivadas dela
 *   (ex.: "aguardando pagamento") — regra de 451c317b.
 * - Cancelado (valor 2, qualquer id): cancelada.
 * - Sem números: o nome decide, quando vier. Demais situações (Em digitação, Em andamento…): nem
 *   válida nem cancelada.
 */
export function classifyBlingSaleSituacao(situacao: TBlingSale["situacao"]): { isValidSale: boolean; isCanceled: boolean } {
	const valor = normalizeSituacaoNumber(situacao?.valor);
	const id = normalizeSituacaoNumber(situacao?.id);

	if (valor === BLING_SITUACAO_VALOR.CANCELADO || (valor === null && id === BLING_SITUACAO_ID.CANCELADO))
		return { isValidSale: false, isCanceled: true };
	if (valor === BLING_SITUACAO_VALOR.ATENDIDO || (valor === null && id === BLING_SITUACAO_ID.ATENDIDO))
		return { isValidSale: true, isCanceled: false };
	if (id === BLING_SITUACAO_ID.EM_ABERTO && (valor === BLING_SITUACAO_VALOR.EM_ABERTO || valor === null))
		return { isValidSale: true, isCanceled: false };
	if (valor !== null || id !== null) return { isValidSale: false, isCanceled: false };

	const nome = toStringId(situacao?.nome);
	if (!nome) return { isValidSale: false, isCanceled: false };
	if (isBlingCanceledSaleStatus(nome)) return { isValidSale: false, isCanceled: true };
	return { isValidSale: isBlingValidSaleStatus(nome), isCanceled: false };
}

export function mapBlingContactToCanonicalClient(contact: TBlingContact | null | undefined): TCanonicalClient | null {
	if (!contact) return null;

	const rawPhone = contact.celular || contact.telefone || "";
	const basePhone = formatPhoneAsBase(rawPhone);
	const externalId = toStringId(contact.id);
	const name = contact.nome || contact.fantasia || (basePhone ? `CLIENTE BLING ${basePhone}` : "CLIENTE BLING");
	const address = contact.endereco?.geral;

	if (!externalId && !basePhone && !name) return null;

	return {
		externalId,
		name,
		phone: formatToPhone(rawPhone),
		basePhone,
		cpfCnpj: formatToCPForCNPJ(contact.numeroDocumento ?? ""),
		email: contact.email,
		location: address
			? {
					cep: address.cep ? formatToCEP(address.cep) : null,
					state: address.uf,
					city: address.municipio,
					neighborhood: address.bairro,
					street: address.endereco,
					number: address.numero,
					complement: address.complemento,
				}
			: undefined,
	};
}

function getProductCode(product: TBlingProduct) {
	return product.codigo || toStringId(product.id) || "PRODUTO-BLING";
}

export function mapBlingProductToCanonicalProduct(product: TBlingProduct): TCanonicalProduct {
	const code = getProductCode(product);
	return {
		externalId: toStringId(product.id),
		code,
		description: product.nome || product.descricaoCurta || code,
		unit: product.unidade || "UN",
		group: product.categoria?.descricao || "Bling",
		ncm: product.tributacao?.ncm || "N/A",
		type: product.tipo || "PRODUTO",
	};
}

function getItemProductCode(item: TBlingSaleItem) {
	return item.codigo || toStringId(item.produto?.id) || toStringId(item.id) || "PRODUTO-BLING";
}

export function mapBlingSaleItemToCanonicalSaleItem(item: TBlingSaleItem): TCanonicalSaleItem {
	const quantity = item.quantidade;
	const unitSaleValue = item.valor;
	const grossSaleValue = unitSaleValue * quantity;
	const discountValue = item.desconto > 0 && item.desconto <= 100 ? grossSaleValue * (item.desconto / 100) : item.desconto;
	const netSaleValue = Math.max(grossSaleValue - discountValue, 0);

	return {
		productExternalId: toStringId(item.produto?.id),
		productCode: getItemProductCode(item),
		quantity,
		unitSaleValue,
		unitCostValue: 0,
		grossSaleValue,
		discountValue,
		netSaleValue,
		totalCostValue: 0,
		notes: item.descricaoDetalhada,
		metadata: {
			itemId: toStringId(item.id),
			unit: item.unidade,
			description: item.descricao,
		},
	};
}

function mapDeliveryMode(sale: TBlingSale): TCanonicalDeliveryMode {
	if ((sale.transporte?.frete ?? 0) > 0) return "ENTREGA";
	return null;
}

export function mapBlingSaleToCanonicalSale({ sale }: { sale: TBlingSale }): TCanonicalSale {
	const sourceSaleId = toStringId(sale.id);
	if (!sourceSaleId) throw new Error("[BLING_MAPPER] Pedido de venda recebido sem ID.");

	const statusText = getSaleStatusText(sale);
	const { isValidSale: validSale, isCanceled: canceled } = classifyBlingSaleSituacao(sale.situacao);
	const itemDiscount = sale.itens.reduce((acc, item) => acc + mapBlingSaleItemToCanonicalSaleItem(item).discountValue, 0);
	const explicitDiscount = sale.desconto?.valor ?? 0;
	const totalSurcharge = (sale.transporte?.frete ?? 0) + sale.outrasDespesas;

	return {
		sourceSaleId,
		displayId: sale.numero || sale.numeroLoja,
		totalValue: sale.total || sale.totalProdutos + totalSurcharge - explicitDiscount,
		totalCost: 0,
		totalDiscount: explicitDiscount || itemDiscount,
		totalSurcharge,
		sellerName: sale.vendedor?.nome || "BLING",
		channel: "Bling",
		deliveryMode: mapDeliveryMode(sale),
		partnerIdentifier: null,
		key: sourceSaleId,
		document: sale.numero || sourceSaleId,
		model: "BLING",
		movement: "VENDA",
		nature: validSale ? "SN01" : "SN99",
		series: "N/A",
		statusText,
		type: "VENDA",
		notes: sale.observacoes,
		occurredAt: parseSaleDate(sale),
		client: mapBlingContactToCanonicalClient(sale.contato),
		seller: sale.vendedor?.nome
			? {
					identifier: toStringId(sale.vendedor.id) || sale.vendedor.nome,
					name: sale.vendedor.nome,
				}
			: null,
		partner: null,
		items: sale.itens.map(mapBlingSaleItemToCanonicalSaleItem),
		isValidSale: validSale,
		isCanceled: canceled,
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

export function toCanonicalBlingImportBatch({
	organizationId,
	window,
	sales,
	contacts,
	products,
}: {
	organizationId: string;
	window: TCanonicalImportWindow;
	sales: TBlingSale[];
	contacts: TBlingContact[];
	products: TBlingProduct[];
}): TCanonicalConnectorBatch {
	const contactsById = new Map(
		contacts.map((contact) => [toStringId(contact.id), contact]).filter((entry): entry is [string, TBlingContact] => !!entry[0]),
	);
	const canonicalSales = sales.map((sale) =>
		mapBlingSaleToCanonicalSale({
			sale: {
				...sale,
				contato: (sale.contato?.id ? contactsById.get(String(sale.contato.id)) : null) ?? sale.contato,
			},
		}),
	);
	const itemProducts = sales.flatMap((sale) =>
		sale.itens.map<TCanonicalProduct>((item) => ({
			externalId: toStringId(item.produto?.id),
			code: getItemProductCode(item),
			description: item.descricao || getItemProductCode(item),
			unit: item.unidade || "UN",
			group: "Bling",
			ncm: "N/A",
			type: "PRODUTO",
		})),
	);

	return {
		source: "BLING",
		organizationId,
		window,
		policies: {
			saleItemRewritePolicy: "REPLACE_ON_EVERY_SYNC",
			clientResolutionStrategy: "EXTERNAL_ID_THEN_PHONE",
		},
		sales: canonicalSales,
		products: uniqueBy([...products.map(mapBlingProductToCanonicalProduct), ...itemProducts], (product) => product.code),
		sellers: uniqueBy(
			canonicalSales.map((sale) => sale.seller).filter((seller): seller is NonNullable<TCanonicalSale["seller"]> => !!seller),
			(seller) => seller.identifier,
		),
		partners: [],
		productAddOns: [],
		productAddOnOptions: [],
		raw: { sales, contacts, products },
	};
}
