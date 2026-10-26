"use client";

import { captureClientEvent } from "@/lib/analytics/posthog-client";
import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";

type TrackedCtaProps = Omit<ComponentPropsWithoutRef<typeof Link>, "href"> & {
	href: string;
	ctaId: string;
	location: string;
};

// Link rastreado dos CTAs das ferramentas, no mesmo evento do Dock e da landing. Links externos
// (WhatsApp) abrem em nova aba e também vão para o Control como "contact".
export function TrackedCta({ href, ctaId, location, onClick, ...props }: TrackedCtaProps) {
	const isExternal = href.startsWith("http");
	return (
		<Link
			{...props}
			href={href}
			target={isExternal ? "_blank" : undefined}
			rel={isExternal ? "noopener noreferrer" : undefined}
			onClick={(clickEvent) => {
				captureClientEvent({
					event: "landing_cta_clicked",
					controlEvent: isExternal ? "contact" : undefined,
					properties: { cta_id: ctaId, location, page: "tools" },
				});
				onClick?.(clickEvent);
			}}
		/>
	);
}
