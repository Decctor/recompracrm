import { type DBTransaction, db } from "@/services/drizzle";
import { productVariants, products } from "@/services/drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getProductionItemQuantity } from "./item-quantity";

export { getProductionItemQuantity };

/**
 * Valoração de receitas e produções.
 *
 * Custo = soma do custo unitário dos produtos que compõem os insumos × quantidade.
 * Retorno esperado = soma do preço de venda dos produtos das saídas × quantidade.
 *
 * Receitas são sempre valoradas ao vivo (uma receita é um molde, não um fato). Produções concluídas
 * carregam um snapshot congelado no momento da conclusão — ver `services/drizzle/schema/productions.ts`.
 */

/**
 * De onde vieram os números:
 * - `SNAPSHOT`: congelados na conclusão da produção, imutáveis.
 * - `PROJECAO`: produção ainda não concluída, estimada pelo catálogo — será substituída pelo snapshot.
 * - `CATALOGO`: receita, valorada pelo catálogo por natureza. É o valor definitivo dela.
 */
export type TValuationOrigin = "SNAPSHOT" | "PROJECAO" | "CATALOGO";

/** Itens de entidade aceitos pelas buscas de preço — campos da linha, portanto em português. */
export type TPricedItem = { produtoId: string; produtoVarianteId?: string | null };

/** Item já resolvido para uma única quantidade valorável. */
export type TValuationItem = TPricedItem & { quantidade: number };

export type TProductPricing = {
	precoCusto: number | null;
	precoVenda: number | null;
};

export type TValuation = {
	custoTotal: number;
	retornoEsperado: number;
	margem: number;
	/** Margem sobre o retorno esperado, em pontos percentuais. Nulo quando não há retorno para dividir. */
	margemPercentual: number | null;
	/** Falso quando algum insumo não tem custo cadastrado — o custo total está subestimado. */
	custoCompleto: boolean;
	/** Falso quando alguma saída não tem preço de venda cadastrado — o retorno está subestimado. */
	retornoCompleto: boolean;
	origemValores: TValuationOrigin;
};

export type TProductionValuation = TValuation & {
	/** Preenchido apenas quando `origemValores` é `SNAPSHOT`. */
	dataSnapshotValores: Date | null;
};

/**
 * Valoração como sai da API: custo e margem viram `null` para quem não vê custos
 * (`dadosSensiveis.visualizarCustos`, lib/permissions/sensitive-data.ts). Margem é retorno − custo,
 * então esconder só o custo não basta. O retorno esperado sai do preço de venda e continua visível.
 */
export type TMaskedValuation<T extends TValuation = TValuation> = Omit<T, "custoTotal" | "margem" | "margemPercentual"> & {
	custoTotal: number | null;
	margem: number | null;
	margemPercentual: number | null;
};

export function maskValuationCosts<T extends TValuation>(valuation: T, canViewCosts: boolean): TMaskedValuation<T> {
	if (canViewCosts) return valuation;
	return { ...valuation, custoTotal: null, margem: null, margemPercentual: null };
}

type TItemWithProductCosts = {
	produto: { precoCusto: number | null };
	produtoVariante: { precoCusto: number | null } | null;
};

/** Item de receita/produção que carrega produto e variante completos: tira o custo de catálogo deles. */
export function maskItemProductCosts<T extends TItemWithProductCosts>(item: T, canViewCosts: boolean): T {
	if (canViewCosts) return item;
	return {
		...item,
		produto: { ...item.produto, precoCusto: null },
		produtoVariante: item.produtoVariante ? { ...item.produtoVariante, precoCusto: null } : null,
	};
}

/** Chave de preço por produto + variante. A variante manda quando existe. */
export function buildPricingKey(produtoId: string, produtoVarianteId?: string | null) {
	return `${produtoId}::${produtoVarianteId ?? ""}`;
}

export type TProductPricingMap = Map<string, TProductPricing>;

/**
 * Carrega preços de custo e venda de todos os produtos/variantes referenciados pelos itens, em duas
 * queries — independente de quantas receitas ou produções estejam na página.
 */
export async function getProductPricingMap({
	trx,
	organizationId,
	items,
}: {
	trx?: DBTransaction;
	organizationId: string;
	items: TPricedItem[];
}): Promise<TProductPricingMap> {
	const client = trx ?? db;
	const pricingMap: TProductPricingMap = new Map();
	if (items.length === 0) return pricingMap;

	const productIds = [...new Set(items.map((item) => item.produtoId))];
	const variantIds = [...new Set(items.map((item) => item.produtoVarianteId).filter((id): id is string => !!id))];

	const [productsResult, variantsResult] = await Promise.all([
		productIds.length > 0
			? client.query.products.findMany({
					where: and(inArray(products.id, productIds), eq(products.organizacaoId, organizationId)),
					columns: { id: true, precoCusto: true, precoVenda: true },
				})
			: [],
		variantIds.length > 0
			? client.query.productVariants.findMany({
					where: and(inArray(productVariants.id, variantIds), eq(productVariants.organizacaoId, organizationId)),
					columns: { id: true, produtoId: true, precoCusto: true, precoVenda: true },
				})
			: [],
	]);

	const productsById = new Map(productsResult.map((product) => [product.id, product]));
	for (const product of productsResult) {
		pricingMap.set(buildPricingKey(product.id, null), {
			precoCusto: product.precoCusto ?? null,
			precoVenda: product.precoVenda ?? null,
		});
	}

	for (const variant of variantsResult) {
		const product = productsById.get(variant.produtoId);
		pricingMap.set(buildPricingKey(variant.produtoId, variant.id), {
			// A variante pode não ter custo próprio cadastrado; nesse caso herda o do produto pai.
			precoCusto: variant.precoCusto ?? product?.precoCusto ?? null,
			precoVenda: variant.precoVenda ?? product?.precoVenda ?? null,
		});
	}

	return pricingMap;
}

export function getItemUnitCost({ item, pricingMap }: { item: TPricedItem; pricingMap: TProductPricingMap }) {
	return pricingMap.get(buildPricingKey(item.produtoId, item.produtoVarianteId))?.precoCusto ?? null;
}

export function getItemSalePrice({ item, pricingMap }: { item: TPricedItem; pricingMap: TProductPricingMap }) {
	return pricingMap.get(buildPricingKey(item.produtoId, item.produtoVarianteId))?.precoVenda ?? null;
}

/** Fecha os totais a partir de custo e retorno já apurados (usado tanto pelo cálculo ao vivo quanto pelo snapshot). */
export function buildValuation({
	custoTotal,
	retornoEsperado,
	origemValores,
	custoCompleto = true,
	retornoCompleto = true,
}: {
	custoTotal: number;
	retornoEsperado: number;
	origemValores: TValuationOrigin;
	custoCompleto?: boolean;
	retornoCompleto?: boolean;
}): TValuation {
	const margem = retornoEsperado - custoTotal;
	return {
		custoTotal,
		retornoEsperado,
		margem,
		margemPercentual: retornoEsperado > 0 ? (margem / retornoEsperado) * 100 : null,
		custoCompleto,
		retornoCompleto,
		origemValores,
	};
}

/** Valoração ao vivo: custo dos insumos e retorno das saídas pelos preços vigentes no catálogo. */
export function calculateValuation({
	inputs,
	outputs,
	pricingMap,
	origemValores = "CATALOGO",
}: {
	inputs: TValuationItem[];
	outputs: TValuationItem[];
	pricingMap: TProductPricingMap;
	origemValores?: TValuationOrigin;
}): TValuation {
	let custoTotal = 0;
	let custoCompleto = true;
	for (const input of inputs) {
		const unitCost = getItemUnitCost({ item: input, pricingMap });
		if (unitCost == null) {
			// Só conta como lacuna se a linha realmente movimenta quantidade.
			if (input.quantidade > 0) custoCompleto = false;
			continue;
		}
		custoTotal += unitCost * input.quantidade;
	}

	let retornoEsperado = 0;
	let retornoCompleto = true;
	for (const output of outputs) {
		const salePrice = getItemSalePrice({ item: output, pricingMap });
		if (salePrice == null) {
			if (output.quantidade > 0) retornoCompleto = false;
			continue;
		}
		retornoEsperado += salePrice * output.quantidade;
	}

	return buildValuation({ custoTotal, retornoEsperado, custoCompleto, retornoCompleto, origemValores });
}

/** Forma estrutural da entidade `productions` com seus itens. */
type ProductionValuationSource = {
	custoTotal: number | null;
	retornoEsperado: number | null;
	dataSnapshotValores: Date | null;
	entradas: (TPricedItem & { quantidadePrevista: number | null; quantidadeReal: number | null })[];
	saidas: (TPricedItem & { quantidadePrevista: number | null; quantidadeReal: number | null })[];
};

/**
 * Itens cujos preços precisam ser carregados. Vazio quando a produção já tem snapshot — nesse caso
 * a valoração não consulta o catálogo e a query de preços é dispensada.
 */
export function getProductionPricingItems(production: ProductionValuationSource): TPricedItem[] {
	if (production.dataSnapshotValores) return [];
	return [...production.entradas, ...production.saidas];
}

function toValuationItem(item: ProductionValuationSource["entradas"][number]): TValuationItem {
	return {
		produtoId: item.produtoId,
		produtoVarianteId: item.produtoVarianteId,
		quantidade: getProductionItemQuantity(item),
	};
}

/**
 * Snapshot quando a produção já foi concluída, projeção pelo catálogo atual enquanto não foi.
 * `pricingMap` só é consultado no segundo caso.
 */
export function resolveProductionValuation({
	production,
	pricingMap,
}: {
	production: ProductionValuationSource;
	pricingMap: TProductPricingMap;
}): TProductionValuation {
	if (production.dataSnapshotValores) {
		return {
			...buildValuation({
				custoTotal: production.custoTotal ?? 0,
				retornoEsperado: production.retornoEsperado ?? 0,
				origemValores: "SNAPSHOT",
			}),
			dataSnapshotValores: production.dataSnapshotValores,
		};
	}

	return {
		...calculateValuation({
			inputs: production.entradas.map(toValuationItem),
			outputs: production.saidas.map(toValuationItem),
			pricingMap,
			origemValores: "PROJECAO",
		}),
		dataSnapshotValores: null,
	};
}
