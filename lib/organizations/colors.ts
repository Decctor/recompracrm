/**
 * Primitivas puras de cor da identidade da organização.
 *
 * Vivem fora de `OrgColorsProvider` (que é "use client") porque server components — como as páginas
 * do ponto de interação — precisam derivar cores durante o render no servidor. Todo export de um
 * módulo "use client" vira client reference e não pode ser chamado no servidor.
 */

// Cores padrão aplicadas quando a organização não configurou a própria identidade.
// Espelham os tokens `--color-brand*` de styles/globals.css.
export const DEFAULT_ORG_COLORS = {
	primary: "#24549C", // Blue - Structural actions, active states, focus and navigation
	primaryForeground: "#FFFFFF", // White text on blue
	secondary: "#FFB900", // Yellow/Gold - Cashback, rewards and celebration moments
	secondaryForeground: "#000000", // Black text on yellow
} as const;

// WCAG relative luminance of a hex color (0 = black, 1 = white)
function getRelativeLuminance(hex: string): number {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	if (!result) return 0;
	const [r, g, b] = [result[1], result[2], result[3]].map((channel) => {
		const value = Number.parseInt(channel, 16) / 255;
		return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function getContrastRatio(hexA: string, hexB: string): number {
	const luminanceA = getRelativeLuminance(hexA);
	const luminanceB = getRelativeLuminance(hexB);
	const lighter = Math.max(luminanceA, luminanceB);
	const darker = Math.min(luminanceA, luminanceB);
	return (lighter + 0.05) / (darker + 0.05);
}

// Org colors come straight from the database with no guarantee the configured
// foreground is readable on the background. Below 3:1 (WCAG minimum for UI
// components / large text) we fall back to plain black or white.
export function ensureReadableForeground(background: string, foreground: string): string {
	if (getContrastRatio(background, foreground) >= 3) return foreground;
	return getContrastRatio(background, "#111111") >= getContrastRatio(background, "#ffffff") ? "#111111" : "#ffffff";
}

function parseHex(hex: string): [number, number, number] | null {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	if (!result) return null;
	return [Number.parseInt(result[1], 16), Number.parseInt(result[2], 16), Number.parseInt(result[3], 16)];
}

function toHex([r, g, b]: [number, number, number]): string {
	return `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

// 4.5:1 é o piso AA para texto normal. O medidor e o número grande da faixa passariam com 3:1,
// mas a linha de legenda (13px) não — e é ela que decide o tom da faixa inteira.
const AA_NORMAL_TEXT = 4.5;

/**
 * Escurece a cor até que texto branco sobre ela alcance 4.5:1.
 *
 * A faixa de "Vendas de hoje" é um bloco da cor da organização com texto branco por cima, e a cor
 * vem do banco sem garantia de contraste: o teal #18a199 de exemplo dá 3.3:1 com branco, suficiente
 * para os números grandes e insuficiente para a legenda. Em vez de trocar a identidade por um
 * cinza, multiplicamos os canais até o tom passar — #18a199 vira ~#117f77, que ainda lê como o
 * mesmo teal. Devolve a própria cor quando ela já passa, e null quando o hex é inválido.
 */
export function darkenUntilReadableWithWhite(background: string, minimumRatio = AA_NORMAL_TEXT): string | null {
	const parsed = parseHex(background);
	if (!parsed) return null;
	if (getContrastRatio(background, "#ffffff") >= minimumRatio) return toHex(parsed);

	let candidate = parsed;
	// Cada passo tira 6% da luz. 40 passos chegam a ~8% do valor original, escuro o bastante para
	// qualquer matiz passar muito antes do fim — o laço termina pelo teste, não pelo limite.
	for (let step = 0; step < 40; step++) {
		candidate = [candidate[0] * 0.94, candidate[1] * 0.94, candidate[2] * 0.94];
		if (getContrastRatio(toHex(candidate), "#ffffff") >= minimumRatio) break;
	}
	return toHex(candidate);
}
