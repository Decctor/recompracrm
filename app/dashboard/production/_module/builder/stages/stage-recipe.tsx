"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/errors";
import { getPrimaryRecipeOutput } from "@/lib/productions/builder-math";
import { useProductionRecipes } from "@/lib/queries/productions";
import { cn } from "@/lib/utils";
import type { TTimeDurationUnitsEnum } from "@/schemas/enums";
import { Check, Clock, FilePenLine, RefreshCcw, Search } from "lucide-react";
import { RecipeCover } from "@/components/Productions/RecipeCover";
import { useBuilder, type TRecipeListItem } from "../components/builder-provider";
import { formatDuration, formatQuantity } from "../helpers/format";

export default function StageRecipe() {
	const { selection, pickRecipe, pickManual } = useBuilder();
	const { data, isLoading, isError, error, filters, updateFilters } = useProductionRecipes({
		initialFilters: { activeOnly: true, pageSize: 100 },
	});
	const recipes = data?.recipes ?? [];
	const selectedRecipeId = selection?.kind === "recipe" ? selection.recipeId : null;

	return (
		<section className="flex flex-col gap-4">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div className="flex flex-col gap-1">
					<h2 className="text-[22px] font-extrabold tracking-tight">Qual receita vamos produzir?</h2>
					<p className="text-sm text-muted-foreground">Quantidades, título e datas são preenchidos a partir da receita escolhida.</p>
				</div>
				<label className="flex h-[52px] w-full items-center gap-2.5 rounded-full border border-border bg-muted/60 px-4 text-muted-foreground focus-within:ring-[3px] focus-within:ring-ring/50 sm:w-[320px]">
					<Search className="h-[18px] w-[18px] shrink-0" />
					<span className="sr-only">Pesquisar receita</span>
					<input
						value={filters.search ?? ""}
						onChange={(event) => updateFilters({ search: event.target.value, page: 1 })}
						placeholder="Pesquisar receita..."
						className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
					/>
				</label>
			</div>

			{isError ? <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">{getErrorMessage(error)}</p> : null}

			<div className="grid grid-cols-[repeat(auto-fill,minmax(min(230px,100%),1fr))] gap-4">
				{isLoading
					? ["a", "b", "c", "d"].map((key) => <Skeleton key={key} className="h-[260px] rounded-3xl" />)
					: recipes.map((recipe) => (
							<RecipeCard key={recipe.id} recipe={recipe} selected={recipe.id === selectedRecipeId} onPick={() => pickRecipe(recipe)} />
						))}
				<button
					type="button"
					onClick={pickManual}
					aria-pressed={selection?.kind === "manual"}
					className={cn(
						"flex min-h-[260px] flex-col items-center justify-center gap-2.5 rounded-3xl border-2 border-dashed p-5 text-center text-muted-foreground transition-colors hover:bg-muted/30",
						selection?.kind === "manual" ? "border-solid border-primary ring-[3px] ring-primary" : "border-border",
					)}
				>
					<span className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-muted">
						<FilePenLine className="h-7 w-7" />
					</span>
					<span className="text-base font-bold text-foreground">Produção manual</span>
					<span className="text-[13px]">Sem receita. Entradas e saídas livres.</span>
				</button>
			</div>

			{!isLoading && !isError && recipes.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					{filters.search ? "Nenhuma receita encontrada para a busca." : "Nenhuma receita ativa cadastrada."} Você ainda pode fazer uma produção manual.
				</p>
			) : null}
		</section>
	);
}

function RecipeCard({ recipe, selected, onPick }: { recipe: TRecipeListItem; selected: boolean; onPick: () => void }) {
	const primaryOutput = getPrimaryRecipeOutput(recipe.saidas);
	const unit = primaryOutput?.produto.unidade ?? "UN";
	const duration =
		recipe.previsaoTempoValor != null && recipe.previsaoTempoMedida
			? formatDuration(recipe.previsaoTempoValor, recipe.previsaoTempoMedida as TTimeDurationUnitsEnum)
			: null;

	return (
		<button
			type="button"
			onClick={onPick}
			aria-pressed={selected}
			className={cn(
				"flex flex-col overflow-hidden rounded-3xl border bg-card text-left transition-shadow",
				selected ? "border-primary ring-[3px] ring-primary" : "border-border shadow-sm hover:shadow-md",
			)}
		>
			<span className="relative block aspect-[4/3] w-full">
				<RecipeCover recipe={recipe} className="h-full w-full" iconClassName="max-h-16 max-w-16" />
				{duration ? (
					<span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-1 text-xs font-semibold text-foreground">
						<Clock className="h-3 w-3" />
						{duration}
					</span>
				) : null}
				{recipe.saldoLotes > 0 ? (
					<span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-warning-surface px-2.5 py-1 text-xs font-semibold text-warning-surface-foreground">
						<RefreshCcw className="h-3 w-3" />
						Saldo {formatQuantity(recipe.saldoLotes, unit)}
					</span>
				) : null}
				{selected ? (
					<span className="absolute right-3 bottom-3 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
						<Check className="h-[18px] w-[18px]" />
					</span>
				) : null}
			</span>
			<span className="flex flex-col gap-1 px-4 pt-3.5 pb-4">
				<span className="text-[17px] font-bold tracking-tight">{recipe.titulo}</span>
				<span className="text-[13px] text-muted-foreground">
					{primaryOutput ? `Rende ${formatQuantity(primaryOutput.quantidade, unit)} · ` : ""}
					{recipe.insumos.length} {recipe.insumos.length === 1 ? "insumo" : "insumos"}
				</span>
			</span>
		</button>
	);
}
