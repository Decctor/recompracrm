import type { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from "axios";

// A Spedy documenta 60 requisicoes/minuto e no maximo 5/segundo por chave. Um intervalo
// conservador de 1,1s respeita as duas janelas e deixa margem para variacao de relogio/rede.
export const SPEDY_REQUEST_INTERVAL_MS = 1_100;
const SPEDY_MAX_429_RETRIES = 2;
const SPEDY_RETRY_BASE_DELAY_MS = 2_000;
const SPEDY_RETRY_MAX_DELAY_MS = 30_000;

declare module "axios" {
	interface AxiosRequestConfig {
		// 429 que e janela de negocio (ex.: sync da SEFAZ), nao excesso de requisicoes: o chamador
		// trata a recusa, entao a retentativa so atrasaria a mesma resposta.
		spedySkip429Retry?: boolean;
	}
}

type TSpedyRetryRequestConfig = InternalAxiosRequestConfig & { spedy429RetryAttempt?: number };

const nextRequestAtByApiKey = new Map<string, number>();

function sleep(milliseconds: number) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Reserva atomicamente, dentro da instancia Node, o proximo slot permitido para uma chave. */
export function reserveSpedyRequestSlot(apiKey: string, now = Date.now()) {
	const scheduledAt = Math.max(now, nextRequestAtByApiKey.get(apiKey) ?? now);
	nextRequestAtByApiKey.set(apiKey, scheduledAt + SPEDY_REQUEST_INTERVAL_MS);
	return Math.max(scheduledAt - now, 0);
}

export function parseSpedyRetryDelayMs(value: unknown, now = Date.now()): number | null {
	if (typeof value !== "string" && typeof value !== "number") return null;
	const raw = String(value).trim();
	if (!raw) return null;

	const numeric = Number(raw);
	if (Number.isFinite(numeric)) {
		// Retry-After normalmente e uma duracao em segundos. Valores com cara de epoch sao tratados
		// como instante absoluto para tambem aceitar o x-rate-limit-reset da Spedy.
		if (numeric > 10_000_000_000) return Math.max(numeric - now, 0);
		if (numeric > 1_000_000_000) return Math.max(numeric * 1000 - now, 0);
		return Math.max(numeric, 0) * 1000;
	}

	const date = Date.parse(raw);
	return Number.isNaN(date) ? null : Math.max(date - now, 0);
}

function get429WaitMs(error: AxiosError, attempt: number) {
	const headers = error.response?.headers;
	const providerDelay = parseSpedyRetryDelayMs(headers?.["retry-after"]) ?? parseSpedyRetryDelayMs(headers?.["x-rate-limit-reset"]);
	return Math.min(providerDelay ?? SPEDY_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), SPEDY_RETRY_MAX_DELAY_MS);
}

export function attachSpedyRateLimit(client: AxiosInstance, apiKey: string): AxiosInstance {
	client.interceptors.request.use(async (config) => {
		const waitMs = reserveSpedyRequestSlot(apiKey);
		if (waitMs > 0) await sleep(waitMs);
		return config;
	});

	client.interceptors.response.use(undefined, async (error: AxiosError) => {
		const config = error.config as TSpedyRetryRequestConfig | undefined;
		if (!config || config.spedySkip429Retry || error.response?.status !== 429) throw error;

		const attempt = (config.spedy429RetryAttempt ?? 0) + 1;
		if (attempt > SPEDY_MAX_429_RETRIES) throw error;
		config.spedy429RetryAttempt = attempt;

		const waitMs = get429WaitMs(error, attempt);
		console.warn(
			`[SPEDY] Rate limit em ${(config.method ?? "get").toUpperCase()} ${config.url ?? ""}; retentativa ${attempt}/${SPEDY_MAX_429_RETRIES} em ${waitMs}ms.`,
		);
		await sleep(waitMs);
		return client.request(config);
	});

	return client;
}

export function resetSpedyRateLimitForTests() {
	nextRequestAtByApiKey.clear();
}
