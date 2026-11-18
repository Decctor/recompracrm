import ErrorComponent from "@/components/Layouts/ErrorComponent";
import { requireDashboardCapability } from "@/lib/access/guards";
import UnauthenticatedPage from "@/components/Utils/UnauthenticatedPage";
import { redirect } from "next/navigation";
import SellerPage from "./seller-page";

export default async function Seller({ params }: { params: Promise<{ sellerId: string }> }) {
	const { sellerId } = await params;
	if (!sellerId) return <ErrorComponent msg="ID inválido" />;
	const access = await requireDashboardCapability("sellers");
	if (access.unauthorized) return access.unauthorized;
	const sessionUser = access.sessionUser;
	if (!sessionUser) redirect("/auth/signin");
	return <SellerPage user={sessionUser.user} id={sellerId} canEditSeller={sessionUser.membership?.permissoes.usuarios.editar ?? false} />;
}
