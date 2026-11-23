/**
 * Local development mode. Everything here exists so that a developer or an agent can run the app
 * against a throwaway PostgreSQL on their own machine, with no path to production.
 *
 * Design and commands: docs/dev/local-environment.md
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** `recompracrm_dev`, `recompracrm_<suffix>_dev` and their `_template` snapshots. */
const LOCAL_DATABASE_NAME_PATTERN = /_(dev|template)$/;

export function isLocalDevMode() {
	return process.env.LOCAL_DEV === "1" && process.env.NODE_ENV !== "production" && !process.env.VERCEL;
}

export function isLoopbackHost(host: string) {
	return LOCAL_HOSTS.has(host.toLowerCase()) || /^127\.\d+\.\d+\.\d+$/.test(host);
}

export type TLocalDatabaseTarget = { host: string; port: number; database: string };

/**
 * The one guard every local script and the dev-login route go through. It refuses anything that is
 * not a loopback PostgreSQL whose database name ends in `_dev` or `_template`, so a stray
 * `SUPABASE_DB_URL` from a real `.env` can never be seeded, reset or logged into.
 */
export function assertLocalDatabase(url: string | undefined = process.env.SUPABASE_DB_URL): TLocalDatabaseTarget {
	if (!url) throw new Error("[local-dev] SUPABASE_DB_URL is not defined. Run `npm run local:setup` first.");

	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new Error("[local-dev] SUPABASE_DB_URL is not a valid URL.");
	}

	const host = parsed.hostname;
	const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
	// Never echo the URL itself: on a misconfigured machine it could carry real credentials.
	if (!isLoopbackHost(host)) {
		throw new Error(`[local-dev] Refusing to continue: database host "${host}" is not this machine.`);
	}
	if (!LOCAL_DATABASE_NAME_PATTERN.test(database)) {
		throw new Error(`[local-dev] Refusing to continue: database "${database}" does not end in _dev or _template.`);
	}
	return { host, port: Number(parsed.port || 5432), database };
}
