"use client";

import { brandLogoSource } from "@/components/Brand/BrandLogo";
import { captureClientEvent } from "@/lib/analytics/posthog-client";
import type { NavLinkProps } from "./SiteHeader";
import { SiteHeader } from "./SiteHeader";

/**
 * BrandHeader — the shared branding header for public marketing pages
 * (blog, funcionalidades, integrações, …). Built on top of {@link SiteHeader}.
 *
 * Pass your own `links` to tailor the nav per section; omit it for the default set.
 */

export const BRAND_NAV_LINKS: Pick<NavLinkProps, "href" | "label">[] = [
	{ href: "#como-funciona", label: "Como funciona" },
	{ href: "#funcionalidades", label: "Funcionalidades" },
	{ href: "/segments", label: "Segmentos" },
	{ href: "/integrations", label: "Integrações" },
	{ href: "/blog", label: "Blog" },
	{ href: "/partnerships", label: "Parcerias" },
];

const WHATSAPP_DEMO_URL = "https://wa.me/553499480791?text=Olá, gostaria de agendar uma demonstração.";

type BrandHeaderProps = {
	links?: Pick<NavLinkProps, "href" | "label">[];
};

export default function BrandHeader({ links = BRAND_NAV_LINKS }: BrandHeaderProps) {
	const trackDemoClick = (location: string) =>
		captureClientEvent({
			event: "landing_cta_clicked",
			controlEvent: "contact",
			properties: { cta_id: "navbar_agendar_demo", location },
		});

	return (
		<SiteHeader.Root>
			<SiteHeader.Bar>
				<SiteHeader.Logo src={brandLogoSource("horizontal-badge", "color-on-light")} />

				<SiteHeader.Nav>
					{links.map((link) => (
						<SiteHeader.NavLink key={link.href} {...link} />
					))}
				</SiteHeader.Nav>

				<SiteHeader.Actions>
					<SiteHeader.NavLink href="/auth/signin">Entrar</SiteHeader.NavLink>
					<SiteHeader.Cta href={WHATSAPP_DEMO_URL} external onClick={() => trackDemoClick("navbar")}>
						Agendar demo
					</SiteHeader.Cta>
				</SiteHeader.Actions>

				<SiteHeader.MobileToggle />
			</SiteHeader.Bar>

			<SiteHeader.MobileMenu>
				{links.map((link) => (
					<SiteHeader.NavLink key={link.href} {...link} />
				))}
				<SiteHeader.NavLink href="/auth/signin">Entrar</SiteHeader.NavLink>
				<SiteHeader.Cta href={WHATSAPP_DEMO_URL} external onClick={() => trackDemoClick("navbar_mobile")}>
					Agendar demo
				</SiteHeader.Cta>
			</SiteHeader.MobileMenu>
		</SiteHeader.Root>
	);
}
