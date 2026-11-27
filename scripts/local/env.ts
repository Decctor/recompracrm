import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { assertLocalDatabase } from "../../lib/local-dev/guard";

/**
 * The local environment file. It is the ONLY source of configuration in local mode, and it defines
 * every variable the code reads — Next.js fills whatever the process does not define from
 * `.env`/`.env.local`, so one missing key would silently come from a real environment.
 */
export const REPO_ROOT = path.resolve(__dirname, "../..");
export const LOCAL_ENV_FILE = path.join(REPO_ROOT, ".env.localdb");
export const LOCAL_STATE_DIR = path.join(REPO_ROOT, ".local-dev");

export const DEFAULT_LOCAL_PORT = 3100;
export const DEFAULT_ADMIN_URL = "postgres://postgres:postgres@127.0.0.1:5432/postgres";
const DATABASE_PREFIX = "recompracrm";

const SCANNED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git", ".next", ".next-localdb", ".local-dev", ".vercel", "public", "docs", "drizzle"]);

/** Owned by the runtime or the operating system, not by the app's configuration. */
const SYSTEM_KEYS = new Set(["NODE_ENV", "NEXT_RUNTIME", "TZ", "APPDATA", "CI", "VERCEL_CLI_PATH", "IMPECCABLE_CONTEXT_DIR", "LOCAL_PG_ADMIN_URL"]);

const STUB = "local-stub";

/**
 * Keys that need a value. Everything else is defined as an empty string, which is what turns a
 * presence-gated integration off (PostHog, Control, the AI gateway, Meta, iFood, ...) — or as the
 * code's own `?? "literal"` fallback when it has one (see `scanCodeEnv`).
 *
 * A non-empty stub exists only where a constructor refuses to build without a key or where a URL
 * must parse. None of them reaches a real service: lib/local-dev/network-guard.ts blocks every
 * outbound connection that is not loopback.
 */
function resolveStubValues({ appUrl }: { appUrl: string }): Record<string, string> {
	return {
		NEXT_PUBLIC_APP_URL: appUrl,
		NEXT_PUBLIC_URL: appUrl,
		NEXT_PUBLIC_SITE_URL: appUrl,
		// Port 9 (discard) on loopback: storage and realtime fail fast instead of reaching Supabase.
		NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9",
		NEXT_PUBLIC_SUPABASE_ANON_KEY: STUB,
		SUPABASE_SERVICE_ROLE_KEY: STUB,
		SUPABASE_SECRET_KEY: STUB,
		SUPABASE_PRIVATE_FILES_BUCKET: "local-private-files",
		RESEND_API_KEY: "re_local_stub",
		STRIPE_SECRET_KEY: "sk_test_local_stub_syncroniza",
		STRIPE_WEBHOOK_SIGNATURE_SECRET: "whsec_local_stub_syncroniza",
		STRIPE_RECOMPRACRM_SECRET_KEY: "sk_test_local_stub_recompracrm",
		STRIPE_RECOMPRACRM_WEBHOOK_SIGNATURE_SECRET: "whsec_local_stub_recompracrm",
		MUX_TOKEN_ID: STUB,
		MUX_TOKEN_SECRET: STUB,
		MUX_WEBHOOK_SECRET: STUB,
		GOOGLE_CLIENT_ID: STUB,
		GOOGLE_CLIENT_SECRET_KEY: STUB,
		// Cron and webhook routes compare against these; a stub keeps them closed rather than open.
		CRON_SECRET: STUB,
		META_APP_SECRET: STUB,
		META_WEBHOOK_VERIFY_TOKEN: STUB,
		SPEDY_WEBHOOK_SECRET: STUB,
		INTERNAL_WHATSAPP_GATEWAY_API_SECRET: STUB,
		CAMPAIGN_EVENTS_ENABLED: "false",
		DESKTOP_AGENT_WS_ENABLED: "false",
	};
}

/**
 * Real values allowed through from the developer's shell. Empty on purpose: nothing in local mode
 * needs one today. Add a key here (never a database or payment key) only with a written reason.
 */
const PASSTHROUGH_KEYS: string[] = [];

function walkSourceFiles(directory: string, files: string[] = []) {
	for (const entry of readdirSync(directory)) {
		if (SKIPPED_DIRECTORIES.has(entry)) continue;
		const fullPath = path.join(directory, entry);
		const stats = statSync(fullPath);
		if (stats.isDirectory()) walkSourceFiles(fullPath, files);
		else if (SCANNED_EXTENSIONS.has(path.extname(entry))) files.push(fullPath);
	}
	return files;
}

type TCodeEnvScan = { keys: string[]; nullishDefaults: Record<string, string> };
let cachedScan: TCodeEnvScan | null = null;

/**
 * Every `process.env.X` / `process.env["X"]` in the code — works on a machine with no `.env` —
 * plus the literal fallback of each `process.env.X ?? "literal"`.
 *
 * The fallbacks matter because local mode DEFINES every key: an empty string is not nullish, so
 * `process.env.DATA_COLLECTING_TIMEZONE ?? "America/Sao_Paulo"` would yield "" and break. Those
 * keys get their own code default as the stub, which is exactly what an unset key behaves like.
 */
export function scanCodeEnv(): TCodeEnvScan {
	if (cachedScan) return cachedScan;
	const keys = new Set<string>();
	const nullishDefaults: Record<string, string> = {};
	const pattern = /process\.env(?:\.([A-Za-z_][A-Za-z0-9_]*)|\[\s*["'`]([A-Za-z_][A-Za-z0-9_]*)["'`]\s*\])(?:\s*\?\?\s*(?:"([^"\n]*)"|'([^'\n]*)'))?/g;
	for (const file of walkSourceFiles(REPO_ROOT)) {
		const content = readFileSync(file, "utf8");
		if (!content.includes("process.env")) continue;
		for (const match of content.matchAll(pattern)) {
			const key = match[1] ?? match[2];
			keys.add(key);
			const fallback = match[3] ?? match[4];
			if (fallback && !(key in nullishDefaults)) nullishDefaults[key] = fallback;
		}
	}
	cachedScan = { keys: [...keys].filter((key) => !SYSTEM_KEYS.has(key)).sort(), nullishDefaults };
	return cachedScan;
}

export function scanCodeEnvKeys(): string[] {
	return scanCodeEnv().keys;
}

/** The env files Next.js (and `dotenv/config`) would load. `.env.localdb` is ours. */
function listForeignEnvFiles(): string[] {
	return readdirSync(REPO_ROOT)
		.filter((name) => name.startsWith(".env") && name !== path.basename(LOCAL_ENV_FILE) && !name.endsWith(".example"))
		.map((name) => path.join(REPO_ROOT, name))
		.filter((file) => statSync(file).isFile());
}

/**
 * Key NAMES of the real env files. The values are parsed and dropped right here: they are never
 * returned, logged, or placed in any process environment.
 */
export function readForeignEnvKeyNames(): string[] {
	const keys = new Set<string>();
	for (const file of listForeignEnvFiles()) {
		for (const key of Object.keys(parseEnv(readFileSync(file, "utf8")))) keys.add(key);
	}
	return [...keys].filter((key) => !SYSTEM_KEYS.has(key)).sort();
}

export function sanitizeDatabaseSuffix(suffix: string | undefined | null) {
	if (!suffix) return null;
	const sanitized = suffix
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.slice(0, 30);
	return sanitized || null;
}

/** `recompracrm_dev` / `recompracrm_<suffix>_dev`, each with its own `_template` snapshot. */
export function resolveDatabaseNames(suffix: string | null) {
	const base = suffix ? `${DATABASE_PREFIX}_${suffix}` : DATABASE_PREFIX;
	return { database: `${base}_dev`, template: `${base}_template` };
}

export function withDatabase(url: string, database: string) {
	const parsed = new URL(url);
	parsed.pathname = `/${database}`;
	return parsed.href;
}

type TBuildLocalEnvInput = { adminUrl: string; suffix: string | null; port: number };

export function buildLocalEnv({ adminUrl, suffix, port }: TBuildLocalEnvInput): Record<string, string> {
	const { database } = resolveDatabaseNames(suffix);
	const appUrl = `http://localhost:${port}`;
	const stubs = resolveStubValues({ appUrl });
	const { nullishDefaults } = scanCodeEnv();

	const env: Record<string, string> = {};
	for (const key of new Set([...scanCodeEnvKeys(), ...readForeignEnvKeyNames(), ...Object.keys(stubs)])) {
		if (key.startsWith("NEXT_PUBLIC_STRIPE_") && key.endsWith("_PRICE_ID")) env[key] = `price_local_${key.slice(19, -9).toLowerCase()}`;
		else env[key] = stubs[key] ?? nullishDefaults[key] ?? "";
	}
	for (const key of PASSTHROUGH_KEYS) {
		if (process.env[key] !== undefined) env[key] = process.env[key] as string;
	}

	env.LOCAL_DEV = "1";
	env.LOCAL_PORT = String(port);
	env.LOCAL_DB_SUFFIX = suffix ?? "";
	env.LOCAL_PG_ADMIN_URL = adminUrl;
	env.SUPABASE_DB_URL = withDatabase(adminUrl, database);
	assertLocalDatabase(env.SUPABASE_DB_URL);
	return env;
}

export function writeLocalEnvFile(env: Record<string, string>) {
	const lines = [
		"# Generated by `npm run local:setup`. Local development only — every value is a stub.",
		"# Do not put real credentials here. Regenerate instead of editing: docs/dev/local-environment.md",
		...Object.keys(env)
			.sort()
			.map((key) => `${key}=${JSON.stringify(env[key])}`),
	];
	writeFileSync(LOCAL_ENV_FILE, `${lines.join("\n")}\n`);
}

export function readLocalEnvFile(): Record<string, string> {
	if (!existsSync(LOCAL_ENV_FILE)) {
		throw new Error("[local-dev] .env.localdb not found. Run `npm run local:setup` first.");
	}
	return parseEnv(readFileSync(LOCAL_ENV_FILE, "utf8")) as Record<string, string>;
}

/**
 * Fail closed. Any key the code reads, or that a real env file on this machine defines, must be
 * defined by the local environment. Otherwise Next.js or `dotenv/config` would fill it with the
 * real value.
 */
export function assertLocalEnvIsComplete(env: Record<string, string>) {
	const missing = [...new Set([...scanCodeEnvKeys(), ...readForeignEnvKeyNames()])].filter((key) => env[key] === undefined);
	if (missing.length > 0) {
		throw new Error(
			`[local-dev] Refusing to start: ${missing.length} key(s) are not defined in .env.localdb and would leak from a real env file: ${missing.join(", ")}. Run \`npm run local:setup -- --env-only\` to regenerate it.`,
		);
	}
	if (env.LOCAL_DEV !== "1") throw new Error("[local-dev] Refusing to start: .env.localdb does not set LOCAL_DEV=1.");
	assertLocalDatabase(env.SUPABASE_DB_URL);
}

/** Reads `.env.localdb`, validates it and makes it the process environment. */
export function applyLocalEnv(): Record<string, string> {
	const env = readLocalEnvFile();
	assertLocalEnvIsComplete(env);
	for (const [key, value] of Object.entries(env)) process.env[key] = value;
	return env;
}
