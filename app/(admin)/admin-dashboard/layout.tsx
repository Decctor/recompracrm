import AppHeader from "@/components/Layouts/HeaderApp";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { AdminSidebar } from "@/components/Sidebar/AdminSidebar";
import UnauthorizedPage from "@/components/Utils/UnauthorizedPage";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getCurrentSession } from "@/lib/authentication/session";
import { redirect } from "next/navigation";
import { type ReactNode, Suspense } from "react";

type AdminDashboardLayoutProps = {
	children: ReactNode;
};

export default async function AdminDashboardLayout({ children }: AdminDashboardLayoutProps) {
	const session = await getCurrentSession();

	if (!session) redirect("/auth/signin");
	if (!session.user.admin) return <UnauthorizedPage message="Oops, aparentemente você não possui permissão para acessar essa área." />;

	return (
		<SidebarProvider className="font-raleway">
			<AdminSidebar user={session.user} organization={session.membership?.organizacao ?? null} />
			<Suspense fallback={<LoadingComponent />}>
				<SidebarInset className="overflow-y-auto p-6 flex flex-col gap-3">
					<AppHeader />

					{children}
				</SidebarInset>
			</Suspense>
		</SidebarProvider>
	);
}
