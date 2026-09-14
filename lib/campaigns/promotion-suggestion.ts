import type { TInteractionContextMetadados } from "@/lib/message-templates";
import type { TCampaignPromotionProduct } from "@/schemas/campaigns";
import { db } from "@/services/drizzle";
import { clients, productClientReferences } from "@/services/drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";

/**
 * Resolução do "produto sugerido da promoção" (gatilho "PROMOCAO-PRODUTOS").
 *
 * Semântica REINCIDENTE (recompra), deliberadamente diferente do cross-sell de
 * `clients.metadataProdutoSugeridoId`: ali o objetivo é descoberta e os produtos que o cliente já
 * compra são EXCLUÍDOS; aqui uma promoção é um empurrão de recompra, então esses produtos são
 * elegíveis e PREFERIDOS.
 *
 * A resolução acontece no enfileiramento (não no envio) e o resultado é congelado em
 * `interactions.metadados`, mantendo a mensagem estável mesmo que o catálogo ou as referências de
 * produto sejam recalculados antes do disparo.
 */

// Produto da campanha já hidratado com os dados de catálogo lidos uma vez por campanha.
export type TPromotionProductCandidate = {
	produtoId: string;
	nome: string;
	grupo: string | null;
	precoVenda: number | null;
	imagemCapaUrl: string | null;
	precoPromocional: number | null;
};

// Sinais de afinidade do cliente usados no ranqueamento.
export type TPromotionClientSignals = {
	produtoMaisCompradoId: string | null;
	grupoProdutoMaisComprado: string | null;
	// Valor total gasto pelo cliente em cada produto da lista promovida (janela GERAL).
	valorPorProdutoId: Map<string, number>;
};

export function createEmptyPromotionClientSignals(): TPromotionClientSignals {
	return {
		produtoMaisCompradoId: null,
		grupoProdutoMaisComprado: null,
		valorPorProdutoId: new Map(),
	};
}

/**
 * Escolhe o produto da promoção a sugerir para um cliente. Primeira regra que casar vence:
 *
 *  1. o produto favorito do cliente está na lista promovida;
 *  2. o produto da lista em que o cliente mais gastou (janela GERAL);
 *  3. um produto da lista no grupo favorito do cliente;
 *  4. o primeiro produto da lista — a ordem do array é a prioridade definida pelo usuário.
 *
 * A regra 4 garante que todo cliente resolva um produto, então a variável do template nunca
 * renderiza vazia.
 */
export function rankPromotionProductForClient({
	candidates,
	signals,
}: {
	candidates: TPromotionProductCandidate[];
	signals: TPromotionClientSignals;
}): TPromotionProductCandidate | null {
	if (candidates.length === 0) return null;

	// 1. Produto favorito do cliente presente na lista promovida.
	if (signals.produtoMaisCompradoId) {
		const favorite = candidates.find((candidate) => candidate.produtoId === signals.produtoMaisCompradoId);
		if (favorite) return favorite;
	}

	// 2. Maior valor gasto entre os produtos da lista. Empate resolvido pela ordem da lista, que
	// é estável porque `candidates` preserva a ordem configurada na campanha.
	let topSpendCandidate: TPromotionProductCandidate | null = null;
	let topSpendValue = 0;
	for (const candidate of candidates) {
		const spendValue = signals.valorPorProdutoId.get(candidate.produtoId) ?? 0;
		if (spendValue > topSpendValue) {
			topSpendValue = spendValue;
			topSpendCandidate = candidate;
		}
	}
	if (topSpendCandidate) return topSpendCandidate;

	// 3. Produto da lista no grupo favorito do cliente.
	if (signals.grupoProdutoMaisComprado) {
		const sameGroup = candidates.find((candidate) => candidate.grupo === signals.grupoProdutoMaisComprado);
		if (sameGroup) return sameGroup;
	}

	// 4. Fallback determinístico: a ordem configurada na campanha.
	return candidates[0] ?? null;
}

/** Preço efetivo do produto na promoção: a sobrescrita quando existir, senão o preço de venda. */
export function getPromotionProductEffectivePrice(candidate: TPromotionProductCandidate) {
	return candidate.precoPromocional ?? candidate.precoVenda ?? 0;
}

export function buildPromotionInteractionMetadata(candidate: TPromotionProductCandidate): TInteractionContextMetadados {
	// Produto sem preço de venda no cadastro não tem âncora de comparação: o campo fica ausente e a
	// variável renderiza vazia, em vez de afirmar "R$ 0,00" como preço original.
	const hasListPrice = candidate.precoVenda != null && candidate.precoVenda > 0;
	return {
		promocaoProdutoId: candidate.produtoId,
		promocaoProdutoNome: candidate.nome,
		...(hasListPrice ? { promocaoProdutoPrecoOriginal: candidate.precoVenda as number } : {}),
		promocaoProdutoPrecoPromocional: getPromotionProductEffectivePrice(candidate),
		promocaoProdutoImagemUrl: candidate.imagemCapaUrl ?? undefined,
	};
}

/**
 * Hidrata a lista configurada na campanha com os dados de catálogo, preservando a ordem
 * configurada (que é a prioridade de fallback). Produtos apagados ou inativados depois de salvos
 * são descartados — o chamador decide o que fazer quando sobra lista vazia.
 */
export async function loadPromotionProductCandidates({
	organizationId,
	promotionProducts,
}: {
	organizationId: string;
	promotionProducts: TCampaignPromotionProduct[];
}): Promise<TPromotionProductCandidate[]> {
	const productIds = promotionProducts.map((promotionProduct) => promotionProduct.produtoId);
	if (productIds.length === 0) return [];

	const catalogProducts = await db.query.products.findMany({
		where: (fields, { and, eq, inArray }) => and(eq(fields.organizacaoId, organizationId), inArray(fields.id, productIds)),
		columns: { id: true, nome: true, grupo: true, precoVenda: true, imagemCapaUrl: true, ativo: true },
	});
	const catalogProductById = new Map(catalogProducts.map((product) => [product.id, product]));

	return promotionProducts.flatMap((promotionProduct) => {
		const catalogProduct = catalogProductById.get(promotionProduct.produtoId);
		if (!catalogProduct || !catalogProduct.ativo) return [];
		return [
			{
				produtoId: catalogProduct.id,
				nome: catalogProduct.nome,
				grupo: catalogProduct.grupo,
				precoVenda: catalogProduct.precoVenda,
				imagemCapaUrl: catalogProduct.imagemCapaUrl,
				precoPromocional: promotionProduct.precoPromocional ?? null,
			},
		];
	});
}

/**
 * Carrega, em duas consultas indexadas, os sinais de afinidade de um lote de clientes restritos
 * aos produtos da promoção. O ranqueamento em si é feito em memória sobre no máximo
 * `clientes × produtos promovidos` linhas.
 */
export async function loadPromotionClientSignals({
	organizationId,
	clientIds,
	productIds,
}: {
	organizationId: string;
	clientIds: string[];
	productIds: string[];
}): Promise<Map<string, TPromotionClientSignals>> {
	const signalsByClientId = new Map<string, TPromotionClientSignals>();
	if (clientIds.length === 0 || productIds.length === 0) return signalsByClientId;

	const clientRows = await db
		.select({
			id: clients.id,
			metadataProdutoMaisCompradoId: clients.metadataProdutoMaisCompradoId,
			metadataGrupoProdutoMaisComprado: clients.metadataGrupoProdutoMaisComprado,
		})
		.from(clients)
		.where(and(eq(clients.organizacaoId, organizationId), inArray(clients.id, clientIds)));

	for (const clientRow of clientRows) {
		signalsByClientId.set(clientRow.id, {
			produtoMaisCompradoId: clientRow.metadataProdutoMaisCompradoId,
			grupoProdutoMaisComprado: clientRow.metadataGrupoProdutoMaisComprado,
			valorPorProdutoId: new Map(),
		});
	}

	const referenceRows = await db
		.select({
			clienteId: productClientReferences.clienteId,
			produtoId: productClientReferences.produtoId,
			totalComprasValor: productClientReferences.totalComprasValor,
		})
		.from(productClientReferences)
		.where(
			and(
				eq(productClientReferences.organizacaoId, organizationId),
				eq(productClientReferences.janela, "GERAL"),
				inArray(productClientReferences.clienteId, clientIds),
				inArray(productClientReferences.produtoId, productIds),
			),
		);

	for (const referenceRow of referenceRows) {
		const signals = signalsByClientId.get(referenceRow.clienteId) ?? createEmptyPromotionClientSignals();
		// Um produto pode ter mais de uma linha por cliente (variantes) — somamos o gasto.
		const currentValue = signals.valorPorProdutoId.get(referenceRow.produtoId) ?? 0;
		signals.valorPorProdutoId.set(referenceRow.produtoId, currentValue + (referenceRow.totalComprasValor ?? 0));
		signalsByClientId.set(referenceRow.clienteId, signals);
	}

	return signalsByClientId;
}

/**
 * Resolve o snapshot do produto sugerido para cada cliente do lote. Clientes sem qualquer sinal
 * caem no fallback de ordem da lista, então o mapa cobre todos os `clientIds`.
 */
export async function resolvePromotionMetadataByClientId({
	organizationId,
	clientIds,
	candidates,
}: {
	organizationId: string;
	clientIds: string[];
	candidates: TPromotionProductCandidate[];
}): Promise<Map<string, TInteractionContextMetadados>> {
	const metadataByClientId = new Map<string, TInteractionContextMetadados>();
	if (clientIds.length === 0 || candidates.length === 0) return metadataByClientId;

	const signalsByClientId = await loadPromotionClientSignals({
		organizationId,
		clientIds,
		productIds: candidates.map((candidate) => candidate.produtoId),
	});

	for (const clientId of clientIds) {
		const signals = signalsByClientId.get(clientId) ?? createEmptyPromotionClientSignals();
		const suggestedProduct = rankPromotionProductForClient({ candidates, signals });
		if (!suggestedProduct) continue;
		metadataByClientId.set(clientId, buildPromotionInteractionMetadata(suggestedProduct));
	}

	return metadataByClientId;
}
