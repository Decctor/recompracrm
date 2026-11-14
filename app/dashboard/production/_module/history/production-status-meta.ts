import type { TProductionStatusEnum } from "@/schemas/enums";
import { Calendar, CheckCheck, CircleX, Factory, FilePenLine, type LucideIcon } from "lucide-react";

type TProductionStatusMeta = {
	label: string;
	icon: LucideIcon;
	/** Chip suave (fundo + texto) dos tokens de tom (DESIGN.md §2). */
	chipClassName: string;
	/** Passo na régua de 4 segmentos do card: rascunho → planejada → em produção → concluída. */
	step: number;
	barClassName: string;
};

/** Cancelada não avança na régua: os quatro segmentos ficam apagados. */
export const PRODUCTION_STATUS_META: Record<TProductionStatusEnum, TProductionStatusMeta> = {
	RASCUNHO: { label: "RASCUNHO", icon: FilePenLine, chipClassName: "bg-muted text-muted-foreground", step: 1, barClassName: "bg-muted-foreground/70" },
	PLANEJADA: { label: "PLANEJADA", icon: Calendar, chipClassName: "bg-info-surface text-info-surface-foreground", step: 2, barClassName: "bg-info" },
	EM_PRODUCAO: {
		label: "EM PRODUÇÃO",
		icon: Factory,
		chipClassName: "bg-warning-surface text-warning-surface-foreground",
		step: 3,
		barClassName: "bg-warning",
	},
	CONCLUIDA: {
		label: "CONCLUÍDA",
		icon: CheckCheck,
		chipClassName: "bg-success-surface text-success-surface-foreground",
		step: 4,
		barClassName: "bg-success",
	},
	CANCELADA: {
		label: "CANCELADA",
		icon: CircleX,
		chipClassName: "bg-destructive-surface text-destructive-surface-foreground",
		step: 0,
		barClassName: "",
	},
};

export const PRODUCTION_STATUS_ORDER: TProductionStatusEnum[] = ["RASCUNHO", "PLANEJADA", "EM_PRODUCAO", "CONCLUIDA", "CANCELADA"];
