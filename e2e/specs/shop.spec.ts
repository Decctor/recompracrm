import { expect, test } from "playwright/test";
import { SEED_PRODUCTS, SEED_STORES } from "../../scripts/local/seed/ids";
import { queryLocalDatabase } from "../support/database";

// The online store is public: no session.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("public online store", () => {
	test("a new customer places a pickup order", async ({ page }) => {
		const { coxinha } = SEED_PRODUCTS;
		await page.goto(`/shop/${SEED_STORES.demo.slug}`);
		await expect(page.getByRole("heading", { name: SEED_STORES.demo.nome, level: 1 })).toBeVisible();
		await expect(page.getByText("ABERTA AGORA")).toBeVisible();

		await page.getByRole("button", { name: `Adicionar ${coxinha.nome}` }).click();
		await page.getByRole("button", { name: /VER CARRINHO/ }).click();
		await page.getByRole("button", { name: "FINALIZAR PEDIDO" }).click();

		// Identity: an unknown phone asks for the name.
		await page.getByPlaceholder("(00) 00000-0000").fill("(34) 99888-7766");
		await page.getByPlaceholder("Seu nome completo").fill("Cliente E2E");
		await page.getByRole("button", { name: "CONTINUAR", exact: true }).click();

		// Delivery: pickup is the default modality.
		await expect(page.getByText("Endereço para retirada")).toBeVisible();
		await page.getByRole("button", { name: "CONTINUAR", exact: true }).click();

		// Benefits (coupons / cashback): nothing to apply for a new customer.
		await page.getByRole("button", { name: "CONTINUAR PARA PAGAMENTO" }).click();

		// Payment.
		await page.getByRole("button", { name: /^Dinheiro/ }).click();
		await page.getByRole("button", { name: "CONTINUAR", exact: true }).click();

		// Review and send.
		const creation = page.waitForResponse((response) => response.url().includes("/api/shop/") && response.request().method() === "POST");
		await page.getByRole("button", { name: /ENVIAR PEDIDO/ }).click();
		const response = await creation;
		expect(response.status(), await response.text()).toBeLessThan(300);

		await expect(page).toHaveURL(new RegExp(`/shop/${SEED_STORES.demo.slug}/pedidos/`));

		const orders = await queryLocalDatabase(
			(sql) => sql`SELECT r.id FROM ampmais_shop_order_requests r WHERE r.organizacao_id = ${SEED_STORES.demo.id}`,
		);
		expect(orders).toHaveLength(1);
	});
});
