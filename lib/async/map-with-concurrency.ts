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

/**
 * Como `mapWithConcurrency`, mas só rejeita depois que todo mapper em andamento terminou: após a
 * primeira falha nenhum item novo é iniciado, os que já rodavam são aguardados e então a primeira
 * falha é relançada. Use quando os mappers têm efeito colateral que o chamador desfaz no `catch` —
 * com `mapWithConcurrency` um mapper ainda em voo concluiria depois da limpeza e ficaria órfão.
 */
export async function mapWithConcurrencySettled<TInput, TOutput>(
	items: TInput[],
	concurrency: number,
	mapper: (item: TInput, index: number) => Promise<TOutput>,
): Promise<TOutput[]> {
	const results: TOutput[] = Array.from({ length: items.length });
	const limit = Math.max(1, Math.min(Math.floor(concurrency), items.length || 1));
	let nextIndex = 0;
	let failure: { error: unknown } | null = null;

	async function worker() {
		while (!failure && nextIndex < items.length) {
			const index = nextIndex;
			nextIndex += 1;
			try {
				results[index] = await mapper(items[index], index);
			} catch (error) {
				failure ??= { error };
			}
		}
	}

	await Promise.all(Array.from({ length: limit }, () => worker()));
	if (failure) throw (failure as { error: unknown }).error;
	return results;
}
