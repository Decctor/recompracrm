/**
 * `Promise.all` que só rejeita depois que todas as promessas assentaram, relançando a primeira
 * falha **na ordem dos argumentos** (não na ordem de chegada).
 *
 * Para paralelizar etapas independentes com efeito colateral sem mudar o contrato de erro: com
 * `Promise.all` a rejeição de uma etapa devolve o controle enquanto as outras ainda gravam — sob
 * `waitUntil` elas podem ser congeladas no meio, e o chamador já registrou o desfecho.
 */
export async function settleAll<T extends readonly unknown[] | []>(promises: T): Promise<{ -readonly [K in keyof T]: Awaited<T[K]> }> {
	const results = await Promise.allSettled(promises);
	for (const result of results) {
		if (result.status === "rejected") throw result.reason;
	}
	return results.map((result) => (result as PromiseFulfilledResult<unknown>).value) as { -readonly [K in keyof T]: Awaited<T[K]> };
}
