/**
 * Funde os produtos criados pela ingestão de pedidos do iFood (grupo "iFood", código UUID) no
 * cadastro original, a partir de `produtosGeradosPeloIfood` do JSON de
 * `scripts/ifood-suggest-catalog-links.ts`.
 *
 * Uso:
 *   npx tsx scripts/merge-ifood-ingestion-duplicates.ts --file=<json> [--confirm]
 *
 * Sem `--confirm` só lista os pares e o que cada duplicata carrega. Com `--confirm`, para cada par:
 * `mergeProducts` (re-aponta vendas, afinidades, canais etc. e apaga a duplicata) e, em seguida,
 * reconstrói a afinidade produto × cliente dos clientes afetados — o re-apontamento deixa duas
 * linhas por (cliente, produto, janela), já que a tabela não tem chave única.
 *
 * Antes de rodar, garanta que o item do iFood que gerava a duplicata já resolve para o original
 * (vínculo ou código externo) — senão o próximo pedido recria o produto.
 */
import "@/utils/scripts/load-next-env";

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { recomputeClientProductReferences } from "@/lib/clients/recompute";
import { mergeProducts } from "@/lib/products/merge";
import { connection, db } from "@/services/drizzle";
import { productClientReferences, products, saleItems } from "@/services/drizzle/schema";
import { and, eq, isNotNull } from "drizzle-orm";

function getArgValue(name: string) {
	const prefix = `--${name}=`;
	const arg = process.argv.find((value) => value.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : null;
}

type TSuggestionFile = {
	organizacao: { id: string; nome: string };
	produtosGeradosPeloIfood: {
		produtoId: string;
		nome: string;
		codigo: string | null;
		originalProvavel: { produtoId: string; nome: string; codigo: string | null } | null;
	}[];
};

async function affectedClientIds(orgId: string, produtoId: string) {
	const [fromSales, fromReferences] = await Promise.all([
		db
			.selectDistinct({ clienteId: saleItems.clienteId })
			.from(saleItems)
			.where(and(eq(saleItems.organizacaoId, orgId), eq(saleItems.produtoId, produtoId), isNotNull(saleItems.clienteId))),
		db
			.selectDistinct({ clienteId: productClientReferences.clienteId })
			.from(productClientReferences)
			.where(and(eq(productClientReferences.organizacaoId, orgId), eq(productClientReferences.produtoId, produtoId))),
	]);
	return [...new Set([...fromSales, ...fromReferences].map((row) => row.clienteId).filter((id): id is string => !!id))];
}

async function main() {
	const file = getArgValue("file");
	if (!file) throw new Error("Informe --file=<json de sugestões>.");
	const confirm = process.argv.includes("--confirm");
	const plan = JSON.parse(readFileSync(resolve(file), "utf-8")) as TSuggestionFile;
	const orgId = plan.organizacao.id;

	console.log(`${confirm ? "FUNDINDO" : "SIMULAÇÃO (use --confirm para gravar)"} — ${plan.organizacao.nome}\n`);

	const pairs = plan.produtosGeradosPeloIfood.filter((artifact) => artifact.originalProvavel);
	const report: unknown[] = [];

	for (const artifact of pairs) {
		const keeper = artifact.originalProvavel as NonNullable<typeof artifact.originalProvavel>;
		const source = await db.query.products.findFirst({
			where: and(eq(products.id, artifact.produtoId), eq(products.organizacaoId, orgId)),
			columns: { id: true, nome: true },
		});
		if (!source) {
			console.log(`JÁ FUNDIDO  ${artifact.nome} [${artifact.codigo}] — não existe mais.`);
			continue;
		}

		const salesCount = await db.$count(saleItems, and(eq(saleItems.organizacaoId, orgId), eq(saleItems.produtoId, source.id)));
		const clientIds = await affectedClientIds(orgId, source.id);
		console.log(`FUNDIR  "${artifact.nome}" [${artifact.codigo}]  →  "${keeper.nome}" [${keeper.codigo}]  | ${salesCount} itens de venda, ${clientIds.length} clientes`);
		if (!confirm) continue;

		const result = await mergeProducts({ db, organizacaoId: orgId, keeperId: keeper.produtoId, sourceId: source.id });
		for (const clienteId of clientIds) {
			await db.transaction((tx) => recomputeClientProductReferences({ tx, organizacaoId: orgId, clienteId }));
		}
		console.log("   movidos:", Object.fromEntries(Object.entries(result.registrosMovidos).filter(([, count]) => count > 0)));
		console.log(`   afinidade recalculada para ${clientIds.length} clientes`);
		report.push({ ...result, clientesRecalculados: clientIds.length });
	}

	if (confirm && report.length) {
		// Snapshot da duplicata apagada, para auditoria/reversão manual.
		const outPath = resolve(`./.local-analysis/ifood/fusoes-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
		mkdirSync(dirname(outPath), { recursive: true });
		writeFileSync(outPath, JSON.stringify(report, null, 2), { encoding: "utf-8" });
		console.log(`\nSnapshot: ${outPath}`);
	}
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(() => connection.end());
