import type { TBenefitRedemptionSurface } from "@/schemas/enums";
import { getCouponCheckoutConditionIssue, type TCouponEvaluationContext } from "./conditions";
export type { TCouponEvaluationContext } from "./conditions";
import type { TCouponAudienceEntity, TCouponEntity, TCouponGrantEntity, TCouponTargetEntity } from "@/services/drizzle/schema";

/**
 * Motor de elegibilidade de cupons.
 *
 * Funções puras compartilhadas por POS, ponto de interação e loja digital:
 * - getCouponAvailabilityIssue: disponibilidade (ativo, vigência, limites, superfície, atribuição)
 * - clientMatchesCouponAudience: audiência por tag/segmentação RFM
 * - evaluateCouponAgainstCart: elegibilidade estruturada + cômputo do desconto sobre um carrinho
 */

export type TCouponCartItem = {
	/** Identificador estável do item dentro do carrinho (ex: índice em string), usado para mapear o desconto de volta. */
	chave: string;
	produtoId: string;
	produtoVarianteId?: string | null;
	/** Grupo do produto (products.grupo) — o chamador enriquece o carrinho com essa informação. */
	grupo?: string | null;
	quantidade: number;
	valorVendaUnitario: number;
};

// Vocabulário único de superfície, compartilhado com o resgate de cashback (`schemas/enums.ts`).
export type TCouponRedemptionSurface = TBenefitRedemptionSurface;

export type TCouponEvaluationResult =
	| { elegivel: false; motivo: string }
	| {
			elegivel: true;
			valorDesconto: number;
			aplicacao: "VENDA_TOTAL" | "ITENS_ELEGIVEIS";
			/** Desconto por item (chave do carrinho) quando aplicacao = ITENS_ELEGIVEIS; vazio quando VENDA_TOTAL. */
			descontosPorItem: Array<{ chave: string; valorDesconto: number }>;
	  };

function roundCurrency(value: number) {
	return Math.round(value * 100) / 100;
}

/**
 * Verifica disponibilidade geral do cupom, independente do carrinho.
 * Retorna o motivo da indisponibilidade, ou null quando o cupom está disponível.
 */
export function getCouponAvailabilityIssue({
	coupon,
	surface,
	now = new Date(),
	grant,
	clientRedemptionsCount,
	totalRedemptionsCount,
}: {
	coupon: Pick<
		TCouponEntity,
		| "ativo"
		| "escopo"
		| "vigenciaInicio"
		| "vigenciaFim"
		| "limiteResgatesTotal"
		| "limiteResgatesPorCliente"
		| "resgatePermitirViaPos"
		| "resgatePermitirViaPontoInteracao"
		| "resgatePermitirViaLojaDigital"
	>;
	surface: TCouponRedemptionSurface;
	now?: Date;
	grant?: Pick<TCouponGrantEntity, "quantidadeDisponivel" | "expiracaoData"> | null;
	clientRedemptionsCount?: number;
	totalRedemptionsCount?: number;
}): string | null {
	if (!coupon.ativo) return "Cupom inativo.";
	if (surface === "POS" && !coupon.resgatePermitirViaPos) return "Cupom não resgatável via PDV.";
	if (surface === "PONTO_INTERACAO" && !coupon.resgatePermitirViaPontoInteracao) return "Cupom não resgatável via ponto de interação.";
	if (surface === "LOJA_DIGITAL" && !coupon.resgatePermitirViaLojaDigital) return "Cupom não resgatável via loja digital.";
	if (coupon.vigenciaInicio && now < coupon.vigenciaInicio) return "Cupom ainda não está vigente.";
	if (coupon.vigenciaFim && now > coupon.vigenciaFim) return "Cupom expirado.";

	if (coupon.escopo === "INDIVIDUAL") {
		if (!grant) return "Cupom não atribuído ao cliente.";
		if (grant.expiracaoData && now > grant.expiracaoData) return "Atribuição do cupom expirada.";
		if (grant.quantidadeDisponivel <= 0) return "Atribuição do cupom esgotada.";
	}

	if (coupon.limiteResgatesTotal !== null && coupon.limiteResgatesTotal !== undefined && totalRedemptionsCount !== undefined) {
		if (totalRedemptionsCount >= coupon.limiteResgatesTotal) return "Limite total de resgates do cupom atingido.";
	}
	if (coupon.limiteResgatesPorCliente !== null && coupon.limiteResgatesPorCliente !== undefined && clientRedemptionsCount !== undefined) {
		if (clientRedemptionsCount >= coupon.limiteResgatesPorCliente) return "Limite de resgates do cupom por cliente atingido.";
	}

	return null;
}

/**
 * Audiência de cupons GLOBAIS: semântica OR entre linhas (o cliente precisa casar com qualquer uma).
 * Sem linhas de audiência = vale para qualquer cliente identificado.
 */
export function clientMatchesCouponAudience({
	audiences,
	clientTagIds,
	clientRFMTitle,
}: {
	audiences: Array<Pick<TCouponAudienceEntity, "clienteTagId" | "segmentacaoRFM">>;
	clientTagIds: string[];
	clientRFMTitle?: string | null;
}): boolean {
	if (audiences.length === 0) return true;
	return audiences.some((audience) => {
		if (audience.clienteTagId) return clientTagIds.includes(audience.clienteTagId);
		if (audience.segmentacaoRFM) return !!clientRFMTitle && clientRFMTitle === audience.segmentacaoRFM;
		return false;
	});
}

/**
 * Avalia um cupom AUTOMATICA em superfícies sem carrinho (ponto de interação),
 * onde só o valor da venda é conhecido.
 *
 * Só são elegíveis cupons de desconto fixo/percentual aplicados à venda total e
 * sem alvos de produto — qualquer condição que dependa dos itens exige o modo
 * MANUAL (validação do operador via condicoesTexto).
 */
export function evaluateCouponAgainstSaleValue({
	coupon,
	targets,
	saleValue,
	context,
}: {
	coupon: Pick<
		TCouponEntity,
		| "validacaoModo"
		| "beneficioTipo"
		| "beneficioValor"
		| "beneficioDescontoMaximo"
		| "beneficioAplicacao"
		| "condicaoValorMinimoVenda"
		| "condicaoModalidadesEntrega"
		| "condicaoPrimeiraCompra"
	>;
	targets: Array<Pick<TCouponTargetEntity, "papel">>;
	saleValue: number;
	context: TCouponEvaluationContext;
}): TCouponEvaluationResult {
	const conditionIssue = getCouponCheckoutConditionIssue(coupon, context);
	if (conditionIssue) return { elegivel: false, motivo: conditionIssue };
	if (coupon.validacaoModo !== "AUTOMATICA") {
		return { elegivel: false, motivo: "Cupom de validação manual: a elegibilidade deve ser confirmada pelo operador." };
	}
	if (coupon.beneficioAplicacao !== "VENDA_TOTAL" || targets.length > 0 || !["DESCONTO_FIXO", "DESCONTO_PERCENTUAL"].includes(coupon.beneficioTipo)) {
		return { elegivel: false, motivo: "Esse cupom depende dos itens da compra e não pode ser validado automaticamente nesta superfície." };
	}
	if (saleValue <= 0) return { elegivel: false, motivo: "Valor de venda não informado." };
	if (coupon.condicaoValorMinimoVenda && saleValue < coupon.condicaoValorMinimoVenda) {
		return { elegivel: false, motivo: `O valor mínimo de venda para o cupom é de R$ ${coupon.condicaoValorMinimoVenda.toFixed(2)}.` };
	}

	let totalDiscount = 0;
	if (coupon.beneficioTipo === "DESCONTO_FIXO") {
		totalDiscount = Math.min(coupon.beneficioValor ?? 0, saleValue);
	} else {
		totalDiscount = (saleValue * (coupon.beneficioValor ?? 0)) / 100;
		if (coupon.beneficioDescontoMaximo) totalDiscount = Math.min(totalDiscount, coupon.beneficioDescontoMaximo);
	}
	totalDiscount = roundCurrency(totalDiscount);
	if (totalDiscount <= 0) return { elegivel: false, motivo: "O cupom não gera desconto para essa venda." };

	return { elegivel: true, valorDesconto: totalDiscount, aplicacao: "VENDA_TOTAL", descontosPorItem: [] };
}

function itemMatchesTarget(item: TCouponCartItem, target: Pick<TCouponTargetEntity, "produtoId" | "produtoVarianteId" | "grupo">) {
	if (target.produtoVarianteId) return item.produtoVarianteId === target.produtoVarianteId;
	if (target.produtoId) return item.produtoId === target.produtoId;
	if (target.grupo) return !!item.grupo && item.grupo === target.grupo;
	return false;
}

function getTargetMatchedQuantity(items: TCouponCartItem[], target: Pick<TCouponTargetEntity, "produtoId" | "produtoVarianteId" | "grupo">) {
	return items.filter((item) => itemMatchesTarget(item, target)).reduce((sum, item) => sum + item.quantidade, 0);
}

/** Unidades individuais dos itens beneficiados, para promoções por unidade (COMPRE_X_LEVE_Y). */
function expandItemUnits(items: TCouponCartItem[]) {
	const units: Array<{ chave: string; valorUnitario: number }> = [];
	for (const item of items) {
		const wholeUnits = Math.floor(item.quantidade);
		for (let index = 0; index < wholeUnits; index++) {
			units.push({ chave: item.chave, valorUnitario: item.valorVendaUnitario });
		}
	}
	return units;
}

/**
 * Avalia um cupom de validação AUTOMATICA contra um carrinho e computa o desconto.
 *
 * Cupons de validação MANUAL não passam por aqui: a validação é do operador
 * (condicoesTexto) e o valor do desconto é informado/confirmado por ele.
 */
export function evaluateCouponAgainstCart({
	coupon,
	targets,
	cartItems,
	context,
}: {
	coupon: Pick<
		TCouponEntity,
		| "validacaoModo"
		| "beneficioTipo"
		| "beneficioValor"
		| "beneficioDescontoMaximo"
		| "beneficioAplicacao"
		| "beneficioCompreQuantidade"
		| "beneficioLeveQuantidade"
		| "condicaoValorMinimoVenda"
		| "condicaoQuantidadeMinimaItens"
		| "condicaoModalidadesEntrega"
		| "condicaoPrimeiraCompra"
		| "condicaoAlvosOperador"
	>;
	targets: Array<Pick<TCouponTargetEntity, "papel" | "produtoId" | "produtoVarianteId" | "grupo" | "quantidadeMinima">>;
	cartItems: TCouponCartItem[];
	context: TCouponEvaluationContext;
}): TCouponEvaluationResult {
	if (coupon.validacaoModo !== "AUTOMATICA") {
		return { elegivel: false, motivo: "Cupom de validação manual: a elegibilidade deve ser confirmada pelo operador." };
	}
	if (coupon.beneficioTipo === "BRINDE") {
		return { elegivel: false, motivo: "Cupons de brinde ainda não são suportados." };
	}
	if (cartItems.length === 0) return { elegivel: false, motivo: "Carrinho vazio." };
	const conditionIssue = getCouponCheckoutConditionIssue(coupon, context);
	if (conditionIssue) return { elegivel: false, motivo: conditionIssue };

	const cartGrossTotal = cartItems.reduce((sum, item) => sum + item.quantidade * item.valorVendaUnitario, 0);
	const cartTotalQuantity = cartItems.reduce((sum, item) => sum + item.quantidade, 0);

	// Condições gerais
	if (coupon.condicaoValorMinimoVenda && cartGrossTotal < coupon.condicaoValorMinimoVenda) {
		return { elegivel: false, motivo: `O valor mínimo de venda para o cupom é de R$ ${coupon.condicaoValorMinimoVenda.toFixed(2)}.` };
	}
	if (coupon.condicaoQuantidadeMinimaItens && cartTotalQuantity < coupon.condicaoQuantidadeMinimaItens) {
		return { elegivel: false, motivo: `A quantidade mínima de itens para o cupom é de ${coupon.condicaoQuantidadeMinimaItens}.` };
	}

	// Condições de alvos (ELEGIVEL)
	const eligibilityTargets = targets.filter((target) => target.papel === "ELEGIVEL");
	if (eligibilityTargets.length > 0) {
		const satisfiedTargets = eligibilityTargets.filter((target) => getTargetMatchedQuantity(cartItems, target) >= (target.quantidadeMinima ?? 1));
		const isSatisfied = coupon.condicaoAlvosOperador === "TODOS" ? satisfiedTargets.length === eligibilityTargets.length : satisfiedTargets.length > 0;
		if (!isSatisfied) return { elegivel: false, motivo: "O carrinho não contém os produtos exigidos pelo cupom." };
	}

	// Itens beneficiados: alvos BENEFICIADO quando existem; senão, os elegíveis; sem alvos = carrinho todo.
	const benefitTargets = targets.filter((target) => target.papel === "BENEFICIADO");
	const benefitScopeTargets = benefitTargets.length > 0 ? benefitTargets : eligibilityTargets;
	const benefitItems =
		benefitScopeTargets.length > 0 ? cartItems.filter((item) => benefitScopeTargets.some((target) => itemMatchesTarget(item, target))) : cartItems;

	if (coupon.beneficioAplicacao === "ITENS_ELEGIVEIS" && benefitItems.length === 0) {
		return { elegivel: false, motivo: "O carrinho não contém itens beneficiados pelo cupom." };
	}

	// Cômputo do desconto
	if (coupon.beneficioTipo === "COMPRE_X_LEVE_Y") {
		const buyQuantity = coupon.beneficioCompreQuantidade ?? 0;
		const takeQuantity = coupon.beneficioLeveQuantidade ?? 0;
		const freePerSet = takeQuantity - buyQuantity;
		if (buyQuantity <= 0 || freePerSet <= 0) return { elegivel: false, motivo: "Configuração inválida do benefício leve X pague Y." };

		const units = expandItemUnits(benefitItems);
		const completeSets = Math.floor(units.length / takeQuantity);
		if (completeSets <= 0) {
			return { elegivel: false, motivo: `São necessárias ${takeQuantity} unidades dos produtos da promoção para usar o cupom.` };
		}

		// Regra determinística: saem grátis as unidades mais baratas entre as elegíveis.
		const freeUnitsCount = completeSets * freePerSet;
		const freeUnits = [...units].sort((a, b) => a.valorUnitario - b.valorUnitario).slice(0, freeUnitsCount);

		const discountByItemKey = new Map<string, number>();
		for (const unit of freeUnits) {
			discountByItemKey.set(unit.chave, (discountByItemKey.get(unit.chave) ?? 0) + unit.valorUnitario);
		}
		const totalDiscount = roundCurrency(freeUnits.reduce((sum, unit) => sum + unit.valorUnitario, 0));
		if (totalDiscount <= 0) return { elegivel: false, motivo: "O cupom não gera desconto para o carrinho atual." };
		return {
			elegivel: true,
			valorDesconto: totalDiscount,
			aplicacao: "ITENS_ELEGIVEIS",
			descontosPorItem: [...discountByItemKey.entries()].map(([chave, valorDesconto]) => ({ chave, valorDesconto: roundCurrency(valorDesconto) })),
		};
	}

	const benefitBaseTotal =
		coupon.beneficioAplicacao === "VENDA_TOTAL"
			? cartGrossTotal
			: benefitItems.reduce((sum, item) => sum + item.quantidade * item.valorVendaUnitario, 0);

	let totalDiscount = 0;
	let itemDiscounts: Array<{ chave: string; valorDesconto: number }> = [];

	if (coupon.beneficioTipo === "DESCONTO_FIXO") {
		totalDiscount = Math.min(coupon.beneficioValor ?? 0, benefitBaseTotal);
	} else if (coupon.beneficioTipo === "DESCONTO_PERCENTUAL") {
		totalDiscount = (benefitBaseTotal * (coupon.beneficioValor ?? 0)) / 100;
		if (coupon.beneficioDescontoMaximo) totalDiscount = Math.min(totalDiscount, coupon.beneficioDescontoMaximo);
	} else if (coupon.beneficioTipo === "PRECO_FIXO") {
		// Preço-alvo por unidade dos itens beneficiados; só desconta itens acima do preço-alvo.
		const targetPrice = coupon.beneficioValor ?? 0;
		itemDiscounts = benefitItems
			.map((item) => ({ chave: item.chave, valorDesconto: roundCurrency(Math.max(0, item.valorVendaUnitario - targetPrice) * item.quantidade) }))
			.filter((entry) => entry.valorDesconto > 0);
		totalDiscount = itemDiscounts.reduce((sum, entry) => sum + entry.valorDesconto, 0);
	}

	totalDiscount = roundCurrency(totalDiscount);
	if (totalDiscount <= 0) return { elegivel: false, motivo: "O cupom não gera desconto para o carrinho atual." };

	if (coupon.beneficioAplicacao === "VENDA_TOTAL") {
		return { elegivel: true, valorDesconto: totalDiscount, aplicacao: "VENDA_TOTAL", descontosPorItem: [] };
	}

	// ITENS_ELEGIVEIS com desconto fixo/percentual: distribui proporcionalmente ao valor de cada item.
	if (coupon.beneficioTipo !== "PRECO_FIXO") {
		let distributed = 0;
		itemDiscounts = benefitItems.map((item, index) => {
			const itemTotal = item.quantidade * item.valorVendaUnitario;
			const isLast = index === benefitItems.length - 1;
			// O último item absorve o resíduo de arredondamento para fechar o total exato.
			const itemDiscount = isLast ? roundCurrency(totalDiscount - distributed) : roundCurrency((itemTotal / benefitBaseTotal) * totalDiscount);
			distributed = roundCurrency(distributed + itemDiscount);
			return { chave: item.chave, valorDesconto: itemDiscount };
		});
	}

	return { elegivel: true, valorDesconto: totalDiscount, aplicacao: "ITENS_ELEGIVEIS", descontosPorItem: itemDiscounts };
}
