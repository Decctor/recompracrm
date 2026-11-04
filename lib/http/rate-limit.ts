/**
 * Ritmo e nova tentativa para APIs de terceiros com limite por segundo (Meta Cloud API, Resend).
 *
 * O limitador é por processo: workers em instâncias diferentes não se enxergam, então quem o usa
 * divide o orçamento do provedor pelo número de workers. O que escapa disso (outra organização
 * disparando ao mesmo tempo, outra instância) é absorvido pela nova tentativa com espera.
 */

type TClock = { now: () => number; sleep: (ms: number) => Promise<void> };

const realClock: TClock = {
	now: () => Date.now(),
	sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export type TIntervalLimiter = { acquire: () => Promise<void> };

/**
 * Espaça as chamadas em 1000/ratePerSecond ms. Cada `acquire` reserva o próximo horário livre na
 * hora da chamada (síncrono), então chamadas concorrentes recebem horários distintos em ordem.
 */
export function createIntervalLimiter({ ratePerSecond, clock = realClock }: { ratePerSecond: number; clock?: TClock }): TIntervalLimiter {
	const intervalMs = 1000 / Math.max(ratePerSecond, 0.001);
	let nextSlotAt = 0;
	return {
		acquire: async () => {
			const now = clock.now();
			const slotAt = Math.max(now, nextSlotAt);
			nextSlotAt = slotAt + intervalMs;
			if (slotAt > now) await clock.sleep(slotAt - now);
		},
	};
}

/** Um limitador por chave (ex.: um por número de WhatsApp), criado sob demanda. */
export function createKeyedIntervalLimiter({ ratePerSecond, clock = realClock }: { ratePerSecond: number; clock?: TClock }) {
	const limiters = new Map<string, TIntervalLimiter>();
	return {
		acquire: (key: string) => {
			let limiter = limiters.get(key);
			if (!limiter) {
				limiter = createIntervalLimiter({ ratePerSecond, clock });
				limiters.set(key, limiter);
			}
			return limiter.acquire();
		},
	};
}

export type TRateLimitRetryDecision = { retry: false } | { retry: true; retryAfterMs?: number | null };

/**
 * Executa `run` e repete enquanto `classify` disser que o resultado (ou o erro lançado) é limite
 * de taxa, até `maxAttempts` tentativas. Espera o `retryAfterMs` do provedor quando houver; senão
 * recuo exponencial com jitter a partir de `baseDelayMs`. Esgotadas as tentativas, devolve o
 * último resultado ou relança o último erro — quem chama decide o que fazer com a recusa.
 */
export async function withRateLimitRetry<T>({
	run,
	classify,
	maxAttempts = 3,
	baseDelayMs = 1000,
	maxDelayMs = 10_000,
	clock = realClock,
	random = Math.random,
}: {
	run: () => Promise<T>;
	classify: (outcome: { result: T } | { error: unknown }) => TRateLimitRetryDecision;
	maxAttempts?: number;
	baseDelayMs?: number;
	maxDelayMs?: number;
	clock?: TClock;
	random?: () => number;
}): Promise<T> {
	for (let attempt = 1; ; attempt++) {
		let outcome: { result: T } | { error: unknown };
		try {
			outcome = { result: await run() };
		} catch (error) {
			outcome = { error };
		}
		const decision = classify(outcome);
		if (!decision.retry || attempt >= maxAttempts) {
			if ("error" in outcome) throw outcome.error;
			return outcome.result;
		}
		const backoffMs = baseDelayMs * 2 ** (attempt - 1) * (0.75 + random() * 0.5);
		await clock.sleep(Math.min(decision.retryAfterMs ?? backoffMs, maxDelayMs));
	}
}

/** `retry-after` em segundos (ou data HTTP) → ms; null se ausente ou inválido. */
export function parseRetryAfterHeader(value: string | null | undefined, now: number = Date.now()): number | null {
	if (!value) return null;
	const seconds = Number(value);
	if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
	const date = Date.parse(value);
	return Number.isFinite(date) ? Math.max(0, date - now) : null;
}
