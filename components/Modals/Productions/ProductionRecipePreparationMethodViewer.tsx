"use client";

import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getErrorMessage } from "@/lib/errors";
import { useProductionRecipeById } from "@/lib/queries/productions";
import { cn } from "@/lib/utils";
import { BookOpenText } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";

// react-markdown + typeset só são necessários quando o menu abre — carregamento sob demanda
// mantém esse peso fora do bundle da página de produções.
const MarkdownViewer = dynamic(() => import("@/components/Inputs/MarkdownViewer").then((mod) => mod.MarkdownViewer), {
	ssr: false,
	loading: () => <div className="bg-muted/20 h-40 w-full animate-pulse rounded-lg" aria-hidden="true" />,
});

type PreparationMethodViewMenuProps = {
	recipeId: string;
	recipeTitle: string;
	closeMenu: () => void;
};

function PreparationMethodViewMenu({ recipeId, recipeTitle, closeMenu }: PreparationMethodViewMenuProps) {
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
				<p className="text-muted-foreground text-sm italic">Nenhum modo de preparo cadastrado para esta receita.</p>
			)}
		</ResponsiveMenu>
	);
}

type ProductionRecipePreparationMethodViewerProps = {
	recipeId: string;
	recipeTitle: string;
	className?: string;
};

export default function ProductionRecipePreparationMethodViewer({ recipeId, recipeTitle, className }: ProductionRecipePreparationMethodViewerProps) {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<>
			<TooltipProvider delay={400}>
				<Tooltip>
					<TooltipTrigger
						render={
							<Button
								type="button"
								size="icon"
								variant="ghost"
								onClick={() => setIsOpen(true)}
								aria-label="Ver modo de preparo"
								className={cn("text-muted-foreground hover:text-foreground h-7 w-7", className)}
							>
								<BookOpenText className="h-4 w-4" />
							</Button>
						}
					/>
					<TooltipContent side="top">Ver modo de preparo</TooltipContent>
				</Tooltip>
			</TooltipProvider>
			{isOpen ? <PreparationMethodViewMenu recipeId={recipeId} recipeTitle={recipeTitle} closeMenu={() => setIsOpen(false)} /> : null}
		</>
	);
}
