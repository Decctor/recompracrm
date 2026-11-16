import { parseSpedyRetryDelayMs } from "./rate-limit";

// O sync-status observado na API usa horário de Brasília sem offset. Datas que
// já incluem Z/offset são preservadas. Nunca depender do TZ do servidor Node.
export function parseSpedySyncDate(value: unknown): Date | null {
	if (typeof value !== "string" || !value.trim()) return null;
	const raw = value.trim();
	const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw) ? `${raw}-03:00` : raw;
	if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(normalized)) return null;
	const date = new Date(normalized);
	return Number.isNaN(date.getTime()) ? null : date;
}

export function parseSpedySyncCooldown(body: unknown, retryAfter: unknown, now = Date.now()) {
	const payload = body && typeof body === "object" ? (body as { retryAfterSeconds?: unknown; nextAllowedSyncAt?: unknown }) : {};
	const headerDelay = parseSpedyRetryDelayMs(retryAfter, now);
	const bodySeconds =
		typeof payload.retryAfterSeconds === "number" && Number.isFinite(payload.retryAfterSeconds) && payload.retryAfterSeconds >= 0
			? payload.retryAfterSeconds
			: null;
	const retryAfterSeconds = headerDelay != null ? Math.ceil(headerDelay / 1000) : bodySeconds;
	// A duração explícita é a fonte preferida: não depende do fuso do timestamp.
	const nextAllowedSyncAt = retryAfterSeconds != null ? new Date(now + retryAfterSeconds * 1000) : parseSpedySyncDate(payload.nextAllowedSyncAt);
	return { retryAfterSeconds, nextAllowedSyncAt };
}
