/** Access token lifetime for Realtime. Short on purpose: Lucia revocation waits for expiry. */
export const REALTIME_JWT_TTL_SECONDS = 10 * 60;

/** Renew this long before `exp`, so a heartbeat never presents an expired token. */
export const REALTIME_JWT_REFRESH_SKEW_MS = 60_000;
