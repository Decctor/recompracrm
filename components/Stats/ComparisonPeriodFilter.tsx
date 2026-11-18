"use client";

import { Calendar } from "@/components/ui/calendar";
import { InteractiveFilter } from "@/components/ui/interactive-filter";
import { formatInteractiveDateRangeSummary } from "@/components/ui/interactive-filter-formatting";
import {
	DEFAULT_COMPARISON_PRESET_ID,
	DEFAULT_COMPARISON_SELECTION,
	type TComparisonPresetId,
	type TComparisonSelection,
	buildComparisonPeriodPresets,
	resolveComparisonPeriod,
	toFullDayRange,
} from "@/lib/period-presets";
import { cn } from "@/lib/utils";
import { ptBR } from "date-fns/locale";
import dayjs from "dayjs";
import { Check, GitCompare } from "lucide-react";
import { useState } from "react";

/** Nome curto da regra para o chip, onde o rótulo inteiro não cabe ao lado das datas. */
const COMPARISON_PRESET_SHORT_LABELS: Record<TComparisonPresetId, string> = {
	"previous-period": "PERÍODO ANTERIOR",
	"same-period-previous-month": "MÊS ANTERIOR",
	"same-period-previous-year": "ANO ANTERIOR",
};

/**
 * Datas de um recorte de comparação. Quando o período base ainda está em curso, a comparação para
 * no mesmo horário de hoje — e isso aparece ("ATÉ 16:18"), senão o número parece de um dia inteiro.
 */
export function formatComparisonPeriodSummary(after: Date | string, before: Date | string) {
	const range = formatInteractiveDateRangeSummary(after, before);
	const end = dayjs(before);
	const endsAtEndOfDay = end.isSame(end.endOf("day"), "minute");
	return endsAtEndOfDay ? range : `${range} ATÉ ${end.format("HH:mm")}`;
}

export function isDefaultComparisonSelection(selection: TComparisonSelection) {
	return selection.kind === "preset" && selection.presetId === DEFAULT_COMPARISON_PRESET_ID;
}

type ComparisonPeriodFilterProps = {
	/** Período que está na tela; as regras se resolvem sobre ele. */
	base: { after: Date; before: Date };
	/** O "agora" usado para resolver as regras — o mesmo que vai para a consulta. */
	referenceDate: Date;
	value: TComparisonSelection;
	onChange: (next: TComparisonSelection) => void;
	/** O comparativo existe para comparar; a análise comercial pode mostrar só o período. */
	allowNone?: boolean;
};

/**
 * "Comparar com": regras prontas, que acompanham o período base, ou um recorte livre no calendário.
 * Cada regra mostra as datas em que se resolve, porque "mês anterior" sozinho já foi lido de mais
 * de um jeito.
 */
export function ComparisonPeriodFilter({ base, referenceDate, value, onChange, allowNone = false }: ComparisonPeriodFilterProps) {
	const [open, setOpen] = useState(false);
	const presets = buildComparisonPeriodPresets(base);
	const resolved = resolveComparisonPeriod(value, base, referenceDate);

	const summary =
		value.kind === "none"
			? "SEM COMPARAÇÃO"
			: value.kind === "preset" && resolved
				? `${COMPARISON_PRESET_SHORT_LABELS[value.presetId]} · ${formatComparisonPeriodSummary(resolved.after, resolved.before)}`
				: resolved
					? formatComparisonPeriodSummary(resolved.after, resolved.before)
					: "—";

	function selectAndClose(next: TComparisonSelection) {
		onChange(next);
		setOpen(false);
	}

	return (
		<InteractiveFilter.Root className="w-fit" open={open} onOpenChange={setOpen}>
			<InteractiveFilter.Trigger>
				<InteractiveFilter.Icon>
					<GitCompare className="h-4 w-4" />
					<InteractiveFilter.Label>COMPARAR COM</InteractiveFilter.Label>
				</InteractiveFilter.Icon>
				<InteractiveFilter.Value>{summary}</InteractiveFilter.Value>
				{!isDefaultComparisonSelection(value) ? <InteractiveFilter.Clear onClear={() => onChange(DEFAULT_COMPARISON_SELECTION)} /> : null}
			</InteractiveFilter.Trigger>
			<InteractiveFilter.Content className="w-auto p-0">
				<div className="flex flex-col md:flex-row">
					<div className="flex flex-col gap-1 border-b border-border p-3 md:w-72 md:border-r md:border-b-0">
						<p className="mb-1 text-[0.65rem] font-bold tracking-[0.08em] text-muted-foreground">REGRAS</p>
						{presets.map((item) => {
							const { from, to } = item.getValue(referenceDate);
							return (
								<ComparisonOption
									key={item.id}
									label={item.label}
									description={formatComparisonPeriodSummary(from, to)}
									selected={value.kind === "preset" && value.presetId === item.id}
									onSelect={() => selectAndClose({ kind: "preset", presetId: item.id })}
								/>
							);
						})}
						{allowNone ? (
							<ComparisonOption
								label="SEM COMPARAÇÃO"
								description="Só os números do período."
								selected={value.kind === "none"}
								onSelect={() => selectAndClose({ kind: "none" })}
							/>
						) : null}
					</div>
					<div className="flex flex-col">
						<p className="px-3 pt-3 text-[0.65rem] font-bold tracking-[0.08em] text-muted-foreground">PERSONALIZADO</p>
						<Calendar
							mode="range"
							locale={ptBR}
							numberOfMonths={1}
							defaultMonth={resolved?.after ?? base.after}
							selected={resolved ? { from: resolved.after, to: resolved.before } : undefined}
							onSelect={(range) => {
								// Dias inteiros, como no filtro de período; a primeira data já vale como um dia só.
								const fullDays = toFullDayRange(range);
								if (fullDays.from && fullDays.to) onChange({ kind: "custom", after: fullDays.from, before: fullDays.to });
							}}
						/>
					</div>
				</div>
			</InteractiveFilter.Content>
		</InteractiveFilter.Root>
	);
}

function ComparisonOption({
	label,
	description,
	selected,
	onSelect,
}: {
	label: string;
	description: string;
	selected: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			aria-pressed={selected}
			onClick={onSelect}
			className={cn(
				"flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				selected ? "bg-primary/10" : "hover:bg-muted",
			)}
		>
			<span className="flex min-w-0 flex-col">
				<span className="text-[0.7rem] font-bold tracking-tight">{label}</span>
				<span className="text-xs text-muted-foreground">{description}</span>
			</span>
			{selected ? <Check className="h-4 w-4 min-h-4 min-w-4 text-primary" /> : null}
		</button>
	);
}
