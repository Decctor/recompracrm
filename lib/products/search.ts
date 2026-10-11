import { sql, or, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { DB, DBTransaction } from "@/services/drizzle";
import { supportsFuzzyProductSearch } from "./search-terms";

export type ProductSearchDatabase = DB | DBTransaction;
export const PRODUCT_SEARCH_WORD_THRESHOLD = 0.3;

// Keep this expression identical to idx_products_nome.
function normalized(column: PgColumn | SQL) {
	return sql`unaccent_immutable(lower(${column}))`;
}

export function buildProductSearch(terms: readonly string[], columns: { nome: PgColumn | SQL; codigo: PgColumn | SQL; codigoBarras?: PgColumn | SQL }) {
	const name = normalized(columns.nome);
	const code = normalized(columns.codigo);
	// Código de barras digitado (leitor falhou, operador lê os dígitos da etiqueta): só igualdade
	// exata — um GTIN parcial não identifica nada e só poluiria a relevância.
	const barcode = columns.codigoBarras ? sql`coalesce(${columns.codigoBarras}, '')` : null;
	const matches: SQL[] = [];
	const scores: SQL[] = [];
	for (const term of terms) {
		const value = sql`unaccent_immutable(lower(${term}))`;
		// Escape LIKE metacharacters: a typed '%' or '_' is literal, never a wildcard.
		const pattern = sql`unaccent_immutable(lower(${`%${term.replace(/[\\%_]/g, "\\$&")}%`}))`;
		const exact = barcode ? sql`(${name} = ${value} OR ${code} = ${value} OR ${barcode} = ${term.trim()})` : sql`(${name} = ${value} OR ${code} = ${value})`;
		const partial = barcode
			? sql`(${name} LIKE ${pattern} OR ${code} LIKE ${pattern} OR ${barcode} = ${term.trim()})`
			: sql`(${name} LIKE ${pattern} OR ${code} LIKE ${pattern})`;
		const fuzzy = supportsFuzzyProductSearch(term);
		matches.push(fuzzy ? sql`(${partial} OR ${name} %> ${value})` : partial);
		scores.push(sql`CASE WHEN ${exact} THEN 3 WHEN ${partial} THEN 2 ELSE ${fuzzy ? sql`word_similarity(${value}, ${name})` : sql`0`} END`);
	}
	return {
		condition: or(...matches),
		relevance: scores.length ? sql<number>`greatest(${sql.join(scores, sql`, `)})` : sql<number>`0`,
	};
}

/** Transaction-local threshold: safe with Supabase's transaction pooler; never changes other requests. */
export async function withProductSearch<T>(database: DB, terms: readonly string[], query: (db: ProductSearchDatabase) => Promise<T>): Promise<T> {
	if (!terms.some(supportsFuzzyProductSearch)) return query(database);
	return database.transaction(
		async (tx) => {
			await tx.execute(sql`select set_config('pg_trgm.word_similarity_threshold', ${String(PRODUCT_SEARCH_WORD_THRESHOLD)}, true)`);
			return query(tx);
		},
		{ accessMode: "read only" },
	);
}
