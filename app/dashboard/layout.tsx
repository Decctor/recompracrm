import { AIHintsBubble } from "@/components/AIHints";
import AppHeader from "@/components/Layouts/HeaderApp";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { OnboardingQualityBubble } from "@/components/Onboarding";
import SubscriptionPaywall from "@/components/Paywall/SubscriptionPaywall";
import { OrgColorsProvider } from "@/components/Providers/OrgColorsProvider";
import { AppSidebar } from "@/components/Sidebar/AppSidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { getCurrentSession } from "@/lib/authentication/session";
import { redirect } from "next/navigation";
import { type ReactNode, Suspense } from "react";

const MainLayout = async ({ children }: { children: ReactNode }) => {
	const user = await getCurrentSession();
	if (!user) redirect("/auth/signin");
	if (!user.membership) redirect("/onboarding");
	return (
		<SidebarProvider className="font-raleway">
			<AppSidebar user={user.user} organization={user.membership.organizacao} />
			<Suspense fallback={<LoadingComponent />}>
				<SidebarInset className="overflow-y-auto p-6 flex flex-col gap-3">
					<OrgColorsProvider
						corPrimaria={user.membership.organizacao.corPrimaria}
						corPrimariaForeground={user.membership.organizacao.corPrimariaForeground}
						corSecundaria={user.membership.organizacao.corSecundaria}
						corSecundariaForeground={user.membership.organizacao.corSecundariaForeground}
					>
						<AppHeader />
						{children}
						<OnboardingQualityBubble />
						{/* <AIHintsBubble /> */}
						<SubscriptionPaywall />
					</OrgColorsProvider>
				</SidebarInset>
			</Suspense>
		</SidebarProvider>
	);
};

export default MainLayout;
