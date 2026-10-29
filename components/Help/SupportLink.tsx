"use client";

import { captureClientEvent } from "@/lib/analytics/posthog-client";
import type { ReactNode } from "react";

const HELP_SUPPORT_HREF = "https://wa.me/553492465388?text=Olá, preciso de ajuda com o RecompraCRM.";

type SupportLinkProps = {
	location: string;
	className?: string;
	children: ReactNode;
};

// Link para o suporte no WhatsApp. Mesmo evento dos demais CTAs de marketing; vai também ao
// Control como "contact".
export function SupportLink({ location, className, children }: SupportLinkProps) {
	return (
		<a
			href={HELP_SUPPORT_HREF}
			target="_blank"
			rel="noopener noreferrer"
			className={className}
			onClick={() =>
				captureClientEvent({
					event: "landing_cta_clicked",
					controlEvent: "contact",
					properties: { cta_id: "help_support", location, page: "help" },
				})
			}
		>
			{children}
		</a>
	);
}
