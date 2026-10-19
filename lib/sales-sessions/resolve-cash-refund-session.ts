import { salesSessions } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { pickCashRefundSession } from "./cash-refund-session-policy";
import type { TransactionClient } from "./types";

/**
 * Resolve e trava (FOR UPDATE) a sessão que recebe a SAÍDA de um estorno em dinheiro — ver
 * `pickCashRefundSession`. A trava impede que o caixa feche entre a escolha e a gravação da saída.
 */
export async function resolveCashRefundSession({
	tx,
	orgId,
	cashToRefund,
	requestedSessionId,
	originSessionIds,
}: {
	tx: TransactionClient;
	orgId: string;
	cashToRefund: number;
	requestedSessionId?: string | null;
	originSessionIds: string[];
}): Promise<{ id: string; contaFinanceiraId: string | null } | null> {
	if (cashToRefund <= 0) return null;

	const openSessions = await tx
		.select({ id: salesSessions.id })
		.from(salesSessions)
		.where(and(eq(salesSessions.organizacaoId, orgId), eq(salesSessions.status, "ABERTA")));
	const pick = pickCashRefundSession({
		cashToRefund,
		requestedSessionId,
		originSessionIds,
		openSessionIds: openSessions.map((session) => session.id),
	});
	if (!pick) return null;

	const [locked] = await tx
		.select({ id: salesSessions.id, status: salesSessions.status, contaFinanceiraId: salesSessions.contaFinanceiraId })
		.from(salesSessions)
		.where(and(eq(salesSessions.id, pick.sessaoVendaId), eq(salesSessions.organizacaoId, orgId)))
		.for("update");
	if (!locked || locked.status !== "ABERTA") {
		throw new createHttpError.Conflict("O caixa foi fechado durante o cancelamento. Selecione outro caixa e tente novamente.");
	}
	return { id: locked.id, contaFinanceiraId: locked.contaFinanceiraId };
}
