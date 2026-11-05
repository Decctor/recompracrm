"use client";

import type { TProductionPermissions } from "@/lib/permissions/productions";
import type { TGetProductionsOutputDefault } from "@/app/api/productions/route";
import type { TGetProductionRecipesOutputDefault } from "@/app/api/productions/recipes/route";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import ControlProduction from "@/components/Modals/Internal/Productions/ControlProduction";
import ControlProductionRecipe from "@/components/Modals/Internal/Productions/ControlProductionRecipe";
import NewProduction from "@/components/Modals/Internal/Productions/NewProduction";
import NewProductionRecipe from "@/components/Modals/Internal/Productions/NewProductionRecipe";
import ProductionRecipePreparationMethodViewer from "@/components/Modals/Internal/Productions/ProductionRecipePreparationMethodViewer";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { Button } from "@/components/ui/button";
import {
	DropdownMenuGroup,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getErrorMessage } from "@/lib/errors";
import { showSuccessActionToast } from "@/lib/toasts/show-action-toast";
import { formatDateAsLocale } from "@/lib/formatting";
import { appRoutes } from "@/lib/navigation/routes";
import { createManualPrintJob } from "@/lib/mutations/desktop-agent";
import { completeProduction } from "@/lib/mutations/productions";
import { cn } from "@/lib/utils";
import { organizationHasPrinterForFinalidade, useAgentPrinters } from "@/lib/queries/desktop-agent";
import { useProductionRecipes, useProductions } from "@/lib/queries/productions";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	Calendar,
	CalendarCheck,
	CalendarPlus,
	CheckCheck,
	CheckCircle2,
	ClipboardList,
	Clock,
	Factory,
	FileIcon,
	MoreHorizontal,
	Package,
	PackageCheck,
	Pencil,
	Plus,
	Printer,
	X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ValuationChips } from "./_components/valuation-chips";

const PRODUCTION_STATUS_CONFIG = {
	RASCUNHO: {
		label: "RASCUNHO",
		icon: <FileIcon className="h-4 w-4 min-h-4 min-w-4 text-gray-600" />,
		className: "bg-gray-200 text-gray-600",
	},
	PLANEJADA: {
		label: "PLANEJADA",
		icon: <Calendar className="h-4 w-4 min-h-4 min-w-4 text-blue-600" />,
		className: "bg-blue-200 text-blue-600",
	},
	EM_PRODUCAO: {
		label: "EM PRODUÇÃO",
		icon: <Factory className="h-4 w-4 min-h-4 min-w-4 text-yellow-600" />,
		className: "bg-yellow-200 text-yellow-600",
	},
	CONCLUIDA: {
		label: "CONCLUÍDA",
		icon: <CheckCheck className="h-4 w-4 min-h-4 min-w-4 text-green-600" />,
		className: "bg-green-200 text-green-600",
	},
	CANCELADA: {
		label: "CANCELADA",
		icon: <X className="h-4 w-4 min-h-4 min-w-4 text-red-600" />,
		className: "bg-red-200 text-red-600",
	},
} as const;

function formatCountLabel(count: number, singular: string, plural: string) {
	return `${count} ${count === 1 ? singular : plural}`;
}

export default function ProductionsPage({ permissions }: { permissions: TProductionPermissions }) {
	const queryClient = useQueryClient();
	const [newProductionModalIsOpen, setNewProductionModalIsOpen] = useState(false);
	const [newRecipeModalIsOpen, setNewRecipeModalIsOpen] = useState(false);
	const [editingProductionId, setEditingProductionId] = useState<string | null>(null);
	const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);

	const productionsQuery = useProductions({
		initialFilters: { page: 1, search: "", status: [], origem: [], periodAfter: null, periodBefore: null },
	});
	const recipesQuery = useProductionRecipes({
		initialFilters: { page: 1, search: "", activeOnly: true },
	});

	const handleProductionsOnMutate = async () => await queryClient.cancelQueries({ queryKey: productionsQuery.queryKey });
	const handleProductionsOnSettled = async () => {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: productionsQuery.queryKey }),
			queryClient.invalidateQueries({ queryKey: ["product-stock-lots"] }),
		]);
	};
	const handleRecipesOnMutate = async () => await queryClient.cancelQueries({ queryKey: recipesQuery.queryKey });
	const handleRecipesOnSettled = async () => await queryClient.invalidateQueries({ queryKey: recipesQuery.queryKey });
	const { mutate: handleCompleteProductionMutation, isPending: productionCompletionIsPending } = useMutation({
		mutationKey: ["complete-production"],
		mutationFn: completeProduction,
		onMutate: handleProductionsOnMutate,
		onSuccess: (data) => {
			const createdStockLotIds = data.data.createdStockLots.map((stockLot) => stockLot.id);
			if (createdStockLotIds.length === 0) return toast.success(data.message);

			showSuccessActionToast({
				message: data.message,
				actionLabel: "IMPRIMIR ETIQUETAS",
				onAction: () => window.open(`${appRoutes.inventory.lotLabelsPreview()}?ids=${createdStockLotIds.join(",")}`, "_blank", "noopener,noreferrer"),
			});
		},
		onError: (error) => toast.error(getErrorMessage(error)),
		onSettled: handleProductionsOnSettled,
	});

	return (
		<TooltipProvider>
			<Tabs defaultValue="producoes" className="flex w-full flex-col gap-3">
				<TabsList variant="page">
					<TabsTrigger value="producoes">
						<Factory className="h-4 w-4 min-h-4 min-w-4" />
						PRODUÇÕES
					</TabsTrigger>
					<TabsTrigger value="receitas">
						<ClipboardList className="h-4 w-4 min-h-4 min-w-4" />
						RECEITAS
					</TabsTrigger>
				</TabsList>
				<TabsContent value="producoes" className="flex w-full flex-col gap-3">
					<ProductionsTab
						query={productionsQuery}
						onCreate={permissions.criar ? () => setNewProductionModalIsOpen(true) : undefined}
						onEdit={permissions.editar ? (productionId) => setEditingProductionId(productionId) : undefined}
						onComplete={permissions.concluir ? (productionId) => handleCompleteProductionMutation({ productionId }) : undefined}
						completionIsPending={productionCompletionIsPending}
					/>
				</TabsContent>
				<TabsContent value="receitas" className="flex w-full flex-col gap-3">
					<RecipesTab
						query={recipesQuery}
						onCreate={permissions.criar ? () => setNewRecipeModalIsOpen(true) : undefined}
						onEdit={permissions.editar ? (recipeId) => setEditingRecipeId(recipeId) : undefined}
					/>
				</TabsContent>

				{newProductionModalIsOpen ? (
					<NewProduction
						closeModal={() => setNewProductionModalIsOpen(false)}
						callbacks={{ onMutate: handleProductionsOnMutate, onSettled: handleProductionsOnSettled }}
					/>
				) : null}
				{editingProductionId ? (
					<ControlProduction
						productionId={editingProductionId}
						closeModal={() => setEditingProductionId(null)}
						callbacks={{ onMutate: handleProductionsOnMutate, onSettled: handleProductionsOnSettled }}
					/>
				) : null}
				{newRecipeModalIsOpen ? (
					<NewProductionRecipe
						closeModal={() => setNewRecipeModalIsOpen(false)}
						callbacks={{ onMutate: handleRecipesOnMutate, onSettled: handleRecipesOnSettled }}
					/>
				) : null}
				{editingRecipeId ? (
					<ControlProductionRecipe
						productionRecipeId={editingRecipeId}
						closeModal={() => setEditingRecipeId(null)}
						callbacks={{ onMutate: handleRecipesOnMutate, onSettled: handleRecipesOnSettled }}
					/>
				) : null}
			</Tabs>
		</TooltipProvider>
	);
}

type ProductionsTabProps = {
	query: ReturnType<typeof useProductions>;
	// Callbacks ausentes = membro sem a permissão correspondente de `producao`: a ação não aparece.
	onCreate?: () => void;
	onEdit?: (productionId: string) => void;
	onComplete?: (productionId: string) => void;
	completionIsPending: boolean;
};

function ProductionsTab({ query, onCreate, onEdit, onComplete, completionIsPending }: ProductionsTabProps) {
	const productions = query.data?.productions ?? [];
	const productionsMatched = query.data?.productionsMatched ?? 0;
	const productionsShowing = productions.length;
	const totalPages = query.data?.totalPages ?? 0;

	return (
		<>
			<div className="flex w-full flex-col-reverse items-stretch gap-2 lg:flex-row lg:items-center">
				<Input
					value={query.filters.search ?? ""}
					placeholder="Pesquisar produção..."
					onChange={(event) => query.updateFilters({ search: event.target.value, page: 1 })}
					className="grow rounded-xl"
				/>
				{onCreate ? (
					<Button className="flex w-full items-center gap-2 lg:w-auto" size="sm" onClick={onCreate}>
						<Plus className="h-4 w-4" />
						NOVA PRODUÇÃO
					</Button>
				) : null}
			</div>

			<GeneralPaginationComponent
				activePage={query.filters.page}
				queryLoading={query.isLoading}
				selectPage={(page) => query.updateFilters({ page })}
				totalPages={totalPages || 0}
				itemsMatchedText={productionsMatched === 1 ? "1 produção encontrada." : `${productionsMatched} produções encontradas.`}
				itemsShowingText={productionsShowing === 1 ? "Mostrando 1 produção." : `Mostrando ${productionsShowing} produções.`}
			/>

			{query.isLoading ? <LoadingComponent /> : null}
			{query.isError ? <ErrorComponent msg={getErrorMessage(query.error)} /> : null}

			{query.isSuccess && productions.length > 0
				? productions.map((production) => (
						<ProductionCard
							key={production.id}
							production={production}
							onEdit={onEdit ? () => onEdit(production.id) : undefined}
							onComplete={onComplete ? () => onComplete(production.id) : undefined}
							completionIsPending={completionIsPending}
						/>
					))
				: null}

			{query.isSuccess && productions.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Factory />
						</EmptyMedia>
						<EmptyTitle>{query.filters.search ? "Nenhuma produção corresponde à busca" : "Nenhuma produção encontrada"}</EmptyTitle>
						<EmptyDescription>
							{query.filters.search
								? "Revise o termo pesquisado ou limpe a busca para ver todas as produções."
								: "Registre produções para controlar insumos consumidos e produtos gerados."}
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent className="flex-row justify-center gap-2">
						{onCreate ? (
							<Button onClick={onCreate}>CRIAR PRODUÇÃO</Button>
						) : null}
					</EmptyContent>
				</Empty>
			) : null}
		</>
	);
}

type RecipesTabProps = {
	query: ReturnType<typeof useProductionRecipes>;
	onCreate?: () => void;
	onEdit?: (recipeId: string) => void;
};

function RecipesTab({ query, onCreate, onEdit }: RecipesTabProps) {
	const recipes = query.data?.recipes ?? [];
	const recipesMatched = query.data?.recipesMatched ?? 0;
	const recipesShowing = recipes.length;
	const totalPages = query.data?.totalPages ?? 0;

	return (
		<>
			<div className="flex w-full flex-col-reverse items-stretch gap-2 lg:flex-row lg:items-center">
				<Input
					value={query.filters.search ?? ""}
					placeholder="Pesquisar receita..."
					onChange={(event) => query.updateFilters({ search: event.target.value, page: 1 })}
					className="grow rounded-xl"
				/>
				{onCreate ? (
					<Button className="flex w-full items-center gap-2 lg:w-auto" size="sm" onClick={onCreate}>
						<Plus className="h-4 w-4" />
						NOVA RECEITA
					</Button>
				) : null}
			</div>

			<GeneralPaginationComponent
				activePage={query.filters.page}
				queryLoading={query.isLoading}
				selectPage={(page) => query.updateFilters({ page })}
				totalPages={totalPages || 0}
				itemsMatchedText={recipesMatched === 1 ? "1 receita encontrada." : `${recipesMatched} receitas encontradas.`}
				itemsShowingText={recipesShowing === 1 ? "Mostrando 1 receita." : `Mostrando ${recipesShowing} receitas.`}
			/>

			{query.isLoading ? <LoadingComponent /> : null}
			{query.isError ? <ErrorComponent msg={getErrorMessage(query.error)} /> : null}

			{query.isSuccess && recipes.length > 0
				? recipes.map((recipe) => <ProductionRecipeCard key={recipe.id} recipe={recipe} onEdit={onEdit ? () => onEdit(recipe.id) : undefined} />)
				: null}

			{query.isSuccess && recipes.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Factory />
						</EmptyMedia>
						<EmptyTitle>{query.filters.search ? "Nenhuma receita corresponde à busca" : "Nenhuma receita encontrada"}</EmptyTitle>
						<EmptyDescription>
							{query.filters.search
								? "Revise o termo pesquisado ou limpe a busca para ver todas as receitas."
								: "Cadastre fichas técnicas para transformar insumos em produtos finais."}
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent className="flex-row justify-center gap-2">
						{onCreate ? (
							<Button onClick={onCreate}>CRIAR RECEITA</Button>
						) : null}
					</EmptyContent>
				</Empty>
			) : null}
		</>
	);
}

type ProductionCardProps = {
	production: TGetProductionsOutputDefault["productions"][number];
	onEdit?: () => void;
	onComplete?: () => void;
	completionIsPending: boolean;
};

function ProductionCard({ production, onEdit, onComplete, completionIsPending }: ProductionCardProps) {
	const statusConfig = PRODUCTION_STATUS_CONFIG[production.status];
	const canComplete = production.status !== "CONCLUIDA" && production.status !== "CANCELADA";

	return (
		<div className="bg-card border-border flex w-full flex-col gap-1.5 rounded-xl border px-3 py-4 shadow-2xs">
			<div className="flex w-full flex-col items-start justify-between gap-2 lg:flex-row lg:items-center">
				<div className="min-w-0">
					<h1 className="text-xs font-bold tracking-tight lg:text-sm">{production.titulo}</h1>
					{production.receita?.titulo ? <p className="line-clamp-1 text-[0.65rem] text-muted-foreground">{production.receita.titulo}</p> : null}
				</div>
				<div className={cn("flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1", statusConfig.className)}>
					{statusConfig.icon}
					<span className="text-xs font-medium uppercase tracking-tight">{statusConfig.label}</span>
				</div>
			</div>

			<div className="flex w-full flex-col items-start justify-between gap-2 lg:flex-row lg:items-center">
				<div className="flex flex-wrap items-center gap-2">
					<ValuationChips valores={production.valores} />
					<div className="flex items-center gap-1">
						<Package className="h-4 w-4 min-h-4 min-w-4" />
						<span className="text-[0.65rem] font-medium uppercase tracking-tight text-muted-foreground">
							{formatCountLabel(production.entradas.length, "ENTRADA", "ENTRADAS")}
						</span>
					</div>
					<div className="flex items-center gap-1">
						<PackageCheck className="h-4 w-4 min-h-4 min-w-4" />
						<span className="text-[0.65rem] font-medium uppercase tracking-tight text-muted-foreground">
							{formatCountLabel(production.saidas.length, "SAÍDA", "SAÍDAS")}
						</span>
					</div>
					{production.dataPrevisaoConclusao ? (
						<div className="flex items-center gap-1">
							<Clock className="h-4 w-4 min-h-4 min-w-4" />
							<span className="text-[0.65rem] font-medium uppercase tracking-tight text-muted-foreground">
								PREVISÃO: {formatDateAsLocale(production.dataPrevisaoConclusao, false)}
							</span>
						</div>
					) : null}
					<div className="flex items-center gap-1">
						<CalendarPlus className="h-4 w-4 min-h-4 min-w-4" />
						<span className="text-[0.65rem] font-medium uppercase tracking-tight text-muted-foreground">
							CRIADA EM: {formatDateAsLocale(production.dataInsercao, true)}
						</span>
					</div>
					{production.dataConclusao ? (
						<div className="flex items-center gap-1">
							<CalendarCheck className="h-4 w-4 min-h-4 min-w-4 text-green-600" />
							<span className="text-[0.65rem] font-medium uppercase tracking-tight text-muted-foreground">
								CONCLUÍDA EM: {formatDateAsLocale(production.dataConclusao, true)}
							</span>
						</div>
					) : null}
				</div>
				<div className="flex flex-wrap items-center gap-2">
					{canComplete && onComplete ? (
						<Button variant="ghost-default" size="xs" onClick={onComplete} disabled={completionIsPending}>
							<CheckCircle2 className="h-4 w-4" />
							CONCLUIR
						</Button>
					) : null}
					{onEdit ? (
						<Button variant="ghost" size="xs" onClick={onEdit}>
							<Pencil className="h-4 w-4" />
							EDITAR
						</Button>
					) : null}
					<ProductionCardActionsMenu production={production} onEdit={onEdit} />
				</div>
			</div>
		</div>
	);
}

// Menu de ações rápidas da produção (mesmo padrão do módulo fiscal): impressão de etiquetas de
// lote via agente desktop — uma etiqueta por saída da produção, montada no servidor.
function ProductionCardActionsMenu({ production, onEdit }: { production: TGetProductionsOutputDefault["productions"][number]; onEdit?: () => void }) {
	const { data: printers } = useAgentPrinters();
	const canPrintLabels = organizationHasPrinterForFinalidade(printers, "ETIQUETA_LOTE") && production.saidas.length > 0;

	const { mutate: printLabels, isPending: printIsPending } = useMutation({
		mutationKey: ["print-production-labels", production.id],
		mutationFn: createManualPrintJob,
		onSuccess: (data) => toast.success(data.message),
		onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
	});

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button variant="ghost" size="icon" aria-label="Mais ações da produção">
						<MoreHorizontal className="h-4 w-4" />
					</Button>
				}
			/>
			<DropdownMenuContent align="end" className="w-56">
				<DropdownMenuGroup>
					<DropdownMenuLabel>Ações rápidas</DropdownMenuLabel>
					{onEdit ? (
						<DropdownMenuItem onClick={onEdit}>
							<Pencil className="h-4 w-4" />
							EDITAR PRODUÇÃO
						</DropdownMenuItem>
					) : null}
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem
						disabled={!canPrintLabels || printIsPending}
						onClick={() => printLabels({ finalidade: "ETIQUETA_LOTE", producaoId: production.id })}
					>
						<Printer className="h-4 w-4" />
						IMPRIMIR ETIQUETAS
					</DropdownMenuItem>
					{production.saidas.length === 0 ? (
						<p className="px-2 pb-1.5 pt-0.5 text-[0.65rem] leading-tight text-muted-foreground">A produção não possui saídas para etiquetar.</p>
					) : !canPrintLabels ? (
						<p className="px-2 pb-1.5 pt-0.5 text-[0.65rem] leading-tight text-muted-foreground">
							Nenhuma impressora ativa atende a etiquetas. Configure em Configurações → Dispositivos.
						</p>
					) : null}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

type ProductionRecipeCardProps = {
	recipe: TGetProductionRecipesOutputDefault["recipes"][number];
	onEdit?: () => void;
};

function ProductionRecipeCard({ recipe, onEdit }: ProductionRecipeCardProps) {
	const hasDuration = Boolean(recipe.previsaoTempoValor && recipe.previsaoTempoMedida);

	return (
		<div className="bg-card border-border flex w-full flex-col gap-1.5 rounded-xl border px-3 py-4 shadow-2xs">
			<div className="min-w-0">
				<h1 className="text-xs font-bold tracking-tight lg:text-sm">{recipe.titulo}</h1>
				{recipe.descricao ? <p className="line-clamp-2 text-[0.65rem] text-muted-foreground">{recipe.descricao}</p> : null}
			</div>

			<div className="flex w-full flex-col items-start justify-between gap-2 lg:flex-row lg:items-center">
				<div className="flex flex-wrap items-center gap-2">
					<ValuationChips valores={recipe.valores} />
					<div className="flex items-center gap-1">
						<Package className="h-4 w-4 min-h-4 min-w-4" />
						<span className="text-[0.65rem] font-medium uppercase tracking-tight text-muted-foreground">
							{formatCountLabel(recipe.insumos.length, "INSUMO", "INSUMOS")}
						</span>
					</div>
					<div className="flex items-center gap-1">
						<PackageCheck className="h-4 w-4 min-h-4 min-w-4" />
						<span className="text-[0.65rem] font-medium uppercase tracking-tight text-muted-foreground">
							{formatCountLabel(recipe.saidas.length, "SAÍDA", "SAÍDAS")}
						</span>
					</div>
					{hasDuration ? (
						<div className="flex items-center gap-1">
							<Clock className="h-4 w-4 min-h-4 min-w-4" />
							<span className="text-[0.65rem] font-medium uppercase tracking-tight text-muted-foreground">
								{`${recipe.previsaoTempoValor} ${recipe.previsaoTempoMedida}`}
							</span>
						</div>
					) : null}
					<div className="flex items-center gap-1">
						<CalendarPlus className="h-4 w-4 min-h-4 min-w-4" />
						<span className="text-[0.65rem] font-medium uppercase tracking-tight text-muted-foreground">
							CRIADA EM: {formatDateAsLocale(recipe.dataInsercao, true)}
						</span>
					</div>
				</div>
				<div className="flex items-center gap-1">
					<ProductionRecipePreparationMethodViewer recipeId={recipe.id} recipeTitle={recipe.titulo} />
					{onEdit ? (
						<Button variant="ghost" size="xs" onClick={onEdit}>
							<Pencil className="h-4 w-4" />
							EDITAR
						</Button>
					) : null}
				</div>
			</div>
		</div>
	);
}
