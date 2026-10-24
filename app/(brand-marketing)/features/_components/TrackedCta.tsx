"use client";

import { captureClientEvent } from "@/lib/analytics/posthog-client";
import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";
import { FEATURE_CTA_EVENT, SIGNUP_HREF } from "./feature-links";

type TrackedCtaProps = Omit<ComponentPropsWithoutRef<typeof Link>, "href"> & {
	href: string;
	ctaId: string;
	location: string;
	slug: string;
};

// Link rastreado dos CTAs das páginas de funcionalidade. WhatsApp abre em nova aba e vai para o
// Control como "contact"; o teste grátis vai como "lead". Âncoras internas só entram no PostHog.
export function TrackedCta({ href, ctaId, location, slug, onClick, ...props }: TrackedCtaProps) {
	const isExternal = href.startsWith("http");
	const controlEvent = isExternal ? "contact" : href === SIGNUP_HREF ? "lead" : undefined;
	return (
		<Link
			{...props}
			href={href}
			target={isExternal ? "_blank" : undefined}
			rel={isExternal ? "noopener noreferrer" : undefined}
			onClick={(clickEvent) => {
				captureClientEvent({
					event: FEATURE_CTA_EVENT,
					controlEvent,
					properties: { cta_id: ctaId, location, page: "feature", feature_slug: slug },
				});
				onClick?.(clickEvent);
			}}
		/>
	);
}
