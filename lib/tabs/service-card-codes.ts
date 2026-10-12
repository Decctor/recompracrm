// ============================================================================
// Comandas fixas (serviceCards) — regras puras de codigo e URL.
// Sem dependencia de banco: importado pelo client (geracao em lote, arquivo da
// grafica) e pelo server (cadastro, abertura de conta).
// ============================================================================

export const SERVICE_CARD_MAX_CODE_LENGTH = 20;
export const SERVICE_CARD_MAX_BATCH_SIZE = 1000;
/** Rajada do leitor para o QR do cartao: URL com token de 64 hex, com folga para dominios longos. */
export const SERVICE_CARD_SCAN_MAX_LENGTH = 256;

/**
 * Chave de comparacao do codigo: trim → maiusculas → se for so digitos, sem zeros a
 * esquerda ("0" continua "0"). "7", "07" e "007" resolvem o mesmo cartao; "A07" e
 * "A7" sao distintos — prefixo alfanumerico nao e interpretado.
 */
export function normalizeServiceCardCode(codigo: string): string {
	const trimmed = codigo.trim().toUpperCase();
	if (/^\d+$/.test(trimmed)) return trimmed.replace(/^0+(?=\d)/, "");
	return trimmed;
}

export type TServiceCardCodeRange = {
	inicio: number;
	fim: number;
	/** Largura minima do numero, completada com zeros: 3 → "007". 0 = sem preenchimento. */
	digitos: number;
	prefixo?: string | null;
};

/** `{ inicio: 1, fim: 3, digitos: 3 }` → ["001", "002", "003"]. */
export function generateServiceCardCodes({ inicio, fim, digitos, prefixo }: TServiceCardCodeRange): string[] {
	if (!Number.isInteger(inicio) || !Number.isInteger(fim) || inicio < 0 || fim < inicio) return [];
	const prefix = (prefixo ?? "").trim().toUpperCase();
	const codes: string[] = [];
	for (let numero = inicio; numero <= fim; numero++) {
		codes.push(`${prefix}${String(numero).padStart(Math.max(0, digitos), "0")}`);
	}
	return codes;
}

/**
 * Extrai o token de uma leitura do QR do cartao. Nao parseia a URL de proposito:
 * leitores configurados em layout US digitando num SO ABNT2 trocam ":" e "/", mas o
 * token hexadecimal chega intacto.
 */
export function extractServiceCardToken(raw: string): string | null {
	const match = raw.toLowerCase().match(/[0-9a-f]{64}/);
	return match ? match[0] : null;
}

/** URL impressa no cartao. Sempre o dominio canonico: o cartao dura anos. */
export function getServiceCardUrl(tokenPublico: string, baseUrl: string): string {
	return `${baseUrl.replace(/\/$/, "")}/service-card/${tokenPublico}`;
}

/** Ordena codigos como uma pessoa leria: "2" antes de "10", "A2" antes de "A10". */
export function compareServiceCardCodes(a: string, b: string): number {
	return a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });
}
