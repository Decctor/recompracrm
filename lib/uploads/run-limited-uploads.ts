type TRunLimitedUploadsParams<TInput, TResult> = {
	items: TInput[];
	limit: number;
	task: (item: TInput, index: number) => Promise<TResult>;
};

export async function runLimitedUploads<TInput, TResult>({
	items,
	limit,
	task,
}: TRunLimitedUploadsParams<TInput, TResult>) {
	if (items.length === 0) return [];
	const normalizedLimit = Math.max(1, Math.floor(limit));
	const results = new Array<TResult>(items.length);
	let nextIndex = 0;

	async function worker() {
		while (nextIndex < items.length) {
			const currentIndex = nextIndex;
			nextIndex += 1;
			results[currentIndex] = await task(items[currentIndex], currentIndex);
		}
	}

	const workers = Array.from({ length: Math.min(normalizedLimit, items.length) }, () => worker());
	await Promise.all(workers);
	return results;
}
