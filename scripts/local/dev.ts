/**
 * npm run local:dev — starts Next.js with ONLY the local environment, on the local port.
 *
 * `applyLocalEnv` refuses to continue when a key from a real env file is not defined locally, so
 * Next.js has nothing left to fill from `.env`/`.env.local`.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { parseArgs } from "./args";
import { REPO_ROOT, applyLocalEnv } from "./env";

function main() {
	const { options } = parseArgs();
	const env = applyLocalEnv();
	const port = options.port ?? env.LOCAL_PORT;

	console.log(
		`[local-dev] Starting Next.js on http://localhost:${port} against "${new URL(env.SUPABASE_DB_URL).pathname.slice(1)}" (stub keys only).`,
	);

	// The Next.js binary is run by this Node directly: no shell, so it behaves the same on Windows.
	const nextBin = path.join(REPO_ROOT, "node_modules", "next", "dist", "bin", "next");
	const start = (attempt: number) => {
		const startedAt = Date.now();
		const child = spawn(process.execPath, [nextBin, "dev", "--port", String(port)], {
			cwd: REPO_ROOT,
			stdio: "inherit",
			env: { ...process.env, ...env, PORT: String(port) },
		});
		const forward = (signal: NodeJS.Signals) => child.kill(signal);
		process.on("SIGINT", forward);
		process.on("SIGTERM", forward);
		child.on("exit", (code, signal) => {
			process.off("SIGINT", forward);
			process.off("SIGTERM", forward);
			// `next dev` sometimes prints a one-time notice and exits before serving, asking for the
			// same command again. An unattended start (Playwright's webServer) cannot do that by hand.
			if (attempt === 1 && !signal && Date.now() - startedAt < 20_000) {
				console.log("[local-dev] Next.js exited before serving; starting it once more.");
				start(2);
				return;
			}
			process.exit(code ?? 0);
		});
	};
	start(1);
}

try {
	main();
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
}
