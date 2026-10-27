/** Integration verification: every fixture and mutation is rolled back. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { connection, db, type DB, type DBTransaction } from "@/services/drizzle";
import { integrations, catalogLinks, products, productVariants } from "@/services/drizzle/schema";
import {
	buildExternalIdentityLink,
	loadExternalIdentities,
	registerExternalIdentity,
	resolveExternalIdentity,
	resolveExternalSaleItem,
} from "@/lib/products/external-identities";
import { mergeProducts } from "@/lib/products/merge";
import { upsertCatalogProduct } from "@/lib/data-connectors/nuvemshop/catalog-sync";
import type { TNuvemshopCatalogProduct } from "@/lib/data-connectors/nuvemshop/mappers";

const args = process.argv.slice(2);
const organizationId = args[args.indexOf("--organization-id") + 1];
assert(args.includes("--organization-id") && organizationId);
const rollback = new Error("ROLLBACK_VERIFICATION");
let verified = false;
async function main() {
	await db
		.transaction(async (tx) => {
			const integration = await tx.query.integrations.findFirst({
				where: and(eq(integrations.organizacaoId, organizationId), eq(integrations.tipo, "NUVEM-SHOP")),
				columns: { id: true },
			});
			assert(integration);
			const id = randomUUID();
			const keeperId = randomUUID();
			const variantId = randomUUID();
			const remoteId = `verification-${id}`;
			await tx
				.insert(products)
				.values(
					[id, keeperId].map((productId) => ({
						id: productId,
						organizacaoId: organizationId,
						codigo: productId,
						nome: "Verificação temporária",
						unidade: "UN",
						grupo: "VERIFICACAO",
						ncm: "N/A",
						tipo: "PRODUTO",
						precoVenda: 99,
						quantidade: 7,
					})),
				);
			await tx
				.insert(productVariants)
				.values({
					id: variantId,
					organizacaoId: organizationId,
					produtoId: id,
					nome: "Marrom / P",
					codigo: remoteId,
					idExterno: remoteId,
					precoVenda: 99,
					quantidade: 7,
				});
			await registerExternalIdentity(tx, organizationId, integration.id, { tipo: "PRODUTO", valor: remoteId }, { produtoId: id, protegido: true });
			await registerExternalIdentity(
				tx,
				organizationId,
				integration.id,
				{ tipo: "VARIANTE", valor: remoteId },
				{ produtoVarianteId: variantId, protegido: true },
			);
			await registerExternalIdentity(
				tx,
				organizationId,
				integration.id,
				{ tipo: "PRODUTO", valor: `${remoteId}-keeper` },
				{ produtoId: keeperId, protegido: true },
			);
			// Exercise the exact legacy iFood conflict predicate, including a repeated upsert.
			for (let i = 0; i < 2; i++)
				await tx
					.insert(catalogLinks)
					.values({
						organizacaoId: organizationId,
						provider: "IFOOD",
						merchantId: remoteId,
						tipo: "PRODUTO",
						produtoId: keeperId,
						sincronizar: { nome: false, descricao: false, imagem: false, preco: false, disponibilidade: false, complementos: false, criarOpcoes: false },
					})
					.onConflictDoUpdate({
						target: [
							catalogLinks.organizacaoId,
							catalogLinks.provider,
							catalogLinks.merchantId,
							catalogLinks.tipo,
							catalogLinks.produtoId,
							catalogLinks.produtoVarianteId,
							catalogLinks.produtoAddOnId,
							catalogLinks.produtoAddOnOpcaoId,
						],
						targetWhere: sql`tipo NOT IN ('ADD_ON', 'ADD_ON_OPCAO')`,
						set: { status: "SINCRONIZADO" },
					});
			await assert.rejects(
				tx.transaction(async (nested) => {
					await registerExternalIdentity(nested, organizationId, integration.id, { tipo: "PRODUTO", valor: remoteId }, { produtoId: keeperId });
				}),
				/outro destino/,
			);
			await assert.rejects(
				tx.transaction(async (nested) => {
					await nested
						.insert(catalogLinks)
						.values(
							buildExternalIdentityLink(randomUUID(), { ...integration, tipo: "NUVEM-SHOP" }, { tipo: "PRODUTO", valor: remoteId }, { produtoId: id }),
						);
				}),
			);
			await assert.rejects(
				tx.transaction(async (nested) => {
					await nested.delete(productVariants).where(eq(productVariants.id, variantId));
				}),
			);
			const nestedDb = { transaction: (callback: (nested: DBTransaction) => Promise<unknown>) => tx.transaction(callback) } as unknown as DB;
			await mergeProducts({ db: nestedDb, organizacaoId: organizationId, sourceId: id, keeperId });
			const index = await loadExternalIdentities(tx, organizationId, integration.id);
			const saleTarget = resolveExternalSaleItem(index, { productExternalId: remoteId, productCode: "changed-sku", metadata: { variantId: remoteId } });
			assert.equal(saleTarget?.produtoId, keeperId);
			assert.equal(saleTarget?.produtoVarianteId, variantId);
			assert.equal(resolveExternalIdentity(index, [{ tipo: "PRODUTO", valor: `${remoteId}-keeper` }])?.produtoId, keeperId);
			assert.equal(
				resolveExternalIdentity(await loadExternalIdentities(tx, organizationId, randomUUID()), [{ tipo: "PRODUTO", valor: remoteId }]),
				null,
			);
			const product: TNuvemshopCatalogProduct = {
				idExterno: remoteId,
				codigo: remoteId,
				nome: "Remote color name",
				descricao: null,
				imagemCapaUrl: null,
				codigoBarras: null,
				unidade: "UN",
				grupo: "Remote",
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
						idExterno: remoteId,
						codigo: remoteId,
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
			const before = await tx.query.products.findFirst({ where: eq(products.id, keeperId), with: { variantes: true, opcoes: true } });
			for (let i = 0; i < 2; i++) await upsertCatalogProduct({ tx, organizationId, integrationId: integration.id, identities: index, product });
			const after = await tx.query.products.findFirst({ where: eq(products.id, keeperId), with: { variantes: true, opcoes: true } });
			assert.deepEqual(after, before);
			await assert.rejects(
				upsertCatalogProduct({
					tx,
					organizationId,
					integrationId: integration.id,
					identities: index,
					product: { ...product, variants: [{ ...product.variants[0], idExterno: "unknown", codigo: "unknown" }] },
				}),
				/sem de-para/,
			);
			verified = true;
			throw rollback;
		})
		.catch((error) => {
			if (error !== rollback) throw error;
		});
	assert(verified);
	console.log(
		"Verificação com rollback: fusão preserva aliases/IDs, sincronização repetida não altera cadastro/preço/saldo, conflitos e isolamento são respeitados.",
	);
}
main()
	.catch((error) => {
		console.error(error instanceof Error ? error.message : "Falha na verificação.");
		process.exitCode = 1;
	})
	.finally(() => connection.end());
