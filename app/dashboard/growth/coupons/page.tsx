import { requireDashboardCapability } from "@/lib/access/guards";
import { canEditCampaigns } from "@/lib/permissions/campaigns";
import { redirect } from "next/navigation";
import CouponsPage from "./coupons-page";

export default async function Coupons() {
	const access = await requireDashboardCapability("coupons");
	if (access.unauthorized) return access.unauthorized;
	const sessionUser = access.sessionUser;
	if (!sessionUser) redirect("/auth/signin");
	return <CouponsPage user={sessionUser.user} canEditCoupons={canEditCampaigns(sessionUser.membership?.permissoes)} />;
}
