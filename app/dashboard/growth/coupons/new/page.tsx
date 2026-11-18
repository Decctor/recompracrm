import CouponBuilderShell from "@/app/dashboard/growth/coupons/_module/builder/components/builder-shell";
import { requireDashboardCapability } from "@/lib/access/guards";
import { appRoutes } from "@/lib/navigation/routes";
import { canEditCampaigns } from "@/lib/permissions/campaigns";
import { redirect } from "next/navigation";

export default async function CouponBuilderPage() {
	const access = await requireDashboardCapability("coupons");
	if (access.unauthorized) return access.unauthorized;
	const sessionUser = access.sessionUser;
	if (!sessionUser) redirect("/auth/signin");
	if (!sessionUser.membership) redirect("/onboarding");
	// Cupons seguem `campanhas.editar`: sem ela não há o que construir, a API recusaria o salvamento.
	if (!canEditCampaigns(sessionUser.membership.permissoes)) redirect(appRoutes.growth.coupons());

	return <CouponBuilderShell />;
}
