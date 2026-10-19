/**
 * Série diária reconstruída de trás para frente a partir do valor atual.
 *
 * O ledger guarda a variação de cada movimentação. Ancorar no valor de hoje (o saldo gravado no
 * produto) e desfazer as variações dia a dia faz o último ponto bater com o resumo, mesmo quando
 * parte do saldo nunca passou pelo ledger (importação, cadastro inicial).
 *
 * `deltaByDay` é a variação somada de cada dia local; o retorno é o valor ao **fim** de cada dia.
 */
export function buildBackwardSeries({ days, currentValue, deltaByDay }: { days: string[]; currentValue: number; deltaByDay: Map<string, number> }) {
	const values: number[] = Array.from({ length: days.length }, () => 0);
	let value = currentValue;
	for (let index = days.length - 1; index >= 0; index--) {
		values[index] = value;
		value -= deltaByDay.get(days[index]) ?? 0;
	}
	return days.map((dia, index) => ({ dia, valor: values[index] }));
}

/** Valor no início do período (antes de todas as variações da janela). */
export function resolveStartValue({ currentValue, deltaByDay }: { currentValue: number; deltaByDay: Map<string, number> }) {
	let value = currentValue;
	for (const delta of deltaByDay.values()) value -= delta;
	return value;
}

/**
 * Agrupa uma série diária em blocos (semanas ou meses) somando ou tomando o último valor.
 * Usado para manter o gráfico de 12 meses legível: 365 pontos viram 53 semanas.
 */
export function bucketDailySeries<T extends { dia: string }>(
	series: T[],
	keyOf: (dia: string) => string,
	reduce: (bucket: T[]) => Omit<T, "dia">,
): (Omit<T, "dia"> & { inicio: string; fim: string })[] {
	const buckets: { key: string; items: T[] }[] = [];
	for (const item of series) {
		const key = keyOf(item.dia);
		const last = buckets[buckets.length - 1];
		if (last && last.key === key) last.items.push(item);
		else buckets.push({ key, items: [item] });
	}
	return buckets.map(({ items }) => ({ ...reduce(items), inicio: items[0].dia, fim: items[items.length - 1].dia }));
}

/** Chave da semana (segunda-feira) de um dia `YYYY-MM-DD`. */
export function weekKeyOf(dia: string) {
	const date = new Date(`${dia}T12:00:00Z`);
	const weekday = (date.getUTCDay() + 6) % 7;
	date.setUTCDate(date.getUTCDate() - weekday);
	return date.toISOString().slice(0, 10);
}

export function monthKeyOf(dia: string) {
	return dia.slice(0, 7);
}
