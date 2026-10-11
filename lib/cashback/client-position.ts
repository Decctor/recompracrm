import { formatCashbackValue, formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import type { TCashbackProgramEntity } from "@/services/drizzle/schema";
import { hasAnyCashbackRedemptionSurface } from "./redemption-policy";

/**
 * A posição do cliente no programa de cashback, lida em voz alta para quem conversa com ele —
 * hoje o agente de IA. Funções puras sobre o programa e o saldo: "falta quanto para este
 * prêmio?", "quanto preciso comprar para chegar lá?", "quanto de desconto consigo usar?".
 *
 * Tudo que sai daqui é uma leitura da regra cadastrada, nunca uma promessa: bônus de campanha,
 * acúmulo por parceiro e regras futuras podem mudar o resultado, por isso a estimativa de compra
 * vai rotulada como estimativa.
 */
export type TCashbackPositionProgram = Pick<
	TCashbackProgramEntity,
	| "terminologia"
	| "acumuloTipo"
	| "acumuloValor"
	| "acumuloRegraValorMinimo"
	| "modalidadeDescontosPermitida"
	| "modalidadeRecompensasPermitida"
	| "resgateLimiteTipo"
	| "resgateLimiteValor"
	| "resgatePermitirViaPos"
	| "resgatePermitirViaPontoIntegracao"
	| "resgatePermitirViaLojaDigital"
>;

function roundCurrency(value: number) {
	return Math.round(value * 100) / 100;
}

/** Arredonda para cima nos centavos: a estimativa nunca pode ficar abaixo do que de fato falta. */
function ceilCurrency(value: number) {
	return Math.ceil(value * 100 - 1e-9) / 100;
}

export type TCashbackPurchaseEstimate = {
	/** Valor total em compras (R$) estimado para fechar a diferença. `null` quando a regra é por quantidade sem valor mínimo. */
	valorCompras: number | null;
	/** Quantidade de compras, quando o acúmulo é fixo por venda. */
	quantidadeCompras: number | null;
	descricao: string;
};

/**
 * Quanto o cliente precisa comprar para acumular `gap` na moeda do programa, pela regra de
 * acúmulo cadastrada. `null` quando o programa não acumula (valor zero) — aí não há caminho.
 */
export function estimatePurchaseToAccumulate({
	program,
	gap,
}: {
	program: Pick<TCashbackPositionProgram, "acumuloTipo" | "acumuloValor" | "acumuloRegraValorMinimo">;
	gap: number;
}): TCashbackPurchaseEstimate | null {
	if (gap <= 0) return { valorCompras: 0, quantidadeCompras: 0, descricao: "Já alcançado." };
	if (program.acumuloValor <= 0) return null;
	const minimum = Math.max(0, program.acumuloRegraValorMinimo);

	if (program.acumuloTipo === "PERCENTUAL") {
		// Uma compra abaixo do mínimo não acumula nada: a compra estimada nunca fica abaixo dele.
		const purchaseTotal = Math.max(ceilCurrency((gap * 100) / program.acumuloValor), minimum);
		return {
			valorCompras: purchaseTotal,
			quantidadeCompras: null,
			descricao: `Cerca de ${formatToMoney(purchaseTotal)} em compras (estimativa pela regra de acúmulo de ${formatDecimalPlaces(program.acumuloValor)}% por compra${
				minimum > 0 ? `, válida para compras a partir de ${formatToMoney(minimum)}` : ""
			}).`,
		};
	}

	// FIXO: cada venda que passa do mínimo acumula o mesmo valor, então a conta é em compras.
	const purchaseCount = Math.ceil(gap / program.acumuloValor - 1e-9);
	const purchaseTotal = minimum > 0 ? roundCurrency(purchaseCount * minimum) : null;
	return {
		valorCompras: purchaseTotal,
		quantidadeCompras: purchaseCount,
		descricao: `${purchaseCount} compra${purchaseCount === 1 ? "" : "s"}${
			minimum > 0 ? ` de pelo menos ${formatToMoney(minimum)} cada` : ""
		} (estimativa pela regra de acúmulo fixo por compra).`,
	};
}

export type TCashbackPrizeGap = {
	resgatavel: boolean;
	/** Quanto falta de saldo, na moeda do programa. Zero quando já dá para resgatar. */
	falta: number;
	compraEstimada: TCashbackPurchaseEstimate | null;
};

/** Posição do cliente diante de um prêmio: dá para resgatar, ou falta quanto e como chegar lá. */
export function describeCashbackPrizeGap({
	program,
	prizeValue,
	availableBalance,
}: {
	program: Pick<TCashbackPositionProgram, "acumuloTipo" | "acumuloValor" | "acumuloRegraValorMinimo">;
	prizeValue: number;
	availableBalance: number;
}): TCashbackPrizeGap {
	const gap = roundCurrency(Math.max(0, prizeValue - availableBalance));
	const redeemable = gap <= 0;
	return {
		resgatavel: redeemable,
		falta: gap,
		compraEstimada: redeemable ? null : estimatePurchaseToAccumulate({ program, gap }),
	};
}

export type TCashbackDiscountPosition = {
	permitido: boolean;
	/** Teto de saldo que pode virar desconto em uma compra. `null` quando o teto depende do valor da compra (limite percentual). */
	maximoPorCompra: number | null;
	/** Limite percentual sobre o valor de cada compra, quando houver. */
	limitePercentualDaCompra: number | null;
	regra: string;
};

/**
 * Quanto do saldo o cliente pode usar como desconto, espelhando `getMaxCashbackToUse` do ponto de
 * interação: o menor entre saldo, valor da compra e o limite do programa. Em programas de pontos
 * o teto sai em pontos — o resgate trata um ponto como um real, e é assim que o caixa aplica.
 */
export function describeCashbackDiscount({
	program,
	availableBalance,
}: {
	program: Pick<TCashbackPositionProgram, "terminologia" | "modalidadeDescontosPermitida" | "resgateLimiteTipo" | "resgateLimiteValor">;
	availableBalance: number;
}): TCashbackDiscountPosition {
	if (!program.modalidadeDescontosPermitida) {
		return { permitido: false, maximoPorCompra: null, limitePercentualDaCompra: null, regra: "O programa não usa o saldo como desconto." };
	}
	const balance = roundCurrency(Math.max(0, availableBalance));
	const terminology = program.terminologia;
	const limitValue = program.resgateLimiteValor ?? 0;
	const limitPercent = program.resgateLimiteTipo === "PERCENTUAL" && limitValue > 0 ? limitValue : null;
	const limitFixed = program.resgateLimiteTipo === "FIXO" && limitValue > 0 ? limitValue : null;

	if (balance <= 0) {
		return {
			permitido: true,
			maximoPorCompra: 0,
			limitePercentualDaCompra: limitPercent,
			regra: "O cliente ainda não tem saldo para usar como desconto.",
		};
	}

	if (limitPercent !== null) {
		return {
			permitido: true,
			maximoPorCompra: null,
			limitePercentualDaCompra: limitPercent,
			regra: `Pode usar até ${formatCashbackValue(balance, terminology)} do saldo como desconto, limitado a ${formatDecimalPlaces(limitPercent)}% do valor de cada compra.`,
		};
	}

	const maxPerPurchase = limitFixed !== null ? Math.min(balance, limitFixed) : balance;
	const cappedByLimit = limitFixed !== null && limitFixed < balance;
	return {
		permitido: true,
		maximoPorCompra: roundCurrency(maxPerPurchase),
		limitePercentualDaCompra: null,
		regra: cappedByLimit
			? `Pode usar até ${formatCashbackValue(maxPerPurchase, terminology)} do saldo como desconto por compra (limite do programa; o restante fica para as próximas compras).`
			: `Pode usar até ${formatCashbackValue(maxPerPurchase, terminology)} do saldo como desconto, até o valor da compra.`,
	};
}

const SURFACE_LABELS: {
	flag: keyof Pick<TCashbackPositionProgram, "resgatePermitirViaPos" | "resgatePermitirViaPontoIntegracao" | "resgatePermitirViaLojaDigital">;
	label: string;
}[] = [
	{ flag: "resgatePermitirViaPos", label: "no caixa da loja (PDV)" },
	{ flag: "resgatePermitirViaPontoIntegracao", label: "no ponto de interação da loja (totem/QR code)" },
	{ flag: "resgatePermitirViaLojaDigital", label: "na loja digital" },
];

/**
 * Onde o cliente resgata, em palavras: o agente informa, não resgata, então precisa apontar o
 * lugar certo. Lista vazia = o programa só acumula (validado no cadastro, mas o dado é legado).
 */
export function listCashbackRedemptionSurfaceLabels(
	program: Pick<TCashbackPositionProgram, "resgatePermitirViaPos" | "resgatePermitirViaPontoIntegracao" | "resgatePermitirViaLojaDigital">,
): string[] {
	if (!hasAnyCashbackRedemptionSurface(program)) return [];
	return SURFACE_LABELS.filter(({ flag }) => program[flag]).map(({ label }) => label);
}
