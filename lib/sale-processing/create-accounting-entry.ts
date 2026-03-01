import { accountingEntries } from "@/services/drizzle/schema";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import type * as schema from "@/services/drizzle/schema";

type TransactionClient = PgTransaction<PostgresJsQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

type CreateAccountingEntryParams = {
	organizacaoId: string;
	vendaId: string;
	valor: number;
	titulo: string;
	idContaDebito: string;
	idContaCredito: string;
	autorId: string;
};

/**
 * Creates an accounting entry (lançamento contábil) for a sale.
 * This is the anchor record that financial transactions are linked to.
 */
export async function createAccountingEntry(
	tx: TransactionClient,
	params: CreateAccountingEntryParams,
) {
	const [entry] = await tx
		.insert(accountingEntries)
		.values({
			organizacaoId: params.organizacaoId,
			vendaId: params.vendaId,
			origemTipo: "VENDA",
			titulo: params.titulo,
			idContaDebito: params.idContaDebito,
			idContaCredito: params.idContaCredito,
			valor: params.valor,
			dataCompetencia: new Date(),
			autorId: params.autorId,
		})
		.returning({ id: accountingEntries.id });

	return entry;
}
