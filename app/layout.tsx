import "@/styles/globals.css";
import { MarketingTrackingScript } from "@/components/Marketing/MarketingTrackingScript";
import ProvidersWrapper from "@/components/Providers/Wrapper";
import { cn } from "@/lib/utils";
import { GoogleTagManager } from "@next/third-parties/google";
import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { Toaster } from "sonner";
// Outfit no lugar da Raleway: a Raleway não tem a feature `tnum`, então `tabular-nums` era letra
// morta e os dígitos seguiam com larguras diferentes (o "1" da Raleway mede metade do "0"). A
// Outfit traz `tnum` de verdade — todo dígito vai para uma variante `.tf` de largura igual. Ver o
// utilitário `text-numeric` em `styles/globals.css` e DESIGN.md §3.
const outfit = Outfit({
	subsets: ["latin"],
	variable: "--font-outfit",
});
const siteTitle = "RecompraCRM | CRM de Fidelização para Lojas";
const siteMetaDescription =
	"RecompraCRM é o sistema de fidelização com cashback automático para lojas físicas. Faça seus clientes voltarem com WhatsApp, CRM e relatórios inteligentes. Teste grátis!";
const siteOgDescription =
	"Sistema de fidelização com cashback automático para lojas físicas. Seus clientes voltam com RecompraCRM — CRM simples, WhatsApp integrado e relatórios em tempo real.";

export const metadata: Metadata = {
	metadataBase: new URL("https://www.recompracrm.com.br"),
	title: {
		default: siteTitle,
		template: "%s | RecompraCRM",
	},
	description: siteMetaDescription,
	icons: [{ rel: "icon", url: "/icon.png" }],
	robots: { index: true, follow: true },
	openGraph: {
		type: "website",
		siteName: "RecompraCRM",
		locale: "pt_BR",
		url: "https://www.recompracrm.com.br",
		title: siteTitle,
		description: siteOgDescription,
		images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "RecompraCRM" }],
	},
	twitter: {
		card: "summary_large_image",
		title: siteTitle,
		description: siteOgDescription,
		images: ["/og-image.png"],
	},
};

export const viewport: Viewport = {
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "white" },
		{ media: "(prefers-color-scheme: dark)", color: "black" },
	],
	interactiveWidget: "resizes-content",
};

const organizationJsonLd = {
	"@context": "https://schema.org",
	"@type": "Organization",
	name: "RecompraCRM",
	url: "https://www.recompracrm.com.br",
	logo: "https://www.recompracrm.com.br/logo.png",
	description: siteMetaDescription,
	sameAs: ["https://www.instagram.com/recompracrm/", "https://www.linkedin.com/company/recompracrm/"],
};

const websiteJsonLd = {
	"@context": "https://schema.org",
	"@type": "WebSite",
	name: "RecompraCRM",
	url: "https://www.recompracrm.com.br",
	inLanguage: "pt-BR",
	publisher: {
		"@type": "Organization",
		name: "RecompraCRM",
		url: "https://www.recompracrm.com.br",
	},
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	console.log("Running");
	return (
		<html lang="pt-BR" suppressHydrationWarning>
			<body className={cn(`min-h-dvh min-w-screen bg-background text-foreground overflow-x-hidden antialiased font-outfit ${outfit.variable}`)}>
				{/* JSON-LD — Organization + WebSite (reconhecimento de entidade por IA) */}
				<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([organizationJsonLd, websiteJsonLd]) }} />
				<ProvidersWrapper>
					{children}
					<Toaster position="bottom-right" visibleToasts={4} gap={12} />
				</ProvidersWrapper>
				<MarketingTrackingScript />
				<Analytics />
				<GoogleTagManager gtmId="GTM-KHTDGQL4" />
			</body>
		</html>
	);
}
