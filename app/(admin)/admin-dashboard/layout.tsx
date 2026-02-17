import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { AdminSidebar } from "@/components/Sidebar/AdminSidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import UnauthorizedPage from "@/components/Utils/UnauthorizedPage";
import { getCurrentSession } from "@/lib/authentication/session";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";

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
				<SidebarInset className="overflow-y-auto p-6 flex flex-col gap-3">{children}</SidebarInset>
			</Suspense>
		</SidebarProvider>
	);
}
