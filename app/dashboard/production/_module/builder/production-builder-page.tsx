"use client";

import type { TProductionPagePermissions } from "../../_lib/require-production-access";
import { appRoutes } from "@/lib/navigation/routes";
import { useRouter } from "next/navigation";
import BuilderHeader from "./components/builder-header";
import { BuilderProvider, useBuilder } from "./components/builder-provider";
import NextStepBar from "./components/next-step-bar";
import StageManualItems from "./stages/stage-manual-items";
import StageQuantities from "./stages/stage-quantities";
import StageRecipe from "./stages/stage-recipe";
import StageReview from "./stages/stage-review";

type ProductionBuilderPageProps = {
	/** A página já exige `criar`; as permissões ficam disponíveis para as etapas. */
	permissions: TProductionPagePermissions;
	initialRecipeId: string | null;
};

/**
 * Construtor de produção em página cheia, pensado para o tablet do balcão: receita → quantidades →
 * revisão. O estado vive só no navegador; recarregar recomeça (com a receita do link, se houver).
 */
export default function ProductionBuilderPage({ initialRecipeId }: ProductionBuilderPageProps) {
	return (
		// A chave recomeça o construtor quando o link muda (`/new?recipeId=X` → "Nova produção" no menu):
		// a página é a mesma, e sem ela a receita e as quantidades anteriores ficariam na tela.
		<BuilderProvider key={initialRecipeId ?? "blank"} initialRecipeId={initialRecipeId}>
			<ProductionBuilderContent />
		</BuilderProvider>
	);
}

function ProductionBuilderContent() {
	const router = useRouter();
	const { stage, selection } = useBuilder();

	return (
		<div className="flex w-full flex-col gap-3.5 py-4 tabular-nums">
			<BuilderHeader onBack={() => router.push(appRoutes.productions.history())} />
			{stage === "recipe" ? <StageRecipe /> : null}
			{stage === "quantities" ? selection?.kind === "manual" ? <StageManualItems /> : <StageQuantities /> : null}
			{stage === "review" ? <StageReview /> : null}
			<NextStepBar />
		</div>
	);
}
