import AppHeader from "@/components/Layouts/HeaderApp";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { ActivationPanel } from "@/components/Onboarding/ActivationPanel";
import { OrgColorsProvider } from "@/components/Providers/OrgColorsProvider";
import { AppSidebar } from "@/components/Sidebar/AppSidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { getCurrentSession } from "@/lib/authentication/session";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { type ReactNode, Suspense } from "react";

export const metadata: Metadata = {
	title: {
		absolute: "RecompraCRM",
		template: "%s | RecompraCRM",
	},
	robots: { index: false, follow: false },
};

const MainLayout = async ({ children }: { children: ReactNode }) => {
	const user = await getCurrentSession();
	if (!user) redirect("/auth/signin");
	if (!user.membership) redirect("/onboarding");
	// Org exists but the deep onboarding flow was not concluded yet — bounce the user back to finish it.
	if (!user.membership.organizacao.dataOnboardingConclusao) redirect("/onboarding");
	// Bloqueio por assinatura acontece aqui, e não num overlay dentro do layout: assim o dashboard
	// nem monta para quem está suspenso — nenhuma página filha, nenhuma query. `assinaturaAtiva` sai
	// do mesmo `resolveSubscriptionAccess` que alimenta o endpoint de status, então as duas decisões
	// nunca divergem.
	if (!user.membership.organizacao.assinaturaAtiva) redirect("/subscription");
	return (
		<SidebarProvider className="font-raleway">
			<AppSidebar user={user.user} organization={user.membership.organizacao} permissions={user.membership.permissoes} />
			<Suspense fallback={<LoadingComponent />}>
				<SidebarInset className="min-w-0">
					<div className="flex min-h-full w-full flex-col gap-3 p-6">
						<OrgColorsProvider
							corPrimaria={user.membership.organizacao.corPrimaria}
							corPrimariaForeground={user.membership.organizacao.corPrimariaForeground}
							corSecundaria={user.membership.organizacao.corSecundaria}
							corSecundariaForeground={user.membership.organizacao.corSecundariaForeground}
						>
							<AppHeader session={{ user: user.user, membership: user.membership }} />
							{children}
						</OrgColorsProvider>
					</div>
				</SidebarInset>
			</Suspense>
		</SidebarProvider>
	);
};

export default MainLayout;
