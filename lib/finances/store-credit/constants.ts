/**
 * Fiado ("store credit", como o mapeamento fiscal já chama em
 * `lib/fiscal/providers/spedy/mappers/pagamento.ts`): venda a prazo registrada no balcão, sempre
 * com cliente vinculado e sempre pendente.
 *
 * O módulo não tem tabela própria de propósito. Um fiado é uma `financialTransactions` ENTRADA
 * pendente com `metodo = FIADO_NOTA`, e a baixa parcial é um split dessa linha — o que preserva
 * exatamente o invariante de `getAccountingEntryBalanceError`: a soma das transações de um
 * lançamento continua fechando com o valor do lançamento.
 */

/** Método de pagamento que constitui um fiado. É o recorte inteiro do módulo. */
export const STORE_CREDIT_METHOD = "FIADO_NOTA" as const;

/**
 * Carimbo em `modificadoresMetadata.origem` da movimentação efetivada por uma baixa de fiado.
 *
 * Existe porque a efetivação troca `metodo` pela forma real do recebimento (dinheiro, pix...) —
 * sem isso o sistema perderia a informação de que aquele dinheiro entrou quitando um fiado, e
 * `lib/sales/results/by-payment-method.ts`, que agrupa por `metodo`, passaria a contar a venda
 * fiado na linha DINHEIRO. Mesmo mecanismo que o troco já usa (`SALE_CHANGE_TRANSACTION_ORIGIN`).
 */
export const STORE_CREDIT_RECEIPT_ORIGIN = "BAIXA_FIADO" as const;

/** Carimbo do saldo remanescente que nasce de uma baixa parcial — distingue-o do fiado original. */
export const STORE_CREDIT_REMAINDER_ORIGIN = "SALDO_FIADO" as const;

/** Meio centavo: a aritmética de alocação roda em centavos inteiros, então a folga é só de arredondamento. */
export const STORE_CREDIT_TOLERANCE = 0.005;

/**
 * Id reservado para o balde dos fiados cujo cliente foi excluído depois da venda (`sales.clienteId`
 * é `set null`). Sem ele essas linhas sumiriam da lista e a soma da listagem deixaria de bater com
 * o total dos indicadores — um rombo silencioso, que é o pior tipo.
 *
 * Mora aqui, e não em `queries.ts`, porque a tela também precisa dele e `queries.ts` importa o `db`.
 */
export const STORE_CREDIT_UNLINKED_CLIENT_ID = "sem-cliente";

/**
 * Vocabulário de filtro da aba, compartilhado entre a tela e a consulta. Mora aqui, e não junto das
 * consultas, porque `queries.ts` importa o `db`: hoje a tela só sobrevive por importar estes tipos
 * com `import type`, e basta alguém apagar a palavra `type` para o `db` ir parar no bundle.
 */
export type TStoreCreditStatus = "EM_ABERTO" | "VENCIDO" | "QUITADO";
export type TStoreCreditSortField = "saldo" | "previsao" | "nome";
export type TStoreCreditSortDirection = "asc" | "desc";
