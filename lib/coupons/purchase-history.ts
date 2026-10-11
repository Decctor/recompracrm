import type { DB, DBTransaction } from "@/services/drizzle";
import { sales } from "@/services/drizzle/schema/sales";
import { and, count, eq, ne, sql } from "drizzle-orm";
import createHttpError from "http-errors";

/** Fail-fast: callers may already own sale/session/balance locks. Never wait in reverse order. */
export async function lockClientPurchaseHistory(trx: DBTransaction, organizacaoId: string, clienteId: string) {
	const rows = await trx.execute<{ adquirido: boolean }>(
		sql`select pg_try_advisory_xact_lock(hashtextextended(${`${organizacaoId}:${clienteId}:primeira-compra`}, 0)) as adquirido`,
	);
	if (!rows[0]?.adquirido) {
		throw new createHttpError.Conflict("Outra compra deste cliente está sendo processada. Tente novamente.");
	}
}

/**
 * Blocking variant for background ingestion. A batch holds many sale rows and several customer
 * locks until it commits; failing fast there would abort a whole import because a POS sale of one
 * of its customers was mid-confirmation, and the POS would see 409s from a background job. POS
 * confirmation never waits on rows an import holds (imports only touch integration sales and the
 * customers they already locked), so waiting here cannot deadlock against it.
 */
export async function lockClientPurchaseHistoryBlocking(trx: DBTransaction, organizacaoId: string, clienteId: string) {
	await trx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${organizacaoId}:${clienteId}:primeira-compra`}, 0))`);
}

export async function countPreviousConfirmedPurchases({
	trx,
	organizacaoId,
	clienteId,
	vendaId,
}: {
	trx: DB | DBTransaction;
	organizacaoId: string;
	clienteId: string;
	vendaId?: string | null;
}) {
	const [history] = await trx
		.select({ total: count() })
		.from(sales)
		.where(
			and(
				eq(sales.organizacaoId, organizacaoId),
				eq(sales.clienteId, clienteId),
				eq(sales.statusVenda, "CONFIRMADA"),
				vendaId ? ne(sales.id, vendaId) : undefined,
			),
		);
	return history?.total ?? 0;
}
