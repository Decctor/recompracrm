import { DollarSign, LayoutTemplate, ListChecks, type LucideIcon, Package, PencilRuler } from "lucide-react";

export const KIT_STAGE_IDS = ["pieces", "products", "price", "visual", "review"] as const;
export type TKitStageId = (typeof KIT_STAGE_IDS)[number];

export const KIT_STAGES: Record<TKitStageId, { label: string; title: string; description: string; icon: LucideIcon }> = {
	pieces: {
		label: "Peças",
		title: "Peças do kit",
		description: "Escolha as peças que o kit vai gerar. Todas usam os mesmos produtos, preços e validade.",
		icon: LayoutTemplate,
	},
	products: {
		label: "Produtos",
		title: "Produtos",
		description: "Escolha os produtos que entram no kit. Nome, código e foto vêm do cadastro.",
		icon: Package,
	},
	price: {
		label: "Preço",
		title: "Preço",
		description: "A promoção é inferida: quando o preço anterior do produto é maior que o atual, as peças mostram De / Por.",
		icon: DollarSign,
	},
	visual: {
		label: "Visual",
		title: "Visual",
		description: "Confira cada peça. Logo e cores vêm da sua marca.",
		icon: PencilRuler,
	},
	review: {
		label: "Revisão",
		title: "Revisão",
		description: "Confira o kit antes de concluir.",
		icon: ListChecks,
	},
};

export function isKitStageId(value: unknown): value is TKitStageId {
	return typeof value === "string" && (KIT_STAGE_IDS as readonly string[]).includes(value);
}
