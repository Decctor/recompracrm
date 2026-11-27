import postgres from "postgres";
import { assertLocalDatabase } from "../../lib/local-dev/guard";
import { readLocalEnv } from "./local";

/**
 * Read-only window into the local database, for asserting what a click actually wrote.
 * Goes through the same guard as every local script: loopback host, `_dev` database.
 */
export async function queryLocalDatabase<Row extends Record<string, unknown>>(run: (sql: postgres.Sql) => Promise<Row[]>): Promise<Row[]> {
	const url = readLocalEnv().SUPABASE_DB_URL;
	assertLocalDatabase(url);
	const sql = postgres(url, { max: 1, onnotice: () => {} });
	try {
		return await run(sql);
	} finally {
		await sql.end();
	}
}
