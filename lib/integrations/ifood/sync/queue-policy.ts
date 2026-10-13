import { isHttpError } from "http-errors";

export function isRetryableIfoodError(error: unknown) {
	return !isHttpError(error) || error.statusCode >= 500 || error.statusCode === 429 || error.statusCode === 408;
}

export class PartialCatalogPushError extends Error {
	constructor(count: number) {
		super(`${count} alteração(ões) do catálogo iFood ainda precisam de sincronização.`);
	}
}

export function assertCatalogPushComplete(result: { erros: number; errosRetentaveis?: number }) {
	const retryable = result.errosRetentaveis ?? result.erros;
	if (retryable) throw new PartialCatalogPushError(retryable);
}

export function catalogPushRetry(error: unknown, deliveryCount: number) {
	if (!isRetryableIfoodError(error) || deliveryCount >= 3) return { acknowledge: true as const };
	return { afterSeconds: 30 };
}
