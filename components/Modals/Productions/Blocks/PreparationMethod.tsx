"use client";

import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import type { TUseInternalProductionRecipeState } from "@/state-hooks/use-internal-production-recipe-state";
import { ChefHat } from "lucide-react";
import dynamic from "next/dynamic";

// O editor Tiptap + react-markdown são pesados e só são necessários quando um modal de receita abre.
// Carregamento sob demanda mantém esse peso fora do bundle da página de produções.
const MarkdownField = dynamic(() => import("@/components/Inputs/MarkdownField").then((mod) => mod.MarkdownField), {
	ssr: false,
	loading: () => <div className="border-border bg-muted/20 min-h-56 animate-pulse rounded-lg border" aria-hidden="true" />,
});

type ProductionRecipePreparationMethodBlockProps = {
	productionRecipe: TUseInternalProductionRecipeState["state"]["productionRecipe"];
	updateProductionRecipe: TUseInternalProductionRecipeState["updateProductionRecipe"];
};

export default function ProductionRecipePreparationMethodBlock({
	productionRecipe,
	updateProductionRecipe,
}: ProductionRecipePreparationMethodBlockProps) {
	return (
		<ResponsiveMenuSection title="MODO DE PREPARO" icon={<ChefHat className="h-4 w-4" />}>
			<MarkdownField
				label="INSTRUÇÕES"
				value={productionRecipe.modoPreparo ?? ""}
				placeholder="Descreva as etapas, tempos e cuidados do preparo..."
				handleChange={(modoPreparo) => updateProductionRecipe({ modoPreparo })}
			/>
		</ResponsiveMenuSection>
	);
}
