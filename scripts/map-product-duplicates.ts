/**
 * Mapeia possíveis produtos duplicados de UMA organização e grava um JSON local para revisão.
 *
 * NÃO ESCREVE NADA NO BANCO — só SELECT. A mesclagem fica para um passo posterior, depois da
 * revisão humana no JSON (`decisao` em cada cluster).
 *
 * Origem típica das duplicatas:
 *   1. Cardápio Web — ingestão de pedidos criava um produto por `item_id`/`external_code`.
 *   2. iFood nativo — import/ingest cria outro cadastro quando o `codigo` não bate, e o
 *      vínculo vive em `catalog_links` (não em `products.id_externo`).
 *
 * Matching:
 *   - nome normalizado idêntico, ou mesmos tokens (ignorando stopwords/tamanho) → EXATA
 *   - código idêntico (não trivial) → EXATA
 *   - Jaccard de tokens ≥ 0.75 → ALTA; ≥ 0.6 (mín. 2 tokens) → MEDIA (par isolado, sem union)
 *   - volumes/porções diferentes ("300ml" vs "500ml", "1 sabor" vs "2 sabores") → `possiveisVariantes`
 *   - produto genérico ("Açaí") não une SKUs de tamanhos distintos via transitividade
 *   - "(Granel)" vs SKU de venda não entra em JUNTAR automático
 *   - dois produtos JÁ vinculados a itens iFood distintos → cluster pulado (mesclar
 *     quebraria o mapping em `catalog_links`)
 *
 * Uso:
 *   npx tsx ./scripts/map-product-duplicates.ts --org=<id>
 *   npx tsx ./scripts/map-product-duplicates.ts --org=<id> --sobrescrever
 */
import "@/utils/scripts/load-next-env";

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { connection, db } from "@/services/drizzle";
import {
	catalogLinks,
	integrations,
	organizations,
	productAddOnOptions,
	productAddOnReferences,
	productChannelSettings,
	productFiscalProfiles,
	productionRecipeInputs,
	productionRecipeOutputs,
	products,
	productVariants,
	saleItems,
	sales,
} from "@/services/drizzle/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

const ORGANIZACAO_ID_PADRAO = "27817d9a-cb04-4704-a1f4-15b81a3610d3";

const JACCARD_ALTA = 0.75;
const JACCARD_MEDIA = 0.6;
const STOPWORDS = new Set(["de", "da", "do", "das", "dos", "com", "sem", "e", "em", "a", "o", "os", "as", "um", "uma", "no", "na", "ao", "para", "ate", "até"]);
const RUIDO = new Set(["copia", "cópia", "promocao", "promoção", "promo"]);
const PORTE_WORDS = new Set(["pequeno", "medio", "grande", "pp", "gg"]);

type TConfianca = "EXATA" | "ALTA" | "MEDIA";
type TOrigemSinal = "IFOOD_CATALOG_LINK" | "IFOOD_IMPORT" | "IFOOD_VENDAS" | "CARDAPIO_WEB" | "CARDAPIO_WEB_VENDAS" | "MANUAL";

type TCatalogLinkResumo = {
	id: string;
	merchantId: string;
	tipo: string;
	status: string;
	externoProdutoId: string | null;
	externoItemId: string | null;
	externoCategoriaId: string | null;
};

type TProdutoCard = {
	id: string;
	nome: string;
	nomeNormalizado: string;
	codigo: string;
	grupo: string;
	tipo: string;
	unidade: string;
	ativo: boolean | null;
	vendavel: boolean;
	precoVenda: number | null;
	precoCusto: number | null;
	ncm: string;
	quantidade: number | null;
	imagemCapaUrl: string | null;
	fichaTecnicaReceitaId: string | null;
	origens: TOrigemSinal[];
	variantes: { id: string; nome: string; codigo: string | null; precoVenda: number }[];
	catalogLinksIfood: TCatalogLinkResumo[];
	uso: {
		itensVenda: number;
		valorVendido: number;
		ultimaVenda: string | null;
		vendasPorIntegracao: Record<string, number>;
		variantes: number;
		addOnReferencias: number;
		addOnOpcoesEstoque: number;
		canais: number;
		perfisFiscais: number;
		receitaEntradas: number;
		receitaSaidas: number;
	};
};

type TParMotivo = {
	a: string;
	b: string;
	confianca: TConfianca;
	motivos: string[];
	jaccard: number;
};

type TCluster = {
	id: string;
	confianca: TConfianca;
	motivos: string[];
	/** Preencher na revisão: JUNTAR | IGNORAR | VARIANTES */
	decisao: "JUNTAR" | "IGNORAR" | "VARIANTES" | null;
	acaoSugerida: "JUNTAR" | "REVISAR" | "PULAR";
	motivoSugestao: string;
	manterId: string;
	absorverIds: string[];
	pulado: boolean;
	motivoPulo: string | null;
	pares: TParMotivo[];
	membros: TProdutoCard[];
};

type TAtributosNome = {
	volumes: string[];
	porcoes: string[];
	portes: string[];
	tokens: string[];
	granel: boolean;
};

type TPossivelVariante = {
	confianca: TConfianca;
	motivos: string[];
	jaccard: number;
	atributos: { a: TAtributosNome; b: TAtributosNome };
	a: TProdutoCard;
	b: TProdutoCard;
};

function getArgValue(name: string) {
	const prefix = `--${name}=`;
	const indexed = process.argv.find((arg) => arg.startsWith(prefix));
	if (indexed) return indexed.slice(prefix.length);
	const flag = process.argv.indexOf(`--${name}`);
	if (flag === -1) return null;
	return process.argv[flag + 1] ?? null;
}

function normalizarNome(valor: string) {
	return valor
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function matchAll(source: string, regex: RegExp) {
	return [...source.matchAll(regex)];
}

function extrairAtributos(nomeNormalizado: string): TAtributosNome {
	const volumeRe = /\b(\d+(?:[.,]\d+)?)\s*(ml|l|g|kg)\b/gi;
	const porcaoRe = /\b(\d+)\s*(sabores?|gelatos?|fatias?|bolas?|unidades?)\b/gi;
	const volumes = [...new Set(matchAll(nomeNormalizado, volumeRe).map((match) => `${(match[1] ?? "").replace(",", ".")}${(match[2] ?? "").toLowerCase()}`))].sort();
	const porcoes = [...new Set(matchAll(nomeNormalizado, porcaoRe).map((match) => `${match[1]}${(match[2] ?? "").toLowerCase().replace(/s$/, "")}`))].sort();
	const portes = [...new Set(nomeNormalizado.split(" ").filter((token) => PORTE_WORDS.has(token)))].sort();
	const granel = nomeNormalizado.split(" ").includes("granel");

	const semAtributos = nomeNormalizado
		.replace(/\b(\d+(?:[.,]\d+)?)\s*(ml|l|g|kg)\b/gi, " ")
		.replace(/\b(\d+)\s*(sabores?|gelatos?|fatias?|bolas?|unidades?)\b/gi, " ")
		.split(" ")
		.filter((token) => token && !STOPWORDS.has(token) && !RUIDO.has(token) && !PORTE_WORDS.has(token) && token !== "granel" && token.length > 1)
		.toSorted();

	return { volumes, porcoes, portes, tokens: semAtributos, granel };
}

function conjuntosIguais(a: string[], b: string[]) {
	if (a.length !== b.length) return false;
	return a.every((item, index) => item === b[index]);
}

function atributosConflitam(a: string[], b: string[]) {
	if (a.length === 0 || b.length === 0) return false;
	return !conjuntosIguais(a, b);
}

function atributosAssimetricos(a: string[], b: string[]) {
	return a.length !== b.length;
}

function jaccardTokens(a: string[], b: string[]) {
	const setA = new Set(a);
	const setB = new Set(b);
	if (setA.size === 0 || setB.size === 0) return 0;
	let intersection = 0;
	for (const token of setA) if (setB.has(token)) intersection += 1;
	return intersection / (setA.size + setB.size - intersection);
}

function codigoTrivial(codigo: string) {
	const trimmed = codigo.trim().toLowerCase();
	return !trimmed || trimmed === "n/a" || trimmed === "na" || trimmed === "produto-ifood";
}

function codigoPareceIfood(codigo: string) {
	return codigo.toUpperCase().startsWith("IFOOD-") || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(codigo.trim());
}

function inferirOrigens(produto: {
	codigo: string;
	grupo: string;
	tipo: string;
	imagemCapaUrl: string | null;
	temLinkIfood: boolean;
	vendasPorIntegracao: Record<string, number>;
}): TOrigemSinal[] {
	const origens = new Set<TOrigemSinal>();
	if (produto.temLinkIfood) origens.add("IFOOD_CATALOG_LINK");
	if (produto.grupo.toLowerCase() === "ifood" || codigoPareceIfood(produto.codigo)) origens.add("IFOOD_IMPORT");
	if (
		produto.grupo === "PRODUTOS" ||
		produto.grupo === "COMBOS" ||
		produto.tipo === "regular_item" ||
		produto.tipo === "combo" ||
		(produto.imagemCapaUrl ?? "").includes("cardapio-web")
	) {
		origens.add("CARDAPIO_WEB");
	}
	if ((produto.vendasPorIntegracao["IFOOD"] ?? 0) > 0) origens.add("IFOOD_VENDAS");
	if ((produto.vendasPorIntegracao["CARDAPIO-WEB"] ?? 0) > 0) origens.add("CARDAPIO_WEB_VENDAS");
	if (origens.size === 0) origens.add("MANUAL");
	return [...origens];
}

function cruzaIfoodECardapio(a: TProdutoCard, b: TProdutoCard) {
	const origensA = new Set(a.origens);
	const origensB = new Set(b.origens);
	const aIfood = origensA.has("IFOOD_CATALOG_LINK") || origensA.has("IFOOD_IMPORT") || origensA.has("IFOOD_VENDAS");
	const bIfood = origensB.has("IFOOD_CATALOG_LINK") || origensB.has("IFOOD_IMPORT") || origensB.has("IFOOD_VENDAS");
	const aCardapio = origensA.has("CARDAPIO_WEB") || origensA.has("CARDAPIO_WEB_VENDAS");
	const bCardapio = origensB.has("CARDAPIO_WEB") || origensB.has("CARDAPIO_WEB_VENDAS");
	return (aIfood && bCardapio) || (bIfood && aCardapio);
}

function compararProdutos(
	a: TProdutoCard,
	b: TProdutoCard,
	attrA: TAtributosNome,
	attrB: TAtributosNome,
): { confianca: TConfianca; motivos: string[]; jaccard: number } | null {
	const motivos: string[] = [];
	let confianca: TConfianca | null = null;
	const score = jaccardTokens(attrA.tokens, attrB.tokens);
	const tokensIdenticos = attrA.tokens.length > 0 && conjuntosIguais([...attrA.tokens].sort(), [...attrB.tokens].sort());

	if (a.nomeNormalizado && a.nomeNormalizado === b.nomeNormalizado) {
		confianca = "EXATA";
		motivos.push("nome idêntico");
	} else if (tokensIdenticos) {
		confianca = "EXATA";
		motivos.push("mesmo nome (ignorando tamanho/stopwords)");
	}

	const codigoA = a.codigo.trim().toLowerCase();
	const codigoB = b.codigo.trim().toLowerCase();
	if (!codigoTrivial(a.codigo) && !codigoTrivial(b.codigo) && codigoA === codigoB) {
		confianca = "EXATA";
		motivos.push(`código idêntico (${a.codigo})`);
	}

	if (!confianca) {
		if (score >= JACCARD_ALTA) {
			confianca = "ALTA";
			motivos.push(`nome parecido (${Math.round(score * 100)}%)`);
		} else if (score >= JACCARD_MEDIA && attrA.tokens.length >= 2 && attrB.tokens.length >= 2) {
			confianca = "MEDIA";
			motivos.push(`nome parecido (${Math.round(score * 100)}%)`);
		}
	}

	if (!confianca) return null;

	if (cruzaIfoodECardapio(a, b)) {
		motivos.push("cruzamento iFood × Cardápio Web");
	}

	if (attrA.portes.length !== attrB.portes.length || attrA.porcoes.length !== attrB.porcoes.length || attrA.volumes.length !== attrB.volumes.length) {
		motivos.push("um dos nomes traz tamanho/porção que o outro não tem");
		if (confianca === "EXATA") confianca = "ALTA";
	}

	if (attrA.granel !== attrB.granel) {
		motivos.push("um é granel (receita) e o outro não");
		if (confianca === "EXATA") confianca = "ALTA";
	}

	return { confianca, motivos, jaccard: score };
}

const ORDEM_CONFIANCA: Record<TConfianca, number> = { EXATA: 0, ALTA: 1, MEDIA: 2 };

function melhorConfianca(valores: TConfianca[]): TConfianca {
	return valores.toSorted((a, b) => ORDEM_CONFIANCA[a] - ORDEM_CONFIANCA[b])[0] ?? "MEDIA";
}

function pontuarKeeper(produto: TProdutoCard) {
	let pontos = 0;
	if (produto.origens.includes("IFOOD_CATALOG_LINK")) pontos += 1000;
	pontos += Math.min(produto.uso.itensVenda, 500);
	if (produto.ativo) pontos += 50;
	if (produto.vendavel) pontos += 20;
	if (produto.precoVenda && produto.precoVenda > 0) pontos += 15;
	if (produto.imagemCapaUrl) pontos += 10;
	if (produto.ncm && produto.ncm !== "N/A" && produto.ncm !== "") pontos += 10;
	if (produto.fichaTecnicaReceitaId) pontos += 25;
	pontos += produto.uso.variantes * 5;
	pontos += produto.uso.perfisFiscais * 8;
	pontos += produto.uso.addOnReferencias * 4;
	if (produto.origens.includes("CARDAPIO_WEB") || produto.origens.includes("CARDAPIO_WEB_VENDAS")) pontos += 5;
	return pontos;
}

function sugerirAcao(cluster: {
	confianca: TConfianca;
	pulado: boolean;
	membros: TProdutoCard[];
}): { acaoSugerida: TCluster["acaoSugerida"]; motivoSugestao: string } {
	if (cluster.pulado) {
		return { acaoSugerida: "PULAR", motivoSugestao: "Dois ou mais membros já têm vínculo iFood distinto — mesclar quebraria catalog_links." };
	}
	if (cluster.membros.some((membro) => /granel/i.test(membro.nome)) && cluster.membros.some((membro) => !/granel/i.test(membro.nome))) {
		return { acaoSugerida: "REVISAR", motivoSugestao: "Há um item granel (receita) misturado com SKU de venda — em geral NÃO juntar." };
	}
	if (cluster.confianca === "EXATA") {
		return { acaoSugerida: "JUNTAR", motivoSugestao: "Nome ou código idênticos. Confirme o sobrevivente (o script prefere o que já tem vínculo iFood)." };
	}
	const origens = new Set(cluster.membros.flatMap((membro) => membro.origens));
	const cruzaIntegracoes =
		(origens.has("IFOOD_CATALOG_LINK") || origens.has("IFOOD_IMPORT") || origens.has("IFOOD_VENDAS")) &&
		(origens.has("CARDAPIO_WEB") || origens.has("CARDAPIO_WEB_VENDAS"));
	if (cluster.confianca === "ALTA" && cruzaIntegracoes) {
		return { acaoSugerida: "JUNTAR", motivoSugestao: "Nome muito parecido e origens cruzadas (iFood × Cardápio Web) — o caso canônico de duplicata." };
	}
	return { acaoSugerida: "REVISAR", motivoSugestao: "Similaridade parcial: pode ser o mesmo item com nome diferente, ou SKUs próximos." };
}

class UnionFind {
	private readonly parent = new Map<string, string>();

	constructor(ids: string[]) {
		for (const id of ids) this.parent.set(id, id);
	}

	find(id: string): string {
		const parent = this.parent.get(id) ?? id;
		if (parent === id) return id;
		const root = this.find(parent);
		this.parent.set(id, root);
		return root;
	}

	union(a: string, b: string) {
		const rootA = this.find(a);
		const rootB = this.find(b);
		if (rootA === rootB) return;
		this.parent.set(rootB, rootA);
	}
}

async function carregarUso(organizacaoId: string, produtoIds: string[]) {
	const vazio = {
		itensVenda: 0,
		valorVendido: 0,
		ultimaVenda: null as string | null,
		vendasPorIntegracao: {} as Record<string, number>,
		variantes: 0,
		addOnReferencias: 0,
		addOnOpcoesEstoque: 0,
		canais: 0,
		perfisFiscais: 0,
		receitaEntradas: 0,
		receitaSaidas: 0,
	};

	const uso = new Map<string, typeof vazio>();
	for (const id of produtoIds) uso.set(id, { ...vazio, vendasPorIntegracao: {} });

	const bump = (id: string | null | undefined, campo: keyof Omit<typeof vazio, "ultimaVenda" | "vendasPorIntegracao">, valor: number) => {
		if (!id) return;
		const atual = uso.get(id);
		if (!atual) return;
		atual[campo] += valor;
	};

	const [vendaRows, varianteRows, addOnRefRows, addOnEstoqueRows, canalRows, fiscalRows, receitaInRows, receitaOutRows] = await Promise.all([
		db
			.select({
				produtoId: saleItems.produtoId,
				itens: sql<number>`count(*)::int`,
				valor: sql<number>`coalesce(sum(${saleItems.valorVendaTotalLiquido}), 0)`,
				ultimaVenda: sql<Date | null>`max(${sales.dataVenda})`,
				integracaoTipo: integrations.tipo,
			})
			.from(saleItems)
			.innerJoin(sales, eq(sales.id, saleItems.vendaId))
			.leftJoin(integrations, eq(integrations.id, sales.integracaoId))
			.where(and(eq(saleItems.organizacaoId, organizacaoId), inArray(saleItems.produtoId, produtoIds)))
			.groupBy(saleItems.produtoId, integrations.tipo),
		db
			.select({ produtoId: productVariants.produtoId, total: sql<number>`count(*)::int` })
			.from(productVariants)
			.where(and(eq(productVariants.organizacaoId, organizacaoId), inArray(productVariants.produtoId, produtoIds)))
			.groupBy(productVariants.produtoId),
		db
			.select({ produtoId: productAddOnReferences.produtoId, total: sql<number>`count(*)::int` })
			.from(productAddOnReferences)
			.where(inArray(productAddOnReferences.produtoId, produtoIds))
			.groupBy(productAddOnReferences.produtoId),
		db
			.select({ produtoId: productAddOnOptions.produtoId, total: sql<number>`count(*)::int` })
			.from(productAddOnOptions)
			.where(and(eq(productAddOnOptions.organizacaoId, organizacaoId), inArray(productAddOnOptions.produtoId, produtoIds)))
			.groupBy(productAddOnOptions.produtoId),
		db
			.select({ produtoId: productChannelSettings.produtoId, total: sql<number>`count(*)::int` })
			.from(productChannelSettings)
			.where(and(eq(productChannelSettings.organizacaoId, organizacaoId), inArray(productChannelSettings.produtoId, produtoIds)))
			.groupBy(productChannelSettings.produtoId),
		db
			.select({ produtoId: productFiscalProfiles.produtoId, total: sql<number>`count(*)::int` })
			.from(productFiscalProfiles)
			.where(and(eq(productFiscalProfiles.organizacaoId, organizacaoId), inArray(productFiscalProfiles.produtoId, produtoIds)))
			.groupBy(productFiscalProfiles.produtoId),
		db
			.select({ produtoId: productionRecipeInputs.produtoId, total: sql<number>`count(*)::int` })
			.from(productionRecipeInputs)
			.where(and(eq(productionRecipeInputs.organizacaoId, organizacaoId), inArray(productionRecipeInputs.produtoId, produtoIds)))
			.groupBy(productionRecipeInputs.produtoId),
		db
			.select({ produtoId: productionRecipeOutputs.produtoId, total: sql<number>`count(*)::int` })
			.from(productionRecipeOutputs)
			.where(and(eq(productionRecipeOutputs.organizacaoId, organizacaoId), inArray(productionRecipeOutputs.produtoId, produtoIds)))
			.groupBy(productionRecipeOutputs.produtoId),
	]);

	for (const row of vendaRows) {
		const atual = uso.get(row.produtoId);
		if (!atual) continue;
		atual.itensVenda += Number(row.itens);
		atual.valorVendido += Number(row.valor);
		const iso = row.ultimaVenda ? new Date(row.ultimaVenda).toISOString() : null;
		if (iso && (!atual.ultimaVenda || iso > atual.ultimaVenda)) atual.ultimaVenda = iso;
		const tipo = row.integracaoTipo ?? "INTERNO";
		atual.vendasPorIntegracao[tipo] = (atual.vendasPorIntegracao[tipo] ?? 0) + Number(row.itens);
	}
	for (const row of varianteRows) bump(row.produtoId, "variantes", Number(row.total));
	for (const row of addOnRefRows) bump(row.produtoId, "addOnReferencias", Number(row.total));
	for (const row of addOnEstoqueRows) bump(row.produtoId, "addOnOpcoesEstoque", Number(row.total));
	for (const row of canalRows) bump(row.produtoId, "canais", Number(row.total));
	for (const row of fiscalRows) bump(row.produtoId, "perfisFiscais", Number(row.total));
	for (const row of receitaInRows) bump(row.produtoId, "receitaEntradas", Number(row.total));
	for (const row of receitaOutRows) bump(row.produtoId, "receitaSaidas", Number(row.total));

	return uso;
}

async function main() {
	const organizacaoId = getArgValue("org") ?? getArgValue("orgId") ?? ORGANIZACAO_ID_PADRAO;
	const diretorio = resolve(getArgValue("out") ?? `./.local-analysis/product-duplicates/${organizacaoId}`);
	const arquivo = resolve(diretorio, "duplicatas.json");
	const sobrescrever = process.argv.includes("--sobrescrever");

	if (existsSync(arquivo) && !sobrescrever) {
		throw new Error(`Já existe um mapeamento em ${arquivo}. Ele pode conter revisão manual — use "--sobrescrever" para regenerar do zero.`);
	}

	console.log(`[duplicatas] organização ${organizacaoId}`);

	const [org] = await db
		.select({ id: organizations.id, nome: organizations.nome })
		.from(organizations)
		.where(eq(organizations.id, organizacaoId))
		.limit(1);
	if (!org) throw new Error(`Organização ${organizacaoId} não encontrada.`);

	const [produtoRows, varianteRows, linkRows] = await Promise.all([
		db
			.select({
				id: products.id,
				nome: products.nome,
				codigo: products.codigo,
				grupo: products.grupo,
				tipo: products.tipo,
				unidade: products.unidade,
				ativo: products.ativo,
				vendavel: products.vendavel,
				precoVenda: products.precoVenda,
				precoCusto: products.precoCusto,
				ncm: products.ncm,
				quantidade: products.quantidade,
				imagemCapaUrl: products.imagemCapaUrl,
				fichaTecnicaReceitaId: products.fichaTecnicaReceitaId,
			})
			.from(products)
			.where(eq(products.organizacaoId, organizacaoId)),
		db
			.select({
				id: productVariants.id,
				produtoId: productVariants.produtoId,
				nome: productVariants.nome,
				codigo: productVariants.codigo,
				precoVenda: productVariants.precoVenda,
			})
			.from(productVariants)
			.where(eq(productVariants.organizacaoId, organizacaoId)),
		db
			.select({
				id: catalogLinks.id,
				produtoId: catalogLinks.produtoId,
				produtoVarianteId: catalogLinks.produtoVarianteId,
				merchantId: catalogLinks.merchantId,
				tipo: catalogLinks.tipo,
				status: catalogLinks.status,
				externoProdutoId: catalogLinks.externoProdutoId,
				externoItemId: catalogLinks.externoItemId,
				externoCategoriaId: catalogLinks.externoCategoriaId,
			})
			.from(catalogLinks)
			.where(and(eq(catalogLinks.organizacaoId, organizacaoId), eq(catalogLinks.provider, "IFOOD"))),
	]);

	console.log(`[duplicatas] produtos: ${produtoRows.length} | variantes: ${varianteRows.length} | vínculos iFood: ${linkRows.length}`);

	const produtoIds = produtoRows.map((row) => row.id);
	const uso = produtoIds.length > 0 ? await carregarUso(organizacaoId, produtoIds) : new Map();

	const variantesPorProduto = new Map<string, TProdutoCard["variantes"]>();
	for (const variante of varianteRows) {
		const lista = variantesPorProduto.get(variante.produtoId) ?? [];
		lista.push({ id: variante.id, nome: variante.nome, codigo: variante.codigo, precoVenda: variante.precoVenda });
		variantesPorProduto.set(variante.produtoId, lista);
	}

	const linksPorProduto = new Map<string, TCatalogLinkResumo[]>();
	const varianteParaProduto = new Map(varianteRows.map((variante) => [variante.id, variante.produtoId]));
	for (const link of linkRows) {
		const produtoId = link.produtoId ?? (link.produtoVarianteId ? varianteParaProduto.get(link.produtoVarianteId) : null);
		if (!produtoId) continue;
		const lista = linksPorProduto.get(produtoId) ?? [];
		lista.push({
			id: link.id,
			merchantId: link.merchantId,
			tipo: link.tipo,
			status: link.status,
			externoProdutoId: link.externoProdutoId,
			externoItemId: link.externoItemId,
			externoCategoriaId: link.externoCategoriaId,
		});
		linksPorProduto.set(produtoId, lista);
	}

	const cards: TProdutoCard[] = produtoRows.map((row) => {
		const usoProduto = uso.get(row.id) ?? {
			itensVenda: 0,
			valorVendido: 0,
			ultimaVenda: null,
			vendasPorIntegracao: {},
			variantes: 0,
			addOnReferencias: 0,
			addOnOpcoesEstoque: 0,
			canais: 0,
			perfisFiscais: 0,
			receitaEntradas: 0,
			receitaSaidas: 0,
		};
		const links = linksPorProduto.get(row.id) ?? [];
		return {
			...row,
			nomeNormalizado: normalizarNome(row.nome),
			origens: inferirOrigens({
				codigo: row.codigo,
				grupo: row.grupo,
				tipo: row.tipo,
				imagemCapaUrl: row.imagemCapaUrl,
				temLinkIfood: links.length > 0,
				vendasPorIntegracao: usoProduto.vendasPorIntegracao,
			}),
			variantes: variantesPorProduto.get(row.id) ?? [],
			catalogLinksIfood: links,
			uso: usoProduto,
		};
	});

	const cardsPorId = new Map(cards.map((card) => [card.id, card]));
	const atributosPorId = new Map(cards.map((card) => [card.id, extrairAtributos(card.nomeNormalizado)]));
	const union = new UnionFind(cards.map((card) => card.id));
	const pares: TParMotivo[] = [];
	const paresMedia: TParMotivo[] = [];
	const possiveisVariantes: TPossivelVariante[] = [];

	for (let i = 0; i < cards.length; i++) {
		for (let j = i + 1; j < cards.length; j++) {
			const a = cards[i];
			const b = cards[j];
			const attrA = atributosPorId.get(a.id)!;
			const attrB = atributosPorId.get(b.id)!;
			const match = compararProdutos(a, b, attrA, attrB);
			if (!match) continue;

			if (atributosConflitam(attrA.volumes, attrB.volumes) || atributosConflitam(attrA.porcoes, attrB.porcoes) || atributosConflitam(attrA.portes, attrB.portes)) {
				const conflitos = [
					atributosConflitam(attrA.volumes, attrB.volumes) ? `volume ${attrA.volumes.join("/") || "—"} vs ${attrB.volumes.join("/") || "—"}` : null,
					atributosConflitam(attrA.porcoes, attrB.porcoes) ? `porção ${attrA.porcoes.join("/") || "—"} vs ${attrB.porcoes.join("/") || "—"}` : null,
					atributosConflitam(attrA.portes, attrB.portes) ? `porte ${attrA.portes.join("/") || "—"} vs ${attrB.portes.join("/") || "—"}` : null,
				].filter((item): item is string => !!item);
				possiveisVariantes.push({
					...match,
					motivos: [...match.motivos, ...conflitos],
					atributos: { a: attrA, b: attrB },
					a,
					b,
				});
				continue;
			}

			const par: TParMotivo = { a: a.id, b: b.id, ...match };
			const volumeOuPorcaoAssimetricos = atributosAssimetricos(attrA.volumes, attrB.volumes) || atributosAssimetricos(attrA.porcoes, attrB.porcoes);

			// Produto genérico ("Açaí") não pode unir 300ml com 500ml via transitividade.
			// Pares assimétricos ficam como cluster de 2 para revisão.
			if (match.confianca === "MEDIA" || volumeOuPorcaoAssimetricos || attrA.granel !== attrB.granel) {
				paresMedia.push(par);
				continue;
			}

			pares.push(par);
			union.union(a.id, b.id);
		}
	}

	function montarCluster(ids: string[], paresDoCluster: TParMotivo[]): Omit<TCluster, "id"> {
		const membros = ids.map((id) => cardsPorId.get(id)!).toSorted((a, b) => pontuarKeeper(b) - pontuarKeeper(a) || a.nome.localeCompare(b.nome, "pt-BR"));
		const linksIfoodDistintos = new Set(
			membros.flatMap((membro) => membro.catalogLinksIfood.filter((link) => link.status !== "DESVINCULADO").map((link) => link.externoItemId ?? link.id)),
		);
		const pulado = linksIfoodDistintos.size > 1;
		const confianca = melhorConfianca(paresDoCluster.map((par) => par.confianca));
		const motivos = [...new Set(paresDoCluster.flatMap((par) => par.motivos))];
		const { acaoSugerida, motivoSugestao } = sugerirAcao({ confianca, pulado, membros });
		return {
			confianca,
			motivos,
			decisao: pulado ? "IGNORAR" : null,
			acaoSugerida,
			motivoSugestao,
			manterId: membros[0].id,
			absorverIds: membros.slice(1).map((membro) => membro.id),
			pulado,
			motivoPulo: pulado ? `${linksIfoodDistintos.size} vínculos iFood distintos entre os membros` : null,
			pares: paresDoCluster,
			membros,
		};
	}

	const grupos = new Map<string, string[]>();
	for (const card of cards) {
		const root = union.find(card.id);
		const lista = grupos.get(root) ?? [];
		lista.push(card.id);
		grupos.set(root, lista);
	}

	const clustersAltaExata = [...grupos.values()]
		.filter((ids) => ids.length > 1)
		.map((ids) => montarCluster(ids, pares.filter((par) => ids.includes(par.a) && ids.includes(par.b))));

	const idsJaAgrupados = new Set(clustersAltaExata.flatMap((cluster) => cluster.membros.map((membro) => membro.id)));
	const clustersMedia = paresMedia
		.filter((par) => !idsJaAgrupados.has(par.a) && !idsJaAgrupados.has(par.b))
		.map((par) => montarCluster([par.a, par.b], [par]));

	const clusters: TCluster[] = [...clustersAltaExata, ...clustersMedia]
		.toSorted((a, b) => ORDEM_CONFIANCA[a.confianca] - ORDEM_CONFIANCA[b.confianca] || b.membros.length - a.membros.length)
		.map((cluster, index) => ({ ...cluster, id: `cluster-${String(index + 1).padStart(3, "0")}` }));

	const idsEmCluster = new Set(clusters.flatMap((cluster) => cluster.membros.map((membro) => membro.id)));
	const porOrigem = cards.reduce<Record<string, number>>((acc, card) => {
		for (const origem of card.origens) acc[origem] = (acc[origem] ?? 0) + 1;
		return acc;
	}, {});

	const resultado = {
		organizacaoId,
		organizacaoNome: org.nome,
		geradoEm: new Date().toISOString(),
		instrucoes: [
			"Revise cada cluster: preencha `decisao` com JUNTAR, IGNORAR ou VARIANTES.",
			"Se JUNTAR, ajuste `manterId` (sobrevivente) e `absorverIds` (os que serão reapontados depois).",
			"O sobrevivente sugerido privilegia quem já tem `catalog_links` iFood, depois o de mais vendas.",
			"Clusters com `pulado: true` têm dois vínculos iFood distintos — não junte sem decidir o mapping.",
			"`possiveisVariantes` são nomes parecidos com tamanho/volume diferente (300ml vs 500ml) — em geral NÃO são o mesmo produto.",
			"Nada é gravado no banco por este script.",
		],
		resumo: {
			produtos: cards.length,
			variantes: varianteRows.length,
			vinculosIfood: linkRows.length,
			produtosComVinculoIfood: cards.filter((card) => card.catalogLinksIfood.length > 0).length,
			clusters: clusters.length,
			clustersExatos: clusters.filter((cluster) => cluster.confianca === "EXATA").length,
			clustersAlta: clusters.filter((cluster) => cluster.confianca === "ALTA").length,
			clustersMedia: clusters.filter((cluster) => cluster.confianca === "MEDIA").length,
			clustersPulados: clusters.filter((cluster) => cluster.pulado).length,
			clustersSugeridosJuntar: clusters.filter((cluster) => cluster.acaoSugerida === "JUNTAR").length,
			clustersParaRevisar: clusters.filter((cluster) => cluster.acaoSugerida === "REVISAR").length,
			produtosEmClusters: idsEmCluster.size,
			possiveisVariantes: possiveisVariantes.length,
			porOrigem,
		},
		indice: clusters.map((cluster) => ({
			id: cluster.id,
			confianca: cluster.confianca,
			acaoSugerida: cluster.acaoSugerida,
			decisao: cluster.decisao,
			manterId: cluster.manterId,
			nomes: cluster.membros.map((membro) => membro.nome),
			origens: cluster.membros.map((membro) => membro.origens),
		})),
		clusters,
		possiveisVariantes: possiveisVariantes
			.toSorted((a, b) => ORDEM_CONFIANCA[a.confianca] - ORDEM_CONFIANCA[b.confianca] || b.jaccard - a.jaccard)
			.map((item, index) => ({
				id: `variante-${String(index + 1).padStart(3, "0")}`,
				confianca: item.confianca,
				motivos: item.motivos,
				jaccard: Number(item.jaccard.toFixed(3)),
				atributos: item.atributos,
				a: item.a,
				b: item.b,
			})),
		vinculosIfood: linkRows.map((link) => ({
			...link,
			produtoNome: (link.produtoId && cardsPorId.get(link.produtoId)?.nome) || null,
			emCluster: link.produtoId ? (idsEmCluster.has(link.produtoId) ? true : false) : false,
		})),
	};

	mkdirSync(dirname(arquivo), { recursive: true });
	writeFileSync(arquivo, JSON.stringify(resultado, null, 2), { encoding: "utf-8" });

	console.log("");
	console.log(`[duplicatas] org .................... ${org.nome}`);
	console.log(`[duplicatas] produtos ............... ${cards.length}`);
	console.log(`[duplicatas] vínculos iFood ......... ${linkRows.length}`);
	console.log(`[duplicatas] clusters ............... ${clusters.length}`);
	console.log(`[duplicatas]   EXATA ................ ${resultado.resumo.clustersExatos}`);
	console.log(`[duplicatas]   ALTA ................. ${resultado.resumo.clustersAlta}`);
	console.log(`[duplicatas]   MEDIA ................ ${resultado.resumo.clustersMedia}`);
	console.log(`[duplicatas]   pulados (2+ iFood) ... ${resultado.resumo.clustersPulados}`);
	console.log(`[duplicatas] produtos em clusters ... ${idsEmCluster.size}`);
	console.log(`[duplicatas] possíveis variantes .... ${possiveisVariantes.length}`);
	console.log("");
	for (const cluster of clusters.slice(0, 25)) {
		const nomes = cluster.membros.map((membro) => `${membro.nome} [${membro.origens.join("+")}]`).join("  ||  ");
		console.log(`  ${cluster.id} ${cluster.confianca.padEnd(5)} ${cluster.acaoSugerida.padEnd(7)} ${cluster.membros.length}x  ${nomes}`);
	}
	if (clusters.length > 25) console.log(`  ... +${clusters.length - 25} clusters`);
	console.log("");
	console.log(`[duplicatas] gravado em: ${arquivo}`);
}

main()
	.catch((error) => {
		console.error("[duplicatas] falha no mapeamento:", error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await connection.end();
	});
