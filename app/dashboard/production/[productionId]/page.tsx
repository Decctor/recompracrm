import ErrorComponent from "@/components/Layouts/ErrorComponent";
import { requireProductionAccess } from "../_lib/require-production-access";
import ProductionDetailPage from "../_module/detail/production-detail-page";

export default async function ProductionPage({ params }: { params: Promise<{ productionId: string }> }) {
	const { productionId } = await params;
	if (!productionId) return <ErrorComponent msg="ID inválido" />;
	const { permissions, blocked } = await requireProductionAccess({
		permission: "visualizar",
		deniedMessage: "Você não possui permissão para visualizar a produção.",
	});
	if (blocked) return blocked;
	return <ProductionDetailPage permissions={permissions} productionId={productionId} />;
}
