import SalesEmptyState from "@/components/Sales/SalesEmptyState";
import UnauthorizedPage from "@/components/Utils/UnauthorizedPage";
import { getCurrentSession } from "@/lib/authentication/session";
import type { TOrganizationConfiguration } from "@/schemas/organizations";
import { db } from "@/services/drizzle";
import { redirect } from "next/navigation";
import { DashboardPage } from "./dashboard-page";

export default async function Main() {
	const authSession = await getCurrentSession();
	console.log("AUTH SESSION DASHBOARD PAGE", authSession);
	if (!authSession) redirect("/auth/signin");
	const membership = authSession.membership;
	if (!membership) redirect("/onboarding");

	// Check if the organization has any sales
	const firstSale = await db.query.sales.findFirst({
		where: (fields, { eq }) => eq(fields.organizacaoId, membership.organizacao.id),
		columns: { id: true },
	});
	const hasSales = !!firstSale;

	if (!hasSales) {
		return (
			<SalesEmptyState
				organizationId={membership.organizacao.id}
				organizationConfig={membership.organizacao.configuracao as TOrganizationConfiguration}
			/>
		);
	}
	return <DashboardPage user={authSession.user} userOrg={membership.organizacao} membership={membership} />;
}
