export type TDailySalePrice = {
	/** Dia local `YYYY-MM-DD`. */
	dia: string;
	/** Preço unitário bruto (antes do desconto) mais frequente nas vendas do dia. */
	preco: number;
};

export type TPriceChange = { dia: string; de: number; para: number; origem: "VENDAS" | "CADASTRO" };

const samePrice = (a: number, b: number) => Math.abs(a - b) < 0.005;

/**
 * Deriva as alterações de preço de venda a partir das vendas.
 *
 * O ledger de estoque só guarda custo; o preço praticado vem de `sale_items.valorVendaUnitario`
 * (bruto, o desconto fica separado). Uma alteração é registrada quando o preço mais frequente de um
 * dia difere do anterior **e se mantém** na venda seguinte — um preço editado à mão no caixa uma vez
 * não vira reajuste. O último dia com venda conta como confirmado.
 *
 * `knownChange` é a única alteração com data exata (`precoVendaAnterior` + `dataAlteracaoPrecoVenda`):
 * quando cai dentro da janela, substitui o que as vendas sugerem a partir daquela data.
 */
export function derivePriceHistory({
	dailyPrices,
	currentPrice,
	knownChange,
	windowStart,
}: {
	dailyPrices: TDailySalePrice[];
	currentPrice: number;
	knownChange: { dia: string; de: number; para: number } | null;
	windowStart: string;
}) {
	const days = dailyPrices.slice().sort((a, b) => a.dia.localeCompare(b.dia));
	const changes: TPriceChange[] = [];
	let current = days[0]?.preco ?? null;
	for (let index = 1; index < days.length; index++) {
		const day = days[index];
		if (current == null || samePrice(day.preco, current)) continue;
		const next = days[index + 1];
		const confirmed = !next || samePrice(next.preco, day.preco);
		if (!confirmed) continue;
		changes.push({ dia: day.dia, de: current, para: day.preco, origem: "VENDAS" });
		current = day.preco;
	}

	let startPrice = days[0]?.preco ?? currentPrice;
	let result = changes;
	if (knownChange && knownChange.dia >= windowStart) {
		result = changes.filter((change) => change.dia < knownChange.dia);
		result.push({ ...knownChange, origem: "CADASTRO" });
		if (days.length === 0 || days[0].dia >= knownChange.dia) startPrice = knownChange.de;
	}

	// A linha termina no preço de cadastro atual: se as vendas pararam antes de um reajuste, o
	// reajuste aparece no último dia conhecido como alteração sem data exata.
	const lastPrice = result.length > 0 ? result[result.length - 1].para : startPrice;
	if (!samePrice(lastPrice, currentPrice) && days.length > 0) {
		result.push({ dia: days[days.length - 1].dia, de: lastPrice, para: currentPrice, origem: "CADASTRO" });
	}

	return { precoInicio: startPrice, alteracoes: result };
}
