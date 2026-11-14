import { requireProductionAccess } from "../_lib/require-production-access";
import ProductionBuilderPage from "../_module/builder/production-builder-page";

export default async function NewProductionPage({ searchParams }: { searchParams: Promise<{ recipeId?: string }> }) {
	const { permissions, blocked } = await requireProductionAccess({
		permission: "criar",
		deniedMessage: "Você não possui permissão para criar produções.",
	});
	if (blocked) return blocked;
	const { recipeId } = await searchParams;
	return <ProductionBuilderPage permissions={permissions} initialRecipeId={recipeId ?? null} />;
}
