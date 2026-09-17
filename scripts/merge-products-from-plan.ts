/**
 * Executa as fusões definidas em fundir-produtos.json (saída da revisão de duplicatas).
 *
 * Uso:
 *   npx tsx ./scripts/merge-products-from-plan.ts --org=27817d9a-cb04-4704-a1f4-15b81a3610d3
 *   npx tsx ./scripts/merge-products-from-plan.ts --org=... --cluster=cluster-004
 *   npx tsx ./scripts/merge-products-from-plan.ts --org=... --apply
 *
 * Sem --apply: apenas lista o plano. Com --apply: mescla em transação por par e grava snapshot em tmp/.
 */
import "@/utils/scripts/load-next-env";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { mergeProducts } from "@/lib/products/merge";
import { connection, db } from "@/services/drizzle";
import { products } from "@/services/drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";

const ORGANIZACAO_PADRAO = "27817d9a-cb04-4704-a1f4-15b81a3610d3";

type TFusaoPlano = {
	clusterId: string;
	motivoRevisao: string | null;
	manter: { id: string; nome: string; codigo: string | null };
	absorver: { id: string; nome: string; codigo: string | null }[];
};

type TPlanoArquivo = {
	organizacaoId: string;
	organizacaoNome: string | null;
	fusoes: TFusaoPlano[];
};

type TArgs = {
	apply: boolean;
	organizacaoId: string;
	planoPath: string;
	clusterFilter: string | null;
};

function getArgValue(name: string) {
	const prefix = `--${name}=`;
	const indexed = process.argv.find((arg) => arg.startsWith(prefix));
	if (indexed) return indexed.slice(prefix.length);
	const flag = process.argv.indexOf(`--${name}`);
	if (flag === -1) return null;
	return process.argv[flag + 1] ?? null;
}

function parseArgs(): TArgs {
	const organizacaoId = getArgValue("org") ?? getArgValue("orgId") ?? ORGANIZACAO_PADRAO;
	const planoPath =
		getArgValue("in") ?? resolve(`./.local-analysis/product-duplicates/${organizacaoId}/fundir-produtos.json`);
	return {
		apply: process.argv.includes("--apply"),
		organizacaoId,
		planoPath: resolve(planoPath),
		clusterFilter: getArgValue("cluster"),
	};
}

function carregarPlano(path: string): TPlanoArquivo {
	if (!existsSync(path)) throw new Error(`Plano não encontrado: ${path}`);
	return JSON.parse(readFileSync(path, { encoding: "utf-8" })) as TPlanoArquivo;
}

async function carregarIdsExistentes(organizacaoId: string, ids: string[]) {
	if (ids.length === 0) return new Set<string>();
	const rows = await db
		.select({ id: products.id })
		.from(products)
		.where(and(eq(products.organizacaoId, organizacaoId), inArray(products.id, ids)));
	return new Set(rows.map((row) => row.id));
}

async function main() {
	const args = parseArgs();
	const plano = carregarPlano(args.planoPath);

	let fusoes = plano.fusoes;
	if (args.clusterFilter) {
		fusoes = fusoes.filter((fusao) => fusao.clusterId === args.clusterFilter);
		if (fusoes.length === 0) throw new Error(`Nenhuma fusão com clusterId=${args.clusterFilter}.`);
	}

	if (plano.organizacaoId !== args.organizacaoId) {
		throw new Error(`Plano é da org ${plano.organizacaoId}, mas --org=${args.organizacaoId}.`);
	}

	const pares = fusoes.flatMap((fusao) =>
		fusao.absorver.map((absorver) => ({
			clusterId: fusao.clusterId,
			motivo: fusao.motivoRevisao,
			manterId: fusao.manter.id,
			manterNome: fusao.manter.nome,
			sourceId: absorver.id,
			sourceNome: absorver.nome,
		})),
	);

	const todosIds = [...new Set(pares.flatMap((par) => [par.manterId, par.sourceId]))];
	const idsExistentes = await carregarIdsExistentes(args.organizacaoId, todosIds);

	const pendentes: typeof pares = [];
	const pulados: typeof pares = [];
	for (const par of pares) {
		if (!idsExistentes.has(par.sourceId)) {
			pulados.push(par);
			continue;
		}
		if (!idsExistentes.has(par.manterId)) {
			throw new Error(
				`${par.clusterId}: sobrevivente ${par.manterId} não existe, mas origem ${par.sourceId} ainda está no catálogo.`,
			);
		}
		pendentes.push(par);
	}

	console.log(`[merge] org ${args.organizacaoId} (${plano.organizacaoNome ?? "?"})`);
	console.log(`[merge] plano: ${args.planoPath}`);
	console.log(`[merge] fusões: ${fusoes.length} clusters | ${pares.length} pares no plano | ${pendentes.length} pendentes | ${pulados.length} já mesclados`);
	if (!args.apply) {
		console.log("[merge] modo dry-run — passe --apply para executar\n");
		for (const par of pendentes) {
			console.log(`  ${par.clusterId}: absorver ${par.sourceNome} (${par.sourceId}) → manter ${par.manterNome} (${par.manterId})`);
		}
		if (pulados.length > 0) {
			console.log("\n[merge] já mesclados (origem ausente):");
			for (const par of pulados) {
				console.log(`  ${par.clusterId}: ${par.sourceId}`);
			}
		}
		return;
	}

	const snapshotDir = join("tmp", "merge-products", args.organizacaoId, new Date().toISOString().replace(/[:.]/g, "-"));
	mkdirSync(snapshotDir, { recursive: true });

	const resultados: unknown[] = pulados.map((par) => ({ ...par, ok: true, pulado: true, motivoPulo: "origem já removida (fusão anterior)" }));
	let ok = 0;
	let falhas = 0;
	let puladosCount = pulados.length;

	for (const par of pendentes) {
		try {
			const result = await mergeProducts({
				db,
				organizacaoId: args.organizacaoId,
				keeperId: par.manterId,
				sourceId: par.sourceId,
			});
			resultados.push({ ...par, ok: true, registrosMovidos: result.registrosMovidos, sourceSnapshot: result.sourceSnapshot });
			ok += 1;
			console.log(`[merge] OK ${par.clusterId}: ${par.sourceId} → ${par.manterId} (${JSON.stringify(result.registrosMovidos)})`);
		} catch (error) {
			falhas += 1;
			resultados.push({ ...par, ok: false, erro: error instanceof Error ? error.message : String(error) });
			console.error(`[merge] ERRO ${par.clusterId}: ${par.sourceId} → ${par.manterId}:`, error);
		}
	}

	writeFileSync(
		join(snapshotDir, "resultado.json"),
		JSON.stringify({ planoPath: args.planoPath, ok, pulados: puladosCount, falhas, resultados }, null, 2),
		{ encoding: "utf-8" },
	);
	console.log(`\n[merge] concluído: ${ok} ok, ${puladosCount} pulados, ${falhas} falhas. Snapshot: ${snapshotDir}`);

	if (falhas > 0) process.exitCode = 1;
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await connection.end();
	});
