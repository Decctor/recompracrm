import type { TCampaignTriggerTypeEnum } from "@/schemas/enums";
import {
	BadgePercent,
	CalendarClock,
	CalendarHeart,
	Cake,
	Coins,
	Hourglass,
	Receipt,
	RefreshCcw,
	ShoppingCart,
	Sprout,
	TrendingDown,
	UserPlus,
	Wallet,
} from "lucide-react";
import type { ComponentType } from "react";

export type TTriggerMeta = {
	value: TCampaignTriggerTypeEnum;
	label: string;
	description: string;
	icon: ComponentType<{ className?: string }>;
};

export const TRIGGER_META: Record<TCampaignTriggerTypeEnum, TTriggerMeta> = {
	"NOVA-COMPRA": {
		value: "NOVA-COMPRA",
		label: "Nova compra",
		description: "Disparada quando o cliente realiza uma nova compra (com valor mínimo opcional).",
		icon: ShoppingCart,
	},
	"PRIMEIRA-COMPRA": {
		value: "PRIMEIRA-COMPRA",
		label: "Primeira compra",
		description: "Disparada quando o cliente realiza a primeira compra na sua loja.",
		icon: UserPlus,
	},
	"CASHBACK-ACUMULADO": {
		value: "CASHBACK-ACUMULADO",
		label: "Cashback acumulado",
		description: "Disparada quando o cliente atinge um saldo acumulado de cashback definido.",
		icon: Wallet,
	},
	"CASHBACK-EXPIRANDO": {
		value: "CASHBACK-EXPIRANDO",
		label: "Cashback expirando",
		description: "Avisa o cliente com antecedência quando seu cashback estiver prestes a expirar.",
		icon: Hourglass,
	},
	ANIVERSARIO_CLIENTE: {
		value: "ANIVERSARIO_CLIENTE",
		label: "Aniversário do cliente",
		description: "Disparada no aniversário do cliente — pode ser configurada antes ou depois da data.",
		icon: Cake,
	},
	"QUANTIDADE-TOTAL-COMPRAS": {
		value: "QUANTIDADE-TOTAL-COMPRAS",
		label: "Quantidade total de compras",
		description: "Disparada quando o cliente atinge uma quantidade total de compras (ex: 2ª compra, 3ª compra).",
		icon: Receipt,
	},
	"VALOR-TOTAL-COMPRAS": {
		value: "VALOR-TOTAL-COMPRAS",
		label: "Valor total de compras",
		description: "Disparada quando o cliente atinge um valor total acumulado em compras.",
		icon: Coins,
	},
	"PIOR-DIA-VENDAS": {
		value: "PIOR-DIA-VENDAS",
		label: "Pior dia de vendas",
		description: "Calculado pelas últimas 8 semanas: dispara automaticamente no dia mais fraco da sua loja.",
		icon: TrendingDown,
	},
	RECORRENTE: {
		value: "RECORRENTE",
		label: "Recorrente",
		description: "Cadência fixa: diária, semanal ou mensal, com seleção de dias e intervalo.",
		icon: RefreshCcw,
	},
	"USO-UNICO": {
		value: "USO-UNICO",
		label: "Uso único",
		description: "Disparada uma única vez na data selecionada e no bloco de horário configurado.",
		icon: CalendarClock,
	},
	"PROMOCAO-PRODUTOS": {
		value: "PROMOCAO-PRODUTOS",
		label: "Promoção de produtos",
		description: "Divulga uma lista de produtos numa data única — cada cliente recebe o produto com mais chance de recompra.",
		icon: BadgePercent,
	},
	"ENTRADA-SEGMENTAÇÃO": {
		value: "ENTRADA-SEGMENTAÇÃO",
		label: "Entrada em segmentação",
		description: "Disparada quando o cliente entra em uma das segmentações RFM escolhidas.",
		icon: Sprout,
	},
	"PERMANÊNCIA-SEGMENTAÇÃO": {
		value: "PERMANÊNCIA-SEGMENTAÇÃO",
		label: "Permanência em segmentação",
		description: "Disparada quando o cliente permanece tempo suficiente em uma das segmentações RFM escolhidas.",
		icon: CalendarHeart,
	},
};

export function getTriggerMeta(trigger: TCampaignTriggerTypeEnum | null | undefined): TTriggerMeta | null {
	if (!trigger) return null;
	return TRIGGER_META[trigger] ?? null;
}
