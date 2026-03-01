import { productStockTransactions } from "@/services/drizzle/schema";
import type { TSaleItemEntity } from "@/services/drizzle/schema/sales";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import type * as schema from "@/services/drizzle/schema";

type TransactionClient = PgTransaction<PostgresJsQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

type ProcessStockDeductionParams = {
	organizacaoId: string;
	vendaId: string;
	itens: TSaleItemEntity[];
	operadorId: string;
};

/**
 * Creates SAIDA stock transaction records for each sale item.
 * Links each transaction to the sale and sale item for traceability.
 */
export async function processStockDeduction(
	tx: TransactionClient,
	params: ProcessStockDeductionParams,
) {
	const stockTransactions = params.itens.map((item) => ({
		organizacaoId: params.organizacaoId,
		produtoId: item.produtoId,
		produtoVarianteId: item.produtoVarianteId,
		tipo: "SAIDA" as const,
		quantidade: item.quantidade,
		motivo: "Venda confirmada",
		vendaId: params.vendaId,
		vendaItemId: item.id,
		operadorId: params.operadorId,
	}));

	if (stockTransactions.length > 0) {
		await tx.insert(productStockTransactions).values(stockTransactions);
	}
}
