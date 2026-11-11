import type { TFiscalInboundRegistrationStatusEnum, TPurchaseStatusEnum } from "@/schemas/enums";
import { Ban, CircleCheck, CircleX, Inbox, PackageCheck, PencilLine, Truck, type LucideIcon } from "lucide-react";

type TStatusMeta = {
	label: string;
	icon: LucideIcon;
	/** Chip suave (fundo + texto) dos tokens de tom (DESIGN.md §2). */
	chipClassName: string;
};

/**
 * Status da compra: rótulo, ícone, tom e o passo na régua de 4 segmentos do card
 * (rascunho → confirmada → recebimento parcial → recebida). Cancelada não avança na régua.
 */
export const PURCHASE_STATUS_META: Record<TPurchaseStatusEnum, TStatusMeta & { step: number; barClassName: string }> = {
	RASCUNHO: { label: "Rascunho", icon: PencilLine, chipClassName: "bg-muted text-foreground", step: 1, barClassName: "bg-muted-foreground/60" },
	CONFIRMADA: {
		label: "Confirmada",
		icon: CircleCheck,
		chipClassName: "bg-info-surface text-info-surface-foreground",
		step: 2,
		barClassName: "bg-primary",
	},
	RECEBIMENTO_PARCIAL: {
		label: "Recebimento parcial",
		icon: Truck,
		chipClassName: "bg-warning-surface text-warning-surface-foreground",
		step: 3,
		barClassName: "bg-warning",
	},
	RECEBIDA: {
		label: "Recebida",
		icon: PackageCheck,
		chipClassName: "bg-success-surface text-success-surface-foreground",
		step: 4,
		barClassName: "bg-success",
	},
	CANCELADA: {
		label: "Cancelada",
		icon: CircleX,
		chipClassName: "bg-destructive-surface text-destructive-surface-foreground",
		step: 0,
		barClassName: "",
	},
};

export const PURCHASE_STATUS_ORDER: TPurchaseStatusEnum[] = ["RASCUNHO", "CONFIRMADA", "RECEBIMENTO_PARCIAL", "RECEBIDA", "CANCELADA"];

/** Situação da nota recebida diante das compras (derivada no servidor). */
export const INBOUND_REGISTRATION_STATUS_META: Record<TFiscalInboundRegistrationStatusEnum, TStatusMeta> = {
	A_REGISTRAR: { label: "A registrar", icon: Inbox, chipClassName: "bg-warning-surface text-warning-surface-foreground" },
	REGISTRADA: { label: "Registrada", icon: CircleCheck, chipClassName: "bg-success-surface text-success-surface-foreground" },
	DESCONSIDERADA: { label: "Desconsiderada", icon: CircleX, chipClassName: "bg-muted text-foreground" },
	CANCELADA: { label: "Cancelada pelo emitente", icon: Ban, chipClassName: "bg-destructive-surface text-destructive-surface-foreground" },
};

export const INBOUND_REGISTRATION_STATUS_ORDER: TFiscalInboundRegistrationStatusEnum[] = ["A_REGISTRAR", "REGISTRADA", "DESCONSIDERADA", "CANCELADA"];

/** Iniciais do fornecedor para o avatar do card, ignorando conectivos e siglas societárias curtas. */
export function getSupplierInitials(name: string | null | undefined) {
	const words = (name ?? "")
		.split(/\s+/)
		.map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
		.filter((word) => word.length > 2);
	const initials = words
		.slice(0, 2)
		.map((word) => word[0])
		.join("")
		.toUpperCase();
	return initials || "?";
}
