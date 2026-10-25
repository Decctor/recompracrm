import { writeDefaultAccountingEntryLines } from "@/lib/finances/accounting-entry-lines";
import { accountingEntries } from "@/services/drizzle/schema";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import type * as schema from "@/services/drizzle/schema";

type TransactionClient = PgTransaction<PostgresJsQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

type CreateAccountingEntryParams = {
	organizacaoId: string;
	vendaId: string;
	// Contraparte do lançamento (ADR-0002, decisão 5): quem deve à organização.
	clienteId?: string | null;
	valor: number;
	titulo: string;
	idContaDebito: string;
	idContaCredito: string;
	autorId: string | null;
};

/**
 * Creates an accounting entry (lançamento contábil) for a sale.
 * This is the anchor record that financial transactions are linked to.
 */
export async function createAccountingEntry(tx: TransactionClient, params: CreateAccountingEntryParams) {
	const [entry] = await tx
		.insert(accountingEntries)
		.values({
			organizacaoId: params.organizacaoId,
			vendaId: params.vendaId,
			clienteId: params.clienteId ?? null,
			origemTipo: "VENDA",
			titulo: params.titulo,
			idContaDebito: params.idContaDebito,
			idContaCredito: params.idContaCredito,
			valor: params.valor,
			dataCompetencia: new Date(),
			autorId: params.autorId,
		})
		.returning({ id: accountingEntries.id });

	if (entry?.id)
		await writeDefaultAccountingEntryLines({
			trx: tx,
			organizationId: params.organizacaoId,
			accountingEntryId: entry.id,
			entryValue: params.valor,
			debitAccountId: params.idContaDebito,
			creditAccountId: params.idContaCredito,
		});

	return entry;
}
