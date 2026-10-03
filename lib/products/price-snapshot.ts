// Snapshot do preço de venda anterior em produtos e variantes.
//
// Todo update de `precoVenda` em `products`/`productVariants` espalha o retorno de
// `buildPrecoVendaUpdate` no `.set(...)`. A regra mora aqui (e não num trigger) para ficar visível no
// código; o teste `price-snapshot.test.ts` varre o repositório e falha se um caminho de escrita novo
// gravar `precoVenda` sem passar pelo helper.

// Preços são reais em double precision: diferenças abaixo de meio centavo são ruído, não mudança.
const PRICE_EPSILON = 0.005;

export function isSamePrice(a: number | null | undefined, b: number | null | undefined) {
	if (a == null || b == null) return a == null && b == null;
	return Math.abs(a - b) < PRICE_EPSILON;
}

export type TPrecoVendaSnapshotState = {
	precoVenda: number | null;
	precoVendaAnterior: number | null;
};

export type TPrecoVendaUpdate<TPreco extends number | null> = {
	precoVenda: TPreco;
	precoVendaAnterior?: number | null;
	dataAlteracaoPrecoVenda?: Date;
};

/**
 * Campos a gravar quando `precoVenda` pode mudar.
 *
 * - Preço igual ao atual (escritas repetidas de sincronização): só `precoVenda`, sem snapshot.
 * - Preço diferente: o atual vira `precoVendaAnterior` e `dataAlteracaoPrecoVenda` = agora.
 * - `precoVendaAnteriorManual` (formulário do produto) vence quando difere do anterior gravado:
 *   corrige digitação (9,90 → 99,00 → 9,90 anunciaria 90% de desconto) ou define o "De" explícito.
 *   Um valor manual não nulo também reinicia a data, já que declara a promoção a partir de agora.
 *   Igual ao gravado = o formulário só reenviou o que leu, e a regra automática segue valendo.
 */
export function buildPrecoVendaUpdate<TPreco extends number | null>({
	atual,
	novoPrecoVenda,
	precoVendaAnteriorManual,
	agora = new Date(),
}: {
	atual: TPrecoVendaSnapshotState;
	novoPrecoVenda: TPreco;
	precoVendaAnteriorManual?: number | null;
	agora?: Date;
}): TPrecoVendaUpdate<TPreco> {
	const update: TPrecoVendaUpdate<TPreco> = { precoVenda: novoPrecoVenda };

	if (!isSamePrice(novoPrecoVenda, atual.precoVenda)) {
		update.precoVendaAnterior = atual.precoVenda;
		update.dataAlteracaoPrecoVenda = agora;
	}

	if (precoVendaAnteriorManual !== undefined && !isSamePrice(precoVendaAnteriorManual, atual.precoVendaAnterior)) {
		update.precoVendaAnterior = precoVendaAnteriorManual;
		if (precoVendaAnteriorManual != null) update.dataAlteracaoPrecoVenda = agora;
	}

	return update;
}
