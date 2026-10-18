import { Building2, FileUp, ListChecks, ShoppingCart, Truck, Wallet } from "lucide-react";
import type { ComponentType } from "react";

export const BUILDER_STAGE_IDS = ["origin", "supplier", "items", "finance", "delivery", "review"] as const;
export type TBuilderStageId = (typeof BUILDER_STAGE_IDS)[number];

export type TBuilderStageMeta = {
	id: TBuilderStageId;
	label: string;
	description: string;
	icon: ComponentType<{ className?: string }>;
};

export const BUILDER_STAGES: Record<TBuilderStageId, TBuilderStageMeta> = {
	origin: { id: "origin", label: "Origem", description: "Comece pela nota fiscal ou preencha à mão.", icon: FileUp },
	supplier: { id: "supplier", label: "Fornecedor & pedido", description: "Quem vendeu e os dados do pedido.", icon: Building2 },
	items: { id: "items", label: "Itens", description: "O que entra no seu estoque e por quanto.", icon: ShoppingCart },
	finance: { id: "finance", label: "Financeiro", description: "Valor a pagar, competência e transações.", icon: Wallet },
	delivery: { id: "delivery", label: "Entrega & transporte", description: "Recebimento e frete.", icon: Truck },
	review: { id: "review", label: "Revisão", description: "Confira tudo e confirme.", icon: ListChecks },
};

export const STAGE_ORDER: TBuilderStageId[] = [...BUILDER_STAGE_IDS];

export function nextStage(current: TBuilderStageId): TBuilderStageId | null {
	const idx = STAGE_ORDER.indexOf(current);
	if (idx === -1 || idx >= STAGE_ORDER.length - 1) return null;
	return STAGE_ORDER[idx + 1];
}

export function prevStage(current: TBuilderStageId): TBuilderStageId | null {
	const idx = STAGE_ORDER.indexOf(current);
	if (idx <= 0) return null;
	return STAGE_ORDER[idx - 1];
}
