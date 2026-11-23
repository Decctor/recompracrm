import { SEED_USERS } from "../scripts/local/seed/ids";
import { runLocalScript } from "./support/local";

/**
 * Every run starts from the seeded snapshot: restore the database from its template, then log each
 * seeded user in (sessions live in the database, so a reset invalidates the old ones).
 *
 * The app is already up at this point — Playwright starts `webServer` first — and survives the
 * reset: its pool reconnects to the recreated database.
 */
export default async function globalSetup() {
	runLocalScript("reset.ts");
	const output = runLocalScript("login.ts", ["--all"]);
	const loggedIn = Object.keys(SEED_USERS).filter((key) => output.includes(`${key}.json`));
	console.log(`[e2e] Database restored from template. Sessions: ${loggedIn.join(", ")}.`);
}
