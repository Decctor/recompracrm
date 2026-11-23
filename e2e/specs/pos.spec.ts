import { expect, test } from "playwright/test";
import { SEED_PRODUCTS, SEED_SALES_SESSION, SEED_STORES } from "../../scripts/local/seed/ids";
import { queryLocalDatabase } from "../support/database";

test.describe("register (PDV)", () => {
	test("adds a product and confirms a cash sale", async ({ page }) => {
		const { water } = SEED_PRODUCTS;
		const readStock = async () =>
			(await queryLocalDatabase((sql) => sql`SELECT quantidade FROM ampmais_products WHERE id = ${water.id}`))[0].quantidade as number;
		const stockBefore = await readStock();
		await page.goto("/dashboard/sales/new");
		await expect(page.getByRole("heading", { name: "Nova Venda", level: 1 })).toBeVisible();
		// The seeded register is open, so the sale lands in it.
		await expect(page.getByText(/Caixa aberto/)).toBeVisible();

		await page.getByRole("button", { name: new RegExp(`^Adicionar ${water.nome}`) }).click();
		await page.getByRole("button", { name: "Aumentar quantidade" }).click();
		await expect(page.getByRole("textbox", { name: "Quantidade" })).toHaveValue("2");

		await page.getByRole("button", { name: "DINHEIRO", exact: true }).click();
		const finish = page.getByRole("button", { name: "FINALIZAR VENDA" });
		await expect(finish).toBeEnabled();

		const confirmation = page.waitForResponse(
			(response) => response.url().includes("/api/pos/sales/create-and-confirm") && response.request().method() === "POST",
		);
		await finish.click();
		const response = await confirmation;
		expect(response.status(), await response.text()).toBe(200);
		const saleId = (await response.json()).data.saleId as string;

		await expect(page.getByRole("link", { name: "IR PARA O HISTÓRICO" })).toBeVisible();

		// What the click wrote: a confirmed R$ 8,00 sale, in the open register, and stock moved.
		const [sale] = await queryLocalDatabase(
			(sql) => sql`SELECT status_venda, valor_total, sessao_venda_id, organizacao_id FROM ampmais_sales WHERE id = ${saleId}`,
		);
		expect(sale).toMatchObject({
			status_venda: "CONFIRMADA",
			valor_total: water.precoVenda * 2,
			sessao_venda_id: SEED_SALES_SESSION.id,
			organizacao_id: SEED_STORES.demo.id,
		});
		expect(await readStock()).toBe(stockBefore - 2);
	});
});
