/**
 * npm run local:setup [-- --suffix=<name>] [--port=<n>] [--packs=base,coupons] [--no-seed] [--env-only]
 *
 * Generates `.env.localdb`, (re)creates the local database, builds the schema from the Drizzle
 * files, loads the seed packs and snapshots the result as the template `local:reset` restores.
 */
import { existsSync } from "node:fs";
import { installLocalNetworkGuard } from "../../lib/local-dev/network-guard";
import { parseArgs, runScript } from "./args";
import { buildSchema, recreateEmptyDatabase, resolveLocalDatabaseContext, snapshotDatabaseAsTemplate } from "./database";
import {
	DEFAULT_ADMIN_URL,
	DEFAULT_LOCAL_PORT,
	LOCAL_ENV_FILE,
	applyLocalEnv,
	buildLocalEnv,
	readLocalEnvFile,
	sanitizeDatabaseSuffix,
	writeLocalEnvFile,
} from "./env";

runScript(async () => {
	const { options } = parseArgs();
	// A previous setup's choices stick, so `npm run local:setup` alone keeps the branch database.
	const previous = existsSync(LOCAL_ENV_FILE) ? readLocalEnvFile() : {};

	const adminUrl = process.env.LOCAL_PG_ADMIN_URL || previous.LOCAL_PG_ADMIN_URL || DEFAULT_ADMIN_URL;
	const suffix = sanitizeDatabaseSuffix(options.suffix ?? process.env.LOCAL_DB_SUFFIX ?? previous.LOCAL_DB_SUFFIX);
	const port = Number(options.port ?? previous.LOCAL_PORT ?? DEFAULT_LOCAL_PORT);
	if (!Number.isInteger(port) || port <= 0) throw new Error(`[local-dev] Invalid port: ${options.port}`);

	const env = buildLocalEnv({ adminUrl, suffix, port });
	writeLocalEnvFile(env);
	console.log(`[local-dev] .env.localdb written (${Object.keys(env).length} keys, all stubs).`);
	if (options["env-only"]) return;

	applyLocalEnv();
	installLocalNetworkGuard();
	const context = resolveLocalDatabaseContext();

	console.log(`[local-dev] Creating database "${context.database}"...`);
	await recreateEmptyDatabase(context);

	const startedAt = Date.now();
	const schema = await buildSchema(context);
	console.log(
		`[local-dev] Schema built from services/drizzle/schema: ${schema.tables} tables, ${schema.triggers} triggers (${schema.statements} statements, ${Date.now() - startedAt} ms).`,
	);

	if (!options["no-seed"]) {
		const { runSeedPacks } = await import("./seed");
		await runSeedPacks({ packs: options.packs ? options.packs.split(",") : null });
	}

	await snapshotDatabaseAsTemplate(context);
	console.log(`[local-dev] Snapshot saved as "${context.template}". \`npm run local:reset\` restores it.`);
	console.log(`[local-dev] Next: npm run local:dev  →  http://localhost:${port}`);
});
