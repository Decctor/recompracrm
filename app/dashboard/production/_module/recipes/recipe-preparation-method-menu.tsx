"use client";

import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { useProductionRecipeById } from "@/lib/queries/productions";
import dynamic from "next/dynamic";

// react-markdown + typeset só carregam quando o menu abre.
const MarkdownViewer = dynamic(() => import("@/components/Inputs/MarkdownViewer").then((mod) => mod.MarkdownViewer), {
	ssr: false,
	loading: () => <div className="h-40 w-full animate-pulse rounded-lg bg-muted/20" aria-hidden="true" />,
});

/**
 * Leitura do modo de preparo aberta pelo menu "…" do card. O `ProductionRecipePreparationMethodViewer`
 * traz o próprio botão-gatilho e não expõe o menu, por isso a leitura vive aqui.
 */
export default function RecipePreparationMethodMenu({
	recipeId,
	recipeTitle,
	closeMenu,
}: {
	recipeId: string;
	recipeTitle: string;
	closeMenu: () => void;
}) {
	const { data: recipe, isLoading, isError, error } = useProductionRecipeById({ id: recipeId });
	const modoPreparo = recipe?.modoPreparo?.trim();

	return (
		<ResponsiveMenu
			mode="read-only"
			menuTitle="MODO DE PREPARO"
			menuDescription={recipeTitle}
			menuCancelButtonText="FECHAR"
			closeMenu={closeMenu}
			stateIsLoading={isLoading}
			stateError={isError ? getErrorMessage(error) : null}
			dialogVariant="md"
		>
			{modoPreparo ? (
				<MarkdownViewer value={modoPreparo} />
			) : (
				<p className="text-sm italic text-muted-foreground">Nenhum modo de preparo cadastrado para esta receita.</p>
			)}
		</ResponsiveMenu>
	);
}
