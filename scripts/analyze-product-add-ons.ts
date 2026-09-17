/**
 * Inventário de grupos de adicionais por organização (registry + vínculos por produto).
 * Somente leitura — grava JSON em .local-analysis/product-add-ons/<org>/inventario.json
 *
 * Uso: npx tsx ./scripts/analyze-product-add-ons.ts --org=27817d9a-cb04-4704-a1f4-15b81a3610d3
 */
import "@/utils/scripts/load-next-env";

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { connection, db } from "@/services/drizzle";
import {
	catalogLinks,
	productAddOnOptions,
	productAddOnReferences,
	productAddOns,
	products,
	saleItemModifiers,
} from "@/services/drizzle/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

const ORG_PADRAO = "27817d9a-cb04-4704-a1f4-15b81a3610d3";

function getArgValue(name: string) {
	const prefix = `--${name}=`;
	return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function normalizeNome(value: string) {
	return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function optionSignature(option: {
	nome: string;
	precoDelta: number | null;
	maxQtdePorItem: number | null;
	produtoId: string | null;
	produtoVarianteId: string | null;
	quantidadeConsumo: number | null;
}) {
	return [
		normalizeNome(option.nome),
		option.precoDelta ?? 0,
		option.maxQtdePorItem ?? 1,
		option.produtoId ?? "",
		option.produtoVarianteId ?? "",
		option.quantidadeConsumo ?? 1,
	].join("|");
}

function groupSignature(group: {
	nome: string;
	internoNome: string | null;
	minOpcoes: number;
	maxOpcoes: number;
	opcoes: ReturnType<typeof optionSignature>[];
}) {
	const active = [...group.opcoes].sort();
	return [normalizeNome(group.nome), normalizeNome(group.internoNome ?? ""), group.minOpcoes, group.maxOpcoes, ...active].join("::");
}

async function main() {
	const organizacaoId = getArgValue("org") ?? ORG_PADRAO;
	const outDir = resolve(`./.local-analysis/product-add-ons/${organizacaoId}`);
	const outFile = resolve(outDir, "inventario.json");

	const groups = await db.query.productAddOns.findMany({
		where: eq(productAddOns.organizacaoId, organizacaoId),
		with: { opcoes: true, produtos: true },
		orderBy: (table, { asc }) => [asc(table.nome)],
	});

	const groupIds = groups.map((g) => g.id);
	const optionIds = groups.flatMap((g) => g.opcoes.map((o) => o.id));

	const [modifierCounts, linkRows, produtoNomes] = await Promise.all([
		optionIds.length > 0
			? db
					.select({ opcaoId: saleItemModifiers.opcaoId, total: sql<number>`count(*)::int` })
					.from(saleItemModifiers)
					.where(inArray(saleItemModifiers.opcaoId, optionIds))
					.groupBy(saleItemModifiers.opcaoId)
			: Promise.resolve([]),
		groupIds.length > 0
			? db
					.select({
						produtoAddOnId: catalogLinks.produtoAddOnId,
						produtoAddOnOpcaoId: catalogLinks.produtoAddOnOpcaoId,
					})
					.from(catalogLinks)
					.where(and(eq(catalogLinks.organizacaoId, organizacaoId), inArray(catalogLinks.produtoAddOnId, groupIds)))
			: Promise.resolve([]),
		db
			.select({ id: products.id, nome: products.nome, grupo: products.grupo, ativo: products.ativo })
			.from(products)
			.where(eq(products.organizacaoId, organizacaoId)),
	]);

	const modifierByOption = new Map(modifierCounts.map((row) => [row.opcaoId, row.total]));
	const linkedGroupIds = new Set(linkRows.map((r) => r.produtoAddOnId).filter(Boolean) as string[]);
	const produtoPorId = new Map(produtoNomes.map((p) => [p.id, p]));

	const gruposDetalhados = groups.map((group) => {
		const opcoesAtivas = group.opcoes.filter((o) => o.ativo && !o.dataExclusao);
		const opcoesInativas = group.opcoes.filter((o) => !o.ativo || o.dataExclusao);
		const modifiersTotal = group.opcoes.reduce((sum, o) => sum + (modifierByOption.get(o.id) ?? 0), 0);
		const produtosVinculados = group.produtos.map((ref) => {
			const produto = produtoPorId.get(ref.produtoId);
			return {
				produtoId: ref.produtoId,
				produtoNome: produto?.nome ?? null,
				produtoGrupo: produto?.grupo ?? null,
				produtoAtivo: produto?.ativo ?? null,
				produtoVarianteId: ref.produtoVarianteId,
				minOpcoes: ref.minOpcoes,
				maxOpcoes: ref.maxOpcoes,
			};
		});

		return {
			id: group.id,
			nome: group.nome,
			internoNome: group.internoNome,
			ativo: group.ativo,
			minOpcoes: group.minOpcoes,
			maxOpcoes: group.maxOpcoes,
			idExterno: group.idExterno,
			temCatalogLink: linkedGroupIds.has(group.id),
			produtosVinculados: produtosVinculados.length,
			produtos: produtosVinculados,
			opcoesAtivas: opcoesAtivas.length,
			opcoesInativas: opcoesInativas.length,
			modificadoresVenda: modifiersTotal,
			opcoes: opcoesAtivas.map((o) => ({
				id: o.id,
				nome: o.nome,
				precoDelta: o.precoDelta,
				produtoId: o.produtoId,
				produtoNome: o.produtoId ? produtoPorId.get(o.produtoId)?.nome ?? null : null,
				idExterno: o.idExterno,
				modificadoresVenda: modifierByOption.get(o.id) ?? 0,
			})),
			assinatura: groupSignature({
				nome: group.nome,
				internoNome: group.internoNome,
				minOpcoes: group.minOpcoes,
				maxOpcoes: group.maxOpcoes,
				opcoes: opcoesAtivas.map(optionSignature),
			}),
		};
	});

	const porNome = new Map<string, typeof gruposDetalhados>();
	for (const g of gruposDetalhados) {
		const key = normalizeNome(g.nome);
		porNome.set(key, [...(porNome.get(key) ?? []), g]);
	}

	const familiasMesmoNome = [...porNome.entries()]
		.filter(([, membros]) => membros.length > 1)
		.map(([nomeNormalizado, membros]) => ({
			nomeNormalizado,
			nomeExibicao: membros[0]?.nome,
			quantidade: membros.length,
			assinaturasDistintas: new Set(membros.map((m) => m.assinatura)).size,
			grupos: membros.map((m) => ({
				id: m.id,
				ativo: m.ativo,
				produtosVinculados: m.produtosVinculados,
				opcoesAtivas: m.opcoesAtivas,
				regra: `${m.minOpcoes}/${m.maxOpcoes}`,
				idExterno: m.idExterno,
			})),
		}))
		.sort((a, b) => b.quantidade - a.quantidade);

	const nomesGenericos = ["sabor", "sabores", "adicional", "adicionais", "extra", "extras", "complemento", "opção", "opcao"];
	const gruposSuspeitos = gruposDetalhados
		.filter((g) => {
			const n = normalizeNome(g.nome);
			if (nomesGenericos.some((termo) => n === termo || n.startsWith(`${termo} `) || n.startsWith(`${termo}:`))) return true;
			if (g.opcoesAtivas === 0 && g.produtosVinculados > 0) return true;
			if (!g.ativo && g.produtosVinculados === 0 && g.modificadoresVenda === 0) return false;
			return false;
		})
		.map((g) => ({
			id: g.id,
			nome: g.nome,
			motivo:
				nomesGenericos.includes(normalizeNome(g.nome)) || normalizeNome(g.nome).startsWith("sabor")
					? "nome genérico (revisar utilidade)"
					: g.opcoesAtivas === 0
						? "vinculado a produtos mas sem opções ativas"
						: "outro",
			produtosVinculados: g.produtosVinculados,
			opcoesAtivas: g.opcoesAtivas,
			modificadoresVenda: g.modificadoresVenda,
		}));

	const produtosComMuitosGrupos = [...produtoPorId.values()]
		.map((produto) => {
			const refs = gruposDetalhados.flatMap((g) => g.produtos.filter((p) => p.produtoId === produto.id));
			return { produtoId: produto.id, nome: produto.nome, grupo: produto.grupo, refs: refs.length };
		})
		.filter((p) => p.refs >= 4)
		.sort((a, b) => b.refs - a.refs);

	const resumo = {
		gruposTotal: groups.length,
		gruposAtivos: groups.filter((g) => g.ativo).length,
		gruposInativos: groups.filter((g) => !g.ativo).length,
		familiasMesmoNome: familiasMesmoNome.length,
		gruposSuspeitos: gruposSuspeitos.length,
		produtosComQuatroOuMaisGrupos: produtosComMuitosGrupos.length,
	};

	const payload = {
		organizacaoId,
		geradoEm: new Date().toISOString(),
		resumo,
		instrucoes: [
			"familiasMesmoNome: candidatos a unificar manualmente ou ampliar dedupe-product-add-ons.",
			"gruposSuspeitos: nomes genéricos ou grupos vazios ainda vinculados.",
			"Use dedupe:product-add-ons para duplicatas exatas de conteúdo.",
		],
		familiasMesmoNome,
		gruposSuspeitos,
		produtosComMuitosGrupos,
		grupos: gruposDetalhados,
	};

	if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
	writeFileSync(outFile, JSON.stringify(payload, null, 2), { encoding: "utf-8" });

	console.log(`[add-ons] inventário gravado em ${outFile}`);
	console.log(`[add-ons] resumo: ${JSON.stringify(resumo)}`);
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await connection.end();
	});
