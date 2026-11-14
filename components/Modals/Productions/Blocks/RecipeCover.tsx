"use client";

import {
	RECIPE_COVER_ICON_COMPONENTS,
	RECIPE_COVER_TONE_CLASSES,
	RecipeCover,
	recipeCoverStyle,
} from "@/app/dashboard/production/_components/recipe-cover";
import { Button } from "@/components/ui/button";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { RECIPE_COVER_HUES, RECIPE_COVER_ICONS, resolveRecipeCover } from "@/lib/productions/recipe-cover";
import { cn } from "@/lib/utils";
import type { TUseInternalProductionRecipeState } from "@/state-hooks/use-internal-production-recipe-state";
import { ImageIcon, ImageUp, Trash2 } from "lucide-react";
import { useId } from "react";

type ProductionRecipeCoverBlockProps = {
	/** Id da receita em edição: receitas antigas sem cor derivam a matiz dele, como na listagem. */
	recipeId?: string | null;
	productionRecipe: TUseInternalProductionRecipeState["state"]["productionRecipe"];
	updateProductionRecipe: TUseInternalProductionRecipeState["updateProductionRecipe"];
	updateProductionRecipeCoverHolder: TUseInternalProductionRecipeState["updateProductionRecipeCoverHolder"];
};

/**
 * Capa da receita: uma foto, ou — sem foto — um ícone sobre a cor da receita. A prévia é o mesmo
 * `RecipeCover` dos cards, então o que se vê aqui é o que aparece na listagem e no construtor.
 */
export default function ProductionRecipeCoverBlock({
	recipeId,
	productionRecipe,
	updateProductionRecipe,
	updateProductionRecipeCoverHolder,
}: ProductionRecipeCoverBlockProps) {
	const inputId = useId();
	const photoUrl = productionRecipe.imagemCapaHolder.previewUrl ?? productionRecipe.imagemCapaUrl ?? null;
	const hasPhoto = !!photoUrl;
	const resolvedCover = resolveRecipeCover({
		id: recipeId,
		titulo: productionRecipe.titulo,
		capaIcone: productionRecipe.capaIcone,
		capaCor: productionRecipe.capaCor,
	});

	function removePhoto() {
		updateProductionRecipeCoverHolder({ file: null, previewUrl: null });
		updateProductionRecipe({ imagemCapaUrl: null });
	}

	return (
		<ResponsiveMenuSection title="CAPA" icon={<ImageIcon className="h-4 w-4" />}>
			<div className="flex w-full flex-col gap-4 sm:flex-row sm:items-start">
				<div className="flex w-full shrink-0 flex-col gap-2 sm:w-56">
					<label htmlFor={inputId} className="relative block aspect-[16/10] w-full cursor-pointer overflow-hidden rounded-2xl border border-border">
						<RecipeCover
							recipe={{
								id: recipeId,
								titulo: productionRecipe.titulo,
								imagemCapaUrl: photoUrl,
								capaIcone: resolvedCover.icone,
								capaCor: resolvedCover.matiz,
							}}
							className="h-full w-full"
						/>
						<input
							id={inputId}
							type="file"
							accept=".png,.jpeg,.jpg,.webp"
							multiple={false}
							tabIndex={-1}
							className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
							onChange={(event) => {
								const file = event.target.files?.[0] ?? null;
								updateProductionRecipeCoverHolder({ file, previewUrl: file ? URL.createObjectURL(file) : null });
								// Permite escolher o mesmo arquivo de novo depois de remover a foto.
								event.target.value = "";
							}}
						/>
					</label>
					<div className="flex flex-wrap items-center gap-2">
						<Button variant="outline" size="xs" asChild>
							<label htmlFor={inputId} className="cursor-pointer">
								<ImageUp className="h-3.5 w-3.5" />
								{hasPhoto ? "TROCAR FOTO" : "ENVIAR FOTO"}
							</label>
						</Button>
						{hasPhoto ? (
							<Button type="button" variant="ghost" size="xs" onClick={removePhoto}>
								<Trash2 className="h-3.5 w-3.5" />
								REMOVER FOTO
							</Button>
						) : null}
					</div>
					<p className="text-xs text-muted-foreground">
						{hasPhoto ? "A foto aparece nos cards e no construtor de produção." : "Sem foto, a capa usa o ícone e a cor escolhidos."}
					</p>
				</div>

				{!hasPhoto ? (
					<div className="flex min-w-0 flex-1 flex-col gap-3">
						<div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Ícone da capa">
							<span className="text-sm font-medium tracking-tight text-foreground/80">ÍCONE</span>
							<div className="flex flex-wrap gap-1">
								{RECIPE_COVER_ICONS.map((icon) => {
									const Icon = RECIPE_COVER_ICON_COMPONENTS[icon];
									const isSelected = resolvedCover.icone === icon;
									return (
										<button
											key={icon}
											type="button"
											role="radio"
											aria-checked={isSelected}
											aria-label={icon}
											title={icon}
											onClick={() => updateProductionRecipe({ capaIcone: icon, capaCor: resolvedCover.matiz })}
											style={isSelected ? recipeCoverStyle(resolvedCover.matiz) : undefined}
											className={cn(
												"flex size-9 items-center justify-center rounded-lg outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
												isSelected ? cn(RECIPE_COVER_TONE_CLASSES, "ring-2 ring-current/60") : "text-muted-foreground hover:bg-muted hover:text-foreground",
											)}
										>
											<Icon className="h-4.5 w-4.5" strokeWidth={1.75} />
										</button>
									);
								})}
							</div>
						</div>
						<div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Cor da capa">
							<span className="text-sm font-medium tracking-tight text-foreground/80">COR</span>
							<div className="flex flex-wrap gap-2">
								{RECIPE_COVER_HUES.map((hue) => {
									const isSelected = resolvedCover.matiz === hue;
									return (
										<button
											key={hue}
											type="button"
											role="radio"
											aria-checked={isSelected}
											aria-label={`Matiz ${hue}`}
											onClick={() => updateProductionRecipe({ capaCor: hue, capaIcone: resolvedCover.icone })}
											style={recipeCoverStyle(hue)}
											className={cn(
												"flex size-8 items-center justify-center rounded-full border border-current/25 outline-none transition-transform hover:scale-110 focus-visible:ring-[3px] focus-visible:ring-ring/50",
												RECIPE_COVER_TONE_CLASSES,
												isSelected && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
											)}
										>
											<span className="size-3 rounded-full bg-current" aria-hidden />
										</button>
									);
								})}
							</div>
						</div>
					</div>
				) : null}
			</div>
		</ResponsiveMenuSection>
	);
}
