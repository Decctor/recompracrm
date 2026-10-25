import { createSimplifiedSearchCondition } from "@/lib/search";
import { db } from "@/services/drizzle";
import { products, productVariants } from "@/services/drizzle/schema";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { gateway, generateText, Output } from "ai";
import { z } from "zod";
import type { TAcquisitionNatureEnum } from "@/schemas/enums";
import type { TExtractedCompositionItem } from "./import";
import { resolveDefaultDestination } from "./entry-rules";
import { inferPackFactorFromDescription, unitsAreEquivalent } from "./units";

export type TCompositionMatchType = "MAPEADO" | "CODIGO" | "SUGERIDO" | "NAO_MAPEADO";

export type TMatchedProductInfo = {
	id: string;
	nome: string;
	codigo: string;
	unidade: string | null;
	imagemCapaUrl: string | null;
	natureza: TAcquisitionNatureEnum;
};

export type TMatchedCompositionItem = TExtractedCompositionItem & {
	matchTipo: TCompositionMatchType;
	confianca: number | null;
	/** Por que a linha foi vinculada a este produto, em linguagem do operador. */
	motivo: string | null;
	produto: TMatchedProductInfo | null;
	produtoVarianteId: string | null;
	/** Fator sugerido para converter a unidade da nota à unidade interna do produto. */
	fatorConversaoSugerido: number | null;
	/** A unidade da nota diverge da unidade do produto: exige decisão do operador. */
	divergenciaUnidade: boolean;
	/** De-para lembrado → natureza do produto → revenda (lib/purchase/entry-rules.ts). */
	destinacaoSugerida: TAcquisitionNatureEnum;
};

/**
 * Anexa divergência de unidade e fator sugerido depois que a linha ganhou um produto. O fator
 * aprendido no de-para tem precedência sobre o palpite tirado da descrição.
 */
function applyUnitReconciliation(item: TMatchedCompositionItem, mappedFactor?: number | null) {
	if (!item.produto) return;
	const equivalent = unitsAreEquivalent(item.unidade, item.produto.unidade);
	item.divergenciaUnidade = !equivalent;
	if (mappedFactor && mappedFactor > 0) {
		item.fatorConversaoSugerido = mappedFactor;
		return;
	}
	item.fatorConversaoSugerido = equivalent ? null : inferPackFactorFromDescription(item.descricao);
}

const PRODUCT_INFO_COLUMNS = {
	id: products.id,
	nome: products.nome,
	codigo: products.codigo,
	unidade: products.unidade,
	imagemCapaUrl: products.imagemCapaUrl,
	natureza: products.natureza,
};

const AI_MATCH_MODEL = "anthropic/claude-haiku-4.5";
const AI_MATCH_MIN_CONFIDENCE = 0.5;
const CANDIDATES_PER_LINE = 5;

const AIMatchOutputSchema = z.object({
	matches: z.array(
		z.object({
			itemIndex: z.number(),
			produtoId: z.string().nullable(),
			confianca: z.number().min(0).max(1).nullable(),
			motivo: z.string().nullable(),
		}),
	),
});

function extractSearchTokens(descricao: string) {
	return descricao
		.split(/[^\p{L}\p{N}]+/u)
		.map((token) => token.trim())
		.filter((token) => token.length >= 3)
		.slice(0, 4);
}

export async function matchCompositionItemsToProducts({
	organizacaoId,
	fornecedorId,
	itens,
	abortSignal,
}: {
	organizacaoId: string;
	fornecedorId: string | null;
	itens: TExtractedCompositionItem[];
	abortSignal?: AbortSignal;
}): Promise<TMatchedCompositionItem[]> {
	const results: TMatchedCompositionItem[] = itens.map((item) => ({
		...item,
		matchTipo: "NAO_MAPEADO",
		confianca: null,
		motivo: null,
		produto: null,
		produtoVarianteId: null,
		fatorConversaoSugerido: null,
		divergenciaUnidade: false,
		destinacaoSugerida: "REVENDA",
	}));
	if (itens.length === 0) return results;
	// Resolvida no fim, quando produto e de-para já são conhecidos.
	const mappedDestinationByResult = new Map<TMatchedCompositionItem, TAcquisitionNatureEnum | null>();

	const productInfoById = new Map<string, TMatchedProductInfo>();
	async function loadProductInfos(productIds: string[]) {
		const missing = [...new Set(productIds)].filter((id) => !productInfoById.has(id));
		if (missing.length === 0) return;
		const rows = await db
			.select(PRODUCT_INFO_COLUMNS)
			.from(products)
			.where(and(inArray(products.id, missing), eq(products.organizacaoId, organizacaoId)));
		for (const row of rows) productInfoById.set(row.id, row);
	}

	// Stage A — learned supplier mappings (deterministic, highest trust).
	if (fornecedorId) {
		const mappings = await db.query.supplierProductMappings.findMany({
			where: (fields, { and, eq }) => and(eq(fields.fornecedorId, fornecedorId), eq(fields.organizacaoId, organizacaoId)),
			columns: { codigoFornecedor: true, ean: true, produtoId: true, produtoVarianteId: true, fatorConversao: true, destinacao: true },
		});
		const mappingByCodigo = new Map(mappings.filter((m) => m.codigoFornecedor).map((m) => [m.codigoFornecedor as string, m]));
		const mappingByEan = new Map(mappings.filter((m) => m.ean).map((m) => [m.ean as string, m]));

		const mappedProductIds: string[] = [];
		const mappedFactorByResult = new Map<TMatchedCompositionItem, number | null>();
		for (const result of results) {
			const mappingByCode = result.codigoFornecedor ? mappingByCodigo.get(result.codigoFornecedor) : undefined;
			const mapping = mappingByCode || (result.ean && mappingByEan.get(result.ean)) || null;
			if (!mapping) continue;
			result.matchTipo = "MAPEADO";
			result.confianca = 1;
			result.motivo = mappingByCode
				? `Vínculo lembrado para este fornecedor (cód. ${result.codigoFornecedor})`
				: `Vínculo lembrado para este fornecedor (EAN ${result.ean})`;
			result.produtoVarianteId = mapping.produtoVarianteId ?? null;
			result.produto = { id: mapping.produtoId, nome: "", codigo: "", unidade: null, imagemCapaUrl: null, natureza: "REVENDA" };
			mappedFactorByResult.set(result, mapping.fatorConversao ?? null);
			mappedDestinationByResult.set(result, mapping.destinacao ?? null);
			mappedProductIds.push(mapping.produtoId);
		}
		await loadProductInfos(mappedProductIds);
		for (const result of results) {
			if (result.matchTipo !== "MAPEADO" || !result.produto) continue;
			const info = productInfoById.get(result.produto.id);
			// Mapping pointing at a product that no longer exists in the org: fall back to unmatched.
			if (!info) {
				result.matchTipo = "NAO_MAPEADO";
				result.confianca = null;
				result.motivo = null;
				result.produto = null;
				result.produtoVarianteId = null;
				mappedFactorByResult.delete(result);
				mappedDestinationByResult.delete(result);
			} else {
				result.produto = info;
				applyUnitReconciliation(result, mappedFactorByResult.get(result));
			}
		}
	}

	// Stage B — exact match of the extracted EAN/code against product and variant barcodes and codes.
	// EAN is checked first: it identifies the merchandise, while the supplier code may collide with
	// an internal code by chance.
	const pendingAfterMappings = results.filter((result) => result.matchTipo === "NAO_MAPEADO");
	const externalCodes = [
		...new Set(pendingAfterMappings.flatMap((result) => [result.codigoFornecedor, result.ean]).filter((code): code is string => !!code?.trim())),
	];
	if (externalCodes.length > 0) {
		const [productRows, variantRows] = await Promise.all([
			db
				.select({ ...PRODUCT_INFO_COLUMNS, codigoBarras: products.codigoBarras })
				.from(products)
				.where(
					and(eq(products.organizacaoId, organizacaoId), or(inArray(products.codigo, externalCodes), inArray(products.codigoBarras, externalCodes))),
				),
			db
				.select({
					id: productVariants.id,
					produtoId: productVariants.produtoId,
					codigo: productVariants.codigo,
					codigoBarras: productVariants.codigoBarras,
				})
				.from(productVariants)
				.where(
					and(
						eq(productVariants.organizacaoId, organizacaoId),
						or(inArray(productVariants.codigo, externalCodes), inArray(productVariants.codigoBarras, externalCodes)),
					),
				),
		]);
		await loadProductInfos(variantRows.map((variant) => variant.produtoId));
		for (const row of productRows)
			productInfoById.set(row.id, {
				id: row.id,
				nome: row.nome,
				codigo: row.codigo,
				unidade: row.unidade,
				imagemCapaUrl: row.imagemCapaUrl,
				natureza: row.natureza,
			});

		type TCodeHit = { produtoId: string; produtoVarianteId: string | null; motivo: string };
		const hitByKey = new Map<string, TCodeHit>();
		const register = (key: string, hit: TCodeHit) => {
			if (!hitByKey.has(key)) hitByKey.set(key, hit);
		};
		for (const row of productRows) {
			if (row.codigoBarras)
				register(`EAN:${row.codigoBarras}`, { produtoId: row.id, produtoVarianteId: null, motivo: "EAN igual ao código de barras do produto" });
			register(`COD:${row.codigo}`, { produtoId: row.id, produtoVarianteId: null, motivo: "Código igual ao código do produto" });
			register(`EAN:${row.codigo}`, { produtoId: row.id, produtoVarianteId: null, motivo: "EAN igual ao código do produto" });
		}
		for (const row of variantRows) {
			if (row.codigoBarras)
				register(`EAN:${row.codigoBarras}`, { produtoId: row.produtoId, produtoVarianteId: row.id, motivo: "EAN igual ao código de barras da variante" });
			if (row.codigo) {
				register(`COD:${row.codigo}`, { produtoId: row.produtoId, produtoVarianteId: row.id, motivo: "Código igual ao código da variante" });
				register(`EAN:${row.codigo}`, { produtoId: row.produtoId, produtoVarianteId: row.id, motivo: "EAN igual ao código da variante" });
			}
		}
		for (const result of pendingAfterMappings) {
			const hit =
				(result.ean && hitByKey.get(`EAN:${result.ean}`)) || (result.codigoFornecedor && hitByKey.get(`COD:${result.codigoFornecedor}`)) || null;
			const info = hit ? productInfoById.get(hit.produtoId) : undefined;
			if (!hit || !info) continue;
			result.matchTipo = "CODIGO";
			result.confianca = 0.95;
			result.motivo = hit.motivo;
			result.produto = info;
			result.produtoVarianteId = hit.produtoVarianteId;
			applyUnitReconciliation(result);
		}
	}

	// Stage C — candidate retrieval by description tokens + one AI call to pick (or refuse) per line.
	const pendingForAI = results
		.map((result, index) => ({ result, index }))
		.filter(({ result }) => result.matchTipo === "NAO_MAPEADO" && result.descricao.trim().length >= 3);
	if (pendingForAI.length === 0) return results;

	// As consultas de candidatos são independentes entre si: em paralelo, o custo é o da linha mais
	// lenta e não a soma de todas. Uma nota com 25 linhas pendentes fazia 25 idas ao banco em série.
	const candidatesByItemIndex = new Map<number, TMatchedProductInfo[]>();
	await Promise.all(
		pendingForAI.map(async ({ result, index }) => {
			const tokens = extractSearchTokens(result.descricao);
			if (tokens.length === 0) return;
			// `createSimplifiedSearchCondition` usa `unaccent_immutable`, que é o que o índice
			// `idx_products_nome` indexa. O `unaccent()` puro é STABLE e forçava sequential scan.
			const tokenConditions = tokens.map((token) => createSimplifiedSearchCondition(products.nome, token));
			const candidates = await db
				.select(PRODUCT_INFO_COLUMNS)
				.from(products)
				.where(and(eq(products.organizacaoId, organizacaoId), or(...tokenConditions)))
				.orderBy(sql`similarity(unaccent_immutable(lower(${products.nome})), unaccent_immutable(lower(${result.descricao}))) desc`)
				.limit(CANDIDATES_PER_LINE);
			if (candidates.length > 0) candidatesByItemIndex.set(index, candidates);
		}),
	);
	if (candidatesByItemIndex.size === 0) return finalizeDestinations(results, mappedDestinationByResult);

	const aiPromptLines = [...candidatesByItemIndex.entries()].map(([index, candidates]) => ({
		itemIndex: index,
		descricaoNota: results[index].descricao,
		unidadeNota: results[index].unidade,
		candidatos: candidates.map((candidate) => ({
			produtoId: candidate.id,
			nome: candidate.nome,
			codigo: candidate.codigo,
			unidade: candidate.unidade,
		})),
	}));

	try {
		const { output } = await generateText({
			model: gateway(AI_MATCH_MODEL),
			output: Output.object({ schema: AIMatchOutputSchema }),
			abortSignal,
			system:
				"Você é um especialista em conciliar itens de notas fiscais com o catálogo interno de produtos de um varejo. " +
				"Para cada item, escolha o produtoId do candidato que representa o MESMO produto (mesmo tipo, marca e apresentação quando identificáveis), ou null se nenhum candidato for o mesmo produto. " +
				"Seja conservador: em dúvida, retorne null. " +
				'Em "motivo", explique em uma frase curta em português o que coincide entre a nota e o candidato escolhido (ex: "Nome, marca e peso coincidem (MELKEN, 1KG)"), ou null quando não houver escolha. ' +
				"Responda apenas no schema JSON pedido.",
			prompt: `Concilie os itens abaixo com os candidatos do catálogo. Retorne um match por itemIndex.\n\n${JSON.stringify(aiPromptLines)}`,
		});
		const parsed = AIMatchOutputSchema.parse(output);
		for (const match of parsed.matches) {
			const candidates = candidatesByItemIndex.get(match.itemIndex);
			const result = results[match.itemIndex];
			if (!candidates || !result || !match.produtoId) continue;
			const candidate = candidates.find((item) => item.id === match.produtoId);
			if (!candidate) continue;
			const confidence = match.confianca ?? AI_MATCH_MIN_CONFIDENCE;
			if (confidence < AI_MATCH_MIN_CONFIDENCE) continue;
			result.matchTipo = "SUGERIDO";
			result.confianca = confidence;
			result.motivo = match.motivo?.trim() || "Sugerido pela semelhança do nome";
			result.produto = candidate;
			applyUnitReconciliation(result);
		}
	} catch (error) {
		// AI matching is best-effort: lines simply stay NAO_MAPEADO for manual resolution.
		console.error("[PURCHASE_IMPORT] Erro no matching por IA, mantendo itens não mapeados.", error);
	}

	return finalizeDestinations(results, mappedDestinationByResult);
}

function finalizeDestinations(
	results: TMatchedCompositionItem[],
	mappedDestinationByResult: Map<TMatchedCompositionItem, TAcquisitionNatureEnum | null>,
) {
	for (const result of results)
		result.destinacaoSugerida = resolveDefaultDestination({
			mappingDestination: mappedDestinationByResult.get(result) ?? null,
			productNature: result.produto?.natureza ?? null,
		});
	return results;
}
