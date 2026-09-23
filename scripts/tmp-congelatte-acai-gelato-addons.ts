import "@/utils/scripts/load-next-env";

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { connection, db } from "@/services/drizzle";
import { integrations, productAddOnReferences, productAddOns, products } from "@/services/drizzle/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";

// TEMPORÁRIO — apagar depois de rodar na Congelatte (org 27817d9a).
//
// Os 6 produtos de açaí usavam o grupo "Adicionar 1 bola de gelato no seu açaí?" (cópia do
// Cardápio Web), que ficou 16 sabores ativos atrás do grupo consolidado "Escolha seu gelato:" e
// ainda vendia 9 sabores já pausados lá. Em vez de espelhar a lista (que volta a divergir no
// próximo sabor novo), os açaís passam a apontar para o próprio grupo consolidado, com a regra
// mín 0 / máx 1 gravada NO VÍNCULO (product_add_on_references) — o grupo continua mín 1 / máx 2
// para os gelatos. Preço não muda: todas as opções dos dois grupos estão em R$ 0,00.
//
// O grupo antigo é apenas DESATIVADO: suas opções seguem apontadas por sale_item_modifiers
// (50 no histórico) e o id_externo continua mapeando o grupo do conector.
//
// Uso: npx tsx ./scripts/tmp-congelatte-acai-gelato-addons.ts [--apply]

const ORGANIZATION_ID = "27817d9a-cb04-4704-a1f4-15b81a3610d3";
const GELATO_GROUP_ID = "501f0c62-a2e5-4c32-86a1-05fc68942887"; // "Escolha seu gelato:" (SABORES)
const ACAI_GROUP_ID = "362534ae-7e61-4b29-a4e8-359c3209f12b"; // "Adicionar 1 bola de gelato no seu açaí?"
const ACAI_MIN_OPCOES = 0;
const ACAI_MAX_OPCOES = 1;

function short(id: string) {
	return id.slice(0, 8);
}

async function main() {
	const apply = process.argv.includes("--apply");
	console.log(`Modo: ${apply ? "APPLY" : "DRY-RUN"} | org: ${ORGANIZATION_ID}\n`);

	// Guarda: com o Cardápio Web ativo, o catalog-sync casa grupos/opções por id_externo e move
	// opção de grupo no update — desfaria este vínculo na primeira sincronização.
	const cardapioWeb = await db.query.integrations.findFirst({
		where: and(eq(integrations.organizacaoId, ORGANIZATION_ID), eq(integrations.tipo, "CARDAPIO-WEB")),
		columns: { id: true, ativo: true },
	});
	if (cardapioWeb?.ativo) throw new Error("Integração CARDAPIO-WEB está ativa — o catalog-sync reescreveria os grupos. Aborte ou desative antes.");

	const groups = await db.query.productAddOns.findMany({
		where: and(eq(productAddOns.organizacaoId, ORGANIZATION_ID), inArray(productAddOns.id, [GELATO_GROUP_ID, ACAI_GROUP_ID])),
		columns: { id: true, nome: true, minOpcoes: true, maxOpcoes: true, ativo: true },
	});
	const gelatoGroup = groups.find((group) => group.id === GELATO_GROUP_ID);
	const acaiGroup = groups.find((group) => group.id === ACAI_GROUP_ID);
	if (!gelatoGroup || !acaiGroup) throw new Error("Grupos não encontrados nesta organização.");
	console.log(`Grupo destino: "${gelatoGroup.nome}" (mín ${gelatoGroup.minOpcoes} / máx ${gelatoGroup.maxOpcoes})`);
	console.log(`Grupo a desativar: "${acaiGroup.nome}" (ativo=${acaiGroup.ativo})\n`);

	const acaiReferences = await db
		.select({
			id: productAddOnReferences.id,
			produtoId: productAddOnReferences.produtoId,
			produtoVarianteId: productAddOnReferences.produtoVarianteId,
			ordem: productAddOnReferences.ordem,
			produtoNome: products.nome,
		})
		.from(productAddOnReferences)
		.leftJoin(products, eq(products.id, productAddOnReferences.produtoId))
		.where(eq(productAddOnReferences.produtoAddOnId, ACAI_GROUP_ID));
	if (acaiReferences.length === 0) {
		console.log("Nenhum vínculo no grupo do açaí — nada a fazer.");
		return;
	}

	const existingGelatoReferences = await db
		.select({
			id: productAddOnReferences.id,
			produtoId: productAddOnReferences.produtoId,
			produtoVarianteId: productAddOnReferences.produtoVarianteId,
			minOpcoes: productAddOnReferences.minOpcoes,
			maxOpcoes: productAddOnReferences.maxOpcoes,
		})
		.from(productAddOnReferences)
		.where(
			and(
				eq(productAddOnReferences.produtoAddOnId, GELATO_GROUP_ID),
				inArray(
					productAddOnReferences.produtoId,
					acaiReferences.map((reference) => reference.produtoId),
				),
			),
		);
	const referenceKey = (produtoId: string, produtoVarianteId: string | null) => `${produtoId}|${produtoVarianteId ?? ""}`;
	const existingByKey = new Map(existingGelatoReferences.map((reference) => [referenceKey(reference.produtoId, reference.produtoVarianteId), reference]));

	const toUpdate: { referenceId: string; produtoNome: string; de: string }[] = [];
	const toInsert: { produtoId: string; produtoVarianteId: string | null; ordem: number; produtoNome: string }[] = [];
	for (const reference of acaiReferences) {
		const existing = existingByKey.get(referenceKey(reference.produtoId, reference.produtoVarianteId));
		if (existing) {
			toUpdate.push({
				referenceId: existing.id,
				produtoNome: reference.produtoNome ?? reference.produtoId,
				de: `mín ${existing.minOpcoes ?? "herda"} / máx ${existing.maxOpcoes ?? "herda"}`,
			});
			continue;
		}
		toInsert.push({
			produtoId: reference.produtoId,
			produtoVarianteId: reference.produtoVarianteId,
			ordem: reference.ordem ?? 0,
			produtoNome: reference.produtoNome ?? reference.produtoId,
		});
	}

	console.log(`Vincular "${gelatoGroup.nome}" com mín ${ACAI_MIN_OPCOES} / máx ${ACAI_MAX_OPCOES}:`);
	for (const item of toInsert) console.log(`  + criar vínculo — ${item.produtoNome} (ordem ${item.ordem})`);
	for (const item of toUpdate) console.log(`  ~ ajustar vínculo ${short(item.referenceId)} — ${item.produtoNome} (era ${item.de})`);
	console.log(`\nRemover vínculos do grupo "${acaiGroup.nome}" (${acaiReferences.length}):`);
	for (const reference of acaiReferences) console.log(`  - ${short(reference.id)} — ${reference.produtoNome}`);
	console.log(`\nDesativar o grupo "${acaiGroup.nome}" (opções e histórico preservados).`);

	if (!apply) {
		console.log("\nDry-run: nada foi alterado. Rode com --apply para executar.");
		return;
	}

	const snapshotDir = join(process.cwd(), "tmp", "congelatte-acai-gelato-addons");
	mkdirSync(snapshotDir, { recursive: true });
	const snapshotPath = join(snapshotDir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
	writeFileSync(snapshotPath, JSON.stringify({ acaiGroup, gelatoGroup, acaiReferences, existingGelatoReferences }, null, 2), "utf-8");
	console.log(`\nSnapshot: ${snapshotPath}`);

	await db.transaction(async (tx) => {
		for (const item of toUpdate) {
			await tx
				.update(productAddOnReferences)
				.set({ minOpcoes: ACAI_MIN_OPCOES, maxOpcoes: ACAI_MAX_OPCOES })
				.where(eq(productAddOnReferences.id, item.referenceId));
		}
		if (toInsert.length > 0) {
			await tx.insert(productAddOnReferences).values(
				toInsert.map((item) => ({
					produtoId: item.produtoId,
					produtoVarianteId: item.produtoVarianteId,
					produtoAddOnId: GELATO_GROUP_ID,
					ordem: item.ordem,
					minOpcoes: ACAI_MIN_OPCOES,
					maxOpcoes: ACAI_MAX_OPCOES,
				})),
			);
		}
		await tx.delete(productAddOnReferences).where(
			inArray(
				productAddOnReferences.id,
				acaiReferences.map((reference) => reference.id),
			),
		);
		await tx.update(productAddOns).set({ ativo: false }).where(eq(productAddOns.id, ACAI_GROUP_ID));
	});

	console.log("\nAplicado.");
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await connection.end();
	});
