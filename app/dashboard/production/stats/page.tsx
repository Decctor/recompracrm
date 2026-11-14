import { requireProductionAccess } from "../_lib/require-production-access";
import ProductionStatsPage from "../_module/stats/production-stats-page";

export default async function StatsPage() {
	const { permissions, blocked } = await requireProductionAccess({
		permission: "visualizar",
		deniedMessage: "Você não possui permissão para visualizar a produção.",
	});
	if (blocked) return blocked;
	return <ProductionStatsPage permissions={permissions} />;
}
