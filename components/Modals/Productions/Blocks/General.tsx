import DurationInput from "@/components/Inputs/DurationInput";
import TextareaInput from "@/components/Inputs/TextareaInput";
import TextInput from "@/components/Inputs/TextInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import type { TUseInternalProductionRecipeState } from "@/state-hooks/use-internal-production-recipe-state";
import { ClipboardList } from "lucide-react";

type ProductionDurationOptionValue = "MINUTOS" | "HORAS" | "DIAS";

const PRODUCTION_DURATION_OPTIONS: { id: string; label: string; value: ProductionDurationOptionValue }[] = [
	{ id: "MINUTOS", label: "Minutos", value: "MINUTOS" },
	{ id: "HORAS", label: "Horas", value: "HORAS" },
	{ id: "DIAS", label: "Dias", value: "DIAS" },
];

type ProductionRecipeGeneralBlockProps = {
	productionRecipe: TUseInternalProductionRecipeState["state"]["productionRecipe"];
	updateProductionRecipe: TUseInternalProductionRecipeState["updateProductionRecipe"];
};

export default function ProductionRecipeGeneralBlock({ productionRecipe, updateProductionRecipe }: ProductionRecipeGeneralBlockProps) {
	return (
		<ResponsiveMenuSection title="DADOS GERAIS" icon={<ClipboardList className="h-4 w-4" />}>
			<TextInput
				label="TÍTULO"
				value={productionRecipe.titulo}
				placeholder="Ex: Calda base de chocolate"
				required
				handleChange={(titulo) => updateProductionRecipe({ titulo })}
			/>
			<TextareaInput
				label="DESCRIÇÃO"
				value={productionRecipe.descricao ?? ""}
				placeholder="Observações, modo de preparo ou detalhes internos..."
				handleChange={(descricao) => updateProductionRecipe({ descricao })}
			/>
			<DurationInput
				label="PREVISÃO DE TEMPO"
				value={productionRecipe.previsaoTempoValor}
				measure={productionRecipe.previsaoTempoMedida}
				options={PRODUCTION_DURATION_OPTIONS}
				valuePlaceholder="Tempo"
				measurePlaceholder="Medida"
				helperText="Opcional. Use para estimar a duração padrão desta ficha técnica."
				onValueChange={(previsaoTempoValor) => updateProductionRecipe({ previsaoTempoValor })}
				onMeasureChange={(previsaoTempoMedida) => updateProductionRecipe({ previsaoTempoMedida })}
				onMeasureReset={() => updateProductionRecipe({ previsaoTempoMedida: null, previsaoTempoValor: null })}
			/>
		</ResponsiveMenuSection>
	);
}
