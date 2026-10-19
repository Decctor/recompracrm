// Geometria dos gráficos desenhados em SVG com `viewBox="0 0 100 100"` e `preserveAspectRatio="none"`:
// x e y em porcentagem da área do gráfico, y crescendo para baixo. Marcadores, tooltips e linhas de
// referência são HTML posicionado com as mesmas porcentagens, então ficam alinhados à linha em
// qualquer largura sem medir o DOM.

/** Curva monotônica (Fritsch–Carlson): suave sem ultrapassar os pontos, como o `monotone` do recharts. */
export function monotonePath(xs: number[], ys: number[]) {
	const n = xs.length;
	if (n === 0) return "";
	if (n === 1) return `M${xs[0].toFixed(3)},${ys[0].toFixed(3)}`;
	const slopes: number[] = [];
	const tangents: number[] = [];
	for (let i = 0; i < n - 1; i++) slopes[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i] || 1e-9);
	tangents[0] = slopes[0];
	for (let i = 1; i < n - 1; i++) tangents[i] = slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2;
	tangents[n - 1] = slopes[n - 2];
	for (let i = 0; i < n - 1; i++) {
		if (slopes[i] === 0) {
			tangents[i] = 0;
			tangents[i + 1] = 0;
			continue;
		}
		const a = tangents[i] / slopes[i];
		const b = tangents[i + 1] / slopes[i];
		const s = a * a + b * b;
		if (s > 9) {
			const k = 3 / Math.sqrt(s);
			tangents[i] = k * a * slopes[i];
			tangents[i + 1] = k * b * slopes[i];
		}
	}
	let d = `M${xs[0].toFixed(3)},${ys[0].toFixed(3)}`;
	for (let i = 0; i < n - 1; i++) {
		const h = (xs[i + 1] - xs[i]) / 3;
		d += ` C${(xs[i] + h).toFixed(3)},${(ys[i] + tangents[i] * h).toFixed(3)} ${(xs[i + 1] - h).toFixed(3)},${(ys[i + 1] - tangents[i + 1] * h).toFixed(3)} ${xs[i + 1].toFixed(3)},${ys[i + 1].toFixed(3)}`;
	}
	return d;
}

/** Linha em degraus: o valor vale até a próxima mudança (custo e preço mudam por evento, não gradualmente). */
export function stepPath(points: { x: number; y: number }[], endX = 100) {
	if (points.length === 0) return "";
	let d = `M${points[0].x.toFixed(3)},${points[0].y.toFixed(3)}`;
	for (let i = 1; i < points.length; i++) d += ` H${points[i].x.toFixed(3)} V${points[i].y.toFixed(3)}`;
	return `${d} H${endX.toFixed(3)}`;
}

/** Passo "redondo" (1, 2, 5 × 10ⁿ) para os rótulos do eixo. */
export function niceStep(raw: number) {
	if (!(raw > 0)) return 1;
	const power = 10 ** Math.floor(Math.log10(raw));
	const fraction = raw / power;
	return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
}

/** Domínio arredondado e ticks para um eixo com `ticks` intervalos. */
export function niceDomain(min: number, max: number, ticks = 4, { includeZero = false } = {}) {
	let low = includeZero ? Math.min(0, min) : min;
	let high = max;
	if (high - low <= 0) {
		high = low + 1;
		if (!includeZero) low = Math.max(0, low - 1);
	}
	const step = niceStep((high - low) / ticks);
	const domainLow = Math.floor(low / step) * step;
	const domainHigh = Math.ceil(high / step) * step;
	const values: number[] = [];
	for (let value = domainLow; value <= domainHigh + step / 1000; value += step) values.push(Number(value.toFixed(10)));
	return { min: domainLow, max: domainHigh, ticks: values };
}

/** Posição horizontal do centro do i-ésimo de `count` slots, em %. */
export function slotCenter(index: number, count: number, totalSlots = count) {
	return ((index + 0.5) / totalSlots) * 100;
}
