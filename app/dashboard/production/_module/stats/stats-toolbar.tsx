"use client";

import { RecipeCover } from "@/components/Productions/RecipeCover";
import { InteractiveFilter, type InteractiveFilterDateRange, type InteractiveFilterOption } from "@/components/ui/interactive-filter";
import { formatInteractiveDateRangeSummary, formatInteractiveOptionSummary } from "@/components/ui/interactive-filter-formatting";
import { CAMPAIGN_STATS_PERIOD_PRESETS, matchCampaignStatsPeriodPreset, type TStatsPeriod } from "@/lib/campaigns/stats-period";
import { useProductionRecipes } from "@/lib/queries/productions";
import { cn } from "@/lib/utils";
import dayjs from "dayjs";
import { Calendar, ClipboardList } from "lucide-react";
import { useState } from "react";

type StatsToolbarProps = {
	period: TStatsPeriod;
	onPeriodChange: (period: TStatsPeriod) => void;
	recipeIds: string[];
	onRecipeIdsChange: (recipeIds: string[]) => void;
};

/** Atalhos de período, filtro de receitas e intervalo de datas — a barra das estatísticas de campanha. */
export function StatsToolbar({ period, onPeriodChange, recipeIds, onRecipeIdsChange }: StatsToolbarProps) {
	const activePreset = matchCampaignStatsPeriodPreset(period);

	return (
		<div className="flex w-full flex-wrap items-center justify-end gap-2">
			<div className="flex items-center gap-1 rounded-lg bg-secondary p-1" role="group" aria-label="Atalhos de período">
				{CAMPAIGN_STATS_PERIOD_PRESETS.map((preset) => (
					<button
						key={preset.id}
						type="button"
						aria-pressed={activePreset === preset.id}
						onClick={() => onPeriodChange(preset.getValue(new Date()))}
						className={cn(
							"rounded-md px-2.5 py-1 text-[0.7rem] font-bold transition-colors",
							activePreset === preset.id ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
						)}
					>
						{preset.label}
					</button>
				))}
			</div>
			<RecipeFilter value={recipeIds} onChange={onRecipeIdsChange} />
			<PeriodFilter period={period} onChange={onPeriodChange} />
		</div>
	);
}

function RecipeFilter({ value, onChange }: { value: string[]; onChange: (recipeIds: string[]) => void }) {
	// Inclui inativas: uma receita desativada ainda tem produções no período.
	const { data } = useProductionRecipes({
		initialFilters: { activeOnly: false, orderBy: "NOME", orderByDirection: "asc", pageSize: 100 },
	});
	const options = (data?.recipes ?? []).map((recipe) => ({
		id: recipe.id,
		value: recipe.id,
		label: recipe.titulo,
		startContent: <RecipeCover recipe={recipe} className="size-6 shrink-0 rounded-md" iconClassName="size-3.5" />,
	})) satisfies InteractiveFilterOption<string>[];

	return (
		<InteractiveFilter.Root className="w-fit">
			<InteractiveFilter.Trigger>
				<InteractiveFilter.Icon>
					<ClipboardList className="h-4 w-4" />
					<InteractiveFilter.Label>RECEITA</InteractiveFilter.Label>
				</InteractiveFilter.Icon>
				<InteractiveFilter.Value>{formatInteractiveOptionSummary(options, value)}</InteractiveFilter.Value>
				{value.length > 0 ? <InteractiveFilter.Clear onClear={() => onChange([])} /> : null}
			</InteractiveFilter.Trigger>
			<InteractiveFilter.Content className="w-72 p-0">
				<InteractiveFilter.MultiContent
					options={options}
					value={value}
					onChange={onChange}
					onClear={() => onChange([])}
					isCleared={value.length === 0}
					searchPlaceholder="Buscar receita..."
					clearLabel="TODAS"
				/>
			</InteractiveFilter.Content>
		</InteractiveFilter.Root>
	);
}

/**
 * Intervalo livre. O período é obrigatório, então só se aplica com início e fim escolhidos — o primeiro
 * clique no calendário fica pendente em vez de disparar a consulta de um dia só.
 */
function PeriodFilter({ period, onChange }: { period: TStatsPeriod; onChange: (period: TStatsPeriod) => void }) {
	const [draft, setDraft] = useState<InteractiveFilterDateRange | null>(null);
	const shown = draft ?? { from: period.startDate, to: period.endDate };

	function handleChange(range: InteractiveFilterDateRange) {
		if (range.from && range.to) {
			setDraft(null);
			onChange({ startDate: dayjs(range.from).startOf("day").toDate(), endDate: dayjs(range.to).endOf("day").toDate() });
			return;
		}
		setDraft(range);
	}

	return (
		<InteractiveFilter.Root
			className="w-fit"
			onOpenChange={(open) => {
				if (!open) setDraft(null);
			}}
		>
			<InteractiveFilter.Trigger>
				<InteractiveFilter.Icon>
					<Calendar className="h-4 w-4" />
					<InteractiveFilter.Label>PERÍODO</InteractiveFilter.Label>
				</InteractiveFilter.Icon>
				<InteractiveFilter.Value>{formatInteractiveDateRangeSummary(period.startDate, period.endDate)}</InteractiveFilter.Value>
			</InteractiveFilter.Trigger>
			<InteractiveFilter.Content className="w-auto p-0" align="end">
				<InteractiveFilter.DateRangeContent value={shown} onChange={handleChange} presets={[]} />
			</InteractiveFilter.Content>
		</InteractiveFilter.Root>
	);
}
