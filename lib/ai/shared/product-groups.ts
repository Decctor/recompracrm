import type { DB, DBTransaction } from "@/services/drizzle";
import { products } from "@/services/drizzle/schema";
import { and, count, desc, eq, sql } from "drizzle-orm";

type TDb = DB | DBTransaction;

/**
 * Grupos suficientes para qualquer catálogo saudável; acima disso a lista deixaria de caber com
 * conforto no system prompt e o agente volta a depender da visão GRUPOS da ferramenta.
 */
const MAX_GROUPS = 50;

export type TProductGroupSummary = { grupo: string; quantidadeProdutos: number };

/**
 * Grupos ativos do catálogo, do maior para o menor. Alimenta duas pontas do agente:
 * a seção de grupos do system prompt (grafia exata, sem gastar tool call) e a resposta
 * autocorretiva da consulta de catálogo quando o modelo filtra por um grupo inexistente.
 */
export async function listActiveProductGroups(db: TDb, organizacaoId: string): Promise<TProductGroupSummary[]> {
	const rows = await db
		.select({ grupo: products.grupo, quantidade: count() })
		.from(products)
		// Grupos do que se vende: um grupo só de insumos não deve aparecer para o agente oferecer.
		.where(and(eq(products.organizacaoId, organizacaoId), eq(products.ativo, true), eq(products.vendavel, true)))
		.groupBy(products.grupo)
		.orderBy(desc(sql`count(*)`))
		.limit(MAX_GROUPS);

	return rows.map((row) => ({ grupo: row.grupo, quantidadeProdutos: Number(row.quantidade) }));
}

/** Espelho em JS do `unaccent_immutable(lower(...))` usado nos filtros SQL. */
function simplifyForComparison(value: string): string {
	return value
		.normalize("NFD")
		.replace(/\p{M}+/gu, "")
		.toLowerCase()
		.trim();
}

/** Encontra o grupo cuja grafia simplificada (sem acento/caixa) casa com o nome informado. */
export function findProductGroupByName(groups: TProductGroupSummary[], name: string): TProductGroupSummary | null {
	const target = simplifyForComparison(name);
	return groups.find((group) => simplifyForComparison(group.grupo) === target) ?? null;
}
