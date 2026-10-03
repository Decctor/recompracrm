// Snapshot do preço de venda anterior em produtos e variantes.
//
// Todo update de `precoVenda` em `products`/`productVariants` espalha o retorno de
// `buildSalePriceUpdate` no `.set(...)`. A regra mora aqui (e não num trigger) para ficar visível no
// código; o teste `price-snapshot.test.ts` varre o repositório e falha se um caminho de escrita novo
// gravar `precoVenda` sem passar pelo helper.

// Preços são reais em double precision: diferenças abaixo de meio centavo são ruído, não mudança.
const PRICE_EPSILON = 0.005;

export function isSamePrice(a: number | null | undefined, b: number | null | undefined) {
	if (a == null || b == null) return a == null && b == null;
	return Math.abs(a - b) < PRICE_EPSILON;
}

export type TSalePriceState = {
	precoVenda: number | null;
	precoVendaAnterior: number | null;
};

export type TSalePriceUpdate<TPreco extends number | null> = {
	precoVenda: TPreco;
	precoVendaAnterior?: number | null;
	dataAlteracaoPrecoVenda?: Date;
};

/**
 * Campos a gravar quando `precoVenda` pode mudar.
 *
 * - `next.precoVenda` ausente (`undefined`): o chamador não pretende mexer no preço — nem `precoVenda`
 *   nem o snapshot automático são gravados. Seções do cadastro que não editam preço omitem o campo;
 *   reenviar o valor lido no carregamento da página reverteria uma mudança feita nesse meio-tempo
 *   (sincronização, outro usuário) e o snapshot inventaria uma promoção "De / Por".
 * - Preço igual ao atual (escritas repetidas de sincronização): só `precoVenda`, sem snapshot.
 * - Preço diferente: o atual vira `precoVendaAnterior` e `dataAlteracaoPrecoVenda` = agora.
 * - `next.precoVendaAnterior` (formulário do produto) vence quando difere do anterior gravado:
 *   corrige digitação (9,90 → 99,00 → 9,90 anunciaria 90% de desconto) ou define o "De" explícito.
 *   Um valor manual não nulo também reinicia a data, já que declara a promoção a partir de agora.
 *   Igual ao gravado = o formulário só reenviou o que leu, e a regra automática segue valendo.
 *   Ausente (`undefined`) = só a regra automática.
 */
export function buildSalePriceUpdate<TPreco extends number | null>(args: {
	current: TSalePriceState;
	next: { precoVenda: TPreco; precoVendaAnterior?: number | null };
	now?: Date;
}): TSalePriceUpdate<TPreco>;
export function buildSalePriceUpdate<TPreco extends number | null>(args: {
	current: TSalePriceState;
	next: { precoVenda?: TPreco; precoVendaAnterior?: number | null };
	now?: Date;
}): Partial<TSalePriceUpdate<TPreco>>;
export function buildSalePriceUpdate<TPreco extends number | null>({
	current,
	next,
	now = new Date(),
}: {
	current: TSalePriceState;
	next: { precoVenda?: TPreco; precoVendaAnterior?: number | null };
	now?: Date;
}): Partial<TSalePriceUpdate<TPreco>> {
	const update: Partial<TSalePriceUpdate<TPreco>> = {};

	if (next.precoVenda !== undefined) {
		update.precoVenda = next.precoVenda;
		if (!isSamePrice(next.precoVenda, current.precoVenda)) {
			update.precoVendaAnterior = current.precoVenda;
			update.dataAlteracaoPrecoVenda = now;
		}
	}

	if (next.precoVendaAnterior !== undefined && !isSamePrice(next.precoVendaAnterior, current.precoVendaAnterior)) {
		update.precoVendaAnterior = next.precoVendaAnterior;
		if (next.precoVendaAnterior != null) update.dataAlteracaoPrecoVenda = now;
	}

	return update;
}
