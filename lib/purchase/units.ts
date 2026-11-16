/**
 * Unidades comerciais na importação de nota fiscal.
 *
 * O fornecedor fatura na unidade dele (CX, FD, PCT) e o catálogo estoca na sua (UN, KG). Sem
 * conversão, uma nota de "10 CX" entra como 10 unidades e o estoque nasce errado, em silêncio.
 * O fator responde "quantas unidades internas cabem em 1 unidade do fornecedor", e a conversão
 * preserva o total: quantidade × fator, valor unitário ÷ fator.
 */

/** Sinônimos comuns de unidade comercial em documentos brasileiros. */
const UNIT_ALIASES: Record<string, string> = {
	UN: "UN",
	UND: "UN",
	UNID: "UN",
	UNIDADE: "UN",
	PC: "PC",
	PCS: "PC",
	PÇ: "PC",
	PECA: "PC",
	PEÇA: "PC",
	CX: "CX",
	CAIXA: "CX",
	KG: "KG",
	KGS: "KG",
	QUILO: "KG",
	G: "G",
	GR: "G",
	GRAMA: "G",
	GRAMAS: "G",
	MG: "MG",
	TON: "TON",
	L: "L",
	LT: "L",
	LTS: "L",
	LITRO: "L",
	ML: "ML",
	MILILITRO: "ML",
	M: "M",
	MT: "M",
	MTS: "M",
	METRO: "M",
	M2: "M2",
	M3: "M3",
	CM: "CM",
	MM: "MM",
	RL: "RL",
	ROLO: "RL",
	PT: "PT",
	PCT: "PT",
	PACOTE: "PT",
	FD: "FD",
	FARDO: "FD",
	CJ: "CJ",
	CONJ: "CJ",
	CONJUNTO: "CJ",
	KIT: "KIT",
	PAR: "PAR",
	SC: "SC",
	SACO: "SC",
	DZ: "DZ",
	DUZIA: "DZ",
};

export function normalizeUnit(unit?: string | null) {
	const cleaned = (unit ?? "")
		.trim()
		.toUpperCase()
		.replace(/[^\p{L}\p{N}]/gu, "");
	if (!cleaned) return null;
	return UNIT_ALIASES[cleaned] ?? cleaned;
}

/** Sem informação de um dos lados não há divergência a acusar: não inventamos alerta. */
export function unitsAreEquivalent(documentUnit?: string | null, productUnit?: string | null) {
	const normalizedDocument = normalizeUnit(documentUnit);
	const normalizedProduct = normalizeUnit(productUnit);
	if (!normalizedDocument || !normalizedProduct) return true;
	return normalizedDocument === normalizedProduct;
}

/**
 * Unidades de medida com conversão física conhecida, expressas na menor unidade da grandeza.
 * A dúzia entra como contagem: 1 DZ = 12 UN não depende do produto.
 */
const MEASURE_UNITS: Record<string, { dimension: "mass" | "volume" | "length" | "count"; size: number }> = {
	TON: { dimension: "mass", size: 1_000_000_000 },
	KG: { dimension: "mass", size: 1_000_000 },
	G: { dimension: "mass", size: 1000 },
	MG: { dimension: "mass", size: 1 },
	L: { dimension: "volume", size: 1000 },
	ML: { dimension: "volume", size: 1 },
	M: { dimension: "length", size: 1000 },
	CM: { dimension: "length", size: 10 },
	MM: { dimension: "length", size: 1 },
	DZ: { dimension: "count", size: 12 },
	UN: { dimension: "count", size: 1 },
	PC: { dimension: "count", size: 1 },
};

/**
 * Fator certo entre duas unidades da mesma grandeza (1 KG = 1000 G, 1 L = 1000 ML, 1 DZ = 12 UN).
 * Nulo quando as unidades são iguais, desconhecidas ou de grandezas diferentes: aí só o operador sabe.
 */
export function getMeasureConversionFactor(documentUnit?: string | null, productUnit?: string | null) {
	const from = MEASURE_UNITS[normalizeUnit(documentUnit) ?? ""];
	const to = MEASURE_UNITS[normalizeUnit(productUnit) ?? ""];
	if (!from || !to || from.dimension !== to.dimension || from.size === to.size) return null;
	return Number((from.size / to.size).toPrecision(12));
}

/** Melhor palpite de fator para uma linha cujas unidades divergem: medida conhecida antes da descrição. */
export function suggestConversionFactor({
	descricao,
	documentUnit,
	productUnit,
}: {
	descricao: string;
	documentUnit?: string | null;
	productUnit?: string | null;
}) {
	if (unitsAreEquivalent(documentUnit, productUnit)) return null;
	return getMeasureConversionFactor(documentUnit, productUnit) ?? inferPackFactorFromDescription(descricao);
}

/**
 * Lê o fator digitado em pt-BR. "1.000" é mil (separador de milhar), "1,5" e "0.5" são decimais.
 * Nulo quando não é um número positivo.
 */
export function parseConversionFactor(text: string): number | null {
	const cleaned = text.trim().replace(/\s/g, "");
	if (!cleaned) return null;
	let normalized: string;
	if (cleaned.includes(",")) normalized = cleaned.replace(/\./g, "").replace(",", ".");
	else if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) normalized = cleaned.replace(/\./g, "");
	else normalized = cleaned;
	const parsed = Number(normalized);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Fator como texto editável: vírgula decimal, sem separador de milhar. */
export function formatConversionFactor(fator: number | null | undefined) {
	if (!fator || fator <= 0) return "";
	return String(Number(fator.toPrecision(12))).replace(".", ",");
}

/** "1.000 G × R$ 0,50": quantidade e custo unitário como entram no estoque, depois do fator. */
export function describeConvertedLine({
	quantidade,
	valorUnitario,
	fatorConversao,
	unit,
}: {
	quantidade: number;
	valorUnitario: number;
	fatorConversao?: number | null;
	unit: string;
}) {
	const converted = convertLineToProductUnit({ quantidade, valorUnitario, fatorConversao });
	const quantity = converted.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
	// Converting to a smaller unit makes cents vanish (R$ 0,0005 / G): show the digits that matter.
	const cost = converted.valorUnitario.toLocaleString("pt-BR", {
		minimumFractionDigits: 2,
		maximumFractionDigits: converted.valorUnitario > 0 && converted.valorUnitario < 1 ? 6 : 2,
	});
	return `${quantity} ${unit} × R$ ${cost}`;
}

/**
 * Tenta ler o tamanho da embalagem na própria descrição ("CX 12", "CAIXA C/ 24", "FD X 6").
 * É apenas uma sugestão para poupar digitação: quem confirma o fator é o operador.
 */
export function inferPackFactorFromDescription(descricao: string): number | null {
	const patterns = [
		/(?:CX|CAIXA|PCT|PACOTE|FARDO|FD|CJ|CONJUNTO|DZ|DUZIA)\s*(?:C\/|COM|X|\/)?\s*(\d{1,4})\b/i,
		/\b(\d{1,4})\s*(?:UN|UND|UNID|UNIDADES?|PC|PCS|PE[ÇC]AS?)\b/i,
	];
	for (const pattern of patterns) {
		const match = descricao.match(pattern);
		const parsed = match?.[1] ? Number(match[1]) : Number.NaN;
		if (Number.isFinite(parsed) && parsed > 1) return parsed;
	}
	return null;
}

/**
 * Converte a linha lida do documento para a unidade interna do produto. O fator não altera o total
 * da linha, apenas redistribui quantidade e valor unitário entre as duas unidades.
 */
export function convertLineToProductUnit({
	quantidade,
	valorUnitario,
	fatorConversao,
}: {
	quantidade: number;
	valorUnitario: number;
	fatorConversao?: number | null;
}) {
	const fator = fatorConversao && fatorConversao > 0 ? fatorConversao : 1;
	return { quantidade: quantidade * fator, valorUnitario: valorUnitario / fator };
}
