import { CONTENT_OG_SIZE, renderStatOgImage } from "@/lib/content/og-image";
import { CASHBACK_CALCULATOR_DEFAULTS, computeCashbackCalculator } from "@/lib/marketing-tools/cashback-calculator";
import { formatFraction } from "../_components/format";

export const contentType = "image/png";
export const size = CONTENT_OG_SIZE;
export const alt = "Calculadora de cashback do RecompraCRM";

export default async function CashbackCalculatorOpengraphImage() {
	// O exemplo da página: o resultado com os valores iniciais da calculadora.
	const input = CASHBACK_CALCULATOR_DEFAULTS;
	const result = computeCashbackCalculator(input);
	return renderStatOgImage({
		eyebrow: "Ferramenta gratuita",
		title: "Calculadora de cashback: quanto oferecer sem perder margem",
		stat: result.breakEven === null ? "Reduza o %" : `+${formatFraction(result.breakEven)}`,
		statLabel: `em vendas pagam ${input.cashback}% de cashback numa margem de ${input.margin}%`,
		footer: "recompracrm.com.br/tools",
	});
}
