/**
 * Sem dependência de banco: telas do cliente importam daqui. `valuation.ts` reexporta, mas carrega o
 * cliente do Postgres — importá-lo num componente de cliente quebra o build (`tls` não existe no browser).
 */

/** Quantidade que vale para valoração: a real quando já informada, senão a prevista. */
export function getProductionItemQuantity(item: { quantidadePrevista: number | null; quantidadeReal: number | null }) {
	return item.quantidadeReal ?? item.quantidadePrevista ?? 0;
}
