// Seleção de variante por eixo ("Cor" → "Tamanho") em vez de uma lista plana de combinações.
//
// O cadastro já guarda os eixos (product_options), os valores (product_option_values) e a junção
// variante ↔ valor (product_variant_option_values). Aqui eles viram um seletor: o operador escolhe
// um valor por eixo, em qualquer ordem, e a variante é derivada da combinação. A matriz raramente
// é completa (5 cores × 3 tamanhos e só 13 variantes), então um valor sem combinação com o resto
// fica marcado — e escolhê-lo limpa o eixo que conflita, para nunca deixar o operador sem saída.

export type TVariantAxisOptionInput = {
	id: string;
	nome: string;
	ordem: number;
	valores: { id: string; nome: string; valorAuxiliar?: string | null; ordem: number }[];
};

export type TVariantAxisVariantInput = {
	id: string;
	imagemCapaUrl?: string | null;
	valoresOpcoes?: { opcaoId: string; opcaoValorId: string }[];
};

export type TVariantAxisValue = {
	id: string;
	nome: string;
	/** Cor do swatch: o hex do cadastro, valha o tipo do eixo qual for (há eixo "Cor" cadastrado como TEXTO com hex). */
	swatch: string | null;
	/** Foto da primeira variante com este valor que tenha foto (os valores não têm foto própria hoje). */
	imageUrl: string | null;
};

export type TVariantAxis = { id: string; nome: string; values: TVariantAxisValue[] };

/** Valor escolhido por eixo (`axisId → valueId`). */
export type TVariantAxisSelection = Record<string, string>;

export type TVariantAxes = {
	axes: TVariantAxis[];
	/** Combinação completa de cada variante. */
	keyByVariantId: Map<string, TVariantAxisSelection>;
};

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Eixos usáveis do produto, ou `null` para cair na lista plana: sem eixos, variante sem valor em
 * algum eixo, ou duas variantes com a mesma combinação (a escolha seria ambígua).
 */
export function buildVariantAxes({
	options,
	variants,
}: {
	options: TVariantAxisOptionInput[];
	variants: TVariantAxisVariantInput[];
}): TVariantAxes | null {
	if (options.length === 0 || variants.length === 0) return null;

	const valueAxis = new Map<string, string>();
	for (const option of options) for (const value of option.valores) valueAxis.set(value.id, option.id);

	// Só eixos que alguma variante ativa usa: um eixo cadastrado e esquecido não pode virar pergunta.
	const usedAxisIds = new Set<string>();
	for (const variant of variants)
		for (const assignment of variant.valoresOpcoes ?? [])
			if (valueAxis.get(assignment.opcaoValorId) === assignment.opcaoId) usedAxisIds.add(assignment.opcaoId);
	if (usedAxisIds.size === 0) return null;

	const keyByVariantId = new Map<string, TVariantAxisSelection>();
	const seenKeys = new Set<string>();
	for (const variant of variants) {
		const key: TVariantAxisSelection = {};
		for (const assignment of variant.valoresOpcoes ?? []) {
			if (usedAxisIds.has(assignment.opcaoId) && valueAxis.get(assignment.opcaoValorId) === assignment.opcaoId)
				key[assignment.opcaoId] = assignment.opcaoValorId;
		}
		if (Object.keys(key).length !== usedAxisIds.size) return null;
		const signature = [...usedAxisIds].map((axisId) => key[axisId]).join("|");
		if (seenKeys.has(signature)) return null;
		seenKeys.add(signature);
		keyByVariantId.set(variant.id, key);
	}

	const axes = options
		.filter((option) => usedAxisIds.has(option.id))
		.sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"))
		.map((option) => ({
			id: option.id,
			nome: option.nome,
			values: option.valores
				.filter((value) => variants.some((variant) => keyByVariantId.get(variant.id)?.[option.id] === value.id))
				.sort((a, b) => a.ordem - b.ordem)
				.map((value) => ({
					id: value.id,
					nome: value.nome,
					swatch: value.valorAuxiliar && HEX_COLOR.test(value.valorAuxiliar.trim()) ? value.valorAuxiliar.trim() : null,
					imageUrl: variants.find((variant) => keyByVariantId.get(variant.id)?.[option.id] === value.id && variant.imagemCapaUrl)?.imagemCapaUrl ?? null,
				})),
		}));

	return { axes, keyByVariantId };
}

/** Variantes compatíveis com o que já foi escolhido, ignorando um eixo (o que está sendo avaliado). */
export function findMatchingVariantIds(axes: TVariantAxes, selection: TVariantAxisSelection, ignoreAxisId?: string) {
	const matches: string[] = [];
	for (const [variantId, key] of axes.keyByVariantId) {
		const compatible = Object.entries(selection).every(([axisId, valueId]) => axisId === ignoreAxisId || key[axisId] === valueId);
		if (compatible) matches.push(variantId);
	}
	return matches;
}

/** Variante da combinação, quando todos os eixos estão escolhidos e ela existe. */
export function resolveSelectedVariantId(axes: TVariantAxes, selection: TVariantAxisSelection) {
	if (axes.axes.some((axis) => !selection[axis.id])) return null;
	return findMatchingVariantIds(axes, selection)[0] ?? null;
}

/** Variantes que este valor formaria com o que já está escolhido nos outros eixos. */
export function findVariantIdsForValue(axes: TVariantAxes, selection: TVariantAxisSelection, axisId: string, valueId: string) {
	return findMatchingVariantIds(axes, { ...selection, [axisId]: valueId });
}

/**
 * Escolhe um valor. Os outros eixos que deixam de ter combinação são limpos, e um eixo que ficou
 * com uma única saída é preenchido sozinho (escolher "Terracota", que só existe em M, já marca M).
 */
export function selectAxisValue(axes: TVariantAxes, selection: TVariantAxisSelection, axisId: string, valueId: string): TVariantAxisSelection {
	const next: TVariantAxisSelection = { [axisId]: valueId };
	// Mantém, na ordem dos eixos, cada escolha anterior que ainda combina com o que já ficou.
	for (const axis of axes.axes) {
		const previous = selection[axis.id];
		if (axis.id === axisId || !previous) continue;
		if (findMatchingVariantIds(axes, { ...next, [axis.id]: previous }).length > 0) next[axis.id] = previous;
	}
	return fillSingleChoices(axes, next);
}

/** Preenche os eixos que, dada a seleção, só têm um valor possível. */
export function fillSingleChoices(axes: TVariantAxes, selection: TVariantAxisSelection): TVariantAxisSelection {
	let next = selection;
	let changed = true;
	while (changed) {
		changed = false;
		for (const axis of axes.axes) {
			if (next[axis.id]) continue;
			const options = axis.values.filter((value) => findVariantIdsForValue(axes, next, axis.id, value.id).length > 0);
			if (options.length === 1) {
				next = { ...next, [axis.id]: options[0].id };
				changed = true;
			}
		}
	}
	return next;
}

/** Combinação de uma variante já identificada (código de barras), ou seleção vazia se não for do produto. */
export function selectionFromVariant(axes: TVariantAxes, variantId: string | null): TVariantAxisSelection {
	if (!variantId) return {};
	return { ...axes.keyByVariantId.get(variantId) };
}

/**
 * Preço a mostrar num valor de eixo: o das variantes que ele ainda pode formar com a seleção
 * atual. Valor único quando todas custam o mesmo; "a partir de" o menor quando variam. `null`
 * quando o produto inteiro tem um preço só, porque aí o preço não ajuda a escolher.
 */
export function resolveAxisValuePrice({ candidatePrices, allPrices }: { candidatePrices: number[]; allPrices: number[] }) {
	if (new Set(allPrices).size <= 1 || candidatePrices.length === 0) return null;
	return { amount: Math.min(...candidatePrices), isMinimum: new Set(candidatePrices).size > 1 };
}
