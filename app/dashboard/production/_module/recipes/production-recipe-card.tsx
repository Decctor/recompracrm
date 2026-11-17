"use client";

import type { TGetProductionRecipesOutputDefault } from "@/app/api/productions/recipes/route";
import { RecipeCover } from "@/components/Productions/RecipeCover";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { appRoutes } from "@/lib/navigation/routes";
import { cn } from "@/lib/utils";
import dayjs from "dayjs";
import { AlertTriangle, BookOpenText, Clock, Coins, Ellipsis, History, Pencil, Play, Scale, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatMinutesAsDuration, formatProductionDay, formatProductionQuantity } from "../history/production-format";

type TProductionRecipeListItem = TGetProductionRecipesOutputDefault["recipes"][number];

const DURATION_UNIT_MINUTES = { MINUTOS: 1, HORAS: 60, DIAS: 1440 } as const;

function formatRecipeDuration(recipe: TProductionRecipeListItem) {
	const { previsaoTempoValor: value, previsaoTempoMedida: measure } = recipe;
	if (value == null || !measure) return null;
	if (measure === "DIAS") return `${formatDecimalPlaces(value, 0, 1)} ${value === 1 ? "dia" : "dias"}`;
	const minutesPerUnit = DURATION_UNIT_MINUTES[measure as keyof typeof DURATION_UNIT_MINUTES];
	return minutesPerUnit ? formatMinutesAsDuration(value * minutesPerUnit) : null;
}

function formatLastProduction(date: Date | string | null) {
	if (!date) return "Nunca produzida";
	const daysAgo = dayjs().startOf("day").diff(dayjs(date).startOf("day"), "day");
	if (daysAgo <= 0) return "Produzida hoje";
	if (daysAgo === 1) return "Produzida ontem";
	return `Produzida em ${formatProductionDay(date)}`;
}

function formatCount(count: number, singular: string, plural: string) {
	return `${count} ${count === 1 ? singular : plural}`;
}

type ProductionRecipeCardProps = {
	recipe: TProductionRecipeListItem;
	canProduce: boolean;
	onEdit?: () => void;
	onViewPreparationMethod: () => void;
};

export default function ProductionRecipeCard({ recipe, canProduce, onEdit, onViewPreparationMethod }: ProductionRecipeCardProps) {
	const duration = formatRecipeDuration(recipe);
	const mainOutput = recipe.saidas[0] ?? null;

	const coverChips = (
		<>
			{duration ? (
				<CoverChip className="left-3">
					<Clock />
					{duration}
				</CoverChip>
			) : null}
			{mainOutput ? (
				<CoverChip className="right-3">
					<Scale />
					Rende {formatProductionQuantity(mainOutput.quantidade, mainOutput.produto?.unidade)}
				</CoverChip>
			) : null}
		</>
	);

	return (
		<article className="flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xs transition-all hover:-translate-y-0.5 hover:shadow-md">
			{onEdit ? (
				<button
					type="button"
					onClick={onEdit}
					aria-label={`Editar receita ${recipe.titulo}`}
					className="relative block aspect-[16/10] w-full cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
				>
					<RecipeCover recipe={recipe} className="h-full w-full" />
					{coverChips}
				</button>
			) : (
				<div className="relative aspect-[16/10] w-full">
					<RecipeCover recipe={recipe} className="h-full w-full" />
					{coverChips}
				</div>
			)}

			<div className="flex flex-1 flex-col gap-2.5 px-4 pb-4 pt-3.5">
				<div className="flex min-w-0 flex-col gap-0.5">
					<h2 className="truncate text-base font-bold tracking-tight">{recipe.titulo}</h2>
					<span className="text-xs text-muted-foreground">
						{formatCount(recipe.insumos.length, "insumo", "insumos")} · {formatCount(recipe.producoes, "produção", "produções")}
					</span>
				</div>
				<div className="flex flex-wrap items-center gap-1.5">
					<RecipeValuationChips valores={recipe.valores} />
				</div>
				<div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-2.5">
					<span className="flex min-w-0 items-center gap-1 text-[11px] font-medium text-muted-foreground">
						<History className="h-3.5 w-3.5 shrink-0" />
						<span className="line-clamp-2">{formatLastProduction(recipe.dataUltimaProducao)}</span>
					</span>
					<div className="flex shrink-0 items-center gap-0.5">
						<DropdownMenu>
							<DropdownMenuTrigger
								render={
									<Button variant="ghost" size="icon-sm" aria-label="Mais ações da receita">
										<Ellipsis className="h-4 w-4" />
									</Button>
								}
							/>
							<DropdownMenuContent align="end" className="w-48">
								<DropdownMenuGroup>
									{onEdit ? (
										<DropdownMenuItem onClick={onEdit}>
											<Pencil className="h-4 w-4" />
											EDITAR
										</DropdownMenuItem>
									) : null}
									<DropdownMenuItem onClick={onViewPreparationMethod}>
										<BookOpenText className="h-4 w-4" />
										MODO DE PREPARO
									</DropdownMenuItem>
								</DropdownMenuGroup>
							</DropdownMenuContent>
						</DropdownMenu>
						{canProduce ? (
							<Button variant="brand" size="sm" className="font-semibold" asChild>
								<Link href={appRoutes.productions.new(recipe.id)}>
									<Play className="h-3.5 w-3.5" />
									PRODUZIR
								</Link>
							</Button>
						) : null}
					</div>
				</div>
			</div>
		</article>
	);
}

function CoverChip({ className, children }: { className?: string; children: ReactNode }) {
	return (
		<span
			className={cn(
				"absolute top-3 inline-flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-1 text-xs font-semibold text-foreground backdrop-blur-sm [&_svg]:h-3 [&_svg]:w-3",
				className,
			)}
		>
			{children}
		</span>
	);
}

/**
 * Custo e margem da receita — mesma geometria das pills de `ValuationChips`, sem o retorno: no card
 * da receita a pergunta é "quanto custa e quanto sobra". Valores de receita são sempre estimativa
 * pelo catálogo, daí o tracejado.
 */
function RecipeValuationChips({ valores }: { valores: TProductionRecipeListItem["valores"] }) {
	// Sem permissão de ver custos (custo e margem chegam `null`), o card mostra só o retorno esperado.
	if (valores.custoTotal == null || valores.margem == null) {
		return (
			<ValuationChip
				variant="muted"
				icon={valores.retornoCompleto ? <TrendingUp /> : <AlertTriangle />}
				label={`RETORNO: ${formatToMoney(valores.retornoEsperado)}`}
				tooltip={
					valores.retornoCompleto
						? "Retorno esperado das saídas pelos preços atuais do catálogo."
						: "Retorno esperado das saídas, subestimado: há saída sem preço de venda cadastrado."
				}
			/>
		);
	}
	const marginIsNegative = valores.margem < 0;
	const margin = valores.margemPercentual !== null ? `${formatDecimalPlaces(valores.margemPercentual, 0, 1)}%` : "—";

	return (
		<>
			<ValuationChip
				variant="muted"
				icon={valores.custoCompleto ? <Coins /> : <AlertTriangle />}
				label={`CUSTO: ${formatToMoney(valores.custoTotal)}`}
				tooltip={
					valores.custoCompleto
						? "Custo dos insumos pelos preços atuais do catálogo."
						: "Custo dos insumos, subestimado: há insumo sem preço de custo cadastrado."
				}
			/>
			<ValuationChip
				variant={marginIsNegative ? "destructive" : "success"}
				icon={marginIsNegative ? <TrendingDown /> : <TrendingUp />}
				label={`MARGEM: ${margin}`}
				tooltip={`Retorno esperado de ${formatToMoney(valores.retornoEsperado)} menos o custo dos insumos (${formatToMoney(valores.margem)}).${
					valores.retornoCompleto ? "" : " Há saída sem preço de venda cadastrado."
				}`}
			/>
		</>
	);
}

function ValuationChip({
	variant,
	icon,
	label,
	tooltip,
}: {
	variant: "muted" | "success" | "destructive";
	icon: ReactNode;
	label: string;
	tooltip: string;
}) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Chip.Root variant={variant} size="xs" shape="pill" className="cursor-default border-dashed border-current/40">
						<Chip.Icon>{icon}</Chip.Icon>
						<Chip.Label caps weight="bold">
							{label}
						</Chip.Label>
					</Chip.Root>
				}
			/>
			<TooltipContent>{tooltip}</TooltipContent>
		</Tooltip>
	);
}
