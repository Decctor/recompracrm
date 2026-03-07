import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "RecompraCRM — Plataforma de Vendas e Fidelização",
	description:
		"Conheça o RecompraCRM: a plataforma que ajuda seu negócio a aumentar recompras, fidelizar clientes e impulsionar vendas com campanhas inteligentes e gestão de cashback.",
	openGraph: {
		title: "RecompraCRM — Plataforma de Vendas e Fidelização",
		description:
			"Conheça o RecompraCRM: a plataforma que ajuda seu negócio a aumentar recompras, fidelizar clientes e impulsionar vendas com campanhas inteligentes e gestão de cashback.",
		url: "https://recompracrm.com.br/presentation",
	},
};

export default function PresentationLayout({ children }: { children: React.ReactNode }) {
	return <>{children}</>;
}
