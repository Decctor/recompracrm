import AppHeader from "@/components/Layouts/HeaderApp";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { ActivationPanel } from "@/components/Onboarding/ActivationPanel";
import SubscriptionPaywall from "@/components/Paywall/SubscriptionPaywall";
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
	return (
		// data-app-shell aciona o clamp de scroll do documento em globals.css.
		<SidebarProvider data-app-shell="" className="font-outfit h-svh overflow-hidden">
			<AppSidebar user={user.user} organization={user.membership.organizacao} permissions={user.membership.permissoes} />
			<Suspense fallback={<LoadingComponent />}>
				{/* O respiro do conteúdo fica no wrapper interno, não no scrollport: com o padding no
				    elemento que rola, a barra de rolagem nasce recuada da borda e o scroll se lê como
				    "de dentro da página". */}
				<SidebarInset className="overflow-y-auto scrollbar-subtle">
					<div className="flex min-h-full w-full flex-col gap-3 p-6">
						<OrgColorsProvider
							corPrimaria={user.membership.organizacao.corPrimaria}
							corPrimariaForeground={user.membership.organizacao.corPrimariaForeground}
							corSecundaria={user.membership.organizacao.corSecundaria}
							corSecundariaForeground={user.membership.organizacao.corSecundariaForeground}
						>
							<AppHeader session={{ user: user.user, membership: user.membership }} />
							{children}
							<SubscriptionPaywall />
						</OrgColorsProvider>
					</div>
				</SidebarInset>
			</Suspense>
		</SidebarProvider>
	);
};

export default MainLayout;
