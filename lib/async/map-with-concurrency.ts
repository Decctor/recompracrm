/**
 * `Promise.all` com teto de concorrência: no máximo `concurrency` mappers rodando ao mesmo tempo,
 * resultados na ordem de entrada. Sem dependência de servidor — vale para rota e para navegador.
 */
export async function mapWithConcurrency<TInput, TOutput>(
	items: TInput[],
	concurrency: number,
	mapper: (item: TInput, index: number) => Promise<TOutput>,
): Promise<TOutput[]> {
	const results: TOutput[] = Array.from({ length: items.length });
	const limit = Math.max(1, Math.min(Math.floor(concurrency), items.length || 1));
	let nextIndex = 0;

	async function worker() {
		while (nextIndex < items.length) {
			const index = nextIndex;
			nextIndex += 1;
			results[index] = await mapper(items[index], index);
		}
	}

	await Promise.all(Array.from({ length: limit }, () => worker()));
	return results;
}
