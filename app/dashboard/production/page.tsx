import { requireProductionAccess } from "./_lib/require-production-access";
import ProductionsHistoryPage from "./_module/history/productions-history-page";

export default async function Productions() {
	const { permissions, blocked } = await requireProductionAccess();
	if (blocked) return blocked;
	return <ProductionsHistoryPage permissions={permissions} />;
}
