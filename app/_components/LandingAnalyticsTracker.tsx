"use client";

import { captureClientEvent } from "@/lib/analytics/posthog-client";
import { useEffect } from "react";

const LANDING_SCROLL_DEPTH_MILESTONES = [25, 50, 75, 90] as const;
const LANDING_SECTION_IDS = ["frentes", "cashback", "erp", "resultado", "integracoes", "confianca", "planos", "faq", "contato"] as const;
const PARTNER_INDICATOR_STORAGE_KEY = "recompra_partner_indicator";

type TIdleWindow = Window &
	typeof globalThis & {
		requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
		cancelIdleCallback?: (handle: number) => void;
	};

function trackPartnerReferral(params: URLSearchParams) {
	const ref = params.get("ref")?.trim();
	if (!ref) return;

	window.localStorage.setItem(PARTNER_INDICATOR_STORAGE_KEY, ref.toUpperCase());

	void fetch("/api/platform-partners/track", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		credentials: "same-origin",
		keepalive: true,
		body: JSON.stringify({
			codigo: ref,
			origemUrl: window.location.href,
			utmSource: params.get("utm_source"),
			utmMedium: params.get("utm_medium"),
			utmCampaign: params.get("utm_campaign"),
		}),
	})
		.then((response) => {
			if (!response.ok) {
				console.error(`[WARN] [PARTNER_ATTRIBUTION] Failed to track partner referral: ${response.status}`);
			}
		})
		.catch((error: unknown) => {
			console.error("[WARN] [PARTNER_ATTRIBUTION] Failed to track partner referral:", error);
		});
}

export default function LandingAnalyticsTracker() {
	useEffect(() => {
		const idleWindow = window as TIdleWindow;
		const trackedDepthMilestones = new Set<number>();
		const trackedSections = new Set<string>();
		let animationFrameId: number | null = null;
		let idleCallbackId: number | null = null;

		const runInitialTracking = () => {
			captureClientEvent({ event: "landing_page_viewed" });
			trackPartnerReferral(new URLSearchParams(window.location.search));
		};

		if (idleWindow.requestIdleCallback) {
			idleCallbackId = idleWindow.requestIdleCallback(runInitialTracking, { timeout: 1500 });
		} else {
			idleCallbackId = window.setTimeout(runInitialTracking, 1);
		}

		const trackScrollDepth = () => {
			animationFrameId = null;
			const maxScrollable = document.documentElement.scrollHeight - window.innerHeight;
			if (maxScrollable <= 0) return;

			const scrollPercent = Math.round((window.scrollY / maxScrollable) * 100);
			for (const milestone of LANDING_SCROLL_DEPTH_MILESTONES) {
				if (scrollPercent < milestone || trackedDepthMilestones.has(milestone)) continue;

				trackedDepthMilestones.add(milestone);
				captureClientEvent({
					event: "landing_scroll_depth",
					properties: { depth_percent: milestone },
				});
			}

			if (trackedDepthMilestones.size === LANDING_SCROLL_DEPTH_MILESTONES.length) {
				window.removeEventListener("scroll", scheduleScrollDepthTracking);
			}
		};

		const scheduleScrollDepthTracking = () => {
			if (animationFrameId !== null) return;
			animationFrameId = window.requestAnimationFrame(trackScrollDepth);
		};

		window.addEventListener("scroll", scheduleScrollDepthTracking, { passive: true });
		scheduleScrollDepthTracking();

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;

					const sectionId = entry.target.id;
					if (!sectionId || trackedSections.has(sectionId)) continue;

					trackedSections.add(sectionId);
					observer.unobserve(entry.target);
					captureClientEvent({
						event: "landing_section_viewed",
						properties: { section_id: sectionId },
					});
				}

				if (trackedSections.size === LANDING_SECTION_IDS.length) observer.disconnect();
			},
			{ threshold: 0.35 },
		);

		for (const sectionId of LANDING_SECTION_IDS) {
			const element = document.getElementById(sectionId);
			if (element) observer.observe(element);
		}

		return () => {
			window.removeEventListener("scroll", scheduleScrollDepthTracking);
			observer.disconnect();
			if (animationFrameId !== null) window.cancelAnimationFrame(animationFrameId);
			if (idleCallbackId !== null) {
				if (idleWindow.cancelIdleCallback) idleWindow.cancelIdleCallback(idleCallbackId);
				else window.clearTimeout(idleCallbackId);
			}
		};
	}, []);

	return null;
}
