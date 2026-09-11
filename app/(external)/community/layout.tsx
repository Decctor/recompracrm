import { CommunityDock } from "@/components/Community/CommunityDock";
import { getCurrentSession } from "@/lib/authentication/session";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Comunidade",
	description: "Acesse cursos, eBooks, documentos e tutoriais exclusivos para aprimorar suas habilidades em vendas e fidelização.",
	openGraph: {
		title: "Comunidade | RecompraCRM",
		description: "Acesse cursos, eBooks, documentos e tutoriais exclusivos para aprimorar suas habilidades em vendas e fidelização.",
		url: "https://www.recompracrm.com.br/community",
	},
};

export default async function CommunityLayout({ children }: { children: React.ReactNode }) {
	const session = await getCurrentSession();

	const user = session
		? {
				nome: session.user.nome,
				email: session.user.email,
				avatarUrl: session.user.avatarUrl,
			}
		: null;

	return (
		<div className="font-outfit min-h-svh bg-background text-foreground">
			<main className="min-h-svh overflow-y-auto pb-28">{children}</main>
			<CommunityDock user={user} />
		</div>
	);
}
