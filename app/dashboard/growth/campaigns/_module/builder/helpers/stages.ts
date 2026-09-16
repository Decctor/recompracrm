import { CalendarRange, Filter, ListChecks, MessageSquare, Send, Settings2, Sparkles } from "lucide-react";
import type { ComponentType } from "react";

export const BUILDER_STAGE_IDS = ["trigger", "send", "message", "audience", "effects", "settings", "review"] as const;
export type TBuilderStageId = (typeof BUILDER_STAGE_IDS)[number];

export type TBuilderStageMeta = {
	id: TBuilderStageId;
	label: string;
	description: string;
	icon: ComponentType<{ className?: string }>;
};

export const BUILDER_STAGES: Record<TBuilderStageId, TBuilderStageMeta> = {
	trigger: {
		id: "trigger",
		label: "Gatilho",
		description: "Defina o que aciona a campanha.",
		icon: Sparkles,
	},
	send: {
		id: "send",
		label: "Envio",
		description: "Quando a mensagem é enviada.",
		icon: Send,
	},
	message: {
		id: "message",
		label: "Mensagem",
		description: "Remetente do WhatsApp e template enviado.",
		icon: MessageSquare,
	},
	audience: {
		id: "audience",
		label: "Público",
		description: "Refine quem receberá a campanha.",
		icon: Filter,
	},
	effects: {
		id: "effects",
		label: "Efeitos",
		description: "Geração de cashback associado.",
		icon: CalendarRange,
	},
	settings: {
		id: "settings",
		label: "Ajustes",
		description: "Recorrência, limites e atribuição.",
		icon: Settings2,
	},
	review: {
		id: "review",
		label: "Revisão",
		description: "Confira tudo e salve.",
		icon: ListChecks,
	},
};

// All categories share the same 7 stages today. Category-specific behavior is
// applied INSIDE each stage component (e.g., audience hides segmentations panel
// for RFM, send collapses for RECORRENTE/USO-UNICO).
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

export function isStageId(value: unknown): value is TBuilderStageId {
	return typeof value === "string" && (BUILDER_STAGE_IDS as readonly string[]).includes(value);
}
