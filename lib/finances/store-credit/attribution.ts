import { sql } from "drizzle-orm";
import { financialTransactions } from "@/services/drizzle/schema";
import { STORE_CREDIT_METHOD, STORE_CREDIT_RECEIPT_ORIGIN } from "./constants";

/**
 * Método ao qual a venda deve ser atribuída em "recebimentos por método".
 *
 * A baixa de um fiado troca `metodo` pela forma real do recebimento — é assim que o dinheiro
 * aparece na conferência de gaveta e no extrato da conta, e é o comportamento certo para o
 * financeiro. Mas para o relatório comercial a venda continua tendo sido *vendida* a prazo: sem
 * esta expressão, o fiado quitado em dinheiro migraria da linha FIADO para a linha DINHEIRO e o
 * relatório passaria a dizer que a loja vende menos a prazo do que vende.
 *
 * O carimbo de origem é o que restou da informação original, e é o mesmo mecanismo que o troco já
 * usa (`SALE_CHANGE_TRANSACTION_ORIGIN`). O `::text` nos dois braços evita o `CASE types ... cannot
 * be matched` entre o literal e a coluna `payment_method`.
 *
 * Os dois literais entram por `sql.raw`, e não como parâmetro, porque esta expressão aparece ao
 * mesmo tempo no SELECT e no GROUP BY de `by-payment-method`: o drizzle renumeraria o parâmetro na
 * segunda serialização e o Postgres deixaria de reconhecer as duas como a mesma expressão. São
 * constantes do módulo, nunca entrada de usuário.
 */
export function getSalePaymentAttributionMethod() {
	return sql<string>`case when ${financialTransactions.modificadoresMetadata}->>'origem' = '${sql.raw(STORE_CREDIT_RECEIPT_ORIGIN)}' then '${sql.raw(STORE_CREDIT_METHOD)}'::text else ${financialTransactions.metodo}::text end`;
}
