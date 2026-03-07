import { CommunitySidebar } from "@/components/Sidebar/CommunitySidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getCurrentSession } from "@/lib/authentication/session";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Comunidade",
	description: "Acesse cursos, eBooks, documentos e tutoriais exclusivos para aprimorar suas habilidades em vendas e fidelização.",
	openGraph: {
		title: "Comunidade | RecompraCRM",
		description: "Acesse cursos, eBooks, documentos e tutoriais exclusivos para aprimorar suas habilidades em vendas e fidelização.",
		url: "https://recompracrm.com.br/community",
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
		<SidebarProvider className="font-raleway">
			<CommunitySidebar user={user} />
			<SidebarInset className="overflow-y-auto">{children}</SidebarInset>
		</SidebarProvider>
	);
}
