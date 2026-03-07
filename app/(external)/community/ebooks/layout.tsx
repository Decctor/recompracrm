import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "eBooks",
	description: "Acesse materiais de leitura exclusivos para aprofundar seu conhecimento em vendas e fidelização de clientes.",
	openGraph: {
		title: "eBooks | RecompraCRM",
		description: "Acesse materiais de leitura exclusivos para aprofundar seu conhecimento em vendas e fidelização de clientes.",
		url: "https://recompracrm.com.br/community/ebooks",
	},
};

export default function EbooksLayout({ children }: { children: React.ReactNode }) {
	return <>{children}</>;
}
