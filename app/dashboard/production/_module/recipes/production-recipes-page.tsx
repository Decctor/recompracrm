"use client";

import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import ControlProductionRecipe from "@/components/Modals/Productions/ControlProductionRecipe";
import NewProductionRecipe from "@/components/Modals/Productions/NewProductionRecipe";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { InteractiveFilter, type InteractiveFilterOption, type InteractiveFilterSortValue } from "@/components/ui/interactive-filter";
import { formatInteractiveSortFieldSummary, isInteractiveSortActive } from "@/components/ui/interactive-filter-formatting";
import { TooltipProvider } from "@/components/ui/tooltip";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { getErrorMessage } from "@/lib/errors";
import type { TProductionPagePermissions } from "../../_lib/require-production-access";
import { useProductionRecipes } from "@/lib/queries/productions";
import type { TProductionRecipesSortFieldEnum } from "@/schemas/enums";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDownUp, ClipboardList, Plus } from "lucide-react";
import { useState } from "react";
import ProductionRecipeCard from "./production-recipe-card";
import RecipePreparationMethodMenu from "./recipe-preparation-method-menu";

const ORDER_FIELD_OPTIONS = [
	{ id: "ULTIMA_PRODUCAO", value: "ULTIMA_PRODUCAO", label: "ÚLTIMA PRODUÇÃO" },
	{ id: "MARGEM", value: "MARGEM", label: "MARGEM" },
	{ id: "CUSTO", value: "CUSTO", label: "CUSTO" },
	{ id: "NOME", value: "NOME", label: "NOME" },
] satisfies InteractiveFilterOption<TProductionRecipesSortFieldEnum>[];

// Custo e margem chegam `null` para quem não vê custos (dadosSensiveis): ordenar por eles não faz sentido.
const COST_SORT_FIELDS: TProductionRecipesSortFieldEnum[] = ["CUSTO", "MARGEM"];

const DEFAULT_SORT = { field: "ULTIMA_PRODUCAO", direction: "desc" } satisfies InteractiveFilterSortValue<TProductionRecipesSortFieldEnum>;

/** Organizações têm dezenas de receitas: a grade cabe numa página só (o servidor aceita até 100). */
const RECIPES_PAGE_SIZE = 100;

export default function ProductionRecipesPage({ permissions }: { permissions: TProductionPagePermissions }) {
	const queryClient = useQueryClient();
	const [newRecipeModalIsOpen, setNewRecipeModalIsOpen] = useState(false);
	const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
	const [preparationMethodRecipe, setPreparationMethodRecipe] = useState<{ id: string; titulo: string } | null>(null);
	const orderFieldOptions = permissions.visualizarCustos
		? ORDER_FIELD_OPTIONS
		: ORDER_FIELD_OPTIONS.filter((option) => !COST_SORT_FIELDS.includes(option.value));

	const { data, isLoading, isError, isSuccess, error, filters, updateFilters, queryKey } = useProductionRecipes({
		initialFilters: { pageSize: RECIPES_PAGE_SIZE },
	});
	const recipes = data?.recipes ?? [];
	const recipesMatched = data?.recipesMatched ?? 0;
	const sortValue = {
		field: filters.orderBy,
		direction: filters.orderByDirection,
	} satisfies InteractiveFilterSortValue<TProductionRecipesSortFieldEnum>;
	const setSort = ({ field, direction }: InteractiveFilterSortValue<TProductionRecipesSortFieldEnum>) =>
		updateFilters({ orderBy: field, orderByDirection: direction, page: 1 });

	const handleOnMutate = async () => await queryClient.cancelQueries({ queryKey });
	const handleOnSettled = async () => {
		await Promise.all([
			// Prefixo: inclui a lista de opções do filtro RECEITA do Histórico.
			queryClient.invalidateQueries({ queryKey: ["production-recipes"] }),
			queryClient.invalidateQueries({ queryKey: ["production-recipe-by-id"] }),
		]);
	};

	const openNewRecipe = permissions.criar ? () => setNewRecipeModalIsOpen(true) : undefined;

	return (
		<TooltipProvider>
			<div className="flex w-full flex-col gap-3 tabular-nums">
				<div className="flex w-full flex-col gap-2">
					<div className="flex w-full flex-col-reverse items-center gap-2 lg:flex-row">
						<Input
							value={filters.search ?? ""}
							placeholder="Pesquisar por nome da receita ou insumo..."
							onChange={(event) => updateFilters({ search: event.target.value, page: 1 })}
							className="grow rounded-xl"
						/>
						{openNewRecipe ? (
							<Button className="flex w-full items-center gap-2 lg:w-fit" size="sm" onClick={openNewRecipe}>
								<Plus className="h-4 w-4 min-h-4 min-w-4" />
								NOVA RECEITA
							</Button>
						) : null}
					</div>
					<div className="flex w-full flex-wrap items-center gap-2">
						<InteractiveFilter.Root className="w-fit">
							<InteractiveFilter.Trigger>
								<InteractiveFilter.Icon>
									<ArrowDownUp className="h-4 w-4" />
									<InteractiveFilter.Label>ORDENAR POR</InteractiveFilter.Label>
								</InteractiveFilter.Icon>
								<InteractiveFilter.Value>{formatInteractiveSortFieldSummary(orderFieldOptions, sortValue.field)}</InteractiveFilter.Value>
								<InteractiveFilter.SortDirectionToggle
									direction={sortValue.direction}
									onDirectionChange={(direction) => setSort({ ...sortValue, direction })}
								/>
								{isInteractiveSortActive(sortValue, DEFAULT_SORT) ? (
									<InteractiveFilter.Clear onClear={() => setSort(DEFAULT_SORT)} label="Limpar ordenação" />
								) : null}
							</InteractiveFilter.Trigger>
							<InteractiveFilter.Content className="w-72 p-0">
								<InteractiveFilter.SortContent fieldOptions={orderFieldOptions} value={sortValue} onChange={setSort} />
							</InteractiveFilter.Content>
						</InteractiveFilter.Root>
					</div>
				</div>

				<GeneralPaginationComponent
					activePage={filters.page}
					queryLoading={isLoading}
					selectPage={(page) => updateFilters({ page })}
					totalPages={data?.totalPages ?? 0}
					itemsMatchedText={recipesMatched === 1 ? "1 receita encontrada" : `${recipesMatched} receitas encontradas`}
				/>
				{isLoading ? <LoadingComponent /> : null}
				{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
				{isSuccess ? (
					recipes.length > 0 ? (
						<div className="grid w-full grid-cols-[repeat(auto-fill,minmax(min(250px,100%),1fr))] gap-4">
							{recipes.map((recipe) => (
								<ProductionRecipeCard
									key={recipe.id}
									recipe={recipe}
									canProduce={permissions.criar}
									onEdit={permissions.editar ? () => setEditingRecipeId(recipe.id) : undefined}
									onViewPreparationMethod={() => setPreparationMethodRecipe({ id: recipe.id, titulo: recipe.titulo })}
								/>
							))}
						</div>
					) : (
						<Empty>
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<ClipboardList />
								</EmptyMedia>
								<EmptyTitle>{filters.search ? "Nenhuma receita corresponde à busca" : "Nenhuma receita ainda"}</EmptyTitle>
								<EmptyDescription>
									{filters.search
										? "Revise o termo pesquisado ou limpe a busca para ver todas as receitas."
										: "Cadastre fichas técnicas para transformar insumos em produtos finais."}
								</EmptyDescription>
							</EmptyHeader>
							<EmptyContent className="flex-row justify-center gap-2">
								{filters.search ? (
									<Button variant="outline" onClick={() => updateFilters({ search: "", page: 1 })}>
										LIMPAR BUSCA
									</Button>
								) : openNewRecipe ? (
									<Button onClick={openNewRecipe}>CRIAR RECEITA</Button>
								) : null}
							</EmptyContent>
						</Empty>
					)
				) : null}

				{newRecipeModalIsOpen ? (
					<NewProductionRecipe closeModal={() => setNewRecipeModalIsOpen(false)} callbacks={{ onMutate: handleOnMutate, onSettled: handleOnSettled }} />
				) : null}
				{editingRecipeId ? (
					<ControlProductionRecipe
						productionRecipeId={editingRecipeId}
						closeModal={() => setEditingRecipeId(null)}
						callbacks={{ onMutate: handleOnMutate, onSettled: handleOnSettled }}
					/>
				) : null}
				{preparationMethodRecipe ? (
					<RecipePreparationMethodMenu
						recipeId={preparationMethodRecipe.id}
						recipeTitle={preparationMethodRecipe.titulo}
						closeMenu={() => setPreparationMethodRecipe(null)}
					/>
				) : null}
			</div>
		</TooltipProvider>
	);
}
