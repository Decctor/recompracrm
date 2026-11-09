import { formatCashbackValue, formatDecimalPlaces, formatToMoney, getCashbackUnitLabel } from "@/lib/formatting";
import type { TCashbackProgramDraft } from "@/lib/cashback/program-registry-state";
import { PAYMENT_METHOD_LABELS } from "@/lib/payments/labels";
import type { TCashbackPaymentAccrualRule } from "@/schemas/cashback-programs";
import type { TPaymentMethodEnum } from "@/schemas/enums";

type TCashbackProgramSummaryInput = Pick<
	TCashbackProgramDraft,
	| "terminologia"
	| "acumuloTipo"
	| "acumuloValor"
	| "acumuloRegraValorMinimo"
	| "expiracaoRegraValidadeValor"
	| "modalidadeDescontosPermitida"
	| "modalidadeRecompensasPermitida"
	| "resgateLimiteTipo"
	| "resgateLimiteValor"
	| "acumuloRegrasPagamento"
>;

/** "Não pontua: Outro. Pontua só quando pago: Fiado / nota." — vazio quando nada foge do padrão. */
function describePaymentAccrualRules(rules: TCashbackProgramSummaryInput["acumuloRegrasPagamento"]) {
	if (!rules) return "";
	const entries = Object.entries(rules) as [TPaymentMethodEnum, TCashbackPaymentAccrualRule][];
	const notScoring = entries.filter(([, rule]) => !rule.pontua).map(([metodo]) => PAYMENT_METHOD_LABELS[metodo]);
	const onSettlement = entries.filter(([, rule]) => rule.pontua && rule.momento === "NA_QUITACAO").map(([metodo]) => PAYMENT_METHOD_LABELS[metodo]);
	const parts: string[] = [];
	if (notScoring.length > 0) parts.push(`Não pontua: ${notScoring.join(", ")}.`);
	if (onSettlement.length > 0) parts.push(`Pontua só quando pago: ${onSettlement.join(", ")}.`);
	return parts.join(" ");
}

/**
 * O programa lido em voz alta, em uma ou duas frases: "Cliente ganha 5% de cada venda acima de
 * R$ 20,00, válido por 90 dias. Resgata como desconto de até 30% da compra ou em recompensas."
 *
 * Existe para o lojista conferir o que configurou sem montar a regra de cabeça a partir de seis
 * campos soltos. Função pura: o cabeçalho a chama com o programa salvo.
 */
export function describeCashbackProgram(program: TCashbackProgramSummaryInput) {
	const unit = getCashbackUnitLabel(program.terminologia);

	const earning =
		program.acumuloTipo === "PERCENTUAL"
			? `Cliente ganha ${formatDecimalPlaces(program.acumuloValor)}% de cada venda`
			: `Cliente ganha ${formatCashbackValue(program.acumuloValor, program.terminologia)} por venda`;
	const minimum = program.acumuloRegraValorMinimo > 0 ? ` acima de ${formatToMoney(program.acumuloRegraValorMinimo)}` : "";
	const validity =
		program.expiracaoRegraValidadeValor > 0
			? `, ${program.terminologia === "PONTOS" ? "válidos" : "válido"} por ${formatDecimalPlaces(program.expiracaoRegraValidadeValor)} dias`
			: ", sem prazo para expirar";
	const firstSentence = `${earning}${minimum}${validity}.`;

	const redemptionModes: string[] = [];
	if (program.modalidadeDescontosPermitida) {
		const limitValue = program.resgateLimiteValor ?? 0;
		if (program.resgateLimiteTipo === "PERCENTUAL" && limitValue > 0)
			redemptionModes.push(`como desconto de até ${formatDecimalPlaces(limitValue)}% da compra`);
		else if (program.resgateLimiteTipo === "FIXO" && limitValue > 0)
			redemptionModes.push(`como desconto de até ${formatCashbackValue(limitValue, program.terminologia)} por compra`);
		else redemptionModes.push("como desconto na compra");
	}
	if (program.modalidadeRecompensasPermitida) redemptionModes.push("em recompensas");

	const secondSentence =
		redemptionModes.length > 0
			? `Resgata ${redemptionModes.join(" ou ")}.`
			: `Nenhuma forma de resgate ligada: o cliente acumula ${unit} mas não tem como usar.`;

	const paymentRules = describePaymentAccrualRules(program.acumuloRegrasPagamento);
	return [firstSentence, paymentRules, secondSentence].filter(Boolean).join(" ");
}
