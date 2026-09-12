import { db } from "@/services/drizzle";
import { financialReconciliationMatches, financialStatementTransactions, financialTransactions } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";

/**
 * Vive fora de `sync.ts` de propósito: aquele módulo puxa `effect-financial-transaction` →
 * `sale-processing` → `lib/fiscal/storage` (`server-only`), e esta função é consumida pelo
 * registro de ferramentas MCP, que precisa carregar em Node puro (testes e smoke).
 */

/**
 * Sugestão de conciliação vinda de um agente (MCP): grava o match como SUGERIDO tipo IA e NUNCA
 * confirma — a confirmação segue humana, na tela de conciliação. Difere de
 * `createManualReconciliationMatch`, onde quem vincula é o próprio humano e o match já executa.
 *
 * Par já existente (sugerido, confirmado ou rejeitado) NÃO é sobrescrito: rejeição e confirmação
 * são decisões humanas, e um agente re-sugerindo o mesmo par não pode reabri-las.
 */
export async function createSuggestedReconciliationMatch({
	organizacaoId,
	autorId,
	extratoTransacaoId,
	transacaoFinanceiraId,
	confianca,
}: {
	organizacaoId: string;
	autorId: string;
	extratoTransacaoId: string;
	transacaoFinanceiraId: string;
	confianca?: number | null;
}) {
	const [linha, transacao] = await Promise.all([
		db.query.financialStatementTransactions.findFirst({
			where: and(eq(financialStatementTransactions.id, extratoTransacaoId), eq(financialStatementTransactions.organizacaoId, organizacaoId)),
			columns: { id: true, status: true },
		}),
		db.query.financialTransactions.findFirst({
			where: and(eq(financialTransactions.id, transacaoFinanceiraId), eq(financialTransactions.organizacaoId, organizacaoId)),
			columns: { id: true },
		}),
	]);
	if (!linha) throw new createHttpError.NotFound("Linha do extrato não encontrada.");
	if (linha.status === "CONCILIADA") throw new createHttpError.Conflict("A linha do extrato já está conciliada.");
	if (linha.status === "IGNORADA") throw new createHttpError.Conflict("A linha do extrato foi ignorada por um usuário.");
	if (!transacao) throw new createHttpError.NotFound("Transação financeira não encontrada.");

	const [match] = await db
		.insert(financialReconciliationMatches)
		.values({ organizacaoId, extratoTransacaoId, transacaoFinanceiraId, tipo: "IA", confianca: confianca ?? null, status: "SUGERIDO", autorId })
		.onConflictDoNothing()
		.returning({ id: financialReconciliationMatches.id });
	if (!match) return { criada: false as const };
	return { criada: true as const, matchId: match.id };
}
