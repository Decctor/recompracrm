import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Documentos",
	description: "Documentação técnica, guias, planilhas, templates e checklists para apoiar sua operação comercial.",
	openGraph: {
		title: "Documentos | RecompraCRM",
		description: "Documentação técnica, guias, planilhas, templates e checklists para apoiar sua operação comercial.",
		url: "https://recompracrm.com.br/community/documents",
	},
};

export default function DocumentsLayout({ children }: { children: React.ReactNode }) {
	return <>{children}</>;
}
