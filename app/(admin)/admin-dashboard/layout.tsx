import { AdminDock } from "@/components/Admin/AdminDock";
import AppHeader from "@/components/Layouts/HeaderApp";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import UnauthorizedPage from "@/components/Utils/UnauthorizedPage";
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
		<div className="font-outfit min-h-svh bg-background text-foreground">
			<Suspense fallback={<LoadingComponent />}>
				<main className="flex min-h-svh flex-col gap-3 overflow-y-auto p-6 pb-28">
					<AppHeader showSidebarTrigger={false} />
					{children}
				</main>
			</Suspense>
			<AdminDock user={session.user} />
		</div>
	);
}
