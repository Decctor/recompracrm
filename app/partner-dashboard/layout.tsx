import { getCurrentSession } from "@/lib/authentication/session";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

export const metadata: Metadata = {
	title: "Painel do Parceiro | RecompraCRM",
	robots: { index: false, follow: false },
};

export default async function PartnerDashboardLayout({ children }: { children: ReactNode }) {
	const session = await getCurrentSession();
	if (!session) redirect(`/auth/signin?redirectTo=${encodeURIComponent("/partner-dashboard")}`);

	return <div className="flex min-h-dvh w-full flex-col">{children}</div>;
}
