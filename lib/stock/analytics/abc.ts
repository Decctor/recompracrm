export const ABC_CLASS_A_LIMIT = 0.8;
export const ABC_CLASS_B_LIMIT = 0.95;

export type TAbcClass = "A" | "B" | "C";

export type TAbcInput = { produtoId: string; valor: number };

/**
 * Curva ABC: ordena por valor (faturamento ou unidades) e acumula a participação.
 * Classe A até 80% acumulado, B até 95%, C o restante. O produto que cruza o limite fica na classe de
 * baixo do limite (o primeiro a passar de 80% ainda é A), e quem não vendeu nada é sempre C.
 * Empates em valor desempatam pelo id, para a curva não trocar de ordem entre requisições.
 */
export function classifyAbc(items: TAbcInput[]) {
	const sorted = items.slice().sort((a, b) => b.valor - a.valor || a.produtoId.localeCompare(b.produtoId));
	const total = sorted.reduce((sum, item) => sum + Math.max(0, item.valor), 0);
	let accumulatedBefore = 0;
	return sorted.map((item, index) => {
		const valor = Math.max(0, item.valor);
		const participacao = total > 0 ? valor / total : 0;
		const classe: TAbcClass = valor <= 0 ? "C" : accumulatedBefore < ABC_CLASS_A_LIMIT ? "A" : accumulatedBefore < ABC_CLASS_B_LIMIT ? "B" : "C";
		accumulatedBefore += participacao;
		return { produtoId: item.produtoId, valor, posicao: index + 1, participacao, acumulado: accumulatedBefore, classe };
	});
}
export type TAbcRankedItem = ReturnType<typeof classifyAbc>[number];

/** Totais por classe: produtos, participação no catálogo e no valor. */
export function summarizeAbc(ranked: TAbcRankedItem[]) {
	const empty = () => ({ produtos: 0, participacao: 0, valor: 0, participacaoCatalogo: 0 });
	const classes = { A: empty(), B: empty(), C: empty() };
	for (const item of ranked) {
		classes[item.classe].produtos += 1;
		classes[item.classe].participacao += item.participacao;
		classes[item.classe].valor += item.valor;
	}
	for (const key of ["A", "B", "C"] as const) classes[key].participacaoCatalogo = ranked.length > 0 ? classes[key].produtos / ranked.length : 0;
	return classes;
}

/**
 * Amostra da curva acumulada para gráficos: no máximo `maxPoints` pontos `{ x, y }` em fração
 * (x = posição ÷ total de produtos, y = acumulado), sempre incluindo a origem e o último produto.
 */
export function sampleAbcCurve(ranked: TAbcRankedItem[], maxPoints = 60) {
	if (ranked.length === 0) return [];
	const step = Math.max(1, Math.ceil(ranked.length / maxPoints));
	const points = [{ x: 0, y: 0 }];
	for (let index = 0; index < ranked.length; index += step) points.push({ x: (index + 1) / ranked.length, y: ranked[index].acumulado });
	const last = ranked[ranked.length - 1];
	if (points[points.length - 1].x < 1) points.push({ x: 1, y: last.acumulado });
	return points;
}
