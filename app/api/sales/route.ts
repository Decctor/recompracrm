import { appApiHandler } from "@/lib/app-api";
import { runPagesRouteHandler, type PagesRouteHandler } from "@/lib/pages-route-compat";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { applyCashbackRedemptionFIFO } from "@/lib/cashback/redemption";
import { reverseSaleCashback } from "@/lib/cashback/reverse-sale-cashback";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getSalesIntegrationCondition } from "@/lib/sales/integration-filter";
import { campaignAudienceHasClient, resolveCampaignAudiencesByCampaignId } from "@/lib/campaigns/filters";
import { DASTJS_TIME_DURATION_UNITS_MAP, getPostponedDateFromReferenceDate } from "@/lib/dates";
import { type ImmediateProcessingData, processOrganizationInteractionsBatch, processSingleInteractionImmediately } from "@/lib/interactions";
import { getValidClientSaleWhere } from "@/lib/sales/valid-sale";
import { resolveSaleEditability } from "@/lib/sales/sale-editability";
import { decorateFiscalDocuments, type TFiscalDocumentDecoration } from "@/lib/fiscal/document-actions-loader";
import { loadFiscalOrganization } from "@/lib/fiscal/settings";
import { classifySalePaymentTransactions, computeSaleFinancialStatus, computeSaleFiscalStatus, groupSalePaymentsByMethod } from "@/lib/sales/utils";
import { isSaleChangeTransaction } from "@/lib/sales/sale-change";
import {
	SaleFinancialDerivedStatusEnum,
	SaleFiscalDerivedStatusEnum,
	DeliveryModeEnum,
	PaymentMethodEnum,
	SaleStatusEnum,
	type TDeliveryModeEnum,
	type TPaymentMethodEnum,
	type TSaleFinancialDerivedStatusEnum,
	type TSaleFiscalDerivedStatusEnum,
	type TSaleStatusEnum,
	type TFiscalDocumentLifecycleStatusEnum,
} from "@/schemas/enums";
import { createCampaignWeeklyLimitCache } from "@/lib/interactions/campaign-weekly-limits";
import type { TFiscalDocumentStatusEnum, TFiscalDocumentTypeEnum, TTimeDurationUnitsEnum } from "@/schemas/enums";
import { type DBTransaction, db } from "@/services/drizzle";
import {
	cashbackProgramBalances,
	cashbackProgramTransactions,
	cashbackPrograms,
	clients,
	interactions,
	organizations,
	products,
	saleItems,
	sales,
	accountingEntries,
	financialTransactions,
	fiscalOutboundDocuments,
} from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, asc, count, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, notInArray, or, type SQL, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import z from "zod";

/**
 * Helper function to check if a campaign can be scheduled for a client based on frequency rules
 * @param tx - Database transaction instance
 * @param clienteId - Client ID
 * @param campanhaId - Campaign ID
 * @param permitirRecorrencia - Whether the campaign allows recurrence
 * @param frequenciaIntervaloValor - Frequency interval value
 * @param frequenciaIntervaloMedida - Frequency interval unit (DIAS, HORAS, etc.)
 * @returns true if the campaign can be scheduled, false otherwise
 */
async function canScheduleCampaignForClient(
	tx: DBTransaction,
	clienteId: string,
	campanhaId: string,
	permitirRecorrencia: boolean,
	frequenciaIntervaloValor: number | null,
	frequenciaIntervaloMedida: string | null,
): Promise<boolean> {
	// Check if campaign allows recurrence
	if (!permitirRecorrencia) {
		const previousInteraction = await tx.query.interactions.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.clienteId, clienteId), eq(fields.campanhaId, campanhaId)),
		});
		if (previousInteraction) {
			console.log(`[CAMPAIGN_FREQUENCY] Campaign ${campanhaId} does not allow recurrence. Skipping for client ${clienteId}.`);
			return false;
		}
	}

	// Check for time interval (Frequency Cap)
	if (permitirRecorrencia && frequenciaIntervaloValor && frequenciaIntervaloValor > 0 && frequenciaIntervaloMedida) {
		// Map the enum to dayjs units
		const dayjsUnit = DASTJS_TIME_DURATION_UNITS_MAP[frequenciaIntervaloMedida as TTimeDurationUnitsEnum] || "day";

		// Calculate the cutoff date based on the campaign's interval settings
		const cutoffDate = dayjs().subtract(frequenciaIntervaloValor, dayjsUnit).toDate();

		const recentInteraction = await tx.query.interactions.findFirst({
			where: (fields, { and, eq, gt }) => and(eq(fields.clienteId, clienteId), eq(fields.campanhaId, campanhaId), gt(fields.dataInsercao, cutoffDate)),
		});

		if (recentInteraction) {
			console.log(
				`[CAMPAIGN_FREQUENCY] Campaign ${campanhaId} frequency limit reached for client ${clienteId}. Last interaction was at ${recentInteraction.dataInsercao}.`,
			);
			return false;
		}
	}

	return true;
}

const GetSalesInputSchema = z.object({
	id: z
		.string({
			invalid_type_error: "Tipo não válido para ID da venda.",
		})
		.optional()
		.nullable(),
	page: z
		.string({
			required_error: "Página não informada.",
			invalid_type_error: "Tipo inválido para página.",
		})
		.default("1")
		.transform((val) => (val ? Number(val) : 1)),
	search: z
		.string({
			required_error: "Busca não informada.",
			invalid_type_error: "Tipo inválido para busca.",
		})
		.optional()
		.nullable(),
	periodAfter: z
		.string({
			required_error: "Período não informado.",
			invalid_type_error: "Tipo inválido para período.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	periodBefore: z
		.string({
			required_error: "Período não informado.",
			invalid_type_error: "Tipo inválido para período.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	sellersIds: z
		.string({
			invalid_type_error: "Tipo inválido para ID do vendedor.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? val.split(",") : [])),
	partnersIds: z
		.string({
			invalid_type_error: "Tipo inválido para ID do parceiro.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? val.split(",") : null)),
	integrationsIds: z
		.string({
			invalid_type_error: "Tipo inválido para os IDs de integração.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? val.split(",") : [])),
	clientId: z
		.string({
			invalid_type_error: "Tipo inválido para ID do cliente.",
		})
		.optional()
		.nullable(),
	productGroups: z
		.string({
			invalid_type_error: "Tipo inválido para grupos de produto.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? val.split(",") : [])),
	productIds: z
		.string({
			invalid_type_error: "Tipo inválido para IDs de produto.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? val.split(",") : [])),
	totalMin: z
		.string({
			invalid_type_error: "Tipo inválido para valor mínimo.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? Number(val) : null)),
	totalMax: z
		.string({
			invalid_type_error: "Tipo inválido para valor máximo.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? Number(val) : null)),
	financialStatuses: z
		.string({ invalid_type_error: "Tipo inválido para os status financeiros." })
		.optional()
		.nullable()
		.transform((val) =>
			val ? val.split(",").filter((status): status is TSaleFinancialDerivedStatusEnum => SaleFinancialDerivedStatusEnum.safeParse(status).success) : [],
		),
	fiscalStatuses: z
		.string({ invalid_type_error: "Tipo inválido para os status fiscais." })
		.optional()
		.nullable()
		.transform((val) =>
			val ? val.split(",").filter((status): status is TSaleFiscalDerivedStatusEnum => SaleFiscalDerivedStatusEnum.safeParse(status).success) : [],
		),
	// Vendas com ao menos um recebimento em algum dos métodos informados (OR entre os métodos).
	paymentMethods: z
		.string({ invalid_type_error: "Tipo inválido para os métodos de pagamento." })
		.optional()
		.nullable()
		.transform((val) => (val ? val.split(",").filter((method): method is TPaymentMethodEnum => PaymentMethodEnum.safeParse(method).success) : [])),
	// Modalidade de atendimento da venda (presencial, retirada, entrega, comanda): qualquer uma das informadas.
	deliveryModes: z
		.string({ invalid_type_error: "Tipo inválido para as modalidades de atendimento." })
		.optional()
		.nullable()
		.transform((val) => (val ? val.split(",").filter((mode): mode is TDeliveryModeEnum => DeliveryModeEnum.safeParse(mode).success) : [])),
	// Status comercial da venda. O histórico mistura orçamento, condicional e venda confirmada de
	// propósito — quem acabou de criar um orçamento espera achá-lo aqui. O filtro é para triagem.
	saleStatuses: z
		.string({ invalid_type_error: "Tipo inválido para os status de venda." })
		.optional()
		.nullable()
		.transform((val) => (val ? val.split(",").filter((status): status is TSaleStatusEnum => SaleStatusEnum.safeParse(status).success) : [])),
	// Presença de desconto na venda: "true" só as com desconto, "false" só as sem; ausente não filtra.
	hasDiscount: z
		.string({ invalid_type_error: "Tipo inválido para o filtro de desconto." })
		.optional()
		.nullable()
		.transform((val) => (val === "true" ? true : val === "false" ? false : null)),
});

export type TGetSalesInput = z.infer<typeof GetSalesInputSchema>;

/**
 * Resumo ERP (financeiro + fiscal) por venda para a listagem do histórico. Calculado só para
 * organizações com o módulo de ERP, a partir de 2 consultas agregadas sobre os IDs da página
 * (ambas atendidas pelos índices de venda_id) — sem engordar a query relacional principal.
 */
export type TSaleErpSummary = {
	financeiro: {
		status: TSaleFinancialDerivedStatusEnum;
		/** Líquido por método (entradas menos troco devolvido); negativo quando o método só devolveu dinheiro. */
		metodos: { metodo: TPaymentMethodEnum; valor: number }[];
		maxParcelas: number | null;
	};
	fiscal: {
		status: TSaleFiscalDerivedStatusEnum;
		documento: { tipo: string; numero: string | null } | null;
	};
};

async function getSalesErpSummaries({
	orgId,
	salesPage,
}: {
	orgId: string;
	salesPage: { id: string; valorTotal: number }[];
}): Promise<Map<string, TSaleErpSummary>> {
	const saleIds = salesPage.map((sale) => sale.id);
	const summaries = new Map<string, TSaleErpSummary>();
	if (saleIds.length === 0) return summaries;

	const [entries, fiscalDocs] = await Promise.all([
		db.query.accountingEntries.findMany({
			where: (fields, { and, eq, inArray }) => and(eq(fields.organizacaoId, orgId), inArray(fields.vendaId, saleIds)),
			columns: { id: true, vendaId: true },
			with: {
				transacoesFinanceiras: {
					columns: {
						valor: true,
						tipo: true,
						metodo: true,
						totalParcelas: true,
						dataEfetivacao: true,
						dataPrevisao: true,
						provedorStatus: true,
						modificadoresMetadata: true,
					},
				},
			},
		}),
		db.query.fiscalOutboundDocuments.findMany({
			where: (fields, { and, eq, inArray }) => and(eq(fields.organizacaoId, orgId), inArray(fields.vendaId, saleIds)),
			columns: { vendaId: true, tipo: true, statusInterno: true, numero: true, dataInsercao: true },
			orderBy: (fields, { asc }) => asc(fields.dataInsercao),
		}),
	]);

	const transactionsBySaleId = new Map<string, (typeof entries)[number]["transacoesFinanceiras"]>();
	for (const entry of entries) {
		if (!entry.vendaId) continue;
		const existing = transactionsBySaleId.get(entry.vendaId) ?? [];
		transactionsBySaleId.set(entry.vendaId, existing.concat(entry.transacoesFinanceiras));
	}
	const fiscalDocsBySaleId = new Map<string, typeof fiscalDocs>();
	for (const doc of fiscalDocs) {
		if (!doc.vendaId) continue;
		const existing = fiscalDocsBySaleId.get(doc.vendaId) ?? [];
		existing.push(doc);
		fiscalDocsBySaleId.set(doc.vendaId, existing);
	}

	const now = new Date();
	for (const sale of salesPage) {
		const transactions = transactionsBySaleId.get(sale.id) ?? [];
		const receipts = transactions.filter(
			(transaction) => transaction.tipo === "ENTRADA" && !["CANCELADO", "ESTORNADO"].includes(transaction.provedorStatus ?? ""),
		);
		// Líquido por método: entradas somam, troco devolvido (SAÍDA de origem TROCO) subtrai. Taxas de
		// canal também são SAÍDA, mas são despesa da organização, não pagamento do cliente — ficam fora.
		// Liquidar mantém a venda em dinheiro com troco como um método só; o valor por método interessa
		// quando o pagamento cruza instrumentos (ex.: PIX R$ 100 + DINHEIRO −R$ 22 de troco).
		const valorPorMetodo = new Map<TPaymentMethodEnum, number>();
		for (const transaction of receipts) {
			valorPorMetodo.set(transaction.metodo, (valorPorMetodo.get(transaction.metodo) ?? 0) + transaction.valor);
		}
		for (const transaction of transactions) {
			if (!isSaleChangeTransaction(transaction) || ["CANCELADO", "ESTORNADO"].includes(transaction.provedorStatus ?? "")) continue;
			valorPorMetodo.set(transaction.metodo, (valorPorMetodo.get(transaction.metodo) ?? 0) - transaction.valor);
		}
		const metodos = [...valorPorMetodo].map(([metodo, valor]) => ({ metodo, valor: Math.round((valor + Number.EPSILON) * 100) / 100 }));
		const maxParcelas = receipts.reduce<number | null>(
			(acc, transaction) => (transaction.totalParcelas && transaction.totalParcelas > (acc ?? 0) ? transaction.totalParcelas : acc),
			null,
		);

		const docs = fiscalDocsBySaleId.get(sale.id) ?? [];
		// Documento "principal" do chip: o autorizado mais recente; sem autorizado, o mais recente.
		const primaryDoc = [...docs].reverse().find((doc) => doc.statusInterno === "AUTORIZADO") ?? docs[docs.length - 1] ?? null;

		summaries.set(sale.id, {
			financeiro: {
				status: computeSaleFinancialStatus({ transactions, saleTotal: sale.valorTotal, now }),
				metodos,
				maxParcelas,
			},
			fiscal: {
				status: computeSaleFiscalStatus({ documents: docs }),
				documento: primaryDoc ? { tipo: primaryDoc.tipo, numero: primaryDoc.numero } : null,
			},
		});
	}

	return summaries;
}

type SaleErpDetailDocument = {
	id: string;
	organizacaoId: string;
	tipo: TFiscalDocumentTypeEnum;
	status: TFiscalDocumentStatusEnum;
	statusInterno: TFiscalDocumentLifecycleStatusEnum;
	ambiente: string;
	numero: string | null;
	serie: string | null;
	chaveAcesso: string | null;
	vendaId: string | null;
	provedorDocumentoId: string | null;
	xmlStoragePath: string | null;
	pdfStoragePath: string | null;
	codigoRejeicao: string | null;
	mensagens: string[] | null;
	problemas: string | null;
	documentoOrigemId: string | null;
	dataAutorizacao: Date | null;
	dataCancelamento: Date | null;
	dataInsercao: Date;
};

/**
 * Documentos fiscais da venda com `acoes` + `problemas` (mesma decoração do módulo fiscal), para
 * que a página da venda mostre o que fazer sem recalcular regra nenhuma. Sem permissão fiscal
 * não decora: a seção inteira é gateada por `fiscal: null` logo abaixo.
 */
async function decorateSaleFiscalDocuments({
	documents,
	organizationId,
	userCanViewFiscal,
}: {
	documents: SaleErpDetailDocument[];
	organizationId: string;
	userCanViewFiscal: boolean;
}): Promise<(SaleErpDetailDocument & TFiscalDocumentDecoration)[]> {
	if (!userCanViewFiscal || documents.length === 0) return [];
	const organization = await loadFiscalOrganization(organizationId);
	return decorateFiscalDocuments({ documents, organizationId, provider: organization?.fiscalProvedor });
}

/**
 * Resumo ERP da venda individual: a versão detalhada do que `getSalesErpSummaries` devolve por
 * linha da listagem. Não faz consulta — recebe as transações e os documentos que o ramo `byId` já
 * carregou e só deriva a apresentação.
 *
 * Um único `null` no topo gateia a linha inteira na página (organização sem o módulo de ERP); o
 * `fiscal: null` interno gateia só a metade fiscal (membro sem permissão de visualização).
 */
function buildSaleErpDetail({
	sale,
	transacoes,
	documentosFiscais,
	userCanViewFiscal,
	now = new Date(),
}: {
	sale: { valorTotal: number };
	transacoes: Parameters<typeof classifySalePaymentTransactions>[0];
	documentosFiscais: (SaleErpDetailDocument & TFiscalDocumentDecoration)[];
	userCanViewFiscal: boolean;
	now?: Date;
}) {
	const classificacao = classifySalePaymentTransactions(transacoes);
	const pagamentos = groupSalePaymentsByMethod(classificacao.todas, now);

	// Ordem cronológica: a sequência de documentos conta a história da nota (emitida, depois
	// cancelada) na direção em que ela aconteceu.
	const documentos = [...documentosFiscais].sort((a, b) => a.dataInsercao.getTime() - b.dataInsercao.getTime());
	const numeroPorId = new Map(documentos.map((documento) => [documento.id, documento.numero]));

	return {
		financeiro: {
			status: computeSaleFinancialStatus({
				transactions: classificacao.todas.map((pagamento) => ({
					valor: pagamento.valor,
					tipo: "ENTRADA",
					dataEfetivacao: pagamento.dataEfetivacao,
					dataPrevisao: pagamento.dataPrevisao,
					provedorStatus: pagamento.provedorStatus,
				})),
				saleTotal: sale.valorTotal,
				now,
			}),
			pagamentos,
			valorRecebido: pagamentos.reduce((acc, pagamento) => acc + pagamento.valorRecebido, 0),
		},
		fiscal: userCanViewFiscal
			? {
					status: computeSaleFiscalStatus({ documents: documentos }),
					documentos: documentos.map((documento) => ({
						...documento,
						// O encadeamento (cancelamento/devolução) referencia o documento de origem por id.
						// Resolver o número aqui evita que a UI precise fazer o lookup — todos os
						// documentos da venda já estão nesta mesma lista.
						documentoOrigemNumero: documento.documentoOrigemId ? (numeroPorId.get(documento.documentoOrigemId) ?? null) : null,
					})),
				}
			: null,
	};
}

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

async function getSales({ input, sessionUser }: { input: TGetSalesInput; sessionUser: TAuthUserSession }) {
	const PAGE_SIZE = 25;
	const userOrgId = sessionUser.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	const {
		id,
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
	} = input;

	// Lido antes do ramo `byId`: o resumo de ERP da venda individual é gateado pelo mesmo módulo
	// que gateia os chips da listagem.
	const orgHasERPAccess = !!sessionUser.membership?.organizacao.configuracao?.recursos?.erp?.acesso;

	if (id) {
		const sale = await db.query.sales.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, id), eq(fields.organizacaoId, userOrgId)),
			with: {
				integracao: {
					columns: {
						tipo: true,
						apelido: true,
					},
				},
				cliente: {
					columns: {
						id: true,
						nome: true,
						telefone: true,
						email: true,
						dataNascimento: true,
						analiseRFMTitulo: true,
						analiseRFMNotasFrequencia: true,
						analiseRFMNotasMonetario: true,
						analiseRFMNotasRecencia: true,
						localizacaoCep: true,
						localizacaoEstado: true,
						localizacaoCidade: true,
						localizacaoBairro: true,
						localizacaoLogradouro: true,
						localizacaoNumero: true,
						localizacaoComplemento: true,
						metadataValorTotalCompras: true,
						metadataTotalCompras: true,
					},
				},
				vendedor: {
					columns: {
						id: true,
						nome: true,
						avatarUrl: true,
					},
				},
				parceiro: {
					columns: {
						id: true,
						nome: true,
						avatarUrl: true,
					},
				},
				// Colunas explícitas: `true` traria `provedorPayload`, `provedorRetorno` e
				// `snapshotOrigemVenda` — três colunas `text` com o XML/JSON inteiro da nota, que
				// viajavam até o cliente em todo carregamento da página sem ninguém lê-las.
				documentosFiscais: {
					columns: {
						id: true,
						organizacaoId: true,
						tipo: true,
						status: true,
						statusInterno: true,
						ambiente: true,
						numero: true,
						serie: true,
						chaveAcesso: true,
						protocolo: true,
						vendaId: true,
						provedorDocumentoId: true,
						xmlStoragePath: true,
						pdfStoragePath: true,
						codigoRejeicao: true,
						mensagens: true,
						// `problemas` (JSON) alimenta `resolveFiscalDocumentProblems`: o erro como dado, com alvo e CTA.
						problemas: true,
						documentoOrigemId: true,
						dataEmissao: true,
						dataAutorizacao: true,
						dataCancelamento: true,
						dataInsercao: true,
					},
				},
				itens: {
					columns: {
						id: true,
						quantidade: true,
						valorCustoUnitario: true,
						valorCustoTotal: true,
						valorVendaUnitario: true,
						valorVendaTotalBruto: true,
						valorTotalDesconto: true,
						valorVendaTotalLiquido: true,
					},
					with: {
						produto: {
							columns: {
								id: true,
								nome: true,
								codigo: true,
								imagemCapaUrl: true,
								grupo: true,
								unidade: true,
							},
						},
						produtoVariante: {
							columns: {
								id: true,
								nome: true,
								codigo: true,
								imagemCapaUrl: true,
							},
						},
						adicionais: {
							columns: {
								id: true,
								quantidade: true,
								valorUnitario: true,
								valorTotal: true,
							},
							with: {
								opcao: {
									columns: {
										id: true,
										nome: true,
									},
								},
							},
						},
					},
				},
				transacoesCashback: {
					columns: {
						tipo: true,
						valor: true,
						saldoValorAnterior: true,
						saldoValorPosterior: true,
						expiracaoData: true,
						dataInsercao: true,
					},
				},
				atribuicaoCampanhaConversao: {
					columns: {
						deltaFrequencia: true,
						deltaMonetarioAbsoluto: true,
						deltaMonetarioPercentual: true,
						diasDesdeUltimaCompra: true,
						tipoConversao: true,
						dataInteracao: true,
						tempoParaConversaoMinutos: true,
					},
				},
			},
		});
		if (!sale) throw new createHttpError.NotFound("Venda não encontrada.");
		const resgatesCupom = await db.query.couponRedemptions.findMany({
			where: (fields, { and, eq }) => and(eq(fields.vendaId, sale.id), eq(fields.organizacaoId, userOrgId)),
			columns: {
				id: true,
				cupomId: true,
				atribuicaoId: true,
				clienteId: true,
				status: true,
				vendaId: true,
				vendaValor: true,
				valorDesconto: true,
				cupomTitulo: true,
				cupomCodigo: true,
				beneficioSnapshot: true,
				origemResgate: true,
				metadados: true,
				dataInsercao: true,
				dataAtualizacao: true,
			},
			orderBy: (fields, { desc }) => desc(fields.dataInsercao),
		});
		// Transações financeiras da venda (via lançamentos): insumo da política de editabilidade e
		// do resumo de recebimentos.
		const lancamentos = await db.query.accountingEntries.findMany({
			where: (fields, { and, eq }) => and(eq(fields.organizacaoId, userOrgId), eq(fields.vendaId, sale.id)),
			columns: { id: true },
			with: {
				transacoesFinanceiras: {
					columns: {
						id: true,
						titulo: true,
						valor: true,
						tipo: true,
						metodo: true,
						parcela: true,
						totalParcelas: true,
						dataEfetivacao: true,
						dataPrevisao: true,
						provedorStatus: true,
						contaFinanceiraId: true,
					},
				},
			},
		});
		const transacoes = lancamentos.flatMap((entry) =>
			entry.transacoesFinanceiras.map((transacao) => ({ ...transacao, lancamentoContabilId: entry.id })),
		);
		const editabilidade = resolveSaleEditability({
			statusVenda: sale.statusVenda,
			statusAtendimento: sale.statusAtendimento,
			processamentoOrigem: sale.processamentoOrigem,
			tabId: sale.tabId,
			valorTotal: sale.valorTotal,
			documentosFiscais: sale.documentosFiscais,
			transacoes,
		});
		const { documentosFiscais, ...saleWithoutFiscalDocuments } = sale;
		const userCanViewFiscal = !!sessionUser.membership?.permissoes.fiscal.visualizar;
		const documentosFiscaisDecorados = orgHasERPAccess
			? await decorateSaleFiscalDocuments({ documents: documentosFiscais, organizationId: userOrgId, userCanViewFiscal })
			: [];
		return {
			data: {
				default: null,
				byId: {
					...saleWithoutFiscalDocuments,
					resgatesCupom,
					editabilidade,
					erp: orgHasERPAccess
						? buildSaleErpDetail({
								sale,
								transacoes,
								documentosFiscais: documentosFiscaisDecorados,
								userCanViewFiscal,
							})
						: null,
				},
				byClientId: null,
			},
			message: "Venda encontrada com sucesso.",
		};
	}
	const conditions = [eq(sales.organizacaoId, userOrgId)];
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
	if (financialStatuses.length > 0) conditions.push(getFinancialStatusCondition({ orgId: userOrgId, statuses: financialStatuses, now: new Date() })!);
	if (fiscalStatuses.length > 0) conditions.push(getFiscalStatusCondition({ orgId: userOrgId, statuses: fiscalStatuses })!);
	if (paymentMethods.length > 0) conditions.push(getPaymentMethodCondition({ orgId: userOrgId, methods: paymentMethods }));
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
					.where(and(eq(saleItems.organizacaoId, userOrgId), inArray(saleItems.produtoId, productIds))),
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
					.where(and(eq(saleItems.organizacaoId, userOrgId), eq(products.organizacaoId, userOrgId), inArray(products.grupo, productGroups))),
			),
		);
	}

	const salesMatchedPromise = db
		.select({ count: count() })
		.from(sales)
		.where(and(...conditions));

	const skip = PAGE_SIZE * (input.page - 1);
	const limit = PAGE_SIZE;

	// Duas etapas: primeiro só os IDs da página (consulta leve, ordenada e paginada), depois a
	// hidratação relacional restrita a esses IDs. Numa consulta única, quando o planejador
	// subestimava os filtros do ERP, ele varria todas as vendas da organização executando os
	// LATERAL joins de cada uma antes de filtrar — minutos, até estourar o timeout.
	const salesPagePromise = db
		.select({ id: sales.id })
		.from(sales)
		.where(and(...conditions))
		.orderBy(desc(sales.dataVenda), desc(sales.id))
		.offset(skip)
		.limit(limit);
	const [salesMatched, salesPage] = await Promise.all([salesMatchedPromise, salesPagePromise]);
	const salesPageIds = salesPage.map((sale) => sale.id);

	const salesHydrated =
		salesPageIds.length === 0
			? []
			: await db.query.sales.findMany({
					where: inArray(sales.id, salesPageIds),
					with: {
						integracao: {
							columns: {
								tipo: true,
								apelido: true,
							},
						},
						cliente: {
							columns: {
								id: true,
								nome: true,
								telefone: true,
								localizacaoCep: true,
								localizacaoEstado: true,
								localizacaoCidade: true,
								localizacaoBairro: true,
								localizacaoLogradouro: true,
								localizacaoNumero: true,
								localizacaoComplemento: true,
								primeiraCompraData: true,
							},
						},
						vendedor: {
							columns: {
								id: true,
								nome: true,
								avatarUrl: true,
							},
						},
						parceiro: {
							columns: {
								id: true,
								nome: true,
								avatarUrl: true,
							},
						},
						itens: {
							columns: {
								id: true,
								quantidade: true,
								valorVendaUnitario: true,
								valorTotalDesconto: true,
								valorVendaTotalLiquido: true,
							},
							with: {
								produto: {
									columns: {
										id: true,
										nome: true,
									},
								},
							},
						},
						transacoesCashback: {
							columns: {
								id: true,
								valor: true,
								tipo: true,
								status: true,
								expiracaoData: true,
								dataInsercao: true,
								saldoValorAnterior: true,
								saldoValorPosterior: true,
							},
							with: {
								programa: {
									columns: {
										id: true,
										titulo: true,
									},
								},
							},
						},
						atribuicaoCampanhaConversao: {
							columns: {
								id: true,
								dataInteracao: true,
								dataConversao: true,
								tempoParaConversaoMinutos: true,
								atribuicaoReceita: true,
							},
							with: {
								campanha: {
									columns: {
										id: true,
										titulo: true,
										cashbackGeracaoTipo: true,
										cashbackGeracaoValor: true,
									},
								},
								interacao: {
									columns: {
										id: true,
										titulo: true,
										dataEnvio: true,
									},
								},
							},
						},
					},
				});
	// Preserva a ordem da página: `IN (...)` não garante ordem.
	const salesHydratedById = new Map(salesHydrated.map((sale) => [sale.id, sale]));
	const salesResult = salesPageIds.flatMap((id) => {
		const sale = salesHydratedById.get(id);
		return sale ? [sale] : [];
	});
	const salesMatchedCount = salesMatched[0]?.count ?? 0;
	const totalPages = Math.ceil(salesMatchedCount / PAGE_SIZE);

	// Resumo ERP (pagamento/fiscal) apenas para organizações com o módulo: as demais não pagam as consultas extra.
	const erpSummaries = orgHasERPAccess ? await getSalesErpSummaries({ orgId: userOrgId, salesPage: salesResult }) : null;
	const salesWithErp = salesResult.map((sale) => ({
		...sale,
		erp: erpSummaries?.get(sale.id) ?? null,
	}));

	return {
		data: {
			default: clientId
				? null
				: {
						sales: salesWithErp,
						totalPages: totalPages,
						salesMatched: salesMatchedCount,
					},
			byId: null,
			byClientId: clientId
				? {
						sales: salesWithErp,
						totalPages: totalPages,
						salesMatched: salesMatchedCount,
					}
				: null,
		},
		message: "Vendas encontradas com sucesso.",
	};
}
export type TGetSalesOutput = Awaited<ReturnType<typeof getSales>>;
export type TGetSalesOutputDefault = Exclude<Awaited<TGetSalesOutput>["data"]["default"], null>;
export type TGetSalesOutputById = Exclude<Awaited<TGetSalesOutput>["data"]["byId"], null>;
export type TGetSalesOutputByClientId = Exclude<Awaited<TGetSalesOutput>["data"]["byClientId"], null>;
const getSalesRoute: PagesRouteHandler<TGetSalesOutput> = async (req, res) => {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const userOrgId = sessionUser.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const input = GetSalesInputSchema.parse(req.query);

	const result = await getSales({ input, sessionUser });

	return res.status(200).json(result);
};

// POST handler for creating sales from point-of-interaction
const CreateSaleInputSchema = z.object({
	orgId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para ID da organização.",
	}),
	clientId: z.string({
		required_error: "ID do cliente não informado.",
		invalid_type_error: "Tipo não válido para ID do cliente.",
	}),
	saleValue: z
		.number({
			required_error: "Valor total não informado.",
			invalid_type_error: "Tipo não válido para valor total.",
		})
		.positive("Valor total deve ser positivo."),
	cashbackApplied: z.boolean().default(false),
	cashbackAppliedAmount: z.number().nonnegative().default(0),
	password: z
		.string({
			required_error: "Senha do operador não informada.",
			invalid_type_error: "Tipo não válido para senha do operador.",
		})
		.length(4, "Senha deve ter 4 dígitos."),
});
export type TCreateSaleInput = z.infer<typeof CreateSaleInputSchema>;
export type TCreateSaleOutput = {
	data: {
		saleId: string;
		cashbackAcumulado: number;
		newBalance: number;
	};
	message: string;
};

const createSaleRoute: PagesRouteHandler<TCreateSaleOutput> = async (req, res) => {
	const input = CreateSaleInputSchema.parse(req.body);

	const result = await db.transaction(async (tx) => {
		// 1. Validate operator password
		const org = await tx.query.organizations.findFirst({
			where: eq(organizations.id, input.orgId),
			columns: { cnpj: true },
		});

		if (!org) {
			throw new createHttpError.NotFound("Organização não encontrada.");
		}

		const cnpjFirst4Digits = org.cnpj.replace(/\D/g, "").substring(0, 4);
		if (input.password !== cnpjFirst4Digits) {
			throw new createHttpError.Unauthorized("Senha inválida.");
		}

		// 2. Get cashback program
		const program = await tx.query.cashbackPrograms.findFirst({
			where: eq(cashbackPrograms.organizacaoId, input.orgId),
		});

		if (!program) {
			throw new createHttpError.NotFound("Programa de cashback não encontrado.");
		}

		if (!program.ativo && input.cashbackApplied && input.cashbackAppliedAmount > 0) {
			throw new createHttpError.BadRequest("Programa de cashback inativo. Resgates não estão disponíveis.");
		}

		// 2.1. Query campaigns for cashback accumulation trigger
		const campaignsForCashbackAccumulation = await tx.query.campaigns.findMany({
			where: (fields, { and, eq }) => and(eq(fields.organizacaoId, input.orgId), eq(fields.ativo, true), eq(fields.gatilhoTipo, "CASHBACK-ACUMULADO")),
			with: {
				segmentacoes: true,
				whatsappTemplate: true,
				whatsappConexaoTelefone: {
					columns: {
						id: true,
					},
					with: {
						conexao: { columns: { token: true, gatewaySessaoId: true } },
					},
				},
			},
		});
		const audiencesByCampaignId = await resolveCampaignAudiencesByCampaignId({
			executor: tx,
			organizationId: input.orgId,
			campaigns: campaignsForCashbackAccumulation,
		});

		// 3. If using cashback: validate balance and create redemption
		let redemptionSnapshot: {
			previousBalance: number;
			newBalance: number;
			consumedFromAccumulations: Array<{
				accumulationTransactionId: string;
				consumedValue: number;
			}>;
		} | null = null;
		if (input.cashbackApplied && input.cashbackAppliedAmount > 0) {
			const redemptionResult = await applyCashbackRedemptionFIFO({
				tx,
				orgId: input.orgId,
				clientId: input.clientId,
				programId: program.id,
				redemptionValue: input.cashbackAppliedAmount,
			});

			redemptionSnapshot = {
				previousBalance: redemptionResult.previousBalance,
				newBalance: redemptionResult.newBalance,
				consumedFromAccumulations: redemptionResult.consumedFromAccumulations,
			};
		}

		// 4. Create sale record
		const valorFinalVenda = input.saleValue - input.cashbackAppliedAmount;
		const saleDate = new Date();
		const insertedSaleResponse = await tx
			.insert(sales)
			.values({
				organizacaoId: input.orgId,
				clienteId: input.clientId,
				idExterno: `POI-${Date.now()}-${Math.random().toString(36).substring(7)}`,
				valorTotal: valorFinalVenda,
				custoTotal: 0,
				vendedorNome: "PONTO DE INTERAÇÃO",
				vendedorId: null,
				parceiro: "N/A",
				parceiroId: null,
				chave: "N/A",
				documento: "N/A",
				modelo: "DV",
				movimento: "RECEITAS",
				natureza: "SN01",
				serie: "0",
				situacao: "00",
				tipo: "Venda de produtos",
				processamentoOrigem: "INTERNO",
				dataVenda: saleDate,
			})
			.returning({ id: sales.id });

		const saleId = insertedSaleResponse[0]?.id;
		if (!saleId) {
			throw new createHttpError.InternalServerError("Erro ao criar venda.");
		}

		// 5. If cashback was used, create the redemption transaction linked to this sale
		if (input.cashbackApplied && input.cashbackAppliedAmount > 0) {
			if (!redemptionSnapshot) {
				throw new createHttpError.InternalServerError("Erro ao obter snapshot de resgate.");
			}
			await tx.insert(cashbackProgramTransactions).values({
				organizacaoId: input.orgId,
				clienteId: input.clientId,
				vendaId: saleId,
				programaId: program.id,
				tipo: "RESGATE",
				status: "ATIVO",
				valor: -input.cashbackAppliedAmount,
				valorRestante: 0,
				saldoValorAnterior: redemptionSnapshot.previousBalance,
				saldoValorPosterior: redemptionSnapshot.newBalance,
				expiracaoData: null,
				metadados: {
					consumoFifo: redemptionSnapshot.consumedFromAccumulations,
				},
			});
		}

		// 6. Calculate and accumulate new cashback based on ORIGINAL sale value (before cashback discount)
		let accumulatedBalance = 0;
		const balance = await tx.query.cashbackProgramBalances.findFirst({
			where: and(eq(cashbackProgramBalances.clienteId, input.clientId), eq(cashbackProgramBalances.organizacaoId, input.orgId)),
		});

		if (!balance && program.ativo) {
			throw new createHttpError.NotFound("Saldo de cashback não encontrado.");
		}

		if (!program.ativo) {
			accumulatedBalance = 0;
		} else if (program.acumuloTipo === "FIXO") {
			if (input.saleValue >= program.acumuloRegraValorMinimo) {
				accumulatedBalance = program.acumuloValor;
			}
		} else if (program.acumuloTipo === "PERCENTUAL") {
			if (input.saleValue >= program.acumuloRegraValorMinimo) {
				accumulatedBalance = (input.saleValue * program.acumuloValor) / 100;
			}
		}

		const previousOverallAvailableBalance = balance?.saldoValorDisponivel ?? 0;
		const previousOverallAccumulatedBalance = balance?.saldoValorAcumuladoTotal ?? 0;
		const newOverallAvailableBalance = previousOverallAvailableBalance + accumulatedBalance;
		const newOverallAccumulatedBalance = previousOverallAccumulatedBalance + accumulatedBalance;

		// Collect data for immediate processing
		const immediateProcessingDataList: ImmediateProcessingData[] = [];

		if (accumulatedBalance > 0 && balance) {
			// Update balance (credit)
			await tx
				.update(cashbackProgramBalances)
				.set({
					saldoValorDisponivel: newOverallAvailableBalance,
					saldoValorAcumuladoTotal: newOverallAccumulatedBalance,
					dataAtualizacao: new Date(),
				})
				.where(eq(cashbackProgramBalances.id, balance.id));

			// Create accumulation transaction
			await tx.insert(cashbackProgramTransactions).values({
				organizacaoId: input.orgId,
				clienteId: input.clientId,
				vendaId: saleId,
				programaId: program.id,
				tipo: "ACÚMULO",
				status: "ATIVO",
				valor: accumulatedBalance,
				valorRestante: accumulatedBalance,
				saldoValorAnterior: previousOverallAvailableBalance,
				saldoValorPosterior: newOverallAvailableBalance,
				expiracaoData: dayjs().add(program.expiracaoRegraValidadeValor, "day").toDate(),
				dataInsercao: saleDate,
			});

			// 6.1. Check for applicable cashback accumulation campaigns
			if (campaignsForCashbackAccumulation.length > 0) {
				const applicableCampaigns = campaignsForCashbackAccumulation.filter((campaign) => {
					if (!campaignAudienceHasClient(audiencesByCampaignId, campaign.id, input.clientId)) return false;

					// Check if the new accumulated cashback meets the minimum threshold (if defined)
					const meetsNewCashbackThreshold =
						campaign.gatilhoNovoCashbackAcumuladoValorMinimo === null ||
						campaign.gatilhoNovoCashbackAcumuladoValorMinimo === undefined ||
						accumulatedBalance >= campaign.gatilhoNovoCashbackAcumuladoValorMinimo;

					// Check if the total accumulated cashback meets the minimum threshold (if defined)
					const meetsTotalCashbackThreshold =
						campaign.gatilhoTotalCashbackAcumuladoValorMinimo === null ||
						campaign.gatilhoTotalCashbackAcumuladoValorMinimo === undefined ||
						newOverallAvailableBalance >= campaign.gatilhoTotalCashbackAcumuladoValorMinimo;

					// Both conditions must be met (if defined)
					return meetsNewCashbackThreshold && meetsTotalCashbackThreshold;
				});

				if (applicableCampaigns.length > 0) {
					console.log(
						`[ORG: ${input.orgId}] ${applicableCampaigns.length} campanhas de cashback acumulado aplicáveis encontradas para o cliente ${input.clientId}.`,
					);
				}

				// Query client data for immediate processing
				const clientData = await tx.query.clients.findFirst({
					where: (fields, { eq }) => eq(fields.id, input.clientId),
					columns: {
						id: true,
						nome: true,
						telefone: true,
						email: true,
						analiseRFMTitulo: true,
						metadataProdutoMaisCompradoId: true,
						metadataGrupoProdutoMaisComprado: true,
						metadataProdutoSugeridoId: true,
					},
				});

				for (const campaign of applicableCampaigns) {
					// Validate campaign frequency before scheduling
					const canSchedule = await canScheduleCampaignForClient(
						tx,
						input.clientId,
						campaign.id,
						campaign.permitirRecorrencia,
						campaign.frequenciaIntervaloValor,
						campaign.frequenciaIntervaloMedida,
					);

					if (!canSchedule) {
						console.log(
							`[ORG: ${input.orgId}] [CAMPAIGN_FREQUENCY] Skipping campaign ${campaign.titulo} for client ${input.clientId} due to frequency limits.`,
						);
						continue;
					}

					const interactionScheduleDate = getPostponedDateFromReferenceDate({
						date: dayjs().toDate(),
						unit: campaign.execucaoAgendadaMedida,
						value: campaign.execucaoAgendadaValor,
					});

					const interactionContextMetadados = {
						terminologia: program.terminologia,
						cashbackAcumuladoValor: accumulatedBalance,
						whatsappMensagemId: null,
						whatsappTemplateId: null,
						compraValor: input.saleValue,
						compraCashbackAcumulado: accumulatedBalance,
						compraCashbackNovoSaldo: newOverallAvailableBalance,
						compraVendedorNome: "PONTO DE INTERAÇÃO",
						cashbackSaldoDisponivel: newOverallAvailableBalance,
						cashbackTotalAcumuladoVida: newOverallAccumulatedBalance,
						cashbackTotalResgatadoVida: balance.saldoValorResgatadoTotal,
					};

					const [insertedInteraction] = await tx
						.insert(interactions)
						.values({
							clienteId: input.clientId,
							campanhaId: campaign.id,
							organizacaoId: input.orgId,
							titulo: `Envio de mensagem automática via campanha ${campaign.titulo}`,
							tipo: "ENVIO-MENSAGEM",
							descricao: `Cliente acumulou R$ ${(accumulatedBalance / 100).toFixed(2)} em cashback. Total acumulado: R$ ${(newOverallAccumulatedBalance / 100).toFixed(2)}.`,
							agendamentoDataReferencia: dayjs(interactionScheduleDate).format("YYYY-MM-DD"),
							agendamentoBlocoReferencia: campaign.execucaoAgendadaBloco,
							metadados: interactionContextMetadados,
						})
						.returning({ id: interactions.id });

					// Check for immediate processing (execucaoAgendadaValor === 0)
					if (campaign.execucaoAgendadaValor === 0 && campaign.whatsappTemplate && clientData) {
						immediateProcessingDataList.push({
							interactionId: insertedInteraction.id,
							organizationId: input.orgId,
							client: {
								id: clientData.id,
								nome: clientData.nome,
								telefone: clientData.telefone,
								email: clientData.email,
								analiseRFMTitulo: clientData.analiseRFMTitulo,
								metadataProdutoMaisCompradoId: clientData.metadataProdutoMaisCompradoId,
								metadataGrupoProdutoMaisComprado: clientData.metadataGrupoProdutoMaisComprado,
								metadataProdutoSugeridoId: clientData.metadataProdutoSugeridoId,
							},
							campaign: {
								autorId: campaign.autorId,
								whatsappConexaoTelefoneId: campaign.whatsappConexaoTelefoneId,
								whatsappTemplate: campaign.whatsappTemplate,
							},
							whatsappToken: campaign.whatsappConexaoTelefone?.conexao?.token ?? undefined,
							whatsappSessionId: campaign.whatsappConexaoTelefone?.conexao?.gatewaySessaoId ?? undefined,
							contextMetadados: interactionContextMetadados,
						});
					}
				}
			}
		}

		// 7. Update client last purchase
		await tx
			.update(clients)
			.set({
				ultimaCompraData: saleDate,
				ultimaCompraId: saleId,
			})
			.where(eq(clients.id, input.clientId));

		return {
			saleId,
			cashbackAcumulado: accumulatedBalance,
			newBalance: newOverallAvailableBalance,
			immediateProcessingDataList,
		};
	});

	// Process interactions immediately after transaction (fire-and-forget)
	if (result.immediateProcessingDataList && result.immediateProcessingDataList.length > 0) {
		const weeklyLimitCache = createCampaignWeeklyLimitCache();
		if (result.immediateProcessingDataList.length === 1) {
			for (const processingData of result.immediateProcessingDataList) {
				processSingleInteractionImmediately({ ...processingData, weeklyLimitCache }).catch((err) =>
					console.error(`[IMMEDIATE_PROCESS] Failed to process interaction ${processingData.interactionId}:`, err),
				);
			}
		} else {
			processOrganizationInteractionsBatch({
				organizationId: input.orgId,
				interactions: result.immediateProcessingDataList,
				weeklyLimitCache,
			}).then((processingSummary) => {
				if (processingSummary.failed > 0 || processingSummary.blocked > 0) {
					for (const failedResult of processingSummary.results.filter((itemResult) => !itemResult.success)) {
						console.error(`[IMMEDIATE_PROCESS] Failed to process interaction ${failedResult.interactionId}:`, failedResult.error);
					}
				}
			});
		}
	}

	return res.status(201).json({
		data: {
			saleId: result.saleId,
			cashbackAcumulado: result.cashbackAcumulado,
			newBalance: result.newBalance,
		},
		message: "Venda criada com sucesso.",
	});
};

const DeleteSaleInputSchema = z.object({
	id: z.string({ required_error: "ID da venda não informado." }),
});
export type TDeleteSaleInput = z.infer<typeof DeleteSaleInputSchema>;
export type TDeleteSaleOutput = {
	data: {
		deletedSaleId: string;
		cashbackReversal: Awaited<ReturnType<typeof reverseSaleCashback>> | null;
	};
	message: string;
};

async function recalculateClientPurchaseMetadata({ tx, orgId, clientId }: { tx: DBTransaction; orgId: string; clientId: string }) {
	const validSalesWhere = getValidClientSaleWhere({ orgId, clientId });
	const [stats] = await tx
		.select({
			totalCompras: count(sales.id),
			valorTotalCompras: sql<number>`COALESCE(SUM(${sales.valorTotal}), 0)`,
		})
		.from(sales)
		.where(validSalesWhere);
	const firstSale = await tx.query.sales.findFirst({
		where: validSalesWhere,
		columns: { id: true, dataVenda: true },
		orderBy: (fields) => [asc(fields.dataVenda), asc(fields.id)],
	});
	const lastSale = await tx.query.sales.findFirst({
		where: validSalesWhere,
		columns: { id: true, dataVenda: true },
		orderBy: (fields) => [desc(fields.dataVenda), desc(fields.id)],
	});

	await tx
		.update(clients)
		.set({
			primeiraCompraId: firstSale?.id ?? null,
			primeiraCompraData: firstSale?.dataVenda ?? null,
			ultimaCompraId: lastSale?.id ?? null,
			ultimaCompraData: lastSale?.dataVenda ?? null,
			metadataTotalCompras: Number(stats?.totalCompras ?? 0),
			metadataValorTotalCompras: Number(stats?.valorTotalCompras ?? 0),
		})
		.where(and(eq(clients.id, clientId), eq(clients.organizacaoId, orgId)));
}

const deleteSaleRoute: PagesRouteHandler<TDeleteSaleOutput> = async (req, res) => {
	const input = DeleteSaleInputSchema.parse(req.query);
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	const orgId = sessionUser.membership?.organizacao.id;
	if (!orgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	if (!sessionUser.membership?.permissoes.vendas.excluir) throw new createHttpError.Forbidden("Você não possui permissão para excluir vendas.");

	const result = await db.transaction(async (tx) => {
		const sale = await tx.query.sales.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, input.id), eq(fields.organizacaoId, orgId)),
			with: {
				documentosFiscais: { columns: { id: true } },
				lancamentosContabeis: { columns: { id: true } },
				movimentacoesEstoque: { columns: { id: true } },
				itens: {
					columns: {
						id: true,
						quantidadeReservada: true,
						quantidadeSeparada: true,
						quantidadeEntregue: true,
						quantidadeCancelada: true,
					},
				},
			},
		});

		if (!sale) throw new createHttpError.NotFound("Venda não encontrada.");
		if (sale.processamentoOrigem !== "INTERNO") {
			throw new createHttpError.BadRequest("Somente vendas de origem interna podem ser excluídas.");
		}
		if (sale.statusVenda === "CONFIRMADA") {
			throw new createHttpError.BadRequest("Vendas confirmadas devem ser canceladas pelo fluxo de cancelamento, não excluídas.");
		}
		if (sale.documentosFiscais.length > 0) {
			throw new createHttpError.BadRequest("Não é possível excluir venda com documento fiscal vinculado.");
		}
		if (sale.lancamentosContabeis.length > 0) {
			throw new createHttpError.BadRequest("Não é possível excluir venda com lançamento contábil vinculado.");
		}
		if (sale.movimentacoesEstoque.length > 0) {
			throw new createHttpError.BadRequest("Não é possível excluir venda com movimentação de estoque vinculada.");
		}
		const hasOperationalItemProgress = sale.itens.some(
			(item) => item.quantidadeReservada > 0 || item.quantidadeSeparada > 0 || item.quantidadeEntregue > 0 || item.quantidadeCancelada > 0,
		);
		if (hasOperationalItemProgress) {
			throw new createHttpError.BadRequest("Não é possível excluir venda com itens em atendimento.");
		}

		const cashbackReversal = sale.clienteId
			? await reverseSaleCashback({
					tx,
					saleId: sale.id,
					clientId: sale.clienteId,
					organizationId: orgId,
					reason: "VENDA_EXCLUIDA",
					mode: "delete",
				})
			: null;
		console.log("[INFO] Cashback effects on sale deletion:", cashbackReversal);

		console.log("[INFO] Deleting sale:", sale.id);
		const deletedSale = await tx
			.delete(sales)
			.where(and(eq(sales.id, sale.id), eq(sales.organizacaoId, orgId)))
			.returning({ id: sales.id });
		if (!deletedSale[0]) throw new createHttpError.InternalServerError("Erro ao excluir venda.");
		console.log("[INFO] Sale deleted:", deletedSale[0].id);
		try {
			if (sale.clienteId) {
				console.log("[INFO] Recalculating client purchase metadata:", sale.clienteId);
				await recalculateClientPurchaseMetadata({ tx, orgId, clientId: sale.clienteId });
			}
		} catch (error) {
			console.error("[ERROR] Error recalculating client purchase metadata:", error);
		}

		return {
			deletedSaleId: deletedSale[0].id,
			cashbackReversal,
		};
	});

	return res.status(200).json({
		data: result,
		message: "Venda excluída com sucesso.",
	});
};

const routeHandlers = {
	GET: getSalesRoute,
	POST: createSaleRoute,
	DELETE: deleteSaleRoute,
} satisfies Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", PagesRouteHandler<any>>>;

export const GET = appApiHandler({
	GET: (request) => runPagesRouteHandler({ request, handler: routeHandlers.GET! }),
});
export const POST = appApiHandler({
	POST: (request) => runPagesRouteHandler({ request, handler: routeHandlers.POST! }),
});
export const DELETE = appApiHandler({
	DELETE: (request) => runPagesRouteHandler({ request, handler: routeHandlers.DELETE! }),
});
