import { z } from "zod";

/** Tamanhos de página que o usuário pode escolher na barra de paginação. */
export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export type TPageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];
export const DEFAULT_PAGE_SIZE: TPageSizeOption = 25;
/** Teto que uma listagem aceita de uma vez — o cliente pode pedir mais, o servidor corta aqui. */
export const MAX_PAGE_SIZE = 100;

/** Normaliza o tamanho pedido: inválido/vazio cai no padrão, acima do teto é cortado. */
export function clampPageSize(value: unknown, defaultSize: number = DEFAULT_PAGE_SIZE) {
	if (value === null || value === undefined || value === "") return defaultSize;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) return defaultSize;
	return Math.min(Math.trunc(parsed), MAX_PAGE_SIZE);
}

/**
 * Campo `pageSize` dos input schemas de listagem (query string ou número).
 *
 * O `.optional()` vem por último de propósito: com o `.transform()` por fora, a chave passaria a
 * ser obrigatória no tipo inferido e todo consumidor existente teria de informá-la. Por isso a
 * rota lê `input.pageSize ?? defaultSize`.
 */
export function pageSizeInputSchema(defaultSize: number = DEFAULT_PAGE_SIZE) {
	return z
		.union([z.string(), z.number()], { invalid_type_error: "Tipo inválido para tamanho da página." })
		.nullable()
		.transform((value) => clampPageSize(value, defaultSize))
		.optional();
}

export type TPaginationItem = { type: "page"; page: number } | { type: "gap"; key: string };

/**
 * Itens da régua de páginas: sempre a primeira e a última, a vizinhança da ativa e reticências nos
 * saltos. A régua tem sempre o mesmo número de itens (7) quando há páginas suficientes, para que os
 * botões não mudem de lugar enquanto o usuário avança.
 */
export function getPaginationItems({ activePage, totalPages }: { activePage: number; totalPages: number }): TPaginationItem[] {
	if (totalPages <= 0) return [];
	const SLOTS = 7;
	const page = (n: number): TPaginationItem => ({ type: "page", page: n });
	if (totalPages <= SLOTS) return Array.from({ length: totalPages }, (_, index) => page(index + 1));

	const active = Math.min(Math.max(activePage, 1), totalPages);
	// Perto do início: 1 2 3 4 5 … N
	if (active <= 4) return [...[1, 2, 3, 4, 5].map(page), { type: "gap", key: "end" }, page(totalPages)];
	// Perto do fim: 1 … N-4 N-3 N-2 N-1 N
	if (active >= totalPages - 3) {
		return [page(1), { type: "gap", key: "start" }, ...[4, 3, 2, 1, 0].map((offset) => page(totalPages - offset))];
	}
	// No meio: 1 … a-1 a a+1 … N
	return [page(1), { type: "gap", key: "start" }, page(active - 1), page(active), page(active + 1), { type: "gap", key: "end" }, page(totalPages)];
}
