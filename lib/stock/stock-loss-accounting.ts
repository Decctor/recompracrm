import { writeDefaultAccountingEntryLines } from "@/lib/finances/accounting-entry-lines";
import { resolveAccountingDefaultAccountIds } from "@/lib/finances/resolve-accounting-default-accounts";
import type { DBTransaction } from "@/services/drizzle";
import { accountingEntries } from "@/services/drizzle/schema";
import createHttpError from "http-errors";

/**
 * Custo unitário usado para valorar a perda: o custo médio móvel corrente do produto/variante
 * (mesma base do custeio do sistema) e, quando a organização nunca registrou custo, o custo de
 * origem do lote (item da compra que o criou). Lotes de produção sem custo médio ficam sem valor
 * (as saídas de produção não congelam custo unitário do produto final).
 */
export async function resolveStockLossUnitCost({
	trx,
	organizationId,
	produtoId,
	produtoVarianteId,
	compraItemId,
}: {
	trx: DBTransaction;
	organizationId: string;
	produtoId: string;
	produtoVarianteId?: string | null;
	compraItemId?: string | null;
}) {
	if (produtoVarianteId) {
		const variant = await trx.query.productVariants.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, produtoVarianteId), eq(fields.organizacaoId, organizationId)),
			columns: { precoCusto: true },
		});
		if (variant?.precoCusto != null) return variant.precoCusto;
	} else {
		const product = await trx.query.products.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, produtoId), eq(fields.organizacaoId, organizationId)),
			columns: { precoCusto: true },
		});
		if (product?.precoCusto != null) return product.precoCusto;
	}

	if (compraItemId) {
		const purchaseItem = await trx.query.purchaseItems.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, compraItemId), eq(fields.organizacaoId, organizationId)),
			columns: { valorUnitarioLiquido: true, valorUnitarioBruto: true },
		});
		if (purchaseItem) return purchaseItem.valorUnitarioLiquido ?? purchaseItem.valorUnitarioBruto ?? null;
	}

	return null;
}

/**
 * Lançamento contábil da perda: débito em despesa de perdas, crédito baixando o ativo de
 * estoques. Evento não-caixa — nasce sem transações financeiras. Sem custo conhecido não há
 * o que valorar: um lançamento de valor zero é ruído contábil, então nada é gerado.
 */
export async function registerStockLossAccountingEntry({
	trx,
	organizationId,
	userId,
	unitCost,
	quantity,
	title,
	notes,
	loteId,
}: {
	trx: DBTransaction;
	organizationId: string;
	userId: string;
	unitCost: number | null;
	quantity: number;
	title: string;
	notes: string;
	loteId?: string | null;
}) {
	const lossValue = unitCost != null && unitCost > 0 ? Math.round(unitCost * quantity * 100) / 100 : null;
	if (lossValue == null || lossValue <= 0) return { lancamentoContabilId: null, valor: null, custoUnitario: unitCost };

	const { debitAccountId, creditAccountId } = await resolveAccountingDefaultAccountIds({
		trx,
		orgId: organizationId,
		kind: "perdasEstoque",
		autoProvisionFromSeed: true,
	});
	const [entry] = await trx
		.insert(accountingEntries)
		.values({
			organizacaoId: organizationId,
			loteId: loteId ?? null,
			origemTipo: "PERDA_ESTOQUE",
			titulo: title,
			anotacoes: notes,
			idContaDebito: debitAccountId,
			idContaCredito: creditAccountId,
			valor: lossValue,
			dataCompetencia: new Date(),
			autorId: userId,
		})
		.returning({ id: accountingEntries.id });
	const accountingEntryId = entry?.id ?? null;
	if (!accountingEntryId) throw new createHttpError.InternalServerError("Erro ao criar lançamento contábil da perda.");
	await writeDefaultAccountingEntryLines({
		trx,
		organizationId,
		accountingEntryId,
		entryValue: lossValue,
		debitAccountId,
		creditAccountId,
	});

	return { lancamentoContabilId: accountingEntryId, valor: lossValue, custoUnitario: unitCost };
}
