import { db, type DBTransaction } from "@/services/drizzle";
import { financialTransactions } from "@/services/drizzle/schema";
import { summarizeSessionTransactions, type TSessionExpectedByMethod } from "./summarize-session-transactions";
import { and, eq } from "drizzle-orm";

export type { TSessionExpectedByMethod } from "./summarize-session-transactions";

/**
 * Calcula o valor esperado por método de pagamento de uma sessão, lendo EXCLUSIVAMENTE de
 * `financialTransactions.sessaoVendaId` — a única fonte que cobre também sangria/suprimento/estorno
 * (movimentos sem venda).
 *
 * Por método: net = Σ(ENTRADA) − Σ(SAIDA). Ao DINHEIRO somamos o `saldoInicial` (fundo de troco),
 * pois o esperado de gaveta = saldoInicial + entradas − saídas de dinheiro.
 */
export async function computeSessionExpectedByMethod({
	orgId,
	sessaoVendaId,
	saldoInicial,
	trx,
}: {
	orgId: string;
	sessaoVendaId: string;
	saldoInicial: number;
	trx?: DBTransaction;
}): Promise<TSessionExpectedByMethod[]> {
	const database = trx ?? db;
	const rows = await database
		.select({
			metodo: financialTransactions.metodo,
			tipo: financialTransactions.tipo,
			valor: financialTransactions.valor,
			modificadoresMetadata: financialTransactions.modificadoresMetadata,
			dataEfetivacao: financialTransactions.dataEfetivacao,
		})
		.from(financialTransactions)
		.where(and(eq(financialTransactions.organizacaoId, orgId), eq(financialTransactions.sessaoVendaId, sessaoVendaId)));

	return summarizeSessionTransactions(rows, saldoInicial);
}
