import type { CSSProperties } from "react";

// Codificação EAN-13 / EAN-8 (GS1). O dígito verificador NUNCA é recalculado: o código vem validado
// do cadastro e é desenhado exatamente como está.

const L_CODES = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const R_CODES = L_CODES.map((code) => code.replace(/./g, (bit) => (bit === "1" ? "0" : "1")));
const G_CODES = R_CODES.map((code) => code.split("").reverse().join(""));
// Paridade (L/G) dos 6 dígitos da esquerda, definida pelo primeiro dígito do EAN-13.
const EAN13_PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

export type TEanBars = {
	kind: "EAN13" | "EAN8";
	digits: string;
	modules: string; // "1" = barra, "0" = espaço
	// Índices [início, fim) dos módulos de guarda (barras mais longas).
	guards: [number, number][];
};

/** Normaliza o código: EAN-13 e EAN-8 como estão; UPC-A (12) vira EAN-13 com 0 à esquerda; o resto, nulo. */
export function normalizeEanCode(code: string | null | undefined): string | null {
	if (!code) return null;
	const digits = code.trim();
	if (!/^\d+$/.test(digits)) return null;
	if (digits.length === 13 || digits.length === 8) return digits;
	if (digits.length === 12) return `0${digits}`;
	return null;
}

/** Módulos (barras e espaços) do código, ou nulo quando o código não é EAN-13/EAN-8/UPC-A. */
export function eanBars(code: string | null | undefined): TEanBars | null {
	const digits = normalizeEanCode(code);
	if (!digits) return null;
	const d = digits.split("").map(Number);

	if (digits.length === 8) {
		let modules = "101";
		for (let i = 0; i < 4; i++) modules += L_CODES[d[i]];
		modules += "01010";
		for (let i = 4; i < 8; i++) modules += R_CODES[d[i]];
		modules += "101";
		return {
			kind: "EAN8",
			digits,
			modules,
			guards: [
				[0, 3],
				[31, 36],
				[64, 67],
			],
		};
	}

	const parity = EAN13_PARITY[d[0]];
	let modules = "101";
	for (let i = 1; i <= 6; i++) modules += (parity[i - 1] === "L" ? L_CODES : G_CODES)[d[i]];
	modules += "01010";
	for (let i = 7; i <= 12; i++) modules += R_CODES[d[i]];
	modules += "101";
	return {
		kind: "EAN13",
		digits,
		modules,
		guards: [
			[0, 3],
			[45, 50],
			[92, 95],
		],
	};
}

// Geometria em módulos (viewBox): barras de 25, guardas de 29, dígitos na linha de base 35.
const BAR_HEIGHT = 25;
const GUARD_HEIGHT = 29;
const VIEW_HEIGHT = 37;
const TEXT_Y = 35;
const FONT_SIZE = 8.5;

function barsPath(bars: TEanBars, offset: number) {
	const isGuard = (index: number) => bars.guards.some(([start, end]) => index >= start && index < end);
	let path = "";
	for (let i = 0; i < bars.modules.length; ) {
		if (bars.modules[i] !== "1") {
			i++;
			continue;
		}
		let j = i;
		while (bars.modules[j] === "1") j++;
		const height = isGuard(i) ? GUARD_HEIGHT : BAR_HEIGHT;
		path += `M${offset + i} 0h${j - i}v${height}h${i - j}z`;
		i = j;
	}
	return path;
}

type TEanBarcodeProps = {
	code: string | null | undefined;
	/** Largura em px; a altura acompanha a proporção quando não informada. */
	width?: number;
	height?: number;
	color?: string;
	style?: CSSProperties;
};

/** Código de barras EAN-13/EAN-8 em SVG. Não renderiza nada quando o código não é suportado. */
export function EanBarcode({ code, width, height, color = "#111111", style }: TEanBarcodeProps) {
	const bars = eanBars(code);
	if (!bars) return null;

	const isEan13 = bars.kind === "EAN13";
	// EAN-13 reserva a margem esquerda para o primeiro dígito, impresso fora das barras.
	const left = isEan13 ? 9 : 7;
	const right = isEan13 ? 4 : 7;
	const viewWidth = left + bars.modules.length + right;
	const halves = isEan13 ? [bars.digits.slice(1, 7), bars.digits.slice(7)] : [bars.digits.slice(0, 4), bars.digits.slice(4)];
	const halfCenters = isEan13 ? [left + 24, left + 71] : [left + 17, left + 50];

	const resolvedWidth = width ?? (height != null ? (height * viewWidth) / VIEW_HEIGHT : undefined);
	const resolvedHeight = height ?? (width != null ? (width * VIEW_HEIGHT) / viewWidth : undefined);

	return (
		<svg
			viewBox={`0 0 ${viewWidth} ${VIEW_HEIGHT}`}
			width={resolvedWidth}
			height={resolvedHeight}
			role="img"
			aria-label={bars.digits}
			style={{ display: "block", flexShrink: 0, fill: color, ...style }}
		>
			<path d={barsPath(bars, left)} />
			<g fontSize={FONT_SIZE} fontWeight={500} textAnchor="middle" letterSpacing={0.6}>
				{isEan13 ? (
					<text x={4} y={TEXT_Y}>
						{bars.digits[0]}
					</text>
				) : null}
				<text x={halfCenters[0]} y={TEXT_Y}>
					{halves[0]}
				</text>
				<text x={halfCenters[1]} y={TEXT_Y}>
					{halves[1]}
				</text>
			</g>
		</svg>
	);
}

/** Alias explícito para quem só lida com EAN-13. */
export const Ean13Barcode = EanBarcode;
