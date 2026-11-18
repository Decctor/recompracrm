import ErrorComponent from "@/components/Layouts/ErrorComponent";
import { requireDashboardCapability } from "@/lib/access/guards";
import { canEditCampaigns } from "@/lib/permissions/campaigns";
import { redirect } from "next/navigation";
import CouponByIdPage from "./coupon-by-id-page";

export default async function CouponPage({ params }: { params: Promise<{ couponId: string }> }) {
	const { couponId } = await params;
	if (!couponId) return <ErrorComponent msg="ID inválido" />;
	const access = await requireDashboardCapability("coupons");
	if (access.unauthorized) return access.unauthorized;
	const sessionUser = access.sessionUser;
	if (!sessionUser) redirect("/auth/signin");
	if (!sessionUser.membership?.organizacao) redirect("/onboarding");

	return <CouponByIdPage couponId={couponId} canEdit={canEditCampaigns(sessionUser.membership.permissoes)} />;
}
