import createHttpError from "http-errors";

export type TCashRefundSessionPick = { sessaoVendaId: string } | null;

/**
 * De qual gaveta sai o dinheiro devolvido num cancelamento. A regra é registrar a saída no turno em
 * que o dinheiro sai fisicamente, nunca reabrir um caixa já fechado — por isso a sessão original só
 * serve enquanto ainda está aberta.
 *
 * Ordem: o caixa escolhido por quem cancela → o caixa onde o dinheiro entrou, se ainda aberto → o
 * único caixa aberto da organização. Sem caixa resolvível o cancelamento é recusado: seguir sem a
 * SAÍDA deixaria a gaveta esperando um dinheiro que já foi devolvido.
 *
 * Retorna `null` quando não há gaveta a movimentar: nada em dinheiro a devolver, ou o dinheiro nunca
 * entrou num caixa controlado (organização sem sessões de venda).
 */
export function pickCashRefundSession({
	cashToRefund,
	requestedSessionId,
	originSessionIds,
	openSessionIds,
}: {
	cashToRefund: number;
	requestedSessionId?: string | null;
	/** Sessões em que o dinheiro da venda entrou. */
	originSessionIds: string[];
	openSessionIds: string[];
}): TCashRefundSessionPick {
	if (cashToRefund <= 0) return null;

	if (requestedSessionId) {
		if (!openSessionIds.includes(requestedSessionId)) {
			throw new createHttpError.Conflict("O caixa selecionado foi fechado. Selecione outro caixa e tente novamente.");
		}
		return { sessaoVendaId: requestedSessionId };
	}

	if (originSessionIds.length === 0) return null;

	const openOrigin = originSessionIds.find((id) => openSessionIds.includes(id));
	if (openOrigin) return { sessaoVendaId: openOrigin };

	if (openSessionIds.length === 1) return { sessaoVendaId: openSessionIds[0] };
	if (openSessionIds.length === 0) {
		throw new createHttpError.BadRequest("Abra um caixa para devolver o dinheiro desta venda.");
	}
	throw new createHttpError.BadRequest("Há mais de um caixa aberto. Escolha o caixa que devolve o dinheiro desta venda.");
}
