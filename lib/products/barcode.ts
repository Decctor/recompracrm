import { normalizeGtin } from "./gtin";

/** Conjunto B do Code 128: ASCII imprimível, preservando a identidade do código. */
export function isCode128Value(value: string) {
	return /^[\x20-\x7e]+$/.test(value) && value.trim().length > 0;
}

/** GTIN válido perde apenas a formatação; código interno imprimível permanece como cadastrado. */
export function normalizeProductBarcode(value: string | null | undefined): string | null {
	if (value == null || !value.trim()) return null;
	return normalizeGtin(value) ?? (isCode128Value(value) ? value : null);
}
