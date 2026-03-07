import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Tutoriais",
	description: "Tutoriais passo a passo para aprender na prática como usar o RecompraCRM e maximizar seus resultados.",
	openGraph: {
		title: "Tutoriais | RecompraCRM",
		description: "Tutoriais passo a passo para aprender na prática como usar o RecompraCRM e maximizar seus resultados.",
		url: "https://recompracrm.com.br/community/tutorials",
	},
};

export default function TutorialsLayout({ children }: { children: React.ReactNode }) {
	return <>{children}</>;
}
