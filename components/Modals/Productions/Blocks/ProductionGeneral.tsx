import DateInput from "@/components/Inputs/DateInput";
import SelectInput from "@/components/Inputs/SelectInput";
import TextareaInput from "@/components/Inputs/TextareaInput";
import TextInput from "@/components/Inputs/TextInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { useProductionRecipes } from "@/lib/queries/productions";
import type { TUseInternalProductionState } from "@/state-hooks/use-internal-production-state";
import { CalendarClock, ClipboardList, Factory, FilePenLine } from "lucide-react";

const PRODUCTION_STATUS_OPTIONS = [
	{ id: "RASCUNHO", label: "RASCUNHO", value: "RASCUNHO", startContent: <FilePenLine className="text-muted-foreground" /> },
	{ id: "PLANEJADA", label: "PLANEJADA", value: "PLANEJADA", startContent: <CalendarClock className="text-primary" /> },
	{ id: "EM_PRODUCAO", label: "EM PRODUÇÃO", value: "EM_PRODUCAO", startContent: <Factory className="text-amber-600" /> },
];

type ProductionGeneralBlockProps = {
	production: TUseInternalProductionState["state"]["production"];
	updateProduction: TUseInternalProductionState["updateProduction"];
	recipeSelectionEnabled?: boolean;
	onRecipeChange?: (recipeId: string | null) => void;
};

export default function ProductionGeneralBlock({ production, updateProduction, recipeSelectionEnabled = true, onRecipeChange }: ProductionGeneralBlockProps) {
	const { data: recipesData } = useProductionRecipes({
		initialFilters: { page: 1, search: "", activeOnly: true },
	});
	const recipeOptions =
		recipesData?.recipes.map((recipe) => ({
			id: recipe.id,
			label: recipe.titulo,
			value: recipe.id,
			startContent: <ClipboardList className="text-primary" />,
		})) ?? [];

	return (
		<>
			<ResponsiveMenuSection title="DADOS GERAIS" icon={<ClipboardList className="h-4 w-4" />}>
				<TextInput
					label="TÍTULO"
					value={production.titulo}
					placeholder="Ex: Produção de calda base"
					required
					handleChange={(titulo) => updateProduction({ titulo })}
				/>
				{recipeSelectionEnabled ? (
					<SelectInput
						label="RECEITA BASE"
						value={production.receitaId}
						resetOptionLabel="Produção manual"
						options={recipeOptions}
						handleChange={(receitaId) => (onRecipeChange ? onRecipeChange(receitaId) : updateProduction({ receitaId }))}
						onReset={() => (onRecipeChange ? onRecipeChange(null) : updateProduction({ receitaId: null }))}
					/>
				) : null}
				<SelectInput
					label="STATUS"
					value={production.status}
					resetOptionLabel="Selecione o status"
					options={PRODUCTION_STATUS_OPTIONS}
					required
					handleChange={(status) => updateProduction({ status: status as typeof production.status })}
					onReset={() => updateProduction({ status: "RASCUNHO" })}
				/>
				<TextareaInput
					label="OBSERVAÇÕES"
					value={production.observacoes ?? ""}
					placeholder="Anotações internas sobre esta produção..."
					handleChange={(observacoes) => updateProduction({ observacoes })}
				/>
			</ResponsiveMenuSection>

			<ResponsiveMenuSection title="PRAZOS" icon={<CalendarClock className="h-4 w-4" />}>
				<div className="grid gap-3 md:grid-cols-2">
					<DateInput
						label="INÍCIO"
						value={dateToInputValue(production.dataInicio)}
						handleChange={(value) => updateProduction({ dataInicio: inputValueToDate(value) })}
					/>
					<DateInput
						label="PREVISÃO DE CONCLUSÃO"
						value={dateToInputValue(production.dataPrevisaoConclusao)}
						handleChange={(value) => updateProduction({ dataPrevisaoConclusao: inputValueToDate(value) })}
					/>
				</div>
			</ResponsiveMenuSection>
		</>
	);
}

function dateToInputValue(date: Date | null | undefined) {
	if (!date) return undefined;
	return date.toISOString().slice(0, 10);
}

function inputValueToDate(value: string | undefined) {
	if (!value) return null;
	return new Date(`${value}T00:00:00.000Z`);
}
