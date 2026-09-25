import { computeSessionExpectedByMethod } from "@/lib/sales-sessions/compute-session-expected-by-method";
import type { DBTransaction } from "@/services/drizzle";
import { salesSessionReconciliations, salesSessions } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";

/** Rebuilds a closed cash snapshot after an invalid canceled sale is removed. */
export async function recalculateSessionAfterSaleDeletion({
	tx,
	orgId,
	sessionId,
	saleId,
	authorId,
	removedTransactions,
}: {
	tx: DBTransaction;
	orgId: string;
	sessionId: string;
	saleId: string;
	authorId: string;
	removedTransactions: { metodo: string; tipo: string; valor: number }[];
}) {
	const [session] = await tx
		.select()
		.from(salesSessions)
		.where(and(eq(salesSessions.id, sessionId), eq(salesSessions.organizacaoId, orgId)))
		.for("update");
	if (!session) throw new createHttpError.NotFound("Sessão de venda não encontrada.");
	if (session.status === "ABERTA") return;

	const reconciliations = await tx
		.select()
		.from(salesSessionReconciliations)
		.where(and(eq(salesSessionReconciliations.sessaoVendaId, sessionId), eq(salesSessionReconciliations.organizacaoId, orgId)));
	if (reconciliations.length === 0) throw new createHttpError.Conflict("A conferência da sessão não foi encontrada.");
	if (
		Math.round((session.totalEsperado ?? 0) * 100) !== reconciliations.reduce((sum, row) => sum + Math.round(row.valorEsperado * 100), 0) ||
		Math.round((session.diferencaTotal ?? 0) * 100) !== reconciliations.reduce((sum, row) => sum + Math.round((row.diferenca ?? 0) * 100), 0)
	) {
		throw new createHttpError.Conflict("Os totais da sessão já divergiam da conferência antes da exclusão.");
	}

	const expected = await computeSessionExpectedByMethod({ orgId, sessaoVendaId: sessionId, saldoInicial: session.saldoInicial, trx: tx });
	const expectedByMethod = new Map(expected.map((row) => [row.metodo, row.valorEsperado]));
	const removedCentsByMethod = new Map<string, number>();
	for (const transaction of removedTransactions) {
		const signedCents = Math.round(transaction.valor * 100) * (transaction.tipo === "ENTRADA" ? 1 : -1);
		removedCentsByMethod.set(transaction.metodo, (removedCentsByMethod.get(transaction.metodo) ?? 0) + signedCents);
	}
	if (expected.some((row) => !reconciliations.some((reconciliation) => reconciliation.metodo === row.metodo))) {
		throw new createHttpError.Conflict("A conferência da sessão não corresponde aos métodos financeiros atuais.");
	}
	if (
		reconciliations.some(
			(row) =>
				Math.round(row.valorEsperado * 100) !== Math.round((expectedByMethod.get(row.metodo) ?? 0) * 100) + (removedCentsByMethod.get(row.metodo) ?? 0),
		)
	) {
		throw new createHttpError.Conflict("A conferência da sessão já divergia dos movimentos financeiros antes da exclusão.");
	}

	let totalEsperadoCents = 0;
	let diferencaTotalCents = 0;
	for (const reconciliation of reconciliations) {
		const valorEsperadoCents = Math.round((expectedByMethod.get(reconciliation.metodo) ?? 0) * 100);
		const diferencaCents = reconciliation.valorInformado === null ? null : Math.round(reconciliation.valorInformado * 100) - valorEsperadoCents;
		await tx
			.update(salesSessionReconciliations)
			.set({ valorEsperado: valorEsperadoCents / 100, diferenca: diferencaCents === null ? null : diferencaCents / 100 })
			.where(and(eq(salesSessionReconciliations.id, reconciliation.id), eq(salesSessionReconciliations.organizacaoId, orgId)));
		totalEsperadoCents += valorEsperadoCents;
		diferencaTotalCents += diferencaCents ?? 0;
	}
	const totalEsperado = totalEsperadoCents / 100;
	const diferencaTotal = diferencaTotalCents / 100;
	const correction = `Correção de caixa ${new Date().toISOString()}: venda cancelada ${saleId} excluída por ${authorId}; esperado ${session.totalEsperado} → ${totalEsperado}; diferença ${session.diferencaTotal} → ${diferencaTotal}.`;
	await tx
		.update(salesSessions)
		.set({
			totalEsperado,
			diferencaTotal,
			observacoesFechamento: [session.observacoesFechamento, correction].filter(Boolean).join("\n"),
		})
		.where(and(eq(salesSessions.id, sessionId), eq(salesSessions.organizacaoId, orgId)));
}
