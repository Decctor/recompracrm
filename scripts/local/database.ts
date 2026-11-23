import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { assertLocalDatabase, isLoopbackHost } from "../../lib/local-dev/guard";
import { resolveDatabaseNames, withDatabase } from "./env";

export const DB_OBJECTS_FILE = path.join(__dirname, "db-objects.sql");

export type TLocalDatabaseContext = {
	adminUrl: string;
	database: string;
	template: string;
	databaseUrl: string;
};

export function resolveLocalDatabaseContext(env: Record<string, string | undefined> = process.env): TLocalDatabaseContext {
	const adminUrl = env.LOCAL_PG_ADMIN_URL;
	if (!adminUrl) throw new Error("[local-dev] LOCAL_PG_ADMIN_URL is not defined. Run `npm run local:setup` first.");
	if (!isLoopbackHost(new URL(adminUrl).hostname)) {
		throw new Error("[local-dev] Refusing to continue: LOCAL_PG_ADMIN_URL does not point at this machine.");
	}
	const { database, template } = resolveDatabaseNames(env.LOCAL_DB_SUFFIX || null);
	const databaseUrl = withDatabase(adminUrl, database);
	// Both names must pass the same guard the app-facing URL passes.
	assertLocalDatabase(databaseUrl);
	assertLocalDatabase(withDatabase(adminUrl, template));
	return { adminUrl, database, template, databaseUrl };
}

function connect(url: string) {
	return postgres(url, { max: 1, onnotice: () => {} });
}

async function withAdmin<T>(context: TLocalDatabaseContext, run: (sql: postgres.Sql) => Promise<T>) {
	const sql = connect(context.adminUrl);
	try {
		return await run(sql);
	} catch (error) {
		if ((error as { code?: string }).code === "ECONNREFUSED") {
			throw new Error(
				"[local-dev] Could not reach PostgreSQL on this machine. Is the service running? Set LOCAL_PG_ADMIN_URL if it is not postgres://postgres:postgres@127.0.0.1:5432/postgres.",
			);
		}
		throw error;
	} finally {
		await sql.end();
	}
}

/** A running app (or an abandoned script) holds connections; DROP/CREATE ... TEMPLATE need none. */
async function disconnectEveryone(sql: postgres.Sql, database: string) {
	await sql`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ${database} AND pid <> pg_backend_pid()`;
}

async function dropDatabase(sql: postgres.Sql, database: string) {
	assertLocalDatabase(`postgres://127.0.0.1/${database}`);
	await disconnectEveryone(sql, database);
	await sql.unsafe(`DROP DATABASE IF EXISTS "${database}"`);
}

export async function recreateEmptyDatabase(context: TLocalDatabaseContext) {
	await withAdmin(context, async (sql) => {
		await dropDatabase(sql, context.database);
		await sql.unsafe(`CREATE DATABASE "${context.database}" ENCODING 'UTF8' TEMPLATE template0`);
	});
}

export async function templateExists(context: TLocalDatabaseContext) {
	return withAdmin(context, async (sql) => (await sql`SELECT 1 FROM pg_database WHERE datname = ${context.template}`).length > 0);
}

/** Freezes the current dev database as the template `local:reset` restores from. */
export async function snapshotDatabaseAsTemplate(context: TLocalDatabaseContext) {
	await withAdmin(context, async (sql) => {
		await dropDatabase(sql, context.template);
		await disconnectEveryone(sql, context.database);
		await sql.unsafe(`CREATE DATABASE "${context.template}" TEMPLATE "${context.database}"`);
	});
}

export async function restoreDatabaseFromTemplate(context: TLocalDatabaseContext) {
	await withAdmin(context, async (sql) => {
		if ((await sql`SELECT 1 FROM pg_database WHERE datname = ${context.template}`).length === 0) {
			throw new Error(`[local-dev] Template "${context.template}" does not exist. Run \`npm run local:setup\` first.`);
		}
		await dropDatabase(sql, context.database);
		await sql.unsafe(`CREATE DATABASE "${context.database}" TEMPLATE "${context.template}"`);
	});
}

function readDbObjectSections() {
	const content = readFileSync(DB_OBJECTS_FILE, "utf8");
	const [, beforeSchema, afterSchema] = content.split(/^-- @section (?:before|after)-schema$/m);
	if (!beforeSchema || !afterSchema) throw new Error("[local-dev] db-objects.sql must have a before-schema and an after-schema section.");
	return { beforeSchema, afterSchema };
}

/**
 * Builds the whole schema from the Drizzle files — the same `drizzle-kit/api` call the integration
 * tests use on PGlite, but on a real PostgreSQL, so the trigram/unaccent indexes are created too.
 */
export async function buildSchema(context: TLocalDatabaseContext) {
	// Imported lazily: loading every schema file is slow and `reset` does not need it.
	const { generateDrizzleJson, generateMigration } = await import("drizzle-kit/api");
	const schema = await import("../../services/drizzle/schema");
	const enums = await import("../../services/drizzle/schema/enums");

	const { beforeSchema, afterSchema } = readDbObjectSections();
	const statements = await generateMigration(generateDrizzleJson({}), generateDrizzleJson({ ...schema, ...enums }));

	const sql = connect(context.databaseUrl);
	try {
		await sql.unsafe(beforeSchema);
		for (const statement of statements) {
			try {
				await sql.unsafe(statement);
			} catch (error) {
				throw new Error(`[local-dev] Schema statement failed: ${(error as Error).message}\n${statement.slice(0, 400)}`);
			}
		}
		await sql.unsafe(afterSchema);

		const [{ tables }] = await sql<{ tables: number }[]>`SELECT count(*)::int AS tables FROM pg_tables WHERE schemaname = 'public'`;
		const [{ triggers }] = await sql<{ triggers: number }[]>`SELECT count(*)::int AS triggers FROM pg_trigger WHERE NOT tgisinternal`;
		return { statements: statements.length, tables, triggers };
	} finally {
		await sql.end();
	}
}
