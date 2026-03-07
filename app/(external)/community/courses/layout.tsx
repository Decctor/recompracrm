import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Cursos",
	description: "Explore todos os cursos disponíveis e impulsione seu conhecimento em vendas, fidelização e gestão comercial.",
	openGraph: {
		title: "Cursos | RecompraCRM",
		description: "Explore todos os cursos disponíveis e impulsione seu conhecimento em vendas, fidelização e gestão comercial.",
		url: "https://recompracrm.com.br/community/courses",
	},
};

export default function CoursesLayout({ children }: { children: React.ReactNode }) {
	return <>{children}</>;
}
