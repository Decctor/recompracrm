"use client";

import CheckboxInput from "@/components/Inputs/CheckboxInput";
import NumberInput from "@/components/Inputs/NumberInput";
import TextInput from "@/components/Inputs/TextInput";
import { AddOnOptionTable } from "@/components/Modals/Products/Blocks/AddOns";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import type { SpreadsheetGridBounds } from "@/lib/spreadsheet-navigation";
import type { TUseProductAddOnState } from "@/state-hooks/use-product-state";
import { Layers, ListPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";

const ADDON_OPTION_GRID_COL_COUNT = 6;

type TOptionStatusFilter = "all" | "active" | "inactive";

const OPTION_STATUS_FILTERS: { value: TOptionStatusFilter; label: string }[] = [
	{ value: "all", label: "Todas" },
	{ value: "active", label: "Ativas" },
	{ value: "inactive", label: "Inativas" },
];

const OPTION_STATUS_EMPTY_LABEL: Record<TOptionStatusFilter, string | null> = {
	all: null,
	active: "Nenhuma opção ativa.",
	inactive: "Nenhuma opção inativa.",
};

type AddOnGroupFormProps = {
	state: TUseProductAddOnState["state"];
	updateAddOn: TUseProductAddOnState["updateAddOn"];
	addOption: TUseProductAddOnState["addOption"];
	updateOption: TUseProductAddOnState["updateOption"];
	removeOption: TUseProductAddOnState["removeOption"];
};

export default function AddOnGroupForm({ state, updateAddOn, addOption, updateOption, removeOption }: AddOnGroupFormProps) {
	const validOptions = useMemo(
		() => state.opcoes.map((option, index) => ({ ...option, originalIndex: index })).filter((option) => !option.deletar),
		[state.opcoes],
	);

	// Filtro local: um grupo com 40 sabores e 15 pausados não se lê sem isolar cada conjunto.
	// Não persiste — reabrir o modal volta para "Todas".
	const [statusFilter, setStatusFilter] = useState<TOptionStatusFilter>("all");
	const activeCount = useMemo(() => validOptions.filter((option) => option.ativo).length, [validOptions]);
	const counts: Record<TOptionStatusFilter, number> = {
		all: validOptions.length,
		active: activeCount,
		inactive: validOptions.length - activeCount,
	};
	const visibleOptions = useMemo(
		() => (statusFilter === "all" ? validOptions : validOptions.filter((option) => option.ativo === (statusFilter === "active"))),
		[validOptions, statusFilter],
	);

	const gridBounds: SpreadsheetGridBounds = useMemo(
		() => ({
			rowCount: visibleOptions.length + 1,
			colCount: ADDON_OPTION_GRID_COL_COUNT,
		}),
		[visibleOptions.length],
	);

	return (
		<div className="flex w-full flex-col gap-3">
			<ResponsiveMenuSection title="GERAL" icon={<Layers className="h-4 min-h-4 w-4 min-w-4" />}>
				<div className="flex w-full flex-col gap-2">
					<div className="flex w-full flex-col gap-2 lg:flex-row">
						<div className="w-full lg:w-1/2">
							<TextInput
								label="NOME (CLIENTE)"
								placeholder="Ex: Ponto da Carne, Borda, Extras..."
								value={state.nome}
								handleChange={(nome) => updateAddOn({ nome })}
							/>
						</div>
						<div className="w-full lg:w-1/2">
							<TextInput
								label="NOME INTERNO"
								placeholder="Ex: Extras de Lanche, Extras de Pizza..."
								value={state.internoNome ?? ""}
								handleChange={(internoNome) => updateAddOn({ internoNome })}
							/>
						</div>
					</div>
					<div className="flex w-full flex-col gap-2 lg:flex-row">
						<div className="w-full lg:w-1/2">
							<NumberInput
								label="MÍNIMO DE OPÇÕES"
								placeholder="0 = opcional"
								value={state.minOpcoes}
								handleChange={(minOpcoes) => updateAddOn({ minOpcoes: Math.max(0, Math.round(minOpcoes)) })}
							/>
						</div>
						<div className="w-full lg:w-1/2">
							<NumberInput
								label="MÁXIMO DE OPÇÕES"
								placeholder="1 = escolha única"
								value={state.maxOpcoes}
								handleChange={(maxOpcoes) => updateAddOn({ maxOpcoes: Math.max(1, Math.round(maxOpcoes)) })}
							/>
						</div>
					</div>
					<CheckboxInput labelTrue="GRUPO ATIVO" labelFalse="GRUPO INATIVO" checked={state.ativo} handleChange={(ativo) => updateAddOn({ ativo })} />
				</div>
			</ResponsiveMenuSection>
			<ResponsiveMenuSection title="OPÇÕES" icon={<ListPlus className="h-4 min-h-4 w-4 min-w-4" />}>
				<div className="flex w-full flex-col gap-2">
					<div role="tablist" aria-label="Filtrar opções por status" className="flex w-full gap-1 overflow-x-auto">
						{OPTION_STATUS_FILTERS.map((filter) => {
							const selected = statusFilter === filter.value;
							const disabled = filter.value !== "all" && counts[filter.value] === 0 && !selected;
							return (
								<button
									key={filter.value}
									type="button"
									role="tab"
									aria-selected={selected}
									disabled={disabled}
									onClick={() => setStatusFilter(filter.value)}
									className={cn(
										"inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-bold uppercase tracking-tight transition-colors",
										"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
										selected ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
										disabled && "cursor-not-allowed opacity-50 hover:bg-transparent hover:text-muted-foreground",
									)}
								>
									{filter.label}
									<span className={cn("text-numeric text-[0.65rem] font-semibold", selected ? "text-primary-foreground/80" : "text-muted-foreground/80")}>
										{counts[filter.value]}
									</span>
								</button>
							);
						})}
					</div>
					<div className="w-full overflow-hidden rounded-lg border border-border">
						<AddOnOptionTable
							validOptions={visibleOptions}
							gridBounds={gridBounds}
							addOption={addOption}
							updateOption={updateOption}
							removeOption={removeOption}
							emptyLabel={OPTION_STATUS_EMPTY_LABEL[statusFilter]}
						/>
					</div>
				</div>
			</ResponsiveMenuSection>
		</div>
	);
}
