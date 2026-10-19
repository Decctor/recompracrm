import UnauthorizedPage from "@/components/Utils/UnauthorizedPage";
import { requireDashboardCapability } from "@/lib/access/guards";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import StockReportsPage from "./reports-page";

export const metadata: Metadata = {
	title: "Relatórios de Estoque",
	description: "Curva ABC, giro, reposição, estoque parado, custos, perdas e vencimentos do seu estoque.",
};

export default async function StockReports() {
	const { sessionUser, unauthorized } = await requireDashboardCapability("inventory");
	if (unauthorized) return unauthorized;

	if (!sessionUser) redirect("/auth/signin");
	if (!sessionUser.membership) redirect("/onboarding");
	if (!sessionUser.membership.organizacao.configuracao.recursos.erp.acesso) {
		return <UnauthorizedPage message="Oops, sua organização não possui acesso a este recurso." />;
	}

	return <StockReportsPage />;
}
