// GTIN (EAN-8, UPC-A/GTIN-12, EAN-13, GTIN-14): o número impresso no código de barras.
// Separado de `products.codigo`, que é a chave de identidade das integrações (SKU, código do ERP).

const GTIN_LENGTHS = new Set([8, 12, 13, 14]);

function gtinCheckDigit(body: string) {
	// Pesos 3,1,3,1… a partir do dígito mais à direita do corpo (sem o verificador).
	let sum = 0;
	for (let index = 0; index < body.length; index++) {
		const digit = Number(body[body.length - 1 - index]);
		sum += index % 2 === 0 ? digit * 3 : digit;
	}
	return (10 - (sum % 10)) % 10;
}

export function isValidGtin(digits: string) {
	if (!/^\d+$/.test(digits) || !GTIN_LENGTHS.has(digits.length)) return false;
	// Só zeros passaria no cálculo, mas não identifica produto algum.
	if (/^0+$/.test(digits)) return false;
	return gtinCheckDigit(digits.slice(0, -1)) === Number(digits[digits.length - 1]);
}

/**
 * Normaliza um código de barras digitado ou vindo de integração: remove espaços, pontos e hífens e
 * devolve os dígitos quando formam um GTIN válido; senão `null`. Nunca recalcula o verificador — um
 * código "corrigido" seria impresso como o de outro produto.
 */
export function normalizeGtin(raw: string | null | undefined): string | null {
	if (raw == null) return null;
	const digits = raw.replace(/[\s.-]/g, "");
	return isValidGtin(digits) ? digits : null;
}
