import type { TDeliveryModeEnum, TSaleAttendanceStatusEnum } from "@/schemas/enums";

/**
 * Helpers puros para o eixo operacional de atendimento (fulfillment) da venda.
 */

/**
 * Resolve o status de atendimento inicial de uma venda confirmada internamente,
 * conforme a modalidade de entrega.
 *
 * - PRESENCIAL: ENTREGUE (venda de balcao, entrega imediata);
 * - RETIRADA: PRONTO (aguardando o cliente retirar);
 * - ENTREGA: EM_PREPARO (precisa ser preparada e despachada);
 * - COMANDA: EM_PREPARO (consumo no local em andamento);
 * - sem modalidade: ENTREGUE (tratado como venda imediata).
 */
export function resolveInitialAttendanceStatus(modalidade: TDeliveryModeEnum | null | undefined): TSaleAttendanceStatusEnum {
	switch (modalidade) {
		case "RETIRADA":
			return "PRONTO";
		case "ENTREGA":
			return "EM_PREPARO";
		case "COMANDA":
			return "EM_PREPARO";
		case "PRESENCIAL":
			return "ENTREGUE";
		default:
			return "ENTREGUE";
	}
}

// Transicoes operacionais permitidas. Cancelamento operacional e tratado separadamente.
const ALLOWED_ATTENDANCE_TRANSITIONS: Record<TSaleAttendanceStatusEnum, TSaleAttendanceStatusEnum[]> = {
	NAO_INICIADO: ["EM_PREPARO", "PRONTO", "ENTREGUE", "CANCELADO"],
	EM_PREPARO: ["PRONTO", "EM_ENTREGA", "ENTREGUE", "CANCELADO"],
	PRONTO: ["EM_ENTREGA", "ENTREGUE", "PARCIALMENTE_ENTREGUE", "CANCELADO"],
	EM_ENTREGA: ["ENTREGUE", "PARCIALMENTE_ENTREGUE", "CANCELADO"],
	PARCIALMENTE_ENTREGUE: ["ENTREGUE", "CANCELADO"],
	ENTREGUE: [],
	CANCELADO: [],
};

export function isValidAttendanceTransition(from: TSaleAttendanceStatusEnum, to: TSaleAttendanceStatusEnum): boolean {
	if (from === to) return false;
	return ALLOWED_ATTENDANCE_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Indica se a transicao para o status alvo exige saida fisica de estoque (baixa).
 * A baixa fisica acontece na entrega efetiva do pedido.
 */
export function attendanceStatusRequiresPhysicalOut(status: TSaleAttendanceStatusEnum): boolean {
	return status === "ENTREGUE" || status === "PARCIALMENTE_ENTREGUE";
}

/**
 * Valores de escrita do eixo de atendimento. Todo caminho que grava `statusAtendimento` deve passar
 * por aqui: o carimbo de `statusAtendimentoData` e o que sustenta a janela de concluidos recentes do
 * quadro, e um writer que grave o status sem o carimbo reintroduz silenciosamente o bug que a coluna
 * existe para corrigir (pedido entregue hoje some do quadro por ter `dataVenda` antiga).
 */
export function attendanceStatusValues(status: TSaleAttendanceStatusEnum, options?: { at?: Date }) {
	return { statusAtendimento: status, statusAtendimentoData: options?.at ?? new Date() };
}

/**
 * Igual a `attendanceStatusValues`, mas so carimba quando o status muda de fato. E a forma correta
 * para caminhos de upsert que reafirmam o status a cada execucao (sync de integracao): carimbar ali
 * incondicionalmente faria um re-sync ressuscitar vendas antigas na janela de concluidos recentes.
 */
export function attendanceStatusValuesIfChanged(
	previous: TSaleAttendanceStatusEnum | null | undefined,
	next: TSaleAttendanceStatusEnum,
	options?: { at?: Date },
) {
	if (previous === next) return { statusAtendimento: next };
	return attendanceStatusValues(next, options);
}
