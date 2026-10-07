export const CAMPAIGN_EVENTS_TOPIC = "campaign-events";

/**
 * Events are never backfilled: a pending event older than this is discarded by the worker, and an
 * older pending event past this age no longer holds back the customer's newer events.
 */
export const CAMPAIGN_EVENT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** A handler that keeps throwing (unsupported version, malformed payload) is discarded after this many attempts. */
export const CAMPAIGN_EVENT_MAX_ATTEMPTS = 10;

let disabledWarningLogged = false;

/**
 * Kill switch for the whole campaign pipeline, not just capture: every trigger type (purchase,
 * RFM, birthday, expiring cashback, worst day, scheduled/recurring and manual resend) enters
 * through events, and there is no legacy direct-dispatch fallback. Disabling it stops all
 * campaign sending for the affected organizations.
 */
export function isCampaignEventCaptureEnabled(organizationId?: string) {
	if (process.env.CAMPAIGN_EVENTS_ENABLED === "false") {
		if (!disabledWarningLogged) {
			disabledWarningLogged = true;
			console.warn("[CAMPAIGN_EVENTS] CAMPAIGN_EVENTS_ENABLED=false: nenhuma campanha será capturada nem enviada enquanto a chave estiver desligada.");
		}
		return false;
	}
	const organizations =
		process.env.CAMPAIGN_EVENTS_ORGANIZATIONS?.split(",")
			.map((value) => value.trim())
			.filter(Boolean) ?? [];
	return !organizationId || organizations.length === 0 || organizations.includes(organizationId);
}
