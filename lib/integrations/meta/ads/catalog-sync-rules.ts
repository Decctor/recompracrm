import { MEDIA_AD_NAME_HISTORY_LIMIT, type TMediaAdNameHistory } from "@/schemas/media-ads";

/** Regras puras da sincronização do catálogo, separadas para teste. */

/** Uma completa por dia; as do cron no meio do caminho são incrementais. */
const FULL_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type TMediaAdsSyncMode = "auto" | "full" | "incremental";

export function resolveSyncMode(params: {
	requested: TMediaAdsSyncMode;
	lastFullAt: string | null | undefined;
	lastSuccessAt: Date | null | undefined;
	now: Date;
}): "full" | "incremental" {
	if (!params.lastFullAt || !params.lastSuccessAt) return "full";
	if (params.requested !== "auto") return params.requested;
	return params.now.getTime() - Date.parse(params.lastFullAt) >= FULL_SYNC_INTERVAL_MS ? "full" : "incremental";
}

export const normalizeName = (value?: string | null) => value?.trim().toLowerCase() ?? "";

/** Acrescenta o nome antigo ao histórico quando ele mudou. O histórico guarda o nome normalizado, que é o formato da busca. */
export function appendPreviousName(
	history: TMediaAdNameHistory,
	key: keyof TMediaAdNameHistory,
	previous: string | null | undefined,
	next: string | null | undefined,
): TMediaAdNameHistory {
	const old = normalizeName(previous);
	if (!old || old === normalizeName(next) || history[key]?.includes(old)) return history;
	return { ...history, [key]: [...(history[key] ?? []), old].slice(-MEDIA_AD_NAME_HISTORY_LIMIT) };
}
