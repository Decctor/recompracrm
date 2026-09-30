import { formatPhoneAsBase, formatToCEP, formatToCPForCNPJ, formatToPhone } from "@/lib/formatting";
import type { TPaymentMethodEnum, TSaleAttendanceStatusEnum } from "@/schemas/enums";
import type { TSaleIntegrationMetadata } from "@/schemas/sales";
import dayjs from "dayjs";
import type {
	TCanonicalClient,
	TCanonicalDeliveryMode,
	TCanonicalConnectorBatch,
	TCanonicalImportWindow,
	TCanonicalProduct,
	TCanonicalSale,
	TCanonicalSaleItem,
	TCanonicalSalePayment,
} from "../types";
import type { TIfoodEvent, TIfoodOrder, TIfoodOrderAdditionalFee, TIfoodOrderBenefit, TIfoodOrderItem } from "./types";

type TIfoodOrderEventState = {
	statusText: string | null;
	confirmedAt: string | null;
	concludedAt: string | null;
	cancelledAt: string | null;
	/**
	 * Solicitacao de cancelamento REGISTRADA e ainda sem desfecho. Informativa — nao exige resposta
	 * da loja (o iFood emite CANCELLATION_REQUESTED logo apos o requestCancellation da propria
	 * loja). Fica FORA de `statusText` de proposito: o pedido continua no estagio em que estava
	 * (segue para preparo/entrega se a solicitacao for rejeitada), entao tratar isto como avanco de
	 * status corromperia o quadro. Zerada pelo desfecho: CANCELLED (efetivado) ou
	 * CANCELLATION_REQUEST_FAILED (rejeitado, pedido segue).
	 */
	cancellationRequestedAt: string | null;
	cancellationRequestReason: string | null;
	/**
	 * Disputa de cancelamento ABERTA na Plataforma de Negociação (HANDSHAKE_DISPUTE) — exige
	 * resposta da loja antes do prazo, senão o iFood executa a acao de timeout. Encerrada por
	 * HANDSHAKE_SETTLEMENT ou pelo desfecho terminal do pedido (CANCELLED/CONCLUDED).
	 */
	dispute: NonNullable<TSaleIntegrationMetadata["disputaAberta"]> | null;
};

// Codigos do evento de cancelamento SOLICITADO (curto e completo).
const IFOOD_CANCELLATION_REQUESTED_CODES = new Set(["CAR", "CANCELLATION_REQUESTED"]);
// Solicitacao de cancelamento REJEITADA: o pedido segue vivo no estagio em que estava.
const IFOOD_CANCELLATION_REQUEST_FAILED_CODES = new Set(["CARF", "CANCELLATION_REQUEST_FAILED"]);
// Plataforma de Negociacao: disputa aberta pelo cliente/iFood e o seu desfecho.
const IFOOD_HANDSHAKE_DISPUTE_CODES = new Set(["HSD", "HANDSHAKE_DISPUTE"]);
const IFOOD_HANDSHAKE_SETTLEMENT_CODES = new Set(["HSS", "HANDSHAKE_SETTLEMENT"]);

function matchesEventCode(event: TIfoodEvent, codes: Set<string>) {
	const code = event.code.toUpperCase();
	const fullCode = event.fullCode?.toUpperCase();
	return codes.has(code) || (!!fullCode && codes.has(fullCode));
}

function isCancellationRequestedEvent(event: TIfoodEvent) {
	return matchesEventCode(event, IFOOD_CANCELLATION_REQUESTED_CODES);
}

function isCancellationRequestFailedEvent(event: TIfoodEvent) {
	return matchesEventCode(event, IFOOD_CANCELLATION_REQUEST_FAILED_CODES);
}

function isHandshakeDisputeEvent(event: TIfoodEvent) {
	return matchesEventCode(event, IFOOD_HANDSHAKE_DISPUTE_CODES);
}

function isHandshakeSettlementEvent(event: TIfoodEvent) {
	return matchesEventCode(event, IFOOD_HANDSHAKE_SETTLEMENT_CODES);
}

function readMetadataString(metadata: Record<string, unknown> | null | undefined, key: string): string | null {
	const value = metadata?.[key];
	if (typeof value === "string" && value.trim()) return value.trim();
	if (typeof value === "number") return String(value);
	return null;
}

/**
 * Metadata do HANDSHAKE_DISPUTE → bloco `disputaAberta`. Shape tolerante (o iFood varia campos
 * entre tipos de disputa): sem `disputeId` nao ha como responder, entao descartamos; o resto cai
 * em null. Valores monetarios ficam como o canal envia (centavos em string).
 */
function parseHandshakeDispute(event: TIfoodEvent): TIfoodOrderEventState["dispute"] {
	const metadata = event.metadata;
	const disputeId = readMetadataString(metadata, "disputeId");
	if (!disputeId) return null;

	const rawAlternatives = Array.isArray(metadata?.alternatives) ? metadata.alternatives : [];
	const alternativas = rawAlternatives
		.filter((alternative): alternative is Record<string, unknown> => !!alternative && typeof alternative === "object")
		.map((alternative) => {
			const alternativeMetadata =
				alternative.metadata && typeof alternative.metadata === "object" ? (alternative.metadata as Record<string, unknown>) : null;
			const maxAmount =
				alternativeMetadata?.maxAmount && typeof alternativeMetadata.maxAmount === "object"
					? (alternativeMetadata.maxAmount as Record<string, unknown>)
					: null;
			const maxAmountValue = readMetadataString(maxAmount, "value");
			return {
				id: readMetadataString(alternative, "id"),
				tipo: readMetadataString(alternative, "type"),
				valorMaximo: maxAmountValue ? { valor: maxAmountValue, moeda: readMetadataString(maxAmount, "currency") } : null,
			};
		});

	return {
		disputaId: disputeId,
		abertaEm: event.createdAt ?? null,
		expiraEm: readMetadataString(metadata, "expiresAt"),
		acao: readMetadataString(metadata, "action"),
		acaoTimeout: readMetadataString(metadata, "timeoutAction"),
		tipo: readMetadataString(metadata, "handshakeType"),
		mensagem: readMetadataString(metadata, "message"),
		alternativas,
	};
}

/**
 * Motivo declarado pelo cliente/iFood. O metadata do evento nao tem shape estavel entre versoes
 * da API — lemos as chaves conhecidas e caimos em null em vez de quebrar a ingestao.
 */
function getCancellationRequestReason(event: TIfoodEvent): string | null {
	const metadata = event.metadata;
	if (!metadata) return null;
	for (const key of ["cancellationReason", "reason", "details", "reasonDetail", "CANCEL_REASON", "cancelReason"]) {
		const value = metadata[key];
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	for (const key of ["cancelCodeId", "reason_code", "reasonCode", "cancellationCode"]) {
		const value = metadata[key];
		if (typeof value === "string" && value.trim()) return value.trim();
		if (typeof value === "number") return String(value);
	}
	return null;
}

const IFOOD_EVENT_STATUS_BY_CODE: Record<string, string> = {
	PLC: "PLACED",
	PLACED: "PLACED",
	CFM: "CONFIRMED",
	CONFIRMED: "CONFIRMED",
	PRS: "PREPARATION_STARTED",
	PREPARATION_STARTED: "PREPARATION_STARTED",
	SPS: "SEPARATION_STARTED",
	SEPARATION_STARTED: "SEPARATION_STARTED",
	SPE: "SEPARATION_ENDED",
	SEPARATION_ENDED: "SEPARATION_ENDED",
	RTP: "READY_TO_PICKUP",
	READY_TO_PICKUP: "READY_TO_PICKUP",
	DSP: "DISPATCHED",
	DISPATCHED: "DISPATCHED",
	COL: "COLLECTED",
	COLLECTED: "COLLECTED",
	CON: "CONCLUDED",
	CONCLUDED: "CONCLUDED",
	CAN: "CANCELLED",
	CANCELLED: "CANCELLED",
	CANCELED: "CANCELED",
};

// Traducao do ciclo de pedido do iFood para o eixo operacional de atendimento da plataforma.
// Status desconhecido retorna null — o mapper canonico cai no comportamento legado.
const IFOOD_ATTENDANCE_STATUS_BY_ORDER_STATUS: Record<string, TSaleAttendanceStatusEnum> = {
	PLACED: "NAO_INICIADO",
	CONFIRMED: "EM_PREPARO",
	PREPARATION_STARTED: "EM_PREPARO",
	SEPARATION_STARTED: "EM_PREPARO",
	SEPARATION_ENDED: "PRONTO",
	READY_TO_PICKUP: "PRONTO",
	DISPATCHED: "EM_ENTREGA",
	COLLECTED: "EM_ENTREGA",
	CONCLUDED: "ENTREGUE",
	CANCELLED: "CANCELADO",
	CANCELED: "CANCELADO",
};

function mapIfoodAttendanceStatus(statusText: string | null): TSaleAttendanceStatusEnum | null {
	if (!statusText) return null;
	return IFOOD_ATTENDANCE_STATUS_BY_ORDER_STATUS[statusText.toUpperCase()] ?? null;
}

// Avanco do ciclo de pedido: usado para escolher o estagio MAIS AVANCADO entre o derivado dos
// eventos e o derivado dos timestamps do pedido. Cancelamento e terminal.
const IFOOD_ORDER_STATUS_RANK: Record<string, number> = {
	PLACED: 1,
	CONFIRMED: 2,
	PREPARATION_STARTED: 3,
	SEPARATION_STARTED: 3,
	SEPARATION_ENDED: 4,
	READY_TO_PICKUP: 4,
	DISPATCHED: 5,
	COLLECTED: 5,
	CONCLUDED: 6,
	CANCELLED: 7,
	CANCELED: 7,
};

/**
 * Estagio derivado dos timestamps do proprio pedido. O `GET /orders/{id}` do iFood nao devolve
 * `status`, e os eventos sao entregues uma unica vez (apos o ACK nao retornam) — sem isto, um
 * evento perdido congelaria a venda no ultimo estagio conhecido para sempre.
 */
function getOrderTimestampStatus(order: TIfoodOrder): string | null {
	if (order.cancelledAt) return "CANCELLED";
	if (order.concludedAt) return "CONCLUDED";
	if (order.confirmedAt) return "CONFIRMED";
	return null;
}

function pickMostAdvancedStatus(...candidates: (string | null | undefined)[]): string | null {
	let best: string | null = null;
	let bestRank = -1;
	for (const candidate of candidates) {
		if (!candidate) continue;
		const normalized = candidate.toUpperCase();
		const rank = IFOOD_ORDER_STATUS_RANK[normalized] ?? 0;
		if (rank > bestRank) {
			best = normalized;
			bestRank = rank;
		}
	}
	return best;
}

function getEventStatus(event: TIfoodEvent) {
	const code = event.code.toUpperCase();
	const fullCode = event.fullCode?.toUpperCase();
	return IFOOD_EVENT_STATUS_BY_CODE[fullCode ?? ""] ?? IFOOD_EVENT_STATUS_BY_CODE[code] ?? null;
}

function getOrderEventState(events: TIfoodEvent[]): TIfoodOrderEventState {
	const state: TIfoodOrderEventState = {
		statusText: null,
		confirmedAt: null,
		concludedAt: null,
		cancelledAt: null,
		cancellationRequestedAt: null,
		cancellationRequestReason: null,
		dispute: null,
	};

	// Eventos podem chegar fora de ordem (garantia at-least-once, sem ordenacao) — o status
	// derivado deve ser o do evento mais recente por createdAt, nao o ultimo do array.
	const orderedEvents = [...events].sort((a, b) => {
		const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
		const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
		return aTime - bTime;
	});

	for (const event of orderedEvents) {
		// Solicitacao de cancelamento nao mexe em statusText — so liga a pendencia informativa.
		if (isCancellationRequestedEvent(event)) {
			state.cancellationRequestedAt = event.createdAt ?? state.cancellationRequestedAt;
			state.cancellationRequestReason = getCancellationRequestReason(event) ?? state.cancellationRequestReason;
			continue;
		}

		// Solicitacao rejeitada: encerra a pendencia sem mexer em statusText — o pedido segue no
		// estagio em que estava (CARF nao e transicao de ciclo).
		if (isCancellationRequestFailedEvent(event)) {
			state.cancellationRequestedAt = null;
			state.cancellationRequestReason = null;
			continue;
		}

		// Disputa da Plataforma de Negociacao: nao mexe em statusText (a negociacao corre em
		// paralelo ao ciclo do pedido). Settlement encerra; disputa sem disputeId e ignorada.
		if (isHandshakeDisputeEvent(event)) {
			state.dispute = parseHandshakeDispute(event) ?? state.dispute;
			continue;
		}
		if (isHandshakeSettlementEvent(event)) {
			state.dispute = null;
			continue;
		}

		const status = getEventStatus(event);
		if (!status) continue;
		state.statusText = status;
		// Eventos vem ordenados por createdAt: qualquer evento de ciclo posterior a solicitacao
		// resolve a pendencia (cancelamento efetivado, ou negado e o pedido seguiu adiante).
		state.cancellationRequestedAt = null;
		state.cancellationRequestReason = null;
		if (status === "CONFIRMED") state.confirmedAt = event.createdAt ?? state.confirmedAt;
		if (status === "CONCLUDED") state.concludedAt = event.createdAt ?? state.concludedAt;
		if (status === "CANCELLED" || status === "CANCELED") state.cancelledAt = event.createdAt ?? state.cancelledAt;
		// Desfecho terminal resolve a disputa (cancelamento efetivado ou pedido concluido); eventos
		// intermediarios NAO — a negociacao corre em paralelo ao preparo/entrega.
		if (status === "CANCELLED" || status === "CANCELED" || status === "CONCLUDED") state.dispute = null;
	}

	return state;
}

function pickOrderDate(order: TIfoodOrder) {
	// A data da venda representa a criação do pedido e não muda com os eventos de atendimento.
	// Preserva o instante da fonte; a conversão para o fuso local pertence à apresentação.
	const rawDate = order.createdAt;
	const parsedDate = rawDate ? dayjs(rawDate) : null;
	if (!parsedDate?.isValid()) throw new Error(`Data inválida recebida do iFood. orderId="${order.id}"`);
	return parsedDate.toDate();
}

function mapDeliveryMode(order: TIfoodOrder): TCanonicalDeliveryMode {
	const orderType = order.orderType?.toUpperCase();
	if (orderType === "DELIVERY") return "ENTREGA";
	if (orderType === "TAKEOUT") return "RETIRADA";
	if (orderType === "DINE_IN" || orderType === "INDOOR") return "PRESENCIAL";
	return null;
}

export function mapIfoodClient(order: TIfoodOrder): TCanonicalClient | null {
	const customer = order.customer;
	if (!customer) return null;

	const rawPhone = customer.phone?.number ?? "";
	const phoneIsTemporary = !!customer.phone?.localizer || rawPhone.replace(/\D/g, "").startsWith("0800");
	const phone = phoneIsTemporary ? "" : rawPhone;
	const basePhone = formatPhoneAsBase(phone);
	const name = customer.name || (basePhone ? `CLIENTE IFOOD ${basePhone}` : "CLIENTE IFOOD");
	const address = order.delivery?.deliveryAddress;

	return {
		externalId: customer.id,
		name,
		phone: formatToPhone(phone),
		basePhone,
		phoneIsTemporary,
		cpfCnpj: formatToCPForCNPJ(customer.documentNumber ?? ""),
		email: customer.email,
		location: address
			? {
					cep: address.postalCode ? formatToCEP(address.postalCode) : null,
					state: address.state,
					city: address.city,
					neighborhood: address.neighborhood,
					street: address.streetName,
					number: address.streetNumber,
					complement: address.complement,
					latitude: address.coordinates?.latitude ?? null,
					longitude: address.coordinates?.longitude ?? null,
				}
			: undefined,
	};
}

function getProductCode(item: TIfoodOrderItem) {
	return item.externalCode || item.id || item.uniqueId || "PRODUTO-IFOOD";
}

export function mapIfoodProduct(item: TIfoodOrderItem): TCanonicalProduct {
	const code = getProductCode(item);
	return {
		externalId: item.id || item.uniqueId,
		code,
		description: item.name || code,
		unit: "UN",
		group: "iFood",
		ncm: "N/A",
		type: "PRODUTO",
	};
}

export function mapIfoodSaleItem(item: TIfoodOrderItem): TCanonicalSaleItem {
	const quantity = item.quantity;
	// Bruto = totalPrice (item + complementos): complementos são receita e compõem a base fiscal.
	// Unitário derivado do bruto para manter a regra da NF (vProd = qCom × vUnCom).
	const grossSaleValue = item.totalPrice || item.unitPrice * quantity;
	const unitSaleValue = quantity > 0 ? grossSaleValue / quantity : grossSaleValue;
	const netSaleValue = grossSaleValue;

	return {
		productExternalId: item.id || item.uniqueId,
		productCode: getProductCode(item),
		quantity,
		unitSaleValue,
		unitCostValue: 0,
		grossSaleValue,
		// Descontos reais da loja (benefits MERCHANT) são rateados depois em allocateMerchantDiscountsToItems.
		discountValue: 0,
		netSaleValue,
		totalCostValue: 0,
		notes: item.observations,
		modifiers: item.options.map((option) => ({
			addOnExternalId: option.groupId || option.groupName || "IFOOD-ADICIONAIS",
			optionExternalId: option.id || option.externalCode || option.name || "IFOOD-ADICIONAL",
			name: option.name ?? undefined,
			quantity: option.quantity,
			unitValue: option.unitPrice,
		})),
		metadata: {
			uniqueId: item.uniqueId,
			options: item.options,
		},
	};
}

function isCanceled(order: TIfoodOrder, eventState: TIfoodOrderEventState) {
	const status = (order.status || eventState.statusText)?.toUpperCase();
	return status === "CANCELLED" || status === "CANCELED" || !!order.cancelledAt || !!eventState.cancelledAt;
}

// Status que implicam pedido confirmado (etapas do ciclo posteriores a confirmacao).
const IFOOD_CONFIRMED_OR_LATER_STATUSES = new Set([
	"CONFIRMED",
	"PREPARATION_STARTED",
	"SEPARATION_STARTED",
	"SEPARATION_ENDED",
	"READY_TO_PICKUP",
	"DISPATCHED",
	"COLLECTED",
	"CONCLUDED",
]);

function isValidSale(order: TIfoodOrder, eventState: TIfoodOrderEventState) {
	const status = (order.status || eventState.statusText)?.toUpperCase();
	return (
		!isCanceled(order, eventState) &&
		((!!status && IFOOD_CONFIRMED_OR_LATER_STATUSES.has(status)) ||
			!!order.confirmedAt ||
			!!eventState.confirmedAt ||
			!!order.concludedAt ||
			!!eventState.concludedAt)
	);
}

function round2(value: number): number {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Divide um benefit entre a parcela da loja (sponsorship MERCHANT — desconto real, reduz a NF)
 * e as parcelas patrocinadas (IFOOD/EXTERNAL/CHAIN — NF cheia, viram pagamento do patrocinador).
 * Benefit sem detalhamento de patrocínio é tratado como patrocinado DESCONHECIDO: nunca
 * subdeclara a NF, e a trava de rollout segura a emissão automática nesses casos.
 */
function getBenefitSponsorshipSplit(benefit: TIfoodOrderBenefit): { merchant: number; sponsoredByName: Map<string, number> } {
	const sponsorshipValues = benefit.sponsorshipValues ?? [];
	if (sponsorshipValues.length === 0) {
		return {
			merchant: 0,
			sponsoredByName: benefit.value > 0 ? new Map([["DESCONHECIDO", benefit.value]]) : new Map(),
		};
	}

	let merchant = 0;
	const sponsoredByName = new Map<string, number>();
	for (const sponsorship of sponsorshipValues) {
		if (sponsorship.value <= 0) continue;
		const name = sponsorship.name?.toUpperCase() || "DESCONHECIDO";
		if (name === "MERCHANT") merchant += sponsorship.value;
		else sponsoredByName.set(name, (sponsoredByName.get(name) ?? 0) + sponsorship.value);
	}
	return { merchant, sponsoredByName };
}

function applyDiscountToCanonicalItem(item: TCanonicalSaleItem, discount: number): number {
	const applied = Math.min(round2(discount), item.netSaleValue);
	if (applied <= 0) return 0;
	item.discountValue = round2(item.discountValue + applied);
	item.netSaleValue = round2(item.netSaleValue - applied);
	return applied;
}

/**
 * Rateia os descontos MERCHANT nos itens (C1 da fase 5): benefit de item vai direto no item
 * indicado por `targetId` (= items.index); benefit de carrinho (ou item não localizado) rateia
 * proporcionalmente ao valor dos itens; benefits de taxa de entrega ficam fora (tratados no
 * frete dos metadados de integração).
 */
function allocateMerchantDiscountsToItems(order: TIfoodOrder, items: TCanonicalSaleItem[]) {
	if (items.length === 0) return;
	let cartLevelDiscount = 0;

	for (const benefit of order.benefits) {
		const target = benefit.target?.toUpperCase();
		if (target === "DELIVERY_FEE") continue;
		const { merchant } = getBenefitSponsorshipSplit(benefit);
		if (merchant <= 0) continue;

		if ((target === "ITEM" || target === "PROGRESSIVE_DISCOUNT_ITEM") && benefit.targetId != null) {
			const orderItemPosition = order.items.findIndex((item) => item.index != null && String(item.index) === String(benefit.targetId));
			const canonicalItem = orderItemPosition >= 0 ? items[orderItemPosition] : undefined;
			if (canonicalItem) {
				const applied = applyDiscountToCanonicalItem(canonicalItem, merchant);
				const remainder = round2(merchant - applied);
				if (remainder > 0) cartLevelDiscount += remainder;
				continue;
			}
		}
		cartLevelDiscount += merchant;
	}

	if (cartLevelDiscount <= 0) return;
	const prorationBase = items.reduce((sum, item) => sum + item.netSaleValue, 0);
	if (prorationBase <= 0) return;
	const totalToAllocate = Math.min(round2(cartLevelDiscount), prorationBase);

	let allocated = 0;
	items.forEach((item, index) => {
		const share = index === items.length - 1 ? round2(totalToAllocate - allocated) : round2((totalToAllocate * item.netSaleValue) / prorationBase);
		allocated = round2(allocated + applyDiscountToCanonicalItem(item, share));
	});
}

/**
 * Reparte os benefits do pedido entre o que a loja bancou (reduz a NF) e o que o canal patrocinou
 * (o canal reembolsa a loja, entao NAO e desconto: entra como pagamento). Fonte unica dos totais
 * da venda, do frete liquido e das linhas de patrocinio.
 */
function splitIfoodBenefits(order: TIfoodOrder) {
	let merchantItemAndCartDiscount = 0;
	let merchantDeliveryFeeDiscount = 0;
	const sponsoredTotals = new Map<string, number>();
	for (const benefit of order.benefits) {
		const isDeliveryFee = benefit.target?.toUpperCase() === "DELIVERY_FEE";
		const { merchant, sponsoredByName } = getBenefitSponsorshipSplit(benefit);
		if (isDeliveryFee) merchantDeliveryFeeDiscount += merchant;
		else merchantItemAndCartDiscount += merchant;
		for (const [name, value] of sponsoredByName) {
			sponsoredTotals.set(name, (sponsoredTotals.get(name) ?? 0) + value);
		}
	}
	return { merchantItemAndCartDiscount, merchantDeliveryFeeDiscount, sponsoredTotals };
}

/**
 * Frete do pedido depois dos benefits. Quem entrega decide de quem é a receita: entrega própria
 * (`deliveredBy: MERCHANT`) é receita da loja — compõe o total da venda e a NF como `vFrete`;
 * entrega do canal é receita do iFood — o cliente paga, o canal retém e a loja nunca vê o dinheiro.
 * Mesma leitura de `realizadaPor` que `computeSaleTaxation` usa para montar o `vFrete`, para que
 * `valorTotal` e `vNF` não possam divergir.
 */
function resolveIfoodDelivery(order: TIfoodOrder, merchantDeliveryFeeDiscount: number) {
	const deliveredBy = order.delivery?.deliveredBy?.toUpperCase() ?? null;
	const realizadaPor = deliveredBy === "MERCHANT" ? ("LOJA" as const) : deliveredBy ? ("CANAL" as const) : null;
	const netDeliveryFee = round2(Math.max(order.total.deliveryFee - merchantDeliveryFeeDiscount, 0));

	return {
		realizadaPor,
		netDeliveryFee,
		/** Receita da loja: entra em `valorTotal` e no `vFrete` da NF. */
		ownDeliveryFee: realizadaPor === "LOJA" ? netDeliveryFee : 0,
		/** Retido pelo canal: sai da conta de repasse como SAÍDA, junto das demais taxas. */
		channelDeliveryFee: realizadaPor === "LOJA" ? 0 : netDeliveryFee,
	};
}

/** Nome da liability quando é o próprio lojista que banca a taxa (o canal não a retém). */
const MERCHANT_FEE_LIABILITY = "MERCHANT";

function isMerchantLiableFee(fee: TIfoodOrderAdditionalFee) {
	const liabilities = fee.liabilities ?? [];
	return liabilities.length > 0 && liabilities.every((liability) => liability.name?.toUpperCase() === MERCHANT_FEE_LIABILITY);
}

/**
 * Taxas retidas pelo canal: `additionalFees` (receita do iFood, fora da NF) mais o frete que o
 * canal reteve. O frete precisa entrar aqui porque o cliente o pagou junto do pedido — sem a SAÍDA
 * correspondente o saldo da conta de repasse cobraria do iFood um dinheiro que ele nunca deve.
 *
 * Limite conhecido: uma taxa integralmente sob liability MERCHANT é receita da loja, mas o motor de
 * totais ainda não tem onde declará-la (não é frete nem item). Ela segue como taxa do canal e o
 * caso é logado, em vez de silenciosamente mal classificado.
 */
function resolveIfoodChannelFees(order: TIfoodOrder, channelDeliveryFee: number) {
	const additionalFees =
		order.additionalFees.length > 0
			? order.additionalFees.map((fee) => ({ tipo: fee.type ?? "ADDITIONAL_FEE", valor: round2(fee.value) }))
			: order.total.additionalFees > 0
				? [{ tipo: "ADDITIONAL_FEES", valor: round2(order.total.additionalFees) }]
				: [];

	for (const fee of order.additionalFees.filter(isMerchantLiableFee)) {
		console.warn(
			`[IFOOD_MAPPER] Pedido ${order.id}: taxa "${fee.type ?? "ADDITIONAL_FEE"}" de ${fee.value} é de responsabilidade MERCHANT (receita da loja), mas foi lançada como taxa do canal — a NF ainda não tem campo para declará-la.`,
		);
	}

	return channelDeliveryFee > 0 ? [...additionalFees, { tipo: "DELIVERY_FEE_CANAL", valor: channelDeliveryFee }] : additionalFees;
}

/**
 * Detalhamento do canal para fiscal/conciliação (C4 da fase 5), persistido em
 * `sales.integracaoMetadados`. Frete: benefits MERCHANT de taxa de entrega reduzem o frete
 * cobrado (a loja abriu mão); benefits patrocinados mantêm o frete cheio (o canal paga).
 */
function buildIfoodIntegrationMetadata(
	order: TIfoodOrder,
	eventState: TIfoodOrderEventState,
	payments: TCanonicalSalePayment[] | null,
): TSaleIntegrationMetadata {
	const { merchantItemAndCartDiscount, merchantDeliveryFeeDiscount, sponsoredTotals } = splitIfoodBenefits(order);
	const entrega = resolveIfoodDelivery(order, merchantDeliveryFeeDiscount);
	const taxasCanal = resolveIfoodChannelFees(order, entrega.channelDeliveryFee);
	const referencia = order.delivery?.deliveryAddress?.reference?.trim();

	// Campos opcionais entram só quando têm valor: a assinatura de importação omite chaves
	// ausentes, então pedidos sem referência/troco não são regravados por causa deles.
	return {
		versao: 1,
		canal: "IFOOD",
		entrega: {
			realizadaPor: entrega.realizadaPor,
			valorFrete: entrega.netDeliveryFee,
			...(referencia ? { referencia } : {}),
		},
		descontos: {
			loja: round2(merchantItemAndCartDiscount + merchantDeliveryFeeDiscount),
			patrocinados: [...sponsoredTotals.entries()].map(([patrocinador, valor]) => ({ patrocinador, valor: round2(valor) })),
		},
		pagamentos: {
			prePago: round2(order.payments?.prepaid ?? 0),
			pendente: round2(order.payments?.pending ?? 0),
			metodos: (payments ?? []).map(({ metodo, valor, pagoOnline, descricao, trocoPara }) => ({
				metodo,
				valor,
				pagoOnline,
				descricao: descricao ?? null,
				...(trocoPara ? { trocoPara } : {}),
			})),
		},
		contatoTemporario: order.customer?.phone?.localizer
			? {
					telefone: order.customer.phone.number,
					localizador: order.customer.phone.localizer,
					expiraEm: order.customer.phone.localizerExpiration,
				}
			: null,
		cancelamentoSolicitado: eventState.cancellationRequestedAt
			? { solicitadoEm: eventState.cancellationRequestedAt, motivo: eventState.cancellationRequestReason }
			: null,
		disputaAberta: eventState.dispute,
		taxasCanal,
	};
}

// Métodos de pagamento do iFood → enum de métodos da plataforma. Desconhecido cai em OUTRO.
const IFOOD_PAYMENT_METHOD_MAP: Record<string, TPaymentMethodEnum> = {
	CREDIT: "CARTAO_CREDITO",
	DEBIT: "CARTAO_DEBITO",
	PIX: "PIX",
	CASH: "DINHEIRO",
	MEAL_VOUCHER: "VALE",
	FOOD_VOUCHER: "VALE",
	GIFT_CARD: "VALE",
	BANK_TRANSFER: "TRANSFERENCIA",
};

/**
 * Pagamentos do pedido: cada entrada de `payments.methods` vira um pagamento canônico com a
 * distinção online (dinheiro fica com o iFood até o repasse) vs. offline (pago na entrega).
 * Sem `methods` no payload, cai no fallback pelos agregados `prepaid`/`pending`.
 */
function mapIfoodSalePayments(order: TIfoodOrder): TCanonicalSalePayment[] | null {
	const payments = order.payments;
	if (!payments) return null;

	const methods = payments.methods.filter((method) => method.value > 0);
	if (methods.length > 0) {
		return methods.map((method) => {
			const methodKey = method.method?.toUpperCase() ?? "";
			const mappedMethod = IFOOD_PAYMENT_METHOD_MAP[methodKey] ?? "OUTRO";
			const description = method.card?.brand ?? (mappedMethod === "OUTRO" ? method.method : null);
			// `changeFor` igual ou abaixo do valor = cliente tem o valor exato; só há troco a levar acima.
			const changeFor = method.cash?.changeFor ?? 0;
			return {
				metodo: mappedMethod,
				valor: method.value,
				pagoOnline: method.type?.toUpperCase() === "ONLINE" || method.prepaid === true,
				descricao: description,
				...(changeFor > method.value ? { trocoPara: round2(changeFor) } : {}),
			};
		});
	}

	const fallback: TCanonicalSalePayment[] = [];
	if (payments.prepaid > 0) fallback.push({ metodo: "OUTRO", valor: payments.prepaid, pagoOnline: true, descricao: "iFood (pago online)" });
	if (payments.pending > 0) fallback.push({ metodo: "OUTRO", valor: payments.pending, pagoOnline: false, descricao: "iFood (pago na entrega)" });
	return fallback.length > 0 ? fallback : null;
}

export function mapIfoodSale(order: TIfoodOrder, events: TIfoodEvent[] = []): TCanonicalSale {
	const eventState = getOrderEventState(events);
	const validSale = isValidSale(order, eventState);
	const canceled = isCanceled(order, eventState);
	const merchantName = order.merchant?.name || "IFOOD";
	// Estagio efetivo = o mais avancado entre o status do payload, os timestamps do pedido e os
	// eventos deste lote. Resiliente a evento perdido/ja ACKado e a evento atrasado fora de ordem.
	const statusText = pickMostAdvancedStatus(order.status, getOrderTimestampStatus(order), eventState.statusText) ?? "N/A";
	const items = order.items.map(mapIfoodSaleItem);
	// C1 (fase 5): descontos reais da loja (sponsorship MERCHANT) reduzem os itens — e a NF.
	allocateMerchantDiscountsToItems(order, items);

	// Totais espelham a composicao da NF, para venda e nota nunca divergirem:
	//   valorTotal = itens brutos - desconto da loja + frete proprio  (= vNF)
	// O desconto patrocinado NAO entra como desconto (o canal reembolsa a loja: vira pagamento); a
	// taxa do canal e o frete que o canal retem ficam fora (sao receita do canal, nao da loja) e
	// aparecem como SAIDA em `taxasCanal`. Antes o total vinha do `orderAmount`, que e o valor
	// cobrado do cliente — outra definicao, e por isso a NF nao batia.
	const { merchantItemAndCartDiscount, merchantDeliveryFeeDiscount, sponsoredTotals } = splitIfoodBenefits(order);
	const merchantDiscount = round2(merchantItemAndCartDiscount);
	const { ownDeliveryFee } = resolveIfoodDelivery(order, merchantDeliveryFeeDiscount);
	const operationValue = round2(order.total.subTotal - merchantDiscount + ownDeliveryFee);

	// Patrocinio do canal como pagamento: sem essa linha os pagamentos nao alcancam o total da
	// operacao e a emissao para na validacao de prontidao fiscal.
	const customerPayments = mapIfoodSalePayments(order) ?? [];
	const sponsoredPayments: TCanonicalSalePayment[] = [...sponsoredTotals.entries()]
		.filter(([, valor]) => valor > 0)
		.map(([patrocinador, valor]) => ({
			metodo: "VALE" as const,
			valor: round2(valor),
			pagoOnline: true,
			descricao: `Patrocínio ${patrocinador}`,
		}));
	const payments = [...customerPayments, ...sponsoredPayments];

	return {
		sourceSaleId: order.id,
		displayId: order.displayId,
		totalValue: operationValue,
		totalCost: 0,
		totalDiscount: merchantDiscount,
		totalSurcharge: ownDeliveryFee,
		sellerName: merchantName,
		channel: "iFood",
		deliveryMode: mapDeliveryMode(order),
		partnerIdentifier: null,
		key: order.id,
		document: order.displayId ?? order.id,
		model: "IFOOD",
		movement: order.orderType || order.category || "N/A",
		nature: validSale ? "SN01" : "SN99",
		series: "N/A",
		statusText,
		type: "VENDA",
		// Instrução de entrega do cliente vira a observação da venda (atendimento, preparo e cupom já
		// a exibem). `undefined` quando vazia, pelo mesmo motivo dos opcionais dos metadados.
		notes: order.delivery?.observations?.trim() || undefined,
		occurredAt: pickOrderDate(order),
		client: mapIfoodClient(order),
		seller: null,
		partner: null,
		items,
		isValidSale: validSale,
		isCanceled: canceled,
		attendanceStatus: mapIfoodAttendanceStatus(statusText),
		payments,
		integrationMetadata: buildIfoodIntegrationMetadata(order, eventState, payments),
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

export function toCanonicalIfoodImportBatch({
	organizationId,
	window,
	orders,
	events,
}: {
	organizationId: string;
	window: TCanonicalImportWindow;
	orders: TIfoodOrder[];
	events: TIfoodEvent[];
}): TCanonicalConnectorBatch {
	const eventsByOrderId = new Map<string, TIfoodEvent[]>();
	for (const event of events) {
		if (!event.orderId) continue;
		const orderEvents = eventsByOrderId.get(event.orderId) ?? [];
		orderEvents.push(event);
		eventsByOrderId.set(event.orderId, orderEvents);
	}

	const sales = orders.map((order) => mapIfoodSale(order, eventsByOrderId.get(order.id) ?? []));
	const products = uniqueBy(
		orders.flatMap((order) => order.items.map(mapIfoodProduct)),
		(product) => product.code,
	);

	return {
		source: "IFOOD",
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
		raw: { events, orders },
	};
}
