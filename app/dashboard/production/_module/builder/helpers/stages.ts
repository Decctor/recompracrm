export const BUILDER_STAGES = [
	{ id: "recipe", label: "Receita", placeholder: "Escolher receita" },
	{ id: "quantities", label: "Quantidades", placeholder: "Definir quantidade" },
	{ id: "review", label: "Revisão", placeholder: "Título e início" },
] as const;

export type TBuilderStageId = (typeof BUILDER_STAGES)[number]["id"];

export const STAGE_ORDER: TBuilderStageId[] = BUILDER_STAGES.map((stage) => stage.id);
