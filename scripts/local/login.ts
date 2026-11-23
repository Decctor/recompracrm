/**
 * npm run local:login [-- <user> | --all] [--next=/dashboard/sales/new]
 *
 * <user> is a key of SEED_USERS (admin, operator, crmOwner, trialOwner) or a seeded e-mail.
 * Creates a session row for that user, writes a Playwright `storageState` file and prints a
 * dev-login URL that sets the cookie in any browser.
 */
import "./load-env";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SESSION_COOKIE_NAME } from "@/config";
import { createSession, generateSessionToken } from "@/lib/authentication/session";
import { assertLocalDatabase } from "@/lib/local-dev/guard";
import { connection, db } from "@/services/drizzle";
import { parseArgs, runScript } from "./args";
import { LOCAL_STATE_DIR } from "./env";
import { SEED_USERS, type TSeedUserKey } from "./seed/ids";

export const AUTH_STATE_DIR = path.join(LOCAL_STATE_DIR, "auth");

export function resolveStorageStatePath(userKey: string) {
	return path.join(AUTH_STATE_DIR, `${userKey}.json`);
}

/** Creates a real session row for a seeded user and the files/urls that carry it into a browser. */
export async function createLocalLogin({ user, next = "/dashboard" }: { user: string; next?: string }) {
	assertLocalDatabase();
	const seeded = user in SEED_USERS ? SEED_USERS[user as TSeedUserKey] : Object.values(SEED_USERS).find((candidate) => candidate.email === user);
	const email = seeded?.email ?? user;
	const userKey = (Object.keys(SEED_USERS) as TSeedUserKey[]).find((key) => SEED_USERS[key].email === email) ?? email.replace(/[^a-z0-9]+/gi, "-");

	const row = await db.query.users.findFirst({ where: (fields, { eq }) => eq(fields.email, email), columns: { id: true, nome: true, email: true } });
	if (!row) {
		throw new Error(`[local-dev] No user "${user}" in the local database. Seeded users: ${Object.keys(SEED_USERS).join(", ")}. Was the pack loaded?`);
	}

	const token = await generateSessionToken();
	const session = await createSession({ token, userId: row.id });

	const appUrl = new URL(process.env.NEXT_PUBLIC_APP_URL as string);
	const storageStatePath = resolveStorageStatePath(userKey);
	mkdirSync(AUTH_STATE_DIR, { recursive: true });
	writeFileSync(
		storageStatePath,
		`${JSON.stringify(
			{
				cookies: [
					{
						name: SESSION_COOKIE_NAME,
						value: token,
						domain: appUrl.hostname,
						path: "/",
						expires: Math.floor(session.dataExpiracao.getTime() / 1000),
						httpOnly: true,
						secure: false,
						sameSite: "Lax",
					},
				],
				origins: [],
			},
			null,
			2,
		)}\n`,
	);

	const loginUrl = new URL("/auth/dev-login", appUrl);
	loginUrl.searchParams.set("token", token);
	loginUrl.searchParams.set("next", next);
	return { user: row, userKey, token, storageStatePath, loginUrl: loginUrl.href };
}

if (require.main === module) {
	runScript(async () => {
		const { options, positionals } = parseArgs();
		// `--all` logs every seeded user that exists in this database (used by the e2e global setup).
		const requested = options.all ? (Object.keys(SEED_USERS) as string[]) : [positionals[0] ?? "admin"];
		for (const user of requested) {
			try {
				const login = await createLocalLogin({ user, next: options.next });
				console.log(`[local-dev] Session created for ${login.user.nome} <${login.user.email}>.`);
				console.log(`[local-dev] Playwright storageState: ${path.relative(process.cwd(), login.storageStatePath)}`);
				console.log(`[local-dev] Open to log in: ${login.loginUrl}`);
			} catch (error) {
				// A user from a scenario pack that was not loaded is not an error for `--all`.
				if (!options.all) throw error;
			}
		}
		await connection.end();
	});
}
