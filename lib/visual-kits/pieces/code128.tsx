import type { CSSProperties } from "react";
import { isCode128Value } from "@/lib/products/barcode";

// Code 128: larguras alternadas de barras/espaços, em módulos, para símbolos 0–106.
// Referência da simbologia: https://github.com/zxing/zxing/blob/master/core/src/main/java/com/google/zxing/oned/Code128Reader.java
const SYMBOL_WIDTHS = [
	"212222",
	"222122",
	"222221",
	"121223",
	"121322",
	"131222",
	"122213",
	"122312",
	"132212",
	"221213",
	"221312",
	"231212",
	"112232",
	"122132",
	"122231",
	"113222",
	"123122",
	"123221",
	"223211",
	"221132",
	"221231",
	"213212",
	"223112",
	"312131",
	"311222",
	"321122",
	"321221",
	"312212",
	"322112",
	"322211",
	"212123",
	"212321",
	"232121",
	"111323",
	"131123",
	"131321",
	"112313",
	"132113",
	"132311",
	"211313",
	"231113",
	"231311",
	"112133",
	"112331",
	"132131",
	"113123",
	"113321",
	"133121",
	"313121",
	"211331",
	"231131",
	"213113",
	"213311",
	"213131",
	"311123",
	"311321",
	"331121",
	"312113",
	"312311",
	"332111",
	"314111",
	"221411",
	"431111",
	"111224",
	"111422",
	"121124",
	"121421",
	"141122",
	"141221",
	"112214",
	"112412",
	"122114",
	"122411",
	"142112",
	"142211",
	"241211",
	"221114",
	"413111",
	"241112",
	"134111",
	"111242",
	"121142",
	"121241",
	"114212",
	"124112",
	"124211",
	"411212",
	"421112",
	"421211",
	"212141",
	"214121",
	"412121",
	"111143",
	"111341",
	"131141",
	"114113",
	"114311",
	"411113",
	"411311",
	"113141",
	"114131",
	"311141",
	"411131",
	"211412",
	"211214",
	"211232",
	"2331112",
];

const START_B = 104;
const START_C = 105;
const SWITCH_C = 99;
const STOP = 106;
export const CODE128_QUIET_MODULES = 10;

export type TCode128Bars = { code: string; modules: string };

/** ASCII imprimível em B; códigos só numéricos em C (pares), preservando zeros à esquerda. */
export function code128Bars(code: string | null | undefined): TCode128Bars | null {
	// Não remover espaços: fazem parte da identidade do SKU. Sem controles, DEL ou Unicode.
	if (!code || !isCode128Value(code)) return null;
	let symbols: number[];
	if (/^\d{2,}$/.test(code)) {
		const odd = code.length % 2 === 1;
		symbols = odd ? [START_B, code.charCodeAt(0) - 32, SWITCH_C] : [START_C];
		for (let index = odd ? 1 : 0; index < code.length; index += 2) symbols.push(Number(code.slice(index, index + 2)));
	} else {
		symbols = [START_B, ...Array.from(code, (character) => character.charCodeAt(0) - 32)];
	}
	// Verificador obrigatório da simbologia, distinto de um dígito GTIN no cadastro.
	const checksum = symbols.reduce((sum, symbol, index) => sum + symbol * (index || 1), 0) % 103;
	symbols.push(checksum, STOP);
	const modules = symbols
		.map((symbol) => Array.from(SYMBOL_WIDTHS[symbol], (width, index) => (index % 2 === 0 ? "1" : "0").repeat(Number(width))).join(""))
		.join("");
	return { code, modules };
}

/** SVG com margens livres de 10 módulos, sem esticar/comprimir as barras para caber. */
export function Code128Barcode({
	bars,
	moduleWidth,
	barHeight,
	color = "#111111",
	style,
}: {
	bars: TCode128Bars;
	moduleWidth: number;
	barHeight: number;
	color?: string;
	style?: CSSProperties;
}) {
	const viewWidth = bars.modules.length + 2 * CODE128_QUIET_MODULES;
	const viewHeight = barHeight + 12;
	let path = "";
	for (let index = 0; index < bars.modules.length; ) {
		if (bars.modules[index] !== "1") {
			index++;
			continue;
		}
		let end = index + 1;
		while (bars.modules[end] === "1") end++;
		path += `M${CODE128_QUIET_MODULES + index} 0h${end - index}v${barHeight}h${index - end}z`;
		index = end;
	}
	return (
		<svg
			viewBox={`0 0 ${viewWidth} ${viewHeight}`}
			width={viewWidth * moduleWidth}
			height={viewHeight * moduleWidth}
			role="img"
			aria-label={bars.code}
			style={{ display: "block", flexShrink: 0, fill: color, ...style }}
		>
			<path d={path} />
			<text x={viewWidth / 2} y={barHeight + 10} fontSize={8.5} fontWeight={500} textAnchor="middle" xmlSpace="preserve">
				{bars.code}
			</text>
		</svg>
	);
}
