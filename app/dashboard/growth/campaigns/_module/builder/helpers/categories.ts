import type { TCampaignTriggerTypeEnum } from "@/schemas/enums";

export const BUILDER_CATEGORY_IDS = ["EVENT", "SCHEDULE", "RFM"] as const;
export type TBuilderCategoryId = (typeof BUILDER_CATEGORY_IDS)[number];

export type TBuilderCategory = {
	id: TBuilderCategoryId;
	label: string;
	tagline: string;
	description: string;
	triggers: TCampaignTriggerTypeEnum[];
};

export const BUILDER_CATEGORIES: TBuilderCategory[] = [
	{
		id: "EVENT",
		label: "Eventos",
		tagline: "Reaja a algo que o cliente fez",
		description:
			"Campanhas disparadas quando um cliente realiza uma ação (compra, atinge cashback, faz aniversário, etc).",
		triggers: [
			"NOVA-COMPRA",
			"PRIMEIRA-COMPRA",
			"CASHBACK-ACUMULADO",
			"CASHBACK-EXPIRANDO",
			"ANIVERSARIO_CLIENTE",
			"QUANTIDADE-TOTAL-COMPRAS",
			"VALOR-TOTAL-COMPRAS",
			"PIOR-DIA-VENDAS",
		],
	},
	{
		id: "SCHEDULE",
		label: "Agendamentos",
		tagline: "Dispare numa data ou em uma cadência fixa",
		description:
			"Campanhas que rodam em horários ou datas pré-definidas — recorrentes (diário/semanal/mensal) ou disparo único.",
		triggers: ["RECORRENTE", "USO-UNICO", "PROMOCAO-PRODUTOS"],
	},
	{
		id: "RFM",
		label: "Segmentações (RFM)",
		tagline: "Atue conforme o cliente entra/permanece em segmentos",
		description:
			"As segmentações são o gatilho: a campanha dispara quando um cliente entra ou permanece em uma das segmentações escolhidas.",
		triggers: ["ENTRADA-SEGMENTAÇÃO", "PERMANÊNCIA-SEGMENTAÇÃO"],
	},
];

export function getCategoryFromTrigger(trigger: TCampaignTriggerTypeEnum | null | undefined): TBuilderCategoryId | null {
	if (!trigger) return null;
	const found = BUILDER_CATEGORIES.find((cat) => cat.triggers.includes(trigger));
	return found?.id ?? null;
}

export function getCategoryById(id: TBuilderCategoryId | null | undefined): TBuilderCategory | null {
	if (!id) return null;
	return BUILDER_CATEGORIES.find((cat) => cat.id === id) ?? null;
}
