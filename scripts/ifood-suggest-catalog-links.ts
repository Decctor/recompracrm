/**
 * Gera um JSON com SUGESTÕES de vínculo entre os itens do cardápio iFood e os produtos do cadastro,
 * para revisão manual antes de criar os `catalogLinks`.
 *
 * NÃO ESCREVE NADA — nem no banco, nem no iFood. Só lê o catálogo (GET) e o cadastro (SELECT).
 *
 * Uso:
 *   npx tsx scripts/ifood-suggest-catalog-links.ts --org=<organizationId> [--merchant=<id>] [--out=<arquivo>]
 *
 * Diferente de `suggestCatalogLinks` (lib/integrations/ifood/sync/matching.ts), que devolve só o
 * melhor candidato acima de um limiar, aqui cada item traz as alternativas ranqueadas e o contexto
 * necessário para decidir entre elas:
 *
 * - Canais internos (PDV, Comanda, Loja): em que canal cada candidato está habilitado. É o sinal de
 *   qual cadastro é o "de verdade" quando dois empatam — mas NÃO é prova de duplicata: produto
 *   exclusivo do iFood fica fora do PDV/Loja de propósito.
 * - Duplicatas do lado do iFood: o mesmo item repetido em outra categoria (vitrine "Mais Pedidos")
 *   é um item distinto no iFood, mas o vínculo admite um único item por produto na loja. A cópia
 *   não é vinculada; se ela não tiver código externo, a ingestão de pedidos cai no fallback por
 *   `item.id` e cria produto novo — daí a recomendação de preencher o código no Portal.
 * - Duplicatas do lado do cadastro: produtos que a própria ingestão criou (grupo "iFood", código =
 *   UUID) perdem para o cadastro original e são listados à parte para mesclar/inativar.
 */
import "@/utils/scripts/load-next-env";

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { TIfoodItemDTO } from "@/lib/integrations/ifood/catalog-types";
import { getIfoodCatalogs, listIfoodCategories } from "@/lib/integrations/ifood/catalog";
import { resolveIfoodManagementContext } from "@/lib/integrations/ifood/context";
import { listCatalogLinks } from "@/lib/integrations/ifood/sync/links";
import { resolveChannelAvailability, type TChannel } from "@/lib/products/sales-channels";
import { loadChannelState } from "@/lib/products/sales-channels-store";
import { connection, db } from "@/services/drizzle";
import { organizations, products } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";

function getArgValue(name: string) {
	const prefix = `--${name}=`;
	const arg = process.argv.find((value) => value.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : null;
}

const INTERNAL_CHANNELS = ["POS", "COMANDA", "SHOP"] as const;
type TInternalChannel = (typeof INTERNAL_CHANNELS)[number];

type TCandidate = {
	produtoId: string;
	nome: string;
	codigo: string | null;
	grupo: string;
	precoVenda: number | null;
	ativo: boolean;
	/** Canais internos em que o produto está à venda hoje. */
	canais: TInternalChannel[];
	/** Criado pela ingestão de pedidos do iFood (grupo "iFood" / código UUID) — duplicata de um cadastro real. */
	geradoPeloIfood: boolean;
};

type TScoredCandidate = TCandidate & { score: number };

type TConfidence = "CODIGO" | "ALTA" | "MEDIA" | "BAIXA" | "NENHUMA";
type TAction = "VINCULAR" | "REVISAR" | "DUPLICADO_IFOOD";

// Palavras que aparecem nos nomes do cardápio sem identificar o produto ("Promoção: Gelato 180ml -
// até 2 sabores" é o mesmo produto que "Gelato - 180ml").
const STOPWORDS = new Set(["de", "do", "da", "com", "e", "o", "a", "na", "no", "ate", "sabor", "sabores", "promocao", "seu", "sua"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Categorias-vitrine do iFood: repetem itens de outras categorias.
const SHOWCASE_CATEGORY_PATTERN = /mais pedidos|destaques|promo/i;

function normalize(value: string) {
	return value
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/(\d)\.(\d{3})/g, "$1$2") // 1.300ml → 1300ml
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function tokens(value: string) {
	return new Set(
		normalize(value)
			.split(" ")
			.filter((token) => token && !STOPWORDS.has(token) && !/^\d$/.test(token)),
	);
}

/** Tamanho declarado no nome (300ml, 750g, 6 unidades) — dois tamanhos diferentes nunca são o mesmo item. */
function extractSize(value: string) {
	const match = normalize(value).match(/(\d+)\s?(ml|g|kg|l|unidades)\b/);
	return match ? `${match[1]}${match[2]}` : null;
}

function nameScore(a: string, b: string) {
	const tokensA = tokens(a);
	const tokensB = tokens(b);
	if (!tokensA.size || !tokensB.size) return 0;
	let intersection = 0;
	for (const token of tokensA) if (tokensB.has(token)) intersection += 1;
	const jaccard = intersection / (tokensA.size + tokensB.size - intersection);
	const containment = intersection / Math.min(tokensA.size, tokensB.size);
	let score = 0.5 * jaccard + 0.5 * containment;

	const sizeA = extractSize(a);
	const sizeB = extractSize(b);
	if (sizeA && sizeB && sizeA !== sizeB) score *= 0.3;
	return Math.round(score * 100) / 100;
}

function confidenceFromScore(score: number): TConfidence {
	if (score >= 0.8) return "ALTA";
	if (score >= 0.55) return "MEDIA";
	if (score >= 0.35) return "BAIXA";
	return "NENHUMA";
}

/** Chave de identidade de um item do iFood: o código externo quando existe, senão o nome normalizado. */
function itemIdentityKey(item: TIfoodItemDTO) {
	return [...tokens(item.nome ?? "")].sort().join(" ");
}

async function main() {
	const orgId = getArgValue("org");
	if (!orgId) throw new Error("Informe --org=<organizationId>.");

	const organization = await db.query.organizations.findFirst({
		where: eq(organizations.id, orgId),
		columns: { id: true, nome: true, slug: true },
	});
	if (!organization) throw new Error(`Organização ${orgId} não encontrada.`);

	const context = await resolveIfoodManagementContext({ organizacaoId: orgId, merchantId: getArgValue("merchant") });
	const merchantId = getArgValue("merchant") ?? context.merchantIds[0];
	if (!merchantId) throw new Error("Nenhuma loja iFood encontrada na conexão.");

	const catalogs = await getIfoodCatalogs(context.client, merchantId);
	const catalog = catalogs.find((candidate) => candidate.contextos.includes("DEFAULT")) ?? catalogs[0];
	if (!catalog) throw new Error("Loja sem catálogo no iFood.");

	const [categories, existingLinks, localProducts, ...channelStates] = await Promise.all([
		listIfoodCategories(context.client, merchantId, { catalogId: catalog.id }),
		listCatalogLinks({ orgId, merchantId }),
		db.query.products.findMany({
			where: and(eq(products.organizacaoId, orgId), eq(products.vendavel, true)),
			columns: {
				id: true,
				nome: true,
				codigo: true,
				grupo: true,
				precoVenda: true,
				ativo: true,
				vendavel: true,
				quantidade: true,
				rastreamentoEstoqueAtivo: true,
			},
		}),
		...INTERNAL_CHANNELS.map((canal) => loadChannelState({ orgId, canal })),
	]);

	const activeLinks = existingLinks.filter((link) => link.status !== "DESVINCULADO");
	const linkedItemIds = new Set(activeLinks.map((link) => link.externoItemId).filter(Boolean));
	const linkedProductIds = new Set(activeLinks.map((link) => link.produtoId).filter(Boolean));

	const candidates: TCandidate[] = localProducts
		.filter((product) => !linkedProductIds.has(product.id))
		.map((product) => {
			const canais = INTERNAL_CHANNELS.filter((canal, index) => {
				const state = channelStates[index];
				// Canal não materializado = TODOS sem overrides (mesma regra de buildChannelCatalogConditions).
				const channel: TChannel = { canal, catalogoModo: state?.channel.catalogoModo ?? "TODOS" };
				return resolveChannelAvailability({
					product: { ...product, ativo: product.ativo ?? true },
					channel,
					overrides: { product: state?.productOverrides.get(product.id) ?? null },
				});
			});
			const codigo = product.codigo?.trim() || null;
			return {
				produtoId: product.id,
				nome: product.nome.trim(),
				codigo,
				grupo: product.grupo,
				precoVenda: product.precoVenda,
				ativo: product.ativo ?? true,
				canais,
				geradoPeloIfood: product.grupo.trim().toLowerCase() === "ifood" || (!!codigo && UUID_PATTERN.test(codigo)),
			};
		});

	const byCode = new Map<string, TCandidate[]>();
	for (const candidate of candidates) {
		if (!candidate.codigo || candidate.geradoPeloIfood) continue;
		const list = byCode.get(candidate.codigo) ?? [];
		list.push(candidate);
		byCode.set(candidate.codigo, list);
	}

	// Ordem de preferência entre candidatos: nome, depois cadastro real antes de duplicata da
	// ingestão, depois habilitado em algum canal interno, depois ativo.
	const compareCandidates = (a: TScoredCandidate, b: TScoredCandidate) =>
		b.score - a.score ||
		Number(a.geradoPeloIfood) - Number(b.geradoPeloIfood) ||
		Number(b.canais.length > 0) - Number(a.canais.length > 0) ||
		Number(b.ativo) - Number(a.ativo);

	const unlinkedItems = categories.flatMap((category) =>
		category.itens.filter((item) => item.id && !linkedItemIds.has(item.id)).map((item) => ({ item, categoria: category.nome ?? "" })),
	);

	// Duplicatas do lado do iFood: mesmo nome (ou mesmo código) em mais de uma categoria. Fica o
	// item da categoria "de verdade"; a cópia da vitrine é marcada DUPLICADO_IFOOD.
	const itemGroups = new Map<string, typeof unlinkedItems>();
	for (const entry of unlinkedItems) {
		const key = itemIdentityKey(entry.item);
		const list = itemGroups.get(key) ?? [];
		list.push(entry);
		itemGroups.set(key, list);
	}
	const duplicateOf = new Map<string, (typeof unlinkedItems)[number]>();
	for (const group of itemGroups.values()) {
		if (group.length < 2) continue;
		const rank = (entry: (typeof group)[number]) =>
			(SHOWCASE_CATEGORY_PATTERN.test(entry.categoria) ? 2 : 0) + (entry.item.codigoExterno ? 0 : 1);
		const [keeper, ...copies] = [...group].sort((a, b) => rank(a) - rank(b));
		for (const copy of copies) duplicateOf.set(copy.item.id as string, keeper);
	}

	const suggestions = unlinkedItems.map(({ item, categoria }) => {
		const itemName = item.nome ?? "";
		const ranked: TScoredCandidate[] = candidates
			.map((candidate) => ({ ...candidate, score: nameScore(itemName, candidate.nome) }))
			.filter((candidate) => candidate.score > 0)
			.sort(compareCandidates);

		const codeMatches = item.codigoExterno ? (byCode.get(item.codigoExterno.trim()) ?? []) : [];
		let chosen: TScoredCandidate | null = null;
		let confianca: TConfidence;
		const notes: string[] = [];

		if (codeMatches.length) {
			const [match] = codeMatches
				.map((candidate) => ({ ...candidate, score: nameScore(itemName, candidate.nome) }))
				.sort(compareCandidates);
			chosen = match;
			confianca = "CODIGO";
			notes.push(`Código externo "${item.codigoExterno}" idêntico ao código do produto.`);
			if (codeMatches.length > 1) notes.push(`Há ${codeMatches.length} produtos com esse código.`);
			if (chosen.score < 0.35) notes.push("Atenção: os nomes divergem bastante.");
		} else {
			// Duplicata da ingestão só vence se não houver cadastro real razoável.
			const real = ranked.find((candidate) => !candidate.geradoPeloIfood && candidate.score >= 0.55);
			const best = real ?? ranked[0];
			confianca = best ? confidenceFromScore(best.score) : "NENHUMA";
			if (best && confianca !== "NENHUMA") {
				chosen = best;
				notes.push(
					item.codigoExterno
						? `Código externo "${item.codigoExterno}" não existe no cadastro; nome parecido (${Math.round(best.score * 100)}%).`
						: `Item sem código externo no iFood; nome parecido (${Math.round(best.score * 100)}%).`,
				);
				const skippedArtifact = real && ranked[0] !== real && ranked[0].geradoPeloIfood ? ranked[0] : null;
				if (skippedArtifact) notes.push(`Preferido ao "${skippedArtifact.nome}" [grupo ${skippedArtifact.grupo}], que foi criado pela ingestão do iFood.`);
			} else {
				notes.push("Sem correspondência no cadastro — criar o produto ou importar do iFood.");
			}
		}

		if (chosen?.geradoPeloIfood) notes.push("Produto foi criado pela ingestão do iFood (duplicata provável) — confira se não há cadastro original.");
		if (chosen && !chosen.ativo) notes.push("Produto está INATIVO no cadastro.");
		if (chosen && chosen.ativo && !chosen.canais.length) notes.push("Produto fora do PDV/Comanda/Loja — normal se for exclusivo do iFood.");
		if (chosen?.precoVenda != null && item.preco != null && chosen.precoVenda !== item.preco) {
			notes.push(`Preço difere (cadastro R$ ${chosen.precoVenda} × iFood R$ ${item.preco}).`);
		}

		let acao: TAction = chosen && confianca !== "BAIXA" ? "VINCULAR" : "REVISAR";
		let duplicataDe: { itemId: string; nome: string | null; categoria: string } | null = null;
		const keeper = duplicateOf.get(item.id as string);
		if (keeper) {
			acao = "DUPLICADO_IFOOD";
			duplicataDe = { itemId: keeper.item.id as string, nome: keeper.item.nome, categoria: keeper.categoria };
			notes.unshift(
				`Cópia de "${keeper.item.nome}" [${keeper.categoria}] — o vínculo admite um item por produto, então só o original é vinculado.`,
			);
			const canonicalCode = keeper.item.codigoExterno ?? null;
			if (!item.codigoExterno) {
				notes.push(
					canonicalCode
						? `Sem código externo: pedidos deste item criam produto novo. Preencha o código "${canonicalCode}" no Portal do iFood.`
						: "Sem código externo: pedidos deste item criam produto novo. Preencha no Portal o mesmo código do produto vinculado ao original.",
				);
			} else if (canonicalCode && item.codigoExterno !== canonicalCode) {
				notes.push(`Código externo "${item.codigoExterno}" difere do original ("${canonicalCode}") — alinhe no Portal.`);
			} else {
				notes.push("Mesmo código do original: a ingestão de pedidos já resolve pelo código.");
			}
		}

		return {
			acao,
			confianca,
			motivo: notes.join(" "),
			item: {
				itemId: item.id as string,
				produtoIfoodId: item.produtoId,
				nome: item.nome,
				categoria,
				codigoExterno: item.codigoExterno,
				preco: item.preco,
				status: item.status,
			},
			duplicataDe,
			produto: chosen,
			alternativas: ranked.filter((candidate) => candidate.produtoId !== chosen?.produtoId).slice(0, 3),
		};
	});

	// Conflito remanescente: o mesmo produto sugerido para dois itens que NÃO são cópia um do outro
	// (ex.: combo que casou com o refrigerante). Fica com o casamento por código; os outros perdem
	// a sugestão e vão para REVISAR.
	const byProduct = new Map<string, typeof suggestions>();
	for (const suggestion of suggestions) {
		if (!suggestion.produto || suggestion.acao === "DUPLICADO_IFOOD") continue;
		const list = byProduct.get(suggestion.produto.produtoId) ?? [];
		list.push(suggestion);
		byProduct.set(suggestion.produto.produtoId, list);
	}
	for (const list of byProduct.values()) {
		if (list.length < 2) continue;
		const [keeper, ...losers] = [...list].sort(
			(a, b) => Number(b.confianca === "CODIGO") - Number(a.confianca === "CODIGO") || (b.produto?.score ?? 0) - (a.produto?.score ?? 0),
		);
		for (const loser of losers) {
			const lost = loser.produto as TScoredCandidate;
			loser.motivo += ` CONFLITO: "${lost.nome}" já é o melhor par de "${keeper.item.nome}" [${keeper.item.categoria}]; sugestão removida.`;
			loser.alternativas = [lost, ...loser.alternativas].slice(0, 3);
			loser.produto = null;
			loser.acao = "REVISAR";
		}
	}

	const suggestedProductIds = new Set(
		suggestions.filter((suggestion) => suggestion.acao !== "DUPLICADO_IFOOD").map((suggestion) => suggestion.produto?.produtoId),
	);

	// Produtos criados pela ingestão: apontam para o cadastro original mais provável, para mesclar.
	const ingestionArtifacts = candidates
		.filter((candidate) => candidate.geradoPeloIfood)
		.map((artifact) => {
			const [original] = candidates
				.filter((candidate) => !candidate.geradoPeloIfood)
				.map((candidate) => ({ ...candidate, score: nameScore(artifact.nome, candidate.nome) }))
				.sort(compareCandidates);
			return {
				produtoId: artifact.produtoId,
				nome: artifact.nome,
				codigo: artifact.codigo,
				grupo: artifact.grupo,
				canais: artifact.canais,
				originalProvavel: original && original.score >= 0.55 ? { produtoId: original.produtoId, nome: original.nome, codigo: original.codigo, score: original.score } : null,
			};
		});

	const productsWithoutItem = candidates
		.filter((candidate) => candidate.ativo && !candidate.geradoPeloIfood && !suggestedProductIds.has(candidate.produtoId))
		.map(({ produtoId, nome, codigo, grupo, precoVenda, canais }) => ({ produtoId, nome, codigo, grupo, precoVenda, canais }));

	const output = {
		geradoEm: new Date().toISOString(),
		organizacao: organization,
		merchantId,
		catalogoId: catalog.id,
		legenda: {
			acao: "VINCULAR = pronta para aplicar; REVISAR = precisa de decisão; DUPLICADO_IFOOD = cópia de outro item no próprio iFood, não vincular (ver motivo p/ código no Portal). Edite `acao` e `produto.produtoId` à vontade.",
			confianca: "CODIGO = código externo do iFood igual ao código do produto; ALTA/MEDIA/BAIXA = só semelhança de nome; NENHUMA = sem candidato.",
			canais: "Canais internos (POS, COMANDA, SHOP) em que o produto está à venda hoje. Vazio não é duplicata: pode ser exclusivo do iFood.",
			geradoPeloIfood: "Produto criado pela ingestão de pedidos (grupo iFood / código UUID) — duplicata de um cadastro real.",
		},
		resumo: {
			itensIfood: suggestions.length,
			jaVinculados: activeLinks.length,
			porAcao: Object.fromEntries(
				(["VINCULAR", "REVISAR", "DUPLICADO_IFOOD"] as const).map((action) => [action, suggestions.filter((suggestion) => suggestion.acao === action).length]),
			),
			porConfianca: Object.fromEntries(
				(["CODIGO", "ALTA", "MEDIA", "BAIXA", "NENHUMA"] as const).map((level) => [level, suggestions.filter((suggestion) => suggestion.confianca === level).length]),
			),
			produtosGeradosPeloIfood: ingestionArtifacts.length,
			produtosAtivosSemItem: productsWithoutItem.length,
			produtosAtivosSemItemNoPdvOuLoja: productsWithoutItem.filter((product) => product.canais.length > 0).length,
		},
		sugestoes: suggestions,
		produtosGeradosPeloIfood: ingestionArtifacts,
		produtosAtivosSemItem: productsWithoutItem,
	};

	const outPath = resolve(getArgValue("out") ?? `./.local-analysis/ifood/vinculos-catalogo-${organization.slug}.json`);
	mkdirSync(dirname(outPath), { recursive: true });
	writeFileSync(outPath, JSON.stringify(output, null, 2), { encoding: "utf-8" });

	console.log(`Arquivo gerado: ${outPath}`);
	console.log(output.resumo);
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(() => connection.end());
