import { expect, test } from "playwright/test";
import { SEED_STORES, SEED_USERS } from "../../scripts/local/seed/ids";
import { readSessionToken, storageStateFor } from "../support/local";

test.describe("dashboard hub", () => {
	test("admin lands on the hub of the demo store", async ({ page }) => {
		await page.goto("/dashboard");

		await expect(page).toHaveURL(/\/dashboard$/);
		await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
		await expect(page.getByText(/^Olá, Ana/)).toBeVisible();
		await expect(page.getByText(SEED_STORES.demo.nome).first()).toBeVisible();
		// The band and the tabs: Operação only exists because the store has the ERP.
		await expect(page.getByText("VENDAS DE HOJE")).toBeVisible();
		await expect(page.getByRole("button", { name: /RELACIONAMENTO/ })).toBeVisible();
		await expect(page.getByRole("button", { name: /OPERAÇÃO/ })).toBeVisible();
		// Paying subscription: the paywall did not redirect.
		await expect(page.getByRole("button", { name: /PLANO CRM \+ ERP/ })).toBeVisible();
	});

	test("the dev-login url sets the session cookie in a clean browser", async ({ browser }) => {
		const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
		const page = await context.newPage();

		await page.goto("/dashboard");
		await expect(page).toHaveURL(/\/auth\/signin/);

		await page.goto(`/auth/dev-login?token=${readSessionToken("admin")}&next=/dashboard/sales/new`);
		await expect(page).toHaveURL(/\/dashboard\/sales\/new$/);
		await expect(page.getByRole("heading", { name: "Nova Venda", level: 1 })).toBeVisible();
		await context.close();
	});

	test("the dev-login route grants nothing for an unknown token", async ({ request }) => {
		const response = await request.get("/auth/dev-login?token=not-a-session", { maxRedirects: 0 });
		expect(response.status()).toBe(404);
	});

	test.describe("restricted operator", () => {
		test.use({ storageState: storageStateFor("operator") });

		test("sees the store but not what the profile hides", async ({ page }) => {
			await page.goto("/dashboard");
			await expect(page.getByRole("button", { name: new RegExp(SEED_USERS.operator.email) })).toBeVisible();
			await expect(page.getByRole("link", { name: "Configurações" })).toHaveCount(0);
		});
	});
});
