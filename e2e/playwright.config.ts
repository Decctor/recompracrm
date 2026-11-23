import { defineConfig, devices } from "playwright/test";
import { REPO_ROOT, resolveBaseUrl, storageStateFor } from "./support/local";

const baseURL = resolveBaseUrl();

/**
 * End-to-end checks against the LOCAL environment only (docs/dev/local-environment.md).
 * `baseURL` comes from `.env.localdb`; there is no way to point this config at another host.
 */
export default defineConfig({
	testDir: "./specs",
	outputDir: "./.results/artifacts",
	globalSetup: "./global-setup.ts",
	// One database for the whole run: specs that sell or redeem must not race each other.
	workers: 1,
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: 0,
	// First hit of a route compiles it in `next dev`.
	timeout: 120_000,
	expect: { timeout: 20_000 },
	reporter: [["list"], ["html", { outputFolder: "./.results/report", open: "never" }]],
	use: {
		baseURL,
		storageState: storageStateFor("admin"),
		locale: "pt-BR",
		timezoneId: "America/Sao_Paulo",
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		navigationTimeout: 90_000,
		actionTimeout: 20_000,
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
	webServer: {
		command: "npm run local:dev",
		cwd: REPO_ROOT,
		url: `${baseURL}/auth/signin`,
		reuseExistingServer: true,
		timeout: 180_000,
		stdout: "ignore",
		stderr: "pipe",
	},
});
