import type { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from "axios";
import dayjs from "dayjs";

/**
 * Retry com backoff exponencial nas chamadas à API do iFood — requisito de homologação: erros
 * `5xx` são re-tentados e o `Retry-After` do `429` é respeitado.
 *
 * `5xx` e falha de rede/timeout só são re-tentados em métodos idempotentes: um POST que estourou no
 * servidor pode ter sido aplicado antes de falhar, e repetir criaria uma pausa duplicada. `429` é
 * seguro em qualquer método — a requisição foi recusada pelo rate limit antes de ser processada.
 *
 * O refresh de token fica de fora de propósito: o iFood rotaciona o refresh token a cada uso, então
 * repetir um POST de refresh que já foi aplicado invalidaria a conexão da organização.
 */

/** Tentativas extras após a original — 3 requisições no total, no pior caso. */
const IFOOD_MAX_RETRIES = 2;
const IFOOD_RETRY_BASE_DELAY_MS = 1000;
/** Teto de espera por tentativa: uma rota do app não pode ficar pendurada no `Retry-After` do iFood. */
const IFOOD_RETRY_MAX_DELAY_MS = 30_000;
const IFOOD_IDEMPOTENT_METHODS = new Set(["get", "head", "options", "put", "delete"]);

type TIfoodRetryRequestConfig = InternalAxiosRequestConfig & { ifoodRetryAttempt?: number };

function sleep(milliseconds: number) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** `Retry-After` chega em segundos ou como data HTTP; os dois viram milissegundos de espera. */
export function parseRetryAfterMs(retryAfter: unknown): number | null {
	if (typeof retryAfter !== "string" && typeof retryAfter !== "number") return null;
	const raw = String(retryAfter).trim();
	if (!raw) return null;

	const seconds = Number(raw);
	if (Number.isFinite(seconds)) return Math.max(seconds, 0) * 1000;

	const date = dayjs(raw);
	if (!date.isValid()) return null;
	return Math.max(date.diff(dayjs(), "milliseconds"), 0);
}

/** Backoff exponencial: 1s, 2s, 4s... limitado a `maxDelayMs` (`IFOOD_RETRY_MAX_DELAY_MS` por padrão). */
export function getIfoodBackoffMs(attempt: number, maxDelayMs: number = IFOOD_RETRY_MAX_DELAY_MS) {
	return Math.min(IFOOD_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), maxDelayMs);
}

/**
 * Orçamento de retentativas. O padrão atende rotas do app (homologação: 3 tentativas, `Retry-After`
 * até 30s). O polling do cron, que roda a cada 30s dentro de uma função com `maxDuration` de 25s,
 * usa um orçamento menor: uma pausa de 30s ali é uma invocação inteira cobrada e depois abortada,
 * enquanto o próximo ciclo repete a chamada de graça.
 */
export type TIfoodRetryOptions = {
	/** Tentativas extras após a original. */
	maxRetries?: number;
	/** Teto de espera por tentativa, inclusive para o `Retry-After` do 429. */
	maxDelayMs?: number;
};

export function shouldRetryIfoodRequest({ status, method, code }: { status: number | null; method: string; code?: string }) {
	// Cancelamento é decisão de quem chamou, não falha do iFood.
	if (code === "ERR_CANCELED") return false;
	if (status === 429) return true;
	// Sem status = timeout ou rede caindo. Vale a mesma regra do 5xx: a requisição pode ter chegado
	// ao iFood e sido aplicada antes de a conexão morrer, então só repetimos o que é idempotente.
	if (status === null) return IFOOD_IDEMPOTENT_METHODS.has(method);
	return status >= 500 && IFOOD_IDEMPOTENT_METHODS.has(method);
}

/** Instala o interceptor de retry no client autenticado. Devolve o mesmo client, para encadear. */
export function attachIfoodRetry(client: AxiosInstance, options: TIfoodRetryOptions = {}): AxiosInstance {
	const maxRetries = options.maxRetries ?? IFOOD_MAX_RETRIES;
	const maxDelayMs = options.maxDelayMs ?? IFOOD_RETRY_MAX_DELAY_MS;
	client.interceptors.response.use(undefined, async (error: AxiosError) => {
		const config = error.config as TIfoodRetryRequestConfig | undefined;
		if (!config) throw error;

		const status = error.response?.status ?? null;
		const method = (config.method ?? "get").toLowerCase();
		if (!shouldRetryIfoodRequest({ status, method, code: error.code })) throw error;

		const attempt = (config.ifoodRetryAttempt ?? 0) + 1;
		if (attempt > maxRetries) throw error;
		config.ifoodRetryAttempt = attempt;

		const retryAfterMs = status === 429 ? parseRetryAfterMs(error.response?.headers?.["retry-after"]) : null;
		const waitMs = Math.min(retryAfterMs ?? getIfoodBackoffMs(attempt, maxDelayMs), maxDelayMs);

		console.warn(
			`[IFOOD] ${status ?? error.code ?? "sem resposta"} em ${method.toUpperCase()} ${config.url ?? ""} — retentativa ${attempt}/${maxRetries} em ${waitMs}ms.`,
		);
		await sleep(waitMs);
		return client.request(config);
	});

	return client;
}
