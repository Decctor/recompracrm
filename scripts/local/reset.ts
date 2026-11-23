/** npm run local:reset — drops the local database and recreates it from the seeded template. */
import { parseArgs, runScript } from "./args";
import { resolveLocalDatabaseContext, restoreDatabaseFromTemplate } from "./database";
import { applyLocalEnv } from "./env";

export async function resetLocalDatabase() {
	applyLocalEnv();
	const context = resolveLocalDatabaseContext();
	const startedAt = Date.now();
	await restoreDatabaseFromTemplate(context);
	return { database: context.database, elapsedMs: Date.now() - startedAt };
}

if (require.main === module) {
	runScript(async () => {
		parseArgs();
		const { database, elapsedMs } = await resetLocalDatabase();
		console.log(`[local-dev] "${database}" restored from its template in ${elapsedMs} ms. Sessions were reset too: run \`npm run local:login\` again.`);
	});
}
