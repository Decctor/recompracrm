import type { TSaleAttendanceStatusEnum } from "@/schemas/enums";

// Metadados de exibição dos pedidos no painel da conta.

export const ORDER_STATUS_META: Record<string, { label: string; className: string }> = {
	NAO_INICIADO: { label: "Na fila", className: "bg-secondary text-muted-foreground" },
	EM_PREPARO: { label: "Em preparo", className: "bg-warning-surface text-warning-surface-foreground" },
	PRONTO: { label: "Pronto", className: "bg-info-surface text-info-surface-foreground" },
	EM_ENTREGA: { label: "Em entrega", className: "bg-info-surface text-info-surface-foreground" },
	ENTREGUE: { label: "Entregue", className: "bg-success-surface text-success-surface-foreground" },
	PARCIALMENTE_ENTREGUE: { label: "Parcial", className: "bg-warning-surface text-warning-surface-foreground" },
	CANCELADO: { label: "Cancelado", className: "bg-destructive/10 text-destructive" },
};

// Ação rápida do garçom por status do pedido (a cozinha usa o board de Preparo).
export const ORDER_NEXT_ACTION: Partial<Record<TSaleAttendanceStatusEnum, { status: TSaleAttendanceStatusEnum; label: string }>> = {
	NAO_INICIADO: { status: "EM_PREPARO", label: "Iniciar" },
	EM_PREPARO: { status: "PRONTO", label: "Marcar pronto" },
	PRONTO: { status: "ENTREGUE", label: "Entregar" },
	EM_ENTREGA: { status: "ENTREGUE", label: "Entregue" },
	PARCIALMENTE_ENTREGUE: { status: "ENTREGUE", label: "Entregar resto" },
};
