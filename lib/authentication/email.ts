import { normalizeEmail } from "@/lib/formatting";
import { sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

/**
 * Compara o email ignorando espaços e caixa também do lado do banco, para alcançar as linhas
 * legadas gravadas antes da normalização existir — foi assim que " alexandre.a.c.l17@gmail.com"
 * (com espaço à esquerda) ficou invisível para o login com Google, gerando uma segunda conta e
 * tirando do usuário a organização em que ele já era membro.
 */
export function createEmailMatchCondition(column: PgColumn, email: string) {
	return sql`lower(btrim(${column})) = ${normalizeEmail(email)}`;
}
