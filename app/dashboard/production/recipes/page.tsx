import { requireProductionAccess } from "../_lib/require-production-access";
import ProductionRecipesPage from "../_module/recipes/production-recipes-page";

export default async function RecipesPage() {
	const { permissions, blocked } = await requireProductionAccess();
	if (blocked) return blocked;
	return <ProductionRecipesPage permissions={permissions} />;
}
