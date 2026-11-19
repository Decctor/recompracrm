import type { TPurchaseStatusEnum } from "@/schemas/enums";
import type { DBTransaction } from "@/services/drizzle";
import { productStockLots } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";

/** A compra deu entrada no estoque: status RECEBIDA com a data de recebimento gravada. */
export function isPurchaseConsideredReceived(purchase: { status: TPurchaseStatusEnum; entregaDataRecebimentoEfetivacao?: Date | null }) {
	return purchase.status === "RECEBIDA" && !!purchase.entregaDataRecebimentoEfetivacao;
}

// Stock effects of a received purchase are only reversible while every lot it spawned is still pristine
// (untouched quantity and ATIVO). Once a lot is consumed/discarded/expired, un-receiving or cancelling
// would break the FEFO sub-ledger, so we block it and point the user to the stock-lot flows.
export async function assertPurchaseLotsArePristine({ tx, organizationId, purchaseId }: { tx: DBTransaction; organizationId: string; purchaseId: string }) {
	const lots = await tx.query.productStockLots.findMany({
		where: and(eq(productStockLots.compraId, purchaseId), eq(productStockLots.organizacaoId, organizationId)),
		columns: { quantidadeInicial: true, quantidadeAtual: true, status: true },
	});
	const anyTouched = lots.some((lot) => lot.status !== "ATIVO" || lot.quantidadeAtual < lot.quantidadeInicial);
	if (anyTouched)
		throw new createHttpError.Conflict(
			"Há lotes desta compra já consumidos ou descartados. Ajuste o estoque pelos lotes antes de reabrir ou cancelar a compra.",
		);
}
