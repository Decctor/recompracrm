import { formatCashbackValue, formatDecimalPlaces, formatToMoney, getCashbackUnitLabel } from "@/lib/formatting";
import type { TCashbackProgramDraft } from "@/lib/cashback/program-registry-state";

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
>;

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

	return `${firstSentence} ${secondSentence}`;
}
