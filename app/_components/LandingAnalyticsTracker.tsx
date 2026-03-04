"use client";

import { captureClientEvent } from "@/lib/analytics/posthog-client";
import { useEffect, useRef } from "react";

const LANDING_SCROLL_DEPTH_MILESTONES = [25, 50, 75, 90] as const;
const LANDING_SECTION_IDS = ["funcionalidades", "plataforma", "campanhas", "planos", "contato"] as const;

export default function LandingAnalyticsTracker() {
	const trackedDepthMilestones = useRef<Set<number>>(new Set());
	const trackedSections = useRef<Set<string>>(new Set());

	useEffect(() => {
		captureClientEvent({
			event: "landing_page_viewed",
		});
	}, []);

	useEffect(() => {
		const handleScroll = () => {
			const scrollTop = window.scrollY;
			const documentHeight = document.documentElement.scrollHeight;
			const viewportHeight = window.innerHeight;
			const maxScrollable = documentHeight - viewportHeight;
			if (maxScrollable <= 0) return;

			const scrollPercent = Math.round((scrollTop / maxScrollable) * 100);

			for (const milestone of LANDING_SCROLL_DEPTH_MILESTONES) {
				if (scrollPercent >= milestone && !trackedDepthMilestones.current.has(milestone)) {
					trackedDepthMilestones.current.add(milestone);
					captureClientEvent({
						event: "landing_scroll_depth",
						properties: {
							depth_percent: milestone,
						},
					});
				}
			}
		};

		window.addEventListener("scroll", handleScroll, { passive: true });
		handleScroll();

		return () => window.removeEventListener("scroll", handleScroll);
	}, []);

	useEffect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;

					const sectionId = entry.target.id;
					if (!sectionId || trackedSections.current.has(sectionId)) continue;

					trackedSections.current.add(sectionId);
					captureClientEvent({
						event: "landing_section_viewed",
						properties: {
							section_id: sectionId,
						},
					});
				}
			},
			{ threshold: 0.35 },
		);

		const trackedElements = LANDING_SECTION_IDS.map((sectionId) => document.getElementById(sectionId)).filter(
			(element): element is HTMLElement => !!element,
		);

		for (const element of trackedElements) {
			observer.observe(element);
		}

		return () => observer.disconnect();
	}, []);

	return null;
}
