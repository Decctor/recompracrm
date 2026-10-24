"use client";

import { captureClientEvent } from "@/lib/analytics/posthog-client";
import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";

type TrackedLinkProps = Omit<ComponentPropsWithoutRef<typeof Link>, "href"> & {
	href: string;
	ctaId: string;
	location: string;
	page: string;
};

// Mesmo evento do Dock, da landing e do ERP, para que os CTAs das integrações entrem no mesmo funil.
// Links externos (WhatsApp) abrem em nova aba e também vão para o Control como "contact".
export function TrackedLink({ href, ctaId, location, page, onClick, ...props }: TrackedLinkProps) {
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
					properties: { cta_id: ctaId, location, page },
				});
				onClick?.(clickEvent);
			}}
		/>
	);
}
