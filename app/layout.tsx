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
	title: {
		default: "RecompraCRM",
		template: "RecompraCRM",
	},
	description: "Plataforma de otimização de vendas.",
	icons: [{ rel: "icon", url: "/icon.png" }],
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
