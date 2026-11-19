import { resolveProductAvailability, resolveVariantAvailability } from "@/lib/products/availability";
import type { TProductStockDeductionModeEnum } from "@/schemas/enums";
import type { DB, DBTransaction } from "@/services/drizzle";
import { productAddOnReferences, productVariants, products } from "@/services/drizzle/schema";
import { and, eq, inArray, isNull, or } from "drizzle-orm";

type TDb = DB | DBTransaction;

export type TSaleItemResolutionErrorCode =
	| "PRODUTO_NAO_ENCONTRADO"
	| "PRODUTO_INATIVO"
	| "PRODUTO_NAO_VENDAVEL"
	| "VARIANTE_NAO_ENCONTRADA"
	| "VARIANTE_INVALIDA"
	| "PRECO_AUSENTE"
	| "QUANTIDADE_INVALIDA"
	| "ESTOQUE_INSUFICIENTE"
	| "ADICIONAIS_NAO_SUPORTADOS";

/**
 * Faltas de estoque, por item. Existe para o chamador poder redigir a mensagem: quem sabe se o
 * saldo pode ser dito ao cliente é a política do agente, não esta função — daí o dado subir cru e
 * a formatação acontecer na fronteira da ferramenta.
 */
export type TSaleItemShortage = { nome: string; solicitado: number; disponivel: number };

export class SaleItemResolutionError extends Error {
	override name = "SaleItemResolutionError";

	constructor(
		public readonly code: TSaleItemResolutionErrorCode,
		message: string,
		public readonly produtos: string[] = [],
		public readonly faltas: TSaleItemShortage[] = [],
	) {
		super(message);
	}
}

export type TSaleItemReference = {
	produtoId: string;
	produtoVarianteId?: string | null;
	quantidade: number;
};

export type TResolvedSaleItem = {
	produtoId: string;
	produtoVarianteId: string | null;
	nome: string;
	variacao: string | null;
	codigo: string;
	imagemUrl: string | null;
	quantidade: number;
	preco: number;
	custo: number;
	total: number;
	custoTotal: number;
};

export function resolveSaleItemCost(productCost: number | null, variantCost?: number | null): number {
	return variantCost ?? productCost ?? 0;
}

/**
 * Resolve itens de venda a partir de referências (produto + variação + quantidade).
 *
 * `validateAvailableStock` é opt-in porque esta função serve o POS, o caminho humano e o agente de
 * IA, e só o último quer que a falta de saldo derrube a operação — mesmo racional do
 * `validateSufficientStock` em `lib/stock/apply-stock-movement.ts`. Item sem rastreamento de estoque
 * nunca bloqueia: `NAO_RASTREADO` é ausência de informação, não falta.
 */
export async function resolveSaleItems({
	db,
	organizacaoId,
	itens,
	validateAvailableStock = false,
}: {
	db: TDb;
	organizacaoId: string;
	itens: TSaleItemReference[];
	validateAvailableStock?: boolean;
}): Promise<TResolvedSaleItem[]> {
	if (itens.length === 0) throw new SaleItemResolutionError("QUANTIDADE_INVALIDA", "Pelo menos um item é obrigatório.");

	for (const item of itens) {
		if (!Number.isFinite(item.quantidade) || item.quantidade <= 0) {
			throw new SaleItemResolutionError("QUANTIDADE_INVALIDA", "A quantidade dos itens deve ser positiva.");
		}
	}

	const productIds = [...new Set(itens.map((item) => item.produtoId))];
	const variantIds = [...new Set(itens.map((item) => item.produtoVarianteId).filter((id): id is string => !!id))];

	const [foundProducts, foundVariants, addOnReferences] = await Promise.all([
		db.query.products.findMany({
			where: and(eq(products.organizacaoId, organizacaoId), inArray(products.id, productIds)),
			columns: {
				id: true,
				ativo: true,
				vendavel: true,
				nome: true,
				codigo: true,
				imagemCapaUrl: true,
				precoVenda: true,
				precoCusto: true,
				quantidade: true,
				rastreamentoEstoqueAtivo: true,
				baixaEstoqueModo: true,
			},
		}),
		variantIds.length
			? db.query.productVariants.findMany({
					where: and(eq(productVariants.organizacaoId, organizacaoId), inArray(productVariants.id, variantIds)),
					columns: {
						id: true,
						produtoId: true,
						ativo: true,
						nome: true,
						codigo: true,
						imagemCapaUrl: true,
						precoVenda: true,
						precoCusto: true,
						quantidade: true,
						rastreamentoEstoqueAtivo: true,
					},
				})
			: [],
		db
			.select({
				produtoId: productAddOnReferences.produtoId,
				produtoVarianteId: productAddOnReferences.produtoVarianteId,
			})
			.from(productAddOnReferences)
			.where(
				and(
					inArray(productAddOnReferences.produtoId, productIds),
					variantIds.length
						? or(inArray(productAddOnReferences.produtoVarianteId, variantIds), isNull(productAddOnReferences.produtoVarianteId))
						: isNull(productAddOnReferences.produtoVarianteId),
				),
			),
	]);

	const productMap = new Map(foundProducts.map((product) => [product.id, product]));
	const variantMap = new Map(foundVariants.map((variant) => [variant.id, variant]));

	const resolved = itens.map((item) => {
		const product = productMap.get(item.produtoId);
		if (!product) {
			throw new SaleItemResolutionError("PRODUTO_NAO_ENCONTRADO", "Um produto não foi encontrado no catálogo da organização.");
		}
		if (!product.ativo) throw new SaleItemResolutionError("PRODUTO_INATIVO", `O produto "${product.nome}" está inativo.`, [product.nome]);
		// Insumo, material de uso interno, manutenção: produto que não se vende não entra em orçamento.
		if (!product.vendavel)
			throw new SaleItemResolutionError("PRODUTO_NAO_VENDAVEL", `O produto "${product.nome}" não está disponível para venda.`, [product.nome]);

		const variant = item.produtoVarianteId ? variantMap.get(item.produtoVarianteId) : null;
		if (item.produtoVarianteId && !variant) {
			throw new SaleItemResolutionError("VARIANTE_NAO_ENCONTRADA", `Uma variação de "${product.nome}" não foi encontrada.`, [product.nome]);
		}
		if (variant && (variant.produtoId !== product.id || !variant.ativo)) {
			throw new SaleItemResolutionError("VARIANTE_INVALIDA", `A variação informada para "${product.nome}" não está disponível.`, [product.nome]);
		}

		const hasUnsupportedAddOns = addOnReferences.some(
			(reference) =>
				reference.produtoId === product.id && (reference.produtoVarianteId === null || reference.produtoVarianteId === (variant?.id ?? null)),
		);
		if (hasUnsupportedAddOns) {
			throw new SaleItemResolutionError(
				"ADICIONAIS_NAO_SUPORTADOS",
				`O produto "${product.nome}" possui escolhas adicionais que precisam ser confirmadas pela equipe.`,
				[product.nome],
			);
		}

		const preco = variant?.precoVenda ?? product.precoVenda;
		if (preco == null) throw new SaleItemResolutionError("PRECO_AUSENTE", `O produto "${product.nome}" está sem preço de venda.`, [product.nome]);

		const custo = resolveSaleItemCost(product.precoCusto, variant?.precoCusto);

		return {
			produtoId: product.id,
			produtoVarianteId: variant?.id ?? null,
			nome: product.nome,
			variacao: variant?.nome ?? null,
			codigo: variant?.codigo || product.codigo,
			imagemUrl: variant?.imagemCapaUrl || product.imagemCapaUrl,
			quantidade: item.quantidade,
			preco,
			custo,
			total: preco * item.quantidade,
			custoTotal: custo * item.quantidade,
		};
	});

	if (validateAvailableStock) {
		const shortages = collectStockShortages({ resolved, productMap, variantMap });
		if (shortages.length > 0) {
			throw new SaleItemResolutionError(
				"ESTOQUE_INSUFICIENTE",
				`Saldo insuficiente para ${shortages.length} item(ns) do pedido.`,
				shortages.map((falta) => falta.nome),
				shortages,
			);
		}
	}

	return resolved;
}

type TStockLookup = {
	productMap: Map<
		string,
		{ quantidade: number | null; rastreamentoEstoqueAtivo: boolean | null; baixaEstoqueModo: TProductStockDeductionModeEnum | null }
	>;
	variantMap: Map<string, { quantidade: number | null; rastreamentoEstoqueAtivo: boolean | null }>;
};

/**
 * Faltas de saldo, conferidas por item **somado**: o mesmo produto pode aparecer em duas linhas, e
 * conferir linha por linha aprovaria 2 + 2 unidades de um item com 3 em estoque.
 *
 * Acumula todas as faltas em vez de parar na primeira — quem chama precisa da lista inteira para
 * resolver o pedido em uma única resposta ao cliente. Item `NAO_RASTREADO` nunca entra: ausência de
 * informação não é falta.
 */
export function collectStockShortages({ resolved, productMap, variantMap }: { resolved: TResolvedSaleItem[] } & TStockLookup): TSaleItemShortage[] {
	const requestedByKey = new Map<string, number>();
	for (const item of resolved) {
		const key = `${item.produtoId}::${item.produtoVarianteId ?? ""}`;
		requestedByKey.set(key, (requestedByKey.get(key) ?? 0) + item.quantidade);
	}

	const faltas: TSaleItemShortage[] = [];
	const seen = new Set<string>();
	for (const item of resolved) {
		const key = `${item.produtoId}::${item.produtoVarianteId ?? ""}`;
		if (seen.has(key)) continue;
		seen.add(key);

		const product = productMap.get(item.produtoId);
		if (!product) continue;
		const variant = item.produtoVarianteId ? variantMap.get(item.produtoVarianteId) : null;
		const availability = variant ? resolveVariantAvailability(variant, product) : resolveProductAvailability(product);
		if (availability.quantidade === null) continue;

		const solicitado = requestedByKey.get(key) ?? item.quantidade;
		if (solicitado > availability.quantidade) {
			const name = item.variacao ? `${item.nome} — ${item.variacao}` : item.nome;
			faltas.push({ nome: name, solicitado, disponivel: availability.quantidade });
		}
	}

	return faltas;
}

/**
 * Faltas de saldo sem bloquear a operação — o caminho de quem cria a venda e só quer avisar.
 *
 * Custa uma consulta a mais sobre itens que `resolveSaleItems` já leu. É deliberado: manter o
 * retorno de `resolveSaleItems` como uma lista simples vale mais que economizar um `SELECT` de três
 * colunas num caminho que só roda quando a organização configura o aviso.
 */
export async function findStockShortages({
	db,
	organizacaoId,
	resolved,
}: {
	db: TDb;
	organizacaoId: string;
	resolved: TResolvedSaleItem[];
}): Promise<TSaleItemShortage[]> {
	if (resolved.length === 0) return [];

	const productIds = [...new Set(resolved.map((item) => item.produtoId))];
	const variantIds = [...new Set(resolved.map((item) => item.produtoVarianteId).filter((id): id is string => !!id))];

	const [stockProducts, stockVariants] = await Promise.all([
		db.query.products.findMany({
			where: and(eq(products.organizacaoId, organizacaoId), inArray(products.id, productIds)),
			columns: { id: true, quantidade: true, rastreamentoEstoqueAtivo: true, baixaEstoqueModo: true },
		}),
		variantIds.length
			? db.query.productVariants.findMany({
					where: and(eq(productVariants.organizacaoId, organizacaoId), inArray(productVariants.id, variantIds)),
					columns: { id: true, quantidade: true, rastreamentoEstoqueAtivo: true },
				})
			: [],
	]);

	return collectStockShortages({
		resolved,
		productMap: new Map(stockProducts.map((product) => [product.id, product])),
		variantMap: new Map(stockVariants.map((variant) => [variant.id, variant])),
	});
}
