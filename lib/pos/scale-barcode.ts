import { isValidGtin } from "@/lib/products/gtin";
import type { TScaleBarcodeValueTypeEnum } from "@/schemas/enums";

// Etiquetas de balança: EAN-13 de uso interno da loja (prefixo 2) que carregam o código do produto
// na balança (PLU) e o valor da pesagem — o total a pagar ou o peso. Cada balança monta o código
// de um jeito e o modelo nem sempre é conhecido, então o layout vem da organização como máscara:
//
//   2PPPPPVVVVVVD  →  2 | 00010 | 000809 | 6  →  PLU 10, R$ 8,09
//
// Dígito = literal que precisa bater; P = PLU; V = valor; D = dígito verificador do EAN-13.
// Puro e sem dependência de servidor: a mesma leitura roda no PDV (via rota) e no teste de máscara
// da tela de configuração.

export const SCALE_BARCODE_LENGTH = 13;

export type TScaleBarcodeConfig = {
	habilitado: boolean;
	mascara: string;
	tipoValor: TScaleBarcodeValueTypeEnum;
	casasDecimais: number;
};

export const DEFAULT_SCALE_BARCODE_CONFIG: TScaleBarcodeConfig = {
	habilitado: false,
	mascara: "2PPPPPVVVVVVD",
	tipoValor: "PRECO",
	casasDecimais: 2,
};

/** Layouts mais comuns das balanças etiquetadoras no Brasil (Toledo, Filizola, Urano). */
export const SCALE_BARCODE_MASK_PRESETS = [
	{ mascara: "2PPPPPVVVVVVD", label: "PLU com 5 dígitos, valor com 6" },
	{ mascara: "2PPPP0VVVVVVD", label: "PLU com 4 dígitos, valor com 6" },
	{ mascara: "2PPPPPP0VVVVD", label: "PLU com 6 dígitos, valor com 4" },
	{ mascara: "2PPPPVVVVVVVD", label: "PLU com 4 dígitos, valor com 7" },
] as const;

type TScaleBarcodeLayout = {
	literals: Array<{ index: number; digit: string }>;
	plu: { start: number; length: number };
	valor: { start: number; length: number };
};

type TMaskParseResult = { ok: true; layout: TScaleBarcodeLayout } | { ok: false; error: string };

function findSingleRun(mask: string, char: string) {
	const start = mask.indexOf(char);
	if (start === -1) return null;
	const end = mask.lastIndexOf(char);
	const run = mask.slice(start, end + 1);
	if (!/^(.)\1*$/.test(run)) return null;
	return { start, length: end - start + 1 };
}

export function parseScaleBarcodeMask(rawMask: string): TMaskParseResult {
	const mask = rawMask.trim().toUpperCase();
	if (mask.length !== SCALE_BARCODE_LENGTH)
		return { ok: false, error: `A máscara deve ter ${SCALE_BARCODE_LENGTH} caracteres, como o código da etiqueta.` };
	if (!/^[0-9PVD]+$/.test(mask)) return { ok: false, error: "Use apenas dígitos e as letras P (código), V (valor) e D (verificador)." };
	if (!/^[0-9]/.test(mask)) return { ok: false, error: "A máscara deve começar pelo prefixo fixo da etiqueta (geralmente 2)." };
	if (mask.indexOf("D") !== SCALE_BARCODE_LENGTH - 1) return { ok: false, error: "O dígito verificador (D) deve ser só o último caractere." };

	const plu = findSingleRun(mask, "P");
	if (!plu) return { ok: false, error: "O código do produto (P) deve ser um único bloco contínuo." };
	if (plu.length > 6) return { ok: false, error: "O código do produto (P) tem no máximo 6 dígitos." };
	const valor = findSingleRun(mask, "V");
	if (!valor) return { ok: false, error: "O valor (V) deve ser um único bloco contínuo." };
	if (valor.length < 4 || valor.length > 7) return { ok: false, error: "O valor (V) deve ter entre 4 e 7 dígitos." };

	const literals: TScaleBarcodeLayout["literals"] = [];
	for (let index = 0; index < SCALE_BARCODE_LENGTH - 1; index++) {
		if (/[0-9]/.test(mask[index])) literals.push({ index, digit: mask[index] });
	}
	return { ok: true, layout: { literals, plu, valor } };
}

export type TScaleBarcodeReading = {
	/** PLU como impresso, com zeros à esquerda. */
	plu: string;
	tipoValor: TScaleBarcodeValueTypeEnum;
	/** Total em reais (PRECO) ou quantidade pesada (PESO). */
	valor: number;
};

/**
 * Lê uma etiqueta de balança. `null` quando o código não segue a máscara — aí ele é um código
 * comum e segue a busca normal. O verificador é conferido para uma leitura truncada não virar
 * um valor errado no carrinho.
 */
export function readScaleBarcode(rawCode: string, config: TScaleBarcodeConfig): TScaleBarcodeReading | null {
	if (!config.habilitado) return null;
	const code = rawCode.trim();
	if (code.length !== SCALE_BARCODE_LENGTH || !/^\d+$/.test(code)) return null;
	const parsed = parseScaleBarcodeMask(config.mascara);
	if (!parsed.ok) return null;
	const { layout } = parsed;
	if (layout.literals.some(({ index, digit }) => code[index] !== digit)) return null;
	if (!isValidGtin(code)) return null;

	const plu = code.slice(layout.plu.start, layout.plu.start + layout.plu.length);
	const rawValue = Number(code.slice(layout.valor.start, layout.valor.start + layout.valor.length));
	const valor = rawValue / 10 ** config.casasDecimais;
	if (!(valor > 0)) return null;
	return { plu, tipoValor: config.tipoValor, valor };
}

/** PLU comparável: a balança e o cadastro completam com zeros de jeitos diferentes. */
export function normalizeScalePlu(value: string | null | undefined): string | null {
	if (value == null) return null;
	const trimmed = value.trim();
	if (!/^\d+$/.test(trimmed)) return null;
	const stripped = trimmed.replace(/^0+/, "");
	return stripped.length > 0 ? stripped : null;
}

function roundTo(value: number, decimals: number) {
	const factor = 10 ** decimals;
	return Math.round((value + Number.EPSILON) * factor) / factor;
}

// Quatro casas, não gramas. O total da linha é sempre quantidade × preço arredondado, então a nota
// fecha (a NFC-e rejeita item cujo total difere de quantidade × unitário — rejeição 629); o que as
// casas decidem é quanto o cobrado se afasta da etiqueta. Com três, um item de R$ 99,90/kg erra
// até R$ 0,05; com quatro, fica a no máximo um centavo até uns R$ 200/kg.
export const SCALE_QUANTITY_DECIMALS = 4;

/**
 * Quantidade e total de uma pesagem pelo preço do sistema, que é a fonte de verdade: numa etiqueta
 * de PRECO, a quantidade sai do total impresso dividido pelo preço do cadastro — se a balança
 * estiver com outro preço, o peso calculado diverge do impresso, não o valor cobrado.
 */
export function resolveScaleItemQuantity({
	reading,
	precoUnitario,
}: {
	reading: TScaleBarcodeReading;
	precoUnitario: number;
}): { quantidade: number; valorTotal: number } | null {
	if (reading.tipoValor === "PRECO") {
		if (!(precoUnitario > 0)) return null;
		const quantidade = roundTo(reading.valor / precoUnitario, SCALE_QUANTITY_DECIMALS);
		if (!(quantidade > 0)) return null;
		return { quantidade, valorTotal: roundTo(quantidade * precoUnitario, 2) };
	}
	const quantidade = roundTo(reading.valor, SCALE_QUANTITY_DECIMALS);
	return { quantidade, valorTotal: roundTo(quantidade * Math.max(precoUnitario, 0), 2) };
}

/** Quantidade de linha de carrinho: inteira como sempre; pesagem com até quatro casas ("0,2459"). */
export function formatItemQuantity(quantidade: number) {
	if (Number.isInteger(quantidade)) return String(quantidade);
	return quantidade.toLocaleString("pt-BR", { maximumFractionDigits: SCALE_QUANTITY_DECIMALS });
}
