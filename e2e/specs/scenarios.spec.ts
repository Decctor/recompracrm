import { expect, test } from "playwright/test";
import { SEED_COUPONS, SEED_STORES } from "../../scripts/local/seed/ids";
import { queryLocalDatabase } from "../support/database";
import { storageStateFor } from "../support/local";

/** What the scenario packs promise, checked where a user would see it. */
test.describe("scenario packs", () => {
	test("coupons: one coupon of each benefit type is listed", async ({ page }) => {
		await page.goto("/dashboard/growth/coupons");
		await expect(page.getByRole("heading", { name: "Cupons", level: 1 })).toBeVisible();
		for (const coupon of Object.values(SEED_COUPONS)) {
			await expect(page.getByText(coupon.codigo, { exact: true })).toBeVisible();
		}
	});

	test("sales-history: the demo store has about 90 days of confirmed sales", async ({ page }) => {
		const [history] = await queryLocalDatabase(
			(sql) => sql`
				SELECT count(*)::int AS total, count(DISTINCT data_venda::date)::int AS dias
				FROM ampmais_sales
				WHERE organizacao_id = ${SEED_STORES.demo.id} AND status_venda = 'CONFIRMADA' AND data_venda < now() - interval '12 hours'`,
		);
		expect(history.total).toBeGreaterThan(150);
		expect(history.dias).toBeGreaterThan(60);

		// An established store: the hub shows numbers, not the "Primeiros passos" ladder.
		await page.goto("/dashboard");
		await expect(page.getByText("TAXA DE RECOMPRA")).toBeVisible();
		await expect(page.getByText("PRIMEIROS PASSOS")).toHaveCount(0);
	});

	test.describe("crm-only store", () => {
		test.use({ storageState: storageStateFor("crmOwner") });

		test("has no ERP surfaces", async ({ page }) => {
			await page.goto("/dashboard");
			await expect(page.getByText(SEED_STORES.crmOnly.nome).first()).toBeVisible();
			await expect(page.getByRole("button", { name: /PLANO CRM$/ })).toBeVisible();
			await expect(page.getByRole("button", { name: /RELACIONAMENTO/ })).toBeVisible();
			// A tab the organization does not have is not rendered.
			await expect(page.getByRole("button", { name: /OPERAÇÃO/ })).toHaveCount(0);
			await expect(page.getByRole("link", { name: "Compras" })).toHaveCount(0);
		});
	});

	test.describe("trial store", () => {
		test.use({ storageState: storageStateFor("trialOwner") });

		test("opens the dashboard on trial access", async ({ page }) => {
			await page.goto("/dashboard");
			await expect(page).toHaveURL(/\/dashboard$/);
			await expect(page.getByText(SEED_STORES.trial.nome).first()).toBeVisible();
			await expect(page.getByRole("button", { name: /PLANO EM TESTES/ })).toBeVisible();
		});
	});
});
