import "@/utils/scripts/load-next-env";

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	applyAddOnOptionDedupe,
	normalizeAddOnOptionName,
	planAddOnOptionDedupe,
	type TAddOnOptionDedupePlan,
} from "@/lib/products/dedupe-add-on-options";
import { connection, db } from "@/services/drizzle";
import { catalogLinks, productAddOnOptions, productAddOns, saleItemModifiers } from "@/services/drizzle/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

// Unifica opções duplicadas dentro de cada grupo de adicionais de uma organização.
// A regra de mesclagem vive em lib/products/dedupe-add-on-options.ts (ver cabeçalho).
//
// Uso: npx tsx ./scripts/dedupe-add-on-options.ts --org=<id> [--group=<id>] [--alias="De=Para"]... [--apply]
//   --group   restringe a um grupo.
//   --alias   trata "De" como a mesma opção que "Para" (grafias divergentes: "Banoffe=Banoffee").
//             Repetível. Comparação ignora acentos, caixa e espaços.
//   --apply   executa. Sem ele é dry-run. Antes de mutar, grava snapshot em tmp/dedupe-add-on-options/.

type TArgs = { apply: boolean; organizationId: string; groupId: string | null; aliases: Map<string, string> };

function getArgValues(name: string) {
	const prefix = `--${name}=`;
	return process.argv.filter((arg) => arg.startsWith(prefix)).map((arg) => arg.slice(prefix.length));
}

function parseArgs(): TArgs {
	const organizationId = getArgValues("org")[0] ?? getArgValues("orgId")[0];
	if (!organizationId) throw new Error("Informe a organização: --org=<organizationId>");
	const aliases = new Map<string, string>();
	for (const raw of getArgValues("alias")) {
		const [from, to] = raw.split("=");
		if (!from || !to) throw new Error(`Alias inválido "${raw}" — use --alias="De=Para".`);
		aliases.set(normalizeAddOnOptionName(from), normalizeAddOnOptionName(to));
	}
	return { apply: process.argv.includes("--apply"), organizationId, groupId: getArgValues("group")[0] ?? null, aliases };
}

function short(id: string) {
	return id.slice(0, 8);
}

function describeOption(option: TAddOnOptionDedupePlan["clusters"][number]["survivor"]) {
	const flags = [
		option.dataExclusao ? "excluída" : option.ativo ? "ativa" : "inativa",
		option.codigo ? `cód ${option.codigo}` : null,
		option.idExterno ? `ext ${option.idExterno}` : null,
		option.produtoId || option.produtoVarianteId ? "estoque" : null,
		`máx/item ${option.maxQtdePorItem ?? 1}`,
		option.precoDelta ? `R$${option.precoDelta.toFixed(2)}` : null,
	].filter(Boolean);
	return `${short(option.id)} "${option.nome}" [${flags.join(", ")}]`;
}

async function main() {
	const args = parseArgs();
	console.log(`Modo: ${args.apply ? "APPLY" : "DRY-RUN"} | org: ${args.organizationId}${args.groupId ? ` | grupo: ${args.groupId}` : ""}`);
	if (args.aliases.size > 0) console.log(`Aliases: ${[...args.aliases].map(([from, to]) => `"${from}" → "${to}"`).join(", ")}`);
	console.log("");

	const groups = await db.query.productAddOns.findMany({
		where: and(eq(productAddOns.organizacaoId, args.organizationId), ...(args.groupId ? [eq(productAddOns.id, args.groupId)] : [])),
		with: { opcoes: true },
	});
	if (groups.length === 0) {
		console.log("Nenhum grupo encontrado.");
		return;
	}

	const optionIds = groups.flatMap((group) => group.opcoes.map((option) => option.id));
	const modifierCountByOptionId = new Map<string, number>();
	const catalogLinkCountByOptionId = new Map<string, number>();
	if (optionIds.length > 0) {
		const modifierRows = await db
			.select({ opcaoId: saleItemModifiers.opcaoId, total: sql<number>`count(*)::int` })
			.from(saleItemModifiers)
			.where(inArray(saleItemModifiers.opcaoId, optionIds))
			.groupBy(saleItemModifiers.opcaoId);
		for (const row of modifierRows) if (row.opcaoId) modifierCountByOptionId.set(row.opcaoId, row.total);

		const linkRows = await db
			.select({ opcaoId: catalogLinks.produtoAddOnOpcaoId, total: sql<number>`count(*)::int` })
			.from(catalogLinks)
			.where(inArray(catalogLinks.produtoAddOnOpcaoId, optionIds))
			.groupBy(catalogLinks.produtoAddOnOpcaoId);
		for (const row of linkRows) if (row.opcaoId) catalogLinkCountByOptionId.set(row.opcaoId, row.total);
	}

	const plans: { groupName: string; plan: TAddOnOptionDedupePlan }[] = [];
	for (const group of groups) {
		const plan = planAddOnOptionDedupe({
			groupId: group.id,
			options: group.opcoes,
			modifierCountByOptionId,
			catalogLinkCountByOptionId,
			aliases: args.aliases,
		});
		if (plan.clusters.length === 0) continue;
		plans.push({ groupName: group.nome, plan });

		const totalLosers = plan.clusters.reduce((sum, cluster) => sum + cluster.losers.length, 0);
		const totalModifiers = plan.clusters.reduce((sum, cluster) => sum + cluster.losers.reduce((inner, loser) => inner + loser.modifierCount, 0), 0);
		console.log(
			`Grupo ${group.id} "${group.nome}": ${group.opcoes.length} opções → ${group.opcoes.length - totalLosers} (${plan.clusters.length} clusters, ${totalLosers} removidas, ${totalModifiers} modificadores re-apontados)`,
		);
		for (const cluster of plan.clusters) {
			console.log(`  ✔ ${describeOption(cluster.survivor)}`);
			const updates = Object.entries(cluster.survivorUpdates)
				.filter(([, value]) => value !== undefined)
				.map(([field, value]) => `${field}=${value ?? "null"}`);
			if (updates.length > 0) console.log(`      herda: ${updates.join(", ")}`);
			for (const loser of cluster.losers) {
				const refs = [
					loser.modifierCount ? `${loser.modifierCount} vendas` : null,
					loser.catalogLinkCount ? `${loser.catalogLinkCount} links` : null,
				].filter(Boolean);
				console.log(`    ✘ ${describeOption(loser.option)}${refs.length ? ` → ${refs.join(", ")}` : ""}`);
			}
			for (const conflict of cluster.conflicts) console.log(`      ! ${conflict}`);
		}
		console.log("");
	}

	if (plans.length === 0) {
		console.log("Nenhuma opção duplicada encontrada.");
		return;
	}

	// Grafias parecidas que o normalizador não junta: decisão do operador via --alias.
	const suspicious: string[] = [];
	for (const group of groups) {
		const liveKeys = new Map<string, string>();
		for (const option of group.opcoes.filter((item) => item.dataExclusao == null)) {
			const key = normalizeAddOnOptionName(option.nome);
			const loose = key.replace(/[^a-z0-9]/g, "").replace(/(.)\1+/g, "$1");
			const seen = liveKeys.get(loose);
			if (seen && seen !== key) suspicious.push(`"${seen}" ~ "${key}" (grupo ${short(group.id)})`);
			else liveKeys.set(loose, key);
		}
	}
	if (suspicious.length > 0) {
		console.log("Grafias parecidas NÃO unificadas (use --alias se forem a mesma opção):");
		for (const item of new Set(suspicious)) console.log(`  ? ${item}`);
		console.log("");
	}

	if (!args.apply) {
		console.log("Dry-run: nenhuma alteração aplicada. Rode com --apply para unificar.");
		return;
	}

	const snapshotDir = join(process.cwd(), "tmp", "dedupe-add-on-options");
	mkdirSync(snapshotDir, { recursive: true });
	const snapshotPath = join(snapshotDir, `${short(args.organizationId)}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
	writeFileSync(snapshotPath, JSON.stringify({ args: { ...args, aliases: [...args.aliases] }, plans }, null, 2), "utf-8");
	console.log(`Snapshot gravado em ${snapshotPath}`);

	for (const { plan } of plans) {
		await applyAddOnOptionDedupe({ db, organizationId: args.organizationId, plan });
	}

	for (const { plan, groupName } of plans) {
		const remaining = await db.query.productAddOnOptions.findMany({
			where: eq(productAddOnOptions.produtoAddOnId, plan.groupId),
			columns: { id: true },
		});
		console.log(`Grupo "${groupName}": ${remaining.length} opções restantes.`);
	}
}

main()
	.catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	})
	.finally(() => connection.end());
