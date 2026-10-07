import { computeSaleFinancialStatus } from "@/lib/sales/utils";
import { type DBTransaction, db } from "@/services/drizzle";
import createHttpError from "http-errors";

/**
 * `tx` quando a leitura acontece dentro de uma transação aberta: pedir outra conexão ao `db`
 * global enquanto a transação segura a sua trava o pool sob concorrência.
 */
export async function getSaleFinancialState({
	organizationId,
	saleId,
	tx,
}: {
	organizationId: string;
	saleId: string;
	tx?: Pick<DBTransaction, "query">;
}) {
	const executor: Pick<DBTransaction, "query"> = tx ?? db;
	const sale = await executor.query.sales.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, saleId), eq(fields.organizacaoId, organizationId)),
		columns: {
			id: true,
			valorTotal: true,
		},
		with: {
			lancamentosContabeis: {
				columns: { id: true },
				with: {
					transacoesFinanceiras: {
						columns: {
							id: true,
							valor: true,
							tipo: true,
							metodo: true,
							contaFinanceiraId: true,
							dataEfetivacao: true,
							dataPrevisao: true,
							provedorStatus: true,
						},
					},
				},
			},
		},
	});

	if (!sale) throw new createHttpError.NotFound("Venda não encontrada.");

	const transactions = sale.lancamentosContabeis.flatMap((entry) => entry.transacoesFinanceiras);
	const status = computeSaleFinancialStatus({ transactions, saleTotal: sale.valorTotal });

	return {
		saleId: sale.id,
		saleTotal: sale.valorTotal,
		status,
		transactions,
		isFullyPaid: status === "RECEBIDA",
	};
}
