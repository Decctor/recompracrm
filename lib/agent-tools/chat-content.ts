import { CHAT_ANALYTICS_MIN_SAMPLE_FOR_P90, type TChatDurationStats } from "@/lib/chats/analytics";
import { roundForModel } from "./serialization";

/**
 * Peças puras das ferramentas de atendimento (`tools/chats.ts`). Ficam fora do arquivo das
 * ferramentas para serem testadas sem banco.
 */

/** Teto de caracteres de um campo de mensagem ao ler uma conversa. Áudio de 5 minutos transcrito
 * passa disso; sem o corte, uma única mensagem consome o orçamento de contexto da página. */
export const CHAT_MESSAGE_TEXT_MAX_CHARS = 2000;

/** Teto da prévia da última mensagem numa listagem de conversas. */
export const CHAT_PREVIEW_MAX_CHARS = 200;

/** Tamanho do trecho devolvido ao redor de uma ocorrência na busca literal. */
export const CHAT_SNIPPET_RADIUS_CHARS = 120;

export type TTruncatedText = { texto: string; truncado: boolean };

/**
 * Corta um texto em `max` caracteres. Devolve `null` para texto vazio — a ausência do campo é a
 * informação (mensagem sem legenda), e uma string vazia o modelo leria como "o cliente mandou nada".
 */
export function truncateText(value: string | null | undefined, max: number, { collapseWhitespace = false } = {}): TTruncatedText | null {
	if (!value) return null;
	const normalized = collapseWhitespace ? value.replace(/\s+/g, " ").trim() : value.trim();
	if (!normalized) return null;
	// Array.from conta por code point: cortar no meio de um emoji gera um caractere inválido.
	const chars = Array.from(normalized);
	if (chars.length <= max) return { texto: normalized, truncado: false };
	return { texto: `${chars.slice(0, max).join("")}…`, truncado: true };
}

/**
 * Trecho ao redor da primeira ocorrência do termo, ignorando maiúsculas e acentos — a mesma regra
 * da busca no banco (`unaccent_immutable(lower(...))`), senão o trecho apontaria para o lugar
 * errado numa mensagem que casou por "nao" contra "não".
 */
function foldForSearch(value: string) {
	return value
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase();
}

/** O termo aparece no texto, pela mesma regra da busca no banco (sem caixa, sem acento). */
export function textContainsTerm(text: string, term: string) {
	return foldForSearch(text).includes(foldForSearch(term.trim()));
}

export function buildMatchSnippet(text: string, term: string, radius = CHAT_SNIPPET_RADIUS_CHARS) {
	const normalized = text.replace(/\s+/g, " ").trim();
	const fold = foldForSearch;
	// NFD + remoção de diacríticos preserva a contagem de caracteres-base: o índice no texto
	// dobrado é o índice no texto original, desde que o original esteja em NFC (o caso comum).
	const foldedChars = Array.from(normalized).map((char) => fold(char));
	const foldedText = foldedChars.join("");
	const foldedTerm = fold(term.trim());

	const chars = Array.from(normalized);
	const matchAt = foldedTerm ? foldedText.indexOf(foldedTerm) : -1;
	if (matchAt === -1) {
		// Casou em outro campo (a transcrição, não o texto): devolve o começo.
		return chars.length > radius * 2 ? `${chars.slice(0, radius * 2).join("")}…` : normalized;
	}

	// Converte o índice no texto dobrado (por unidade de string) para índice de caractere.
	let charIndex = 0;
	let consumed = 0;
	while (charIndex < foldedChars.length && consumed + foldedChars[charIndex].length <= matchAt) {
		consumed += foldedChars[charIndex].length;
		charIndex++;
	}

	const start = Math.max(0, charIndex - radius);
	const end = Math.min(chars.length, charIndex + Array.from(foldedTerm).length + radius);
	return `${start > 0 ? "…" : ""}${chars.slice(start, end).join("")}${end < chars.length ? "…" : ""}`;
}

/**
 * Cursor opaco de paginação por chave (`valor de ordenação` + `id` para desempate). Opaco de
 * propósito: o modelo que monta um cursor à mão erra o formato e recebe uma página repetida.
 */
export function encodeKeysetCursor(position: { value: Date; id: string }) {
	return Buffer.from(`${position.value.getTime()}|${position.id}`, "utf8").toString("base64url");
}

export function decodeKeysetCursor(cursor: string | null | undefined): { value: Date; id: string } | null {
	if (!cursor) return null;
	let decoded: string;
	try {
		decoded = Buffer.from(cursor, "base64url").toString("utf8");
	} catch {
		return null;
	}
	const separator = decoded.indexOf("|");
	if (separator <= 0) return null;
	const timestamp = Number(decoded.slice(0, separator));
	const id = decoded.slice(separator + 1);
	if (!Number.isFinite(timestamp) || !id) return null;
	return { value: new Date(timestamp), id };
}

/** Cursor por deslocamento, para listagens históricas ordenadas por valor calculado. */
export function encodeOffsetCursor(offset: number) {
	return Buffer.from(`o|${offset}`, "utf8").toString("base64url");
}

export function decodeOffsetCursor(cursor: string | null | undefined) {
	if (!cursor) return 0;
	const decoded = Buffer.from(cursor, "base64url").toString("utf8");
	if (!decoded.startsWith("o|")) return 0;
	const offset = Number(decoded.slice(2));
	return Number.isInteger(offset) && offset > 0 ? offset : 0;
}

export type TChatLastDirection = "ENTRADA" | "SAIDA" | "INDEFINIDA";

/**
 * Quem falou por último, pelos carimbos que o chat guarda. É sinal de transporte, não de dever:
 * "ENTRADA" com um "obrigado" do cliente por último não é pendência de ninguém.
 */
export function resolveLastDirection({ entrada, saida }: { entrada: Date | null; saida: Date | null }): TChatLastDirection {
	if (!entrada && !saida) return "INDEFINIDA";
	if (!saida) return "ENTRADA";
	if (!entrada) return "SAIDA";
	return entrada.getTime() > saida.getTime() ? "ENTRADA" : "SAIDA";
}

/** Segundos → minutos com uma casa. O modelo raciocina em minutos; segundos convidam a "312s". */
export function secondsToMinutes(seconds: number | null | undefined) {
	if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return undefined;
	return roundForModel(seconds / 60, 1);
}

/**
 * Estatística de duração em minutos. O p90 sai quando a amostra é pequena demais — mesma regra
 * do painel (`CHAT_ANALYTICS_MIN_SAMPLE_FOR_P90`): um p90 sobre três atendimentos parece fato.
 */
export function durationStatsToMinutes(stats: TChatDurationStats) {
	return {
		mediaMinutos: secondsToMinutes(stats.media),
		medianaMinutos: secondsToMinutes(stats.mediana),
		p90Minutos: stats.amostra >= CHAT_ANALYTICS_MIN_SAMPLE_FOR_P90 ? secondsToMinutes(stats.p90) : undefined,
		amostra: stats.amostra,
	};
}

/** Razão 0–1 em percentual com uma casa; sem denominador não há percentual (campo ausente). */
export function ratioToPercent(numerator: number, denominator: number) {
	if (!denominator) return undefined;
	return roundForModel((numerator / denominator) * 100, 1);
}

/** Período imediatamente anterior, de mesma duração — a base de comparação de `get_chat_analytics`. */
export function previousPeriod({ after, before }: { after: Date; before: Date }) {
	const duration = before.getTime() - after.getTime();
	return { after: new Date(after.getTime() - duration - 1), before: new Date(after.getTime() - 1) };
}
