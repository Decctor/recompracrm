import "@/styles/globals.css";
import ProvidersWrapper from "@/components/Providers/Wrapper";
import { cn } from "@/lib/utils";
import { GoogleTagManager } from "@next/third-parties/google";
import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Raleway } from "next/font/google";
import { Toaster } from "sonner";
const raleway = Raleway({
	subsets: ["latin"],
	variable: "--font-raleway",
});
export const metadata: Metadata = {
	metadataBase: new URL("https://recompracrm.com.br"),
	title: {
		default: "RecompraCRM",
		template: "%s | RecompraCRM",
	},
	description: "Plataforma de otimização de vendas e fidelização de clientes.",
	icons: [{ rel: "icon", url: "/icon.png" }],
	robots: { index: true, follow: true },
	openGraph: {
		type: "website",
		siteName: "RecompraCRM",
		locale: "pt_BR",
		url: "https://recompracrm.com.br",
		title: "RecompraCRM",
		description: "Plataforma de otimização de vendas e fidelização de clientes.",
		images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "RecompraCRM" }],
	},
	twitter: {
		card: "summary_large_image",
		title: "RecompraCRM",
		description: "Plataforma de otimização de vendas e fidelização de clientes.",
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
	console.log("Triggering Build");
	return (
		<html lang="pt-BR" suppressHydrationWarning>
			<body className={cn(`min-h-screen min-w-screen bg-background text-primary overflow-x-hidden antialiased font-raleway ${raleway.variable}`)}>
				<ProvidersWrapper>
					{children}
					<Toaster />
				</ProvidersWrapper>
				<Analytics />
				<GoogleTagManager gtmId="GTM-KHTDGQL4" />
			</body>
		</html>
	);
}
