import { DollarSign, LayoutTemplate, ListChecks, type LucideIcon, Package, PencilRuler } from "lucide-react";

export const KIT_STAGE_IDS = ["pecas", "produtos", "preco", "visual", "revisao"] as const;
export type TKitStageId = (typeof KIT_STAGE_IDS)[number];

export const KIT_STAGES: Record<TKitStageId, { label: string; titulo: string; descricao: string; icone: LucideIcon }> = {
	pecas: {
		label: "Peças",
		titulo: "Peças do kit",
		descricao: "Escolha as peças que o kit vai gerar. Todas usam os mesmos produtos, preços e validade.",
		icone: LayoutTemplate,
	},
	produtos: {
		label: "Produtos",
		titulo: "Produtos",
		descricao: "Escolha os produtos que entram no kit. Nome, código e foto vêm do cadastro.",
		icone: Package,
	},
	preco: {
		label: "Preço",
		titulo: "Preço",
		descricao: "A promoção é inferida: quando o preço anterior do produto é maior que o atual, as peças mostram De / Por.",
		icone: DollarSign,
	},
	visual: {
		label: "Visual",
		titulo: "Visual",
		descricao: "Confira cada peça. Logo e cores vêm da sua marca.",
		icone: PencilRuler,
	},
	revisao: {
		label: "Revisão",
		titulo: "Revisão",
		descricao: "Confira o kit antes de concluir.",
		icone: ListChecks,
	},
};

export function isKitStageId(value: unknown): value is TKitStageId {
	return typeof value === "string" && (KIT_STAGE_IDS as readonly string[]).includes(value);
}
