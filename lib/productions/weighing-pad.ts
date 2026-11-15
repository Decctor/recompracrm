import { normalizeUnit } from "@/lib/purchase/units";

/**
 * Teclado da pesagem de produção. O buffer guarda exatamente o que foi digitado ("12,5"), com vírgula
 * decimal — nunca centésimos implícitos: "24" é 24, seja kg ou unidade. A vírgula só existe para
 * unidades fracionáveis (KG, L, G…); em unidades de contagem (UN, CX, PC…) o teclado só aceita inteiros.
 *
 * Balança que digita como teclado manda o separador como "." ou ",": os dois viram a vírgula.
 */

/** Unidades de contagem: a quantidade é sempre inteira. Unidade desconhecida ou vazia aceita fração. */
const COUNT_UNITS = new Set(["UN", "PC", "CX", "PT", "FD", "CJ", "KIT", "PAR", "SC", "DZ", "RL"]);

const MAX_INTEGER_DIGITS = 5;
const MAX_DECIMAL_DIGITS = 3;

export function allowsFractionalQuantity(unit: string | null | undefined) {
	const normalized = normalizeUnit(unit);
	return normalized == null || !COUNT_UNITS.has(normalized);
}

export type TPadKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "00" | "," | "back";

/** Teclas da grade 3×4: vírgula para unidades fracionáveis, "00" para as de contagem. */
export function getPadKeys(allowDecimal: boolean): TPadKey[] {
	return ["1", "2", "3", "4", "5", "6", "7", "8", "9", allowDecimal ? "," : "00", "0", "back"];
}

/**
 * Aplica uma tecla ao buffer. Zeros à esquerda caem; "0" num buffer vazio vira zero digitado — é como
 * se registra um insumo que não foi usado (sem isso, confirmar lançaria o previsto). O buffer para em
 * 5 dígitos inteiros e 3 decimais.
 */
export function pressPadKey(buffer: string, key: string, { allowDecimal }: { allowDecimal: boolean }): string {
	if (key === "back") return buffer.slice(0, -1);
	if (key === "00") return pressPadKey(pressPadKey(buffer, "0", { allowDecimal }), "0", { allowDecimal });
	if (key === "," || key === ".") {
		if (!allowDecimal || buffer.includes(",")) return buffer;
		return `${buffer || "0"},`;
	}
	if (!/^\d$/.test(key)) return buffer;

	const separatorIndex = buffer.indexOf(",");
	if (separatorIndex >= 0) {
		const decimals = buffer.slice(separatorIndex + 1);
		return decimals.length >= MAX_DECIMAL_DIGITS ? buffer : buffer + key;
	}

	const next = buffer === "0" ? key : buffer + key;
	return next.length > MAX_INTEGER_DIGITS ? buffer : next;
}

/** Valor do buffer; `null` quando nada foi digitado. "12," vale 12. */
export function parsePadBuffer(buffer: string): number | null {
	if (buffer === "") return null;
	const value = Number(buffer.replace(",", "."));
	return Number.isFinite(value) ? value : null;
}

/** Visor com o valor já gravado ou previsto (nada digitado): inteiro para contagem, até 3 casas no resto. */
export function formatPadValue(value: number, allowDecimal: boolean) {
	return value.toLocaleString("pt-BR", { maximumFractionDigits: allowDecimal ? MAX_DECIMAL_DIGITS : 0 });
}
