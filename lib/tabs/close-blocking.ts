import type { TSaleAttendanceStatusEnum } from "@/schemas/enums";

// Pedidos que ainda dependem da cozinha/expedicao bloqueiam o fechamento, a menos que o
// operador peca para entrega-los junto com o fechamento. PARCIALMENTE_ENTREGUE nao bloqueia:
// o delta remanescente e baixado na confirmacao. Modulo puro: o painel usa a mesma lista.
export const TAB_CLOSE_BLOCKING_ORDER_STATUSES = [
	"NAO_INICIADO",
	"EM_PREPARO",
	"PRONTO",
	"EM_ENTREGA",
] as const satisfies readonly TSaleAttendanceStatusEnum[];

export function isTabCloseBlockingOrderStatus(status: string) {
	return (TAB_CLOSE_BLOCKING_ORDER_STATUSES as readonly string[]).includes(status);
}
