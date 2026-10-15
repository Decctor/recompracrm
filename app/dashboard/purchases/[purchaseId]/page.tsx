import ErrorComponent from "@/components/Layouts/ErrorComponent";
import UnauthorizedPage from "@/components/Utils/UnauthorizedPage";
import { requireDashboardCapability } from "@/lib/access/guards";
import { redirect } from "next/navigation";
import PurchaseDetailPage from "../_module/detail/purchase-detail-page";

export default async function Purchase({ params }: { params: Promise<{ purchaseId: string }> }) {
	const { purchaseId } = await params;
	if (!purchaseId) return <ErrorComponent msg="ID inválido" />;
	const { sessionUser, unauthorized } = await requireDashboardCapability("purchases");
	if (unauthorized) return unauthorized;

	if (!sessionUser) redirect("/auth/signin");
	if (!sessionUser.membership) redirect("/onboarding");
	if (!sessionUser.membership.organizacao.configuracao.recursos.erp.acesso)
		return <UnauthorizedPage message="Oops,  sua organização não possui acesso a este recurso." />;
	return <PurchaseDetailPage membership={sessionUser.membership} purchaseId={purchaseId} />;
}
