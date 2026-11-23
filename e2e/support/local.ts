import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

/**
 * Bridge between Playwright and the local tooling in scripts/local/.
 *
 * The scripts run as child processes (through tsx, with the `react-server` condition the app's
 * server modules need) instead of being imported: Playwright's own TypeScript loader would resolve
 * `server-only` differently, and each script already validates the environment by itself.
 */
export const REPO_ROOT = path.resolve(__dirname, "../..");
const LOCAL_ENV_FILE = path.join(REPO_ROOT, ".env.localdb");
const TSX_CLI = path.join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs");

export function readLocalEnv(): Record<string, string> {
	if (!existsSync(LOCAL_ENV_FILE)) {
		throw new Error("[e2e] .env.localdb not found. Run `npm run local:setup` before `npm run test:e2e`.");
	}
	return parseEnv(readFileSync(LOCAL_ENV_FILE, "utf8")) as Record<string, string>;
}

export function resolveBaseUrl() {
	return `http://localhost:${readLocalEnv().LOCAL_PORT}`;
}

export function runLocalScript(script: string, args: string[] = []) {
	const result = spawnSync(process.execPath, [TSX_CLI, "--conditions=react-server", path.join(REPO_ROOT, "scripts", "local", script), ...args], {
		cwd: REPO_ROOT,
		encoding: "utf8",
	});
	if (result.status !== 0) throw new Error(`[e2e] scripts/local/${script} failed:\n${result.stdout}\n${result.stderr}`);
	return result.stdout;
}

/** Storage state written by `local:login` for a seeded user key (admin, operator, ...). */
export function storageStateFor(userKey: string) {
	return path.join(REPO_ROOT, ".local-dev", "auth", `${userKey}.json`);
}

export function readSessionToken(userKey: string): string {
	const state = JSON.parse(readFileSync(storageStateFor(userKey), "utf8")) as { cookies: { value: string }[] };
	return state.cookies[0].value;
}
