import { type SQL, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { formatPhoneAsBase } from "./formatting";

/**
 * Aceita uma coluna ou uma expressão SQL — buscar dentro de um campo jsonb
 * (`conteudo->'corpo'->>'conteudo'`, por exemplo) usa exatamente a mesma normalização.
 */
export function createSimplifiedSearchCondition(column: PgColumn | SQL, term: string) {
	const lowerTerm = term.toLowerCase();
	return sql`unaccent_immutable(lower(${column})) LIKE '%' || unaccent_immutable(${lowerTerm}) || '%'`;
}

/**
 * Tokeniza um termo de busca livre: separa por qualquer caractere que não seja letra ou número,
 * descarta tokens curtos demais para discriminar e limita a quantidade para o custo da consulta
 * não crescer com o tamanho da frase.
 */
export function extractSearchTokens(term: string, { minLength = 2, maxTokens = 5 }: { minLength?: number; maxTokens?: number } = {}) {
	return term
		.split(/[^\p{L}\p{N}]+/u)
		.map((token) => token.trim())
		.filter((token) => token.length >= minLength)
		.slice(0, maxTokens);
}

/** Igualdade tolerante a acento e caixa — para filtros categóricos digitados por humanos (ou LLMs). */
export function createSimplifiedEqualityCondition(column: PgColumn, term: string) {
	return sql`unaccent_immutable(lower(${column})) = unaccent_immutable(${term.toLowerCase().trim()})`;
}

/**
 * Similaridade trigram entre o termo completo e a coluna. Usada para ordenar resultados por
 * relevância: compõe em `WHERE` (`sql\`${expr} > 0.3\``) e em `ORDER BY` (`sql\`${expr} DESC\``).
 */
export function createSimilarityExpression(column: PgColumn, term: string) {
	return sql`similarity(unaccent_immutable(lower(${column})), unaccent_immutable(${term.toLowerCase()}))`;
}

/**
 * `word_similarity`: quão bem o termo casa com o melhor trecho da coluna. É a medida certa para
 * "você quis dizer": um termo curto com erro de digitação ("vhinho") pontua alto contra um nome
 * longo ("Vinho Tinto Seco 750ml"), onde a `similarity` clássica diluiria o score.
 */
export function createWordSimilarityExpression(column: PgColumn, term: string) {
	return sql`word_similarity(unaccent_immutable(${term.toLowerCase()}), unaccent_immutable(lower(${column})))`;
}

export function createSimplifiedPhoneSearchCondition(column: PgColumn, term: string) {
	const phoneBase = formatPhoneAsBase(term);
	if (phoneBase) {
		return sql`(
            ${column} LIKE '%' || ${phoneBase} || '%'
            OR
            -- Caso o banco tenha guardado com máscara, tentamos o termo original
            ${column} LIKE '%' || ${term} || '%'
        )`;
	}
	return sql`${column} LIKE '%' || ${term} || '%'`;
}

export function createSimplifiedEmailSearchCondition(column: PgColumn, term: string) {
	return sql`lower(${column}) LIKE '%' || ${term.toLowerCase()} || '%'`;
}
