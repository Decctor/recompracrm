import { getSalesIntegrationCondition } from "@/lib/sales/integration-filter";
import type {
	TDeliveryModeEnum,
	TFiscalDocumentLifecycleStatusEnum,
	TPaymentMethodEnum,
	TSaleFinancialDerivedStatusEnum,
	TSaleFiscalDerivedStatusEnum,
	TSaleStatusEnum,
} from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { accountingEntries, clients, financialTransactions, fiscalOutboundDocuments, products, saleItems, sales } from "@/services/drizzle/schema";
import { and, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, notInArray, or, type SQL, sql } from "drizzle-orm";
import createHttpError from "http-errors";

/**
 * Filtros do histórico de vendas. É a forma já transformada do input da rota `GET /api/sales`
 * (sem `id`/`page`): o histórico e a exportação recebem o mesmo objeto e produzem as mesmas
 * condições — o que o usuário vê filtrado é exatamente o que ele exporta.
 */
export type TSalesHistoryFilters = {
	search?: string | null;
	periodAfter?: Date | null;
	periodBefore?: Date | null;
	sellersIds?: string[] | null;
	partnersIds?: string[] | null;
	integrationsIds?: string[] | null;
	clientId?: string | null;
	productGroups?: string[] | null;
	productIds?: string[] | null;
	totalMin?: number | null;
	totalMax?: number | null;
	financialStatuses: TSaleFinancialDerivedStatusEnum[];
	fiscalStatuses: TSaleFiscalDerivedStatusEnum[];
	paymentMethods: TPaymentMethodEnum[];
	deliveryModes: TDeliveryModeEnum[];
	saleStatuses: TSaleStatusEnum[];
	hasDiscount?: boolean | null;
};

/**
 * Filtros de status financeiro/fiscal derivado.
 *
 * As agregações partem das tabelas do ERP (lançamentos/documentos, centenas de linhas por
 * organização), nunca de `sales` (dezenas de milhares): agrupar todas as vendas só para derivar
 * o status de cada uma custava ~300-500 ms por consulta. As vendas sem lançamento/documento são
 * resolvidas por anti-join (`NOT IN` sobre o conjunto de `venda_id`, filtrado por `IS NOT NULL`
 * para não anular o `NOT IN`). A condição precisa ser não-correlacionada: a consulta relacional
 * (`db.query.sales.findMany`) apelida a tabela raiz como `sales`, então um `EXISTS` correlacionado
 * a `ampmais_sales` falha.
 */
function getFinancialStatusCondition({ orgId, statuses, now }: { orgId: string; statuses: TSaleFinancialDerivedStatusEnum[]; now: Date }) {
	const receiptCount = sql<number>`count(${financialTransactions.id})`;
	const settledTotal = sql<number>`coalesce(sum(case when ${financialTransactions.dataEfetivacao} is not null then ${financialTransactions.valor} else 0 end), 0)`;
	const overdueCondition = and(
		isNotNull(financialTransactions.id),
		isNull(financialTransactions.dataEfetivacao),
		lt(financialTransactions.dataPrevisao, now),
	);
	const overdueCount = sql<number>`coalesce(sum(case when ${overdueCondition} then 1 else 0 end), 0)`;
	const derivedStatus = sql<TSaleFinancialDerivedStatusEnum>`case
		when ${sales.valorTotal} <= 0 then 'RECEBIDA'
		when ${receiptCount} = 0 then 'NAO_GERADO'
		when ${settledTotal} >= ${sales.valorTotal} then 'RECEBIDA'
		when ${settledTotal} > 0 then 'PARCIALMENTE_RECEBIDA'
		when ${overdueCount} > 0 then 'EM_ATRASO'
		else 'PENDENTE'
	end`;
	// Vendas com ao menos um lançamento: agregação dirigida por `accounting_entries`, com inner join
	// em `sales` apenas para ler `valor_total` das vendas envolvidas.
	const salesWithEntries = db
		.select({ id: sales.id })
		.from(accountingEntries)
		.innerJoin(sales, eq(sales.id, accountingEntries.vendaId))
		.leftJoin(
			financialTransactions,
			and(
				eq(financialTransactions.lancamentoContabilId, accountingEntries.id),
				eq(financialTransactions.organizacaoId, orgId),
				eq(financialTransactions.tipo, "ENTRADA"),
				or(isNull(financialTransactions.provedorStatus), notInArray(financialTransactions.provedorStatus, ["CANCELADO", "ESTORNADO"])),
			),
		)
		.where(and(eq(accountingEntries.organizacaoId, orgId), isNotNull(accountingEntries.vendaId)))
		.groupBy(sales.id, sales.valorTotal)
		.having(inArray(derivedStatus, statuses));
	const conditions: SQL[] = [inArray(sales.id, salesWithEntries)];

	// Vendas sem nenhum lançamento: o status depende só de `valor_total` (mesma ordem do CASE acima).
	const hasNoEntry = notInArray(
		sales.id,
		db
			.select({ id: accountingEntries.vendaId })
			.from(accountingEntries)
			.where(and(eq(accountingEntries.organizacaoId, orgId), isNotNull(accountingEntries.vendaId))),
	);
	if (statuses.includes("NAO_GERADO")) conditions.push(and(gt(sales.valorTotal, 0), hasNoEntry)!);
	if (statuses.includes("RECEBIDA")) conditions.push(and(lte(sales.valorTotal, 0), hasNoEntry)!);

	return or(...conditions)!;
}

function getFiscalStatusCondition({ orgId, statuses }: { orgId: string; statuses: TSaleFiscalDerivedStatusEnum[] }) {
	const hasStatus = (...internalStatuses: TFiscalDocumentLifecycleStatusEnum[]) =>
		sql<boolean>`coalesce(bool_or(${fiscalOutboundDocuments.statusInterno} in (${sql.join(
			internalStatuses.map((status) => sql`${status}`),
			sql`, `,
		)})), false)`;
	// Só avaliado para vendas com documento; `NAO_EMITIDO` é o anti-join abaixo.
	const derivedStatus = sql<TSaleFiscalDerivedStatusEnum>`case
		when ${hasStatus("AUTORIZADO")} then 'AUTORIZADO'
		when ${hasStatus("EM_PROCESSAMENTO", "CANCELAMENTO_PENDENTE")} then 'EM_PROCESSAMENTO'
		when ${hasStatus("RASCUNHO", "PRONTO_PARA_ENVIO")} then 'PENDENTE'
		when ${hasStatus("REJEITADO")} then 'REJEITADO'
		when ${hasStatus("ERRO")} then 'ERRO'
		when ${hasStatus("CANCELADO")} then 'CANCELADO'
		when ${hasStatus("INUTILIZADO")} then 'INUTILIZADO'
		else 'PENDENTE'
	end`;
	const salesWithDocuments = db
		.select({ id: fiscalOutboundDocuments.vendaId })
		.from(fiscalOutboundDocuments)
		.where(and(eq(fiscalOutboundDocuments.organizacaoId, orgId), isNotNull(fiscalOutboundDocuments.vendaId)))
		.groupBy(fiscalOutboundDocuments.vendaId)
		.having(inArray(derivedStatus, statuses));
	const conditions: SQL[] = [inArray(sales.id, salesWithDocuments)];

	if (statuses.includes("NAO_EMITIDO")) {
		conditions.push(
			notInArray(
				sales.id,
				db
					.select({ id: fiscalOutboundDocuments.vendaId })
					.from(fiscalOutboundDocuments)
					.where(and(eq(fiscalOutboundDocuments.organizacaoId, orgId), isNotNull(fiscalOutboundDocuments.vendaId))),
			),
		);
	}

	return or(...conditions)!;
}

/**
 * Vendas com ao menos uma movimentação não cancelada/estornada (ENTRADA ou SAÍDA) em algum dos
 * métodos. As saídas entram para que a venda recebida em outro método mas com troco em dinheiro
 * seja alcançável pelo filtro DINHEIRO — este é o mesmo predicado das linhas de "Recebimentos por
 * método" em resultados, que linkam para cá. Dirigido pelos lançamentos (índice de venda_id),
 * como os demais filtros do ERP.
 */
function getPaymentMethodCondition({ orgId, methods }: { orgId: string; methods: TPaymentMethodEnum[] }) {
	const salesWithMethod = db
		.selectDistinct({ id: accountingEntries.vendaId })
		.from(accountingEntries)
		.innerJoin(
			financialTransactions,
			and(eq(financialTransactions.lancamentoContabilId, accountingEntries.id), eq(financialTransactions.organizacaoId, orgId)),
		)
		.where(
			and(
				eq(accountingEntries.organizacaoId, orgId),
				isNotNull(accountingEntries.vendaId),
				or(isNull(financialTransactions.provedorStatus), notInArray(financialTransactions.provedorStatus, ["CANCELADO", "ESTORNADO"])),
				inArray(financialTransactions.metodo, methods),
			),
		);
	return inArray(sales.id, salesWithMethod);
}

/**
 * Condições `WHERE` do histórico de vendas a partir dos filtros. Compartilhada entre a listagem
 * (`GET /api/sales`) e a exportação (`GET /api/sales/export`): uma única definição garante que os
 * dois recortes sejam o mesmo conjunto.
 *
 * Os filtros financeiros/fiscais/de método dependem das tabelas do ERP e são recusados para
 * organizações sem o módulo — a UI nem os oferece, então chegar aqui com eles é uso indevido.
 */
export function buildSalesHistoryConditions({
	filters,
	orgId,
	orgHasERPAccess,
	now = new Date(),
}: {
	filters: TSalesHistoryFilters;
	orgId: string;
	orgHasERPAccess: boolean;
	now?: Date;
}): SQL[] {
	const {
		search,
		periodAfter,
		periodBefore,
		sellersIds,
		partnersIds,
		integrationsIds,
		clientId,
		productGroups,
		productIds,
		totalMin,
		totalMax,
		financialStatuses,
		fiscalStatuses,
		paymentMethods,
		deliveryModes,
		saleStatuses,
		hasDiscount,
	} = filters;

	const conditions: SQL[] = [eq(sales.organizacaoId, orgId)];
	if (!orgHasERPAccess && (financialStatuses.length > 0 || fiscalStatuses.length > 0 || paymentMethods.length > 0)) {
		throw new createHttpError.Forbidden("Sua organização não possui acesso aos filtros financeiros e fiscais do ERP.");
	}

	if (search)
		conditions.push(
			inArray(
				sales.clienteId,
				db
					.select({ id: clients.id })
					.from(clients)
					.where(
						sql`to_tsvector('portuguese', ${clients.nome}) @@ plainto_tsquery('portuguese', ${search}) OR ${clients.nome} ILIKE '%' || ${search} || '%'`,
					),
			),
		);
	if (periodAfter) conditions.push(gte(sales.dataVenda, periodAfter));
	if (periodBefore) conditions.push(lte(sales.dataVenda, periodBefore));
	if (sellersIds && sellersIds.length > 0) conditions.push(inArray(sales.vendedorId, sellersIds));
	if (partnersIds && partnersIds.length > 0) conditions.push(inArray(sales.parceiroId, partnersIds));
	const integrationCondition = getSalesIntegrationCondition(integrationsIds);
	if (integrationCondition) conditions.push(integrationCondition);
	if (clientId) conditions.push(eq(sales.clienteId, clientId));
	if (totalMin !== null && totalMin !== undefined) conditions.push(gte(sales.valorTotal, totalMin));
	if (totalMax !== null && totalMax !== undefined) conditions.push(lte(sales.valorTotal, totalMax));
	if (financialStatuses.length > 0) conditions.push(getFinancialStatusCondition({ orgId, statuses: financialStatuses, now }));
	if (fiscalStatuses.length > 0) conditions.push(getFiscalStatusCondition({ orgId, statuses: fiscalStatuses }));
	if (paymentMethods.length > 0) conditions.push(getPaymentMethodCondition({ orgId, methods: paymentMethods }));
	if (saleStatuses.length > 0) conditions.push(inArray(sales.statusVenda, saleStatuses));
	if (deliveryModes.length > 0) conditions.push(inArray(sales.entregaModalidade, deliveryModes));
	if (hasDiscount === true) conditions.push(gt(sales.descontosTotal, 0));
	if (hasDiscount === false) conditions.push(or(isNull(sales.descontosTotal), lte(sales.descontosTotal, 0))!);
	if (productIds && productIds.length > 0) {
		conditions.push(
			inArray(
				sales.id,
				db
					.select({ id: saleItems.vendaId })
					.from(saleItems)
					.where(and(eq(saleItems.organizacaoId, orgId), inArray(saleItems.produtoId, productIds))),
			),
		);
	}
	if (productGroups && productGroups.length > 0) {
		conditions.push(
			inArray(
				sales.id,
				db
					.select({ id: saleItems.vendaId })
					.from(saleItems)
					.innerJoin(products, eq(products.id, saleItems.produtoId))
					.where(and(eq(saleItems.organizacaoId, orgId), eq(products.organizacaoId, orgId), inArray(products.grupo, productGroups))),
			),
		);
	}

	return conditions;
}
