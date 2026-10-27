import assert from "node:assert/strict";
import test from "node:test";
import { externalIdentityKey, resolveExternalIdentity, resolveExternalSaleItem, type TExternalIdentityTarget } from "./external-identities";
import { partitionProtectedPhiboCatalog } from "./phibo-identity-protection";
import type { TPhiboCatalogRow } from "./phibo-catalog";
import { upsertCatalogProduct } from "@/lib/data-connectors/nuvemshop/catalog-sync";
import type { TNuvemshopCatalogProduct } from "@/lib/data-connectors/nuvemshop/mappers";
import type { DBTransaction } from "@/services/drizzle";

const parent: TExternalIdentityTarget = { produtoId: "canonical", produtoVarianteId: null, protegido: true, opcoes: [] };
const variant: TExternalIdentityTarget = {
	...parent,
	produtoVarianteId: "brown-p",
	opcoes: [
		{ eixo: "Cor", valor: "Marrom" },
		{ eixo: "Tamanho", valor: "P" },
	],
};
function identities() {
	return new Map([
		[externalIdentityKey({ tipo: "PRODUTO", valor: "remote-brown" }), parent],
		[externalIdentityKey({ tipo: "PRODUTO", valor: "remote-black" }), parent],
		[externalIdentityKey({ tipo: "VARIANTE", valor: "v-1" }), variant],
		[externalIdentityKey({ tipo: "CODIGO", valor: "sku-1" }), variant],
	]);
}
test("many remote parents resolve to one family without guessing names", () => {
	const index = identities();
	assert.equal(resolveExternalIdentity(index, [{ tipo: "PRODUTO", valor: "remote-brown" }])?.produtoId, "canonical");
	assert.equal(resolveExternalIdentity(index, [{ tipo: "PRODUTO", valor: "remote-black" }])?.produtoId, "canonical");
	assert.equal(resolveExternalIdentity(index, [{ tipo: "PRODUTO", valor: "unmapped" }]), null);
});
test("sale resolves remote variant even when its SKU changes, preserving implicit color", () => {
	assert.deepEqual(
		resolveExternalSaleItem(identities(), { productExternalId: "remote-brown", productCode: "changed", metadata: { variantId: "v-1" } }),
		variant,
	);
});
test("unknown variant under protected parent fails instead of falling back to flat product", () => {
	assert.throws(
		() => resolveExternalSaleItem(identities(), { productExternalId: "remote-brown", productCode: "new", metadata: { variantId: "unknown" } }),
		/sem de-para/,
	);
});
test("conflicting SKU and remote variant fail explicitly", () => {
	const index = identities();
	index.set(externalIdentityKey({ tipo: "CODIGO", valor: "sku-1" }), { ...variant, produtoVarianteId: "other" });
	assert.throws(
		() => resolveExternalSaleItem(index, { productExternalId: "remote-brown", productCode: "sku-1", metadata: { variantId: "v-1" } }),
		/destinos diferentes/,
	);
});

const product: TNuvemshopCatalogProduct = {
	idExterno: "remote-brown",
	codigo: "NS-remote-brown",
	nome: "Camisa - Marrom",
	descricao: null,
	imagemCapaUrl: null,
	codigoBarras: null,
	unidade: "UN",
	grupo: "Nuvem Shop",
	ncm: "N/A",
	tipo: "PRODUTO",
	ativo: true,
	controlaEstoque: true,
	precoVenda: 1,
	precoCusto: 1,
	quantidade: 999,
	options: [{ nome: "Tamanho", valores: ["P"] }],
	variants: [
		{
			idExterno: "v-1",
			codigo: "sku-1",
			codigoBarras: null,
			nome: "P",
			precoVenda: 1,
			precoCusto: 1,
			quantidade: 999,
			controlaEstoque: true,
			ativo: true,
			imagemCapaUrl: null,
			valores: [{ opcao: "Tamanho", valor: "P" }],
		},
	],
};
const forbiddenTx = new Proxy(
	{},
	{
		get() {
			throw new Error("Protected sync must not write or query mutable catalog data");
		},
	},
) as DBTransaction;
test("repeating protected catalog sync performs no writes, preserving names, axes, prices and stock", async () => {
	for (let i = 0; i < 2; i++)
		assert.deepEqual(
			await upsertCatalogProduct({ tx: forbiddenTx, organizationId: "org", integrationId: "source", identities: identities(), product }),
			{ created: false, variantsUpserted: 0, preserved: true },
		);
});
test("catalog refuses unknown variants in protected family before any write", async () => {
	await assert.rejects(
		upsertCatalogProduct({
			tx: forbiddenTx,
			organizationId: "org",
			integrationId: "source",
			identities: identities(),
			product: { ...product, variants: [{ ...product.variants[0], codigo: "new", idExterno: "unknown" }] },
		}),
		/sem de-para/,
	);
});
const row = { produtoId: 1, produtoEan: "ean", estoqueId: "stock" } as TPhiboCatalogRow;
test("Phibo preserves fully mapped models and separates partial mappings for review", () => {
	const index = new Map([
		[externalIdentityKey({ tipo: "PRODUTO", valor: "1" }), parent],
		[externalIdentityKey({ tipo: "EAN", valor: "ean" }), variant],
	]);
	const complete = partitionProtectedPhiboCatalog([row], index);
	assert.equal(complete.rows.length, 0);
	assert.equal(complete.protegidos.length, 1);
	const partial = partitionProtectedPhiboCatalog([row, { ...row, produtoEan: "new", estoqueId: "new" }], index);
	assert.equal(partial.rows.length, 0);
	assert.equal(partial.pendentes.length, 1);
});
test("unmapped Phibo models retain normal creation path", () => {
	assert.deepEqual(partitionProtectedPhiboCatalog([row], new Map()).rows, [row]);
});
