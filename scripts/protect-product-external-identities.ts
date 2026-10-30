/** Backfill only existing targets. Does not merge products or change commercial fields. */
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { connection, db } from "@/services/drizzle";
import { integrations, catalogLinks, products, productVariants } from "@/services/drizzle/schema";
import { assertCatalog, catalogHash, type TPhiboCatalogPlan } from "@/lib/products/phibo-catalog";
import { buildExternalIdentityLink, loadExternalIdentities, type TExternalIdentityKey } from "@/lib/products/external-identities";

const args = process.argv.slice(2);
const organizationId = args[args.indexOf("--organization-id") + 1];
assertCatalog(args.includes("--organization-id") && organizationId && !organizationId.startsWith("--"), "Informe --organization-id.");
const root = "../recompracrm-tmpworks/phibo";
const output = `${root}/protecao-identidades-${args.includes("--apply") ? "aplicada" : "previa"}-2026-10-27.json`;

async function main() {
	if (args.includes("--migrate")) {
		assertCatalog(args.includes("--apply"), "Migração exige --apply.");
		await db.transaction(async (tx) => {
			const org = await tx.query.organizations.findFirst({ where: (f, { eq }) => eq(f.id, organizationId), columns: { id: true } });
			assertCatalog(org, "Organização não encontrada.");
			await tx.execute(sql.raw(await readFile("drizzle/0140_catalog_external_identities.sql", "utf8")));
		});
		console.log("Estrutura de identidades externas aplicada.");
		return;
	}
	const previous = JSON.parse(await readFile(`${root}/sync-catalogo-resultado-2026-10-27.json`, "utf8")) as {
		organizacao: { id: string };
		fonteSha256: string;
		plano: TPhiboCatalogPlan;
	};
	const manual = JSON.parse(await readFile(`${root}/de-para-manual-conflitos-2026-10-27.json`, "utf8")) as {
		organizacaoId: string;
		fonteSha256: string;
		modelos: Array<{
			produtoCanonicoId: string;
			produtosAConsolidar: Array<{ produtoId: string }>;
			variantes: Array<{ ean: string; estoquePhiboId: string; varianteCanonicaId: string; acao: string }>;
		}>;
	};
	assertCatalog(
		previous.organizacao.id === organizationId && manual.organizacaoId === organizationId && previous.fonteSha256 === manual.fonteSha256,
		"Fontes de mapeamento incompatíveis.",
	);
	const report = await db.transaction(async (tx) => {
		if (args.includes("--apply"))
			await tx.execute(sql`lock table ampmais_catalog_links, ampmais_products, ampmais_product_variants in share row exclusive mode`);
		else await tx.execute(sql`set transaction isolation level repeatable read read only`);
		const sources = await tx
			.select({ id: integrations.id, tipo: integrations.tipo })
			.from(integrations)
			.where(eq(integrations.organizacaoId, organizationId));
		const phibo = sources.filter((s) => s.tipo === "PHIBO");
		const nuvemshop = sources.filter((s) => s.tipo === "NUVEM-SHOP");
		assertCatalog(phibo.length === 1 && nuvemshop.length === 1, "Identifique uma única conexão de cada origem antes do backfill.");
		const parents = await tx.select().from(products).where(eq(products.organizacaoId, organizationId));
		const variants = await tx.select().from(productVariants).where(eq(productVariants.organizacaoId, organizationId));
		const parentById = new Map(parents.map((p) => [p.id, p]));
		const variantById = new Map(variants.map((v) => [v.id, v]));
		const protectedParents = new Set<string>();
		const planned: (typeof catalogLinks.$inferInsert)[] = [];
		function add(integrationId: string, tipo: TExternalIdentityKey["tipo"], valor: string, target: { produtoId?: string; produtoVarianteId?: string }) {
			assertCatalog(valor, "Identificador vazio.");
			const source = sources.find((s) => s.id === integrationId);
			assertCatalog(source, "Origem não encontrada.");
			planned.push(buildExternalIdentityLink(organizationId, source, { tipo, valor }, { ...target, protegido: true }));
		}
		for (const group of previous.plano.grupos) {
			assertCatalog(parentById.has(group.produtoId), "Pai do catálogo aplicado não existe.");
			protectedParents.add(group.produtoId);
			add(phibo[0].id, "PRODUTO", String(group.modeloPhiboId), { produtoId: group.produtoId });
			for (const item of group.variacoes) {
				const variant = variantById.get(item.varianteId);
				assertCatalog(variant?.produtoId === group.produtoId, "Variante mudou desde o catálogo aplicado.");
				add(phibo[0].id, "EAN", item.origem.produtoEan, { produtoVarianteId: variant.id });
				add(phibo[0].id, "ESTOQUE", item.origem.estoqueId, { produtoVarianteId: variant.id });
			}
		}
		let pending = 0;
		for (const model of manual.modelos) {
			for (const id of [model.produtoCanonicoId, ...model.produtosAConsolidar.map((p) => p.produtoId)]) if (parentById.has(id)) protectedParents.add(id);
			for (const item of model.variantes) {
				const variant = variantById.get(item.varianteCanonicaId);
				if (!variant) {
					assertCatalog(item.acao === "CRIAR_VARIANTE", "Destino existente do de-para desapareceu.");
					pending++;
					continue;
				}
				protectedParents.add(variant.produtoId);
				add(phibo[0].id, "EAN", item.ean, { produtoVarianteId: variant.id });
				add(phibo[0].id, "ESTOQUE", item.estoquePhiboId, { produtoVarianteId: variant.id });
			}
		}
		for (const parent of parents.filter((p) => protectedParents.has(p.id) && /^NS-\d+$/.test(p.codigo))) {
			add(nuvemshop[0].id, "PRODUTO", parent.codigo.slice(3), { produtoId: parent.id });
			add(nuvemshop[0].id, "CODIGO", parent.codigo, { produtoId: parent.id });
			for (const variant of variants.filter((v) => v.produtoId === parent.id)) {
				if (variant.idExterno && !variant.idExterno.startsWith("phibo:"))
					add(nuvemshop[0].id, "VARIANTE", variant.idExterno, { produtoVarianteId: variant.id });
				if (variant.codigo) add(nuvemshop[0].id, "CODIGO", variant.codigo, { produtoVarianteId: variant.id });
			}
		}
		const unique = new Map<string, (typeof planned)[number]>();
		for (const row of planned) {
			const key = JSON.stringify([row.integracaoId, row.identidadeTipo, row.identidadeValor]);
			const old = unique.get(key);
			assertCatalog(!old || (old.produtoId === row.produtoId && old.produtoVarianteId === row.produtoVarianteId), "De-para com destinos conflitantes.");
			unique.set(key, row);
		}
		const rows = [...unique.values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
		const hash = catalogHash(JSON.stringify(rows));
		const existing = await tx.select().from(catalogLinks).where(eq(catalogLinks.organizacaoId, organizationId));
		for (const row of rows) {
			const old = existing.find(
				(a) => a.integracaoId === row.integracaoId && a.identidadeTipo === row.identidadeTipo && a.identidadeValor === row.identidadeValor,
			);
			assertCatalog(
				!old || (old.produtoId === (row.produtoId ?? null) && old.produtoVarianteId === (row.produtoVarianteId ?? null)),
				"Vínculo persistido diverge da preparação.",
			);
		}
		const result = {
			organizacaoId: organizationId,
			hash,
			identidades: rows.length,
			novas: rows.filter(
				(r) =>
					!existing.some((a) => a.integracaoId === r.integracaoId && a.identidadeTipo === r.identidadeTipo && a.identidadeValor === r.identidadeValor),
			).length,
			variantesAguardandoCriacao: pending,
			registros: rows,
		};
		if (args.includes("--apply")) {
			assertCatalog(args.includes("--expected-hash") && args[args.indexOf("--expected-hash") + 1] === hash, "Use o hash da prévia atual.");
			await writeFile(`${root}/protecao-identidades-backup-2026-10-27.json`, JSON.stringify(existing, null, 2));
			for (let i = 0; i < rows.length; i += 250)
				await tx
					.insert(catalogLinks)
					.values(rows.slice(i, i + 250).map((r) => ({ ...r, id: randomUUID() })))
					.onConflictDoUpdate({
						target: [catalogLinks.organizacaoId, catalogLinks.integracaoId, catalogLinks.identidadeTipo, catalogLinks.identidadeValor],
						set: { protegido: true },
					});
			await loadExternalIdentities(tx, organizationId, phibo[0].id);
			await loadExternalIdentities(tx, organizationId, nuvemshop[0].id);
		}
		return result;
	});
	await writeFile(output, JSON.stringify(report, null, 2));
	console.log(JSON.stringify({ ...report, registros: undefined, relatorio: output }, null, 2));
}

main()
	.catch((error) => {
		console.error(error instanceof Error ? error.message : "Falha ao proteger identidades.");
		process.exitCode = 1;
	})
	.finally(() => connection.end());
