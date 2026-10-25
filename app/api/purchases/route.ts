import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { TAuthUserSession } from "@/lib/authentication/types";
import { handleSimpleChildRowsProcessing } from "@/lib/db-utils";
import { getAccountingEntryBalanceError } from "@/lib/finances/accounting-entry-balance";
import { buildDefaultAccountingEntryLines, buildPurchaseAccountingEntryLines, syncAccountingEntryLines } from "@/lib/finances/accounting-entry-lines";
import { normalizeFinancialTransactionValue } from "@/lib/finances/financial-transaction-value";
import { calculatePurchaseItemCost, centsToMoney, moneyToCents } from "@/lib/purchase/costing";
import {
	handlePurchaseItemStockProcessing,
	normalizePurchaseItemCostValues,
	type TPurchaseItemInput,
	type TPurchaseItemStockOperation,
} from "@/lib/purchase-processing/process-purchase-item-stock";
import { upsertSupplierProductMappings } from "@/lib/purchase/supplier-product-mappings";
import { ACQUISITION_NATURE_LABELS, SUPPORTED_PURCHASE_DESTINATIONS } from "@/lib/purchase/entry-rules";
import { removePurchaseTaxObligationEntry, syncPurchaseTaxObligationEntry } from "@/lib/purchase/tax-obligation-entry";
import { removePurchaseCarrierEntries, syncPurchaseCarrierEntries } from "@/lib/purchase/carrier-entry";
import { resolvePurchaseAccountingAccountIds, resolvePurchaseDestinationAccountIds } from "@/lib/purchase/accounting-accounts";
import { getItemCiapCreditCents } from "@/lib/fixed-assets/from-purchase";
import { resolveFixedAssetAccounts } from "@/lib/fixed-assets/accounts";
import { getModifierCounterparty } from "@/lib/purchase/costing";
import type { TAcquisitionNatureEnum } from "@/schemas/enums";
import {
	assertLinkedInboundDocumentsReceivable,
	confirmInboundDocumentsOnReceive,
	linkInboundDocumentsToPurchase,
	unlinkInboundDocumentsFromPurchase,
} from "@/lib/fiscal/inbound";
import { createSimplifiedSearchCondition } from "@/lib/search";
import { PurchaseStatusEnum, TPurchaseStatusEnum } from "@/schemas/enums";
import { AccountingEntrySchema, FinancialTransactionSchema } from "@/schemas/financial";
import { ProductSchema } from "@/schemas/products";
import { SupplierProductMappingSchema, SupplierSchema } from "@/schemas/suppliers";
import {
	PurchaseImportedDocumentSchema,
	PurchaseItemSchema,
	PurchaseSchema,
	refinePurchaseStatusAndDeliveryDate,
	type TPurchaseImportedDocument,
} from "@/schemas/purchases";
import { db, type DBTransaction } from "@/services/drizzle";
import {
	accountingEntries,
	financialTransactions,
	organizations,
	products,
	productStockLots,
	purchases,
	supplierProductMappings,
	suppliers,
} from "@/services/drizzle/schema";
import { and, count, eq, inArray, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import createHttpError from "http-errors";
import { NextResponse, type NextRequest } from "next/server";
import z from "zod";

const GetPurchasesInputSchema = z.object({
	id: z
		.string({
			required_error: "ID da compra não informado.",
			invalid_type_error: "Tipo não válido para ID da compra.",
		})
		.optional()
		.nullable(),
	page: z
		.string({
			required_error: "Página não informada.",
			invalid_type_error: "Tipo não válido para página.",
		})
		.optional()
		.nullable()
		.default("1")
		.transform((val) => Number(val))
		.refine((val) => val > 0, {
			message: "Página deve ser maior que 0.",
			path: ["page"],
		}),
	search: z
		.string({
			required_error: "Busca não informada.",
			invalid_type_error: "Tipo não válido para busca.",
		})
		.optional()
		.nullable(),
	status: z
		.string({
			invalid_type_error: "Tipo não válido para status da compra.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? val.split(",") : []))
		.refine((val) => (val.length > 0 ? val.every((v) => PurchaseStatusEnum.safeParse(v).success) : true), {
			message: "Status inválido.",
			path: ["status"],
		}),
});
export type TGetPurchasesInput = z.infer<typeof GetPurchasesInputSchema>;

export type TGetPurchasesByIdInput = Pick<TGetPurchasesInput, "id">;
export type TGetPurchasesDefaultInput = Omit<TGetPurchasesInput, "id">;

async function getPurchases({ input, session }: { input: TGetPurchasesInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	// Checking user permissions
	if (!session.membership?.permissoes.compras.visualizar)
		throw new createHttpError.Unauthorized("Você não possui permissão para acessar esse recurso.");

	if ("id" in input && input.id) {
		const purchaseId = input.id;
		if (typeof purchaseId !== "string") throw new createHttpError.BadRequest("ID da compra inválido.");

		const purchase = await db.query.purchases.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, purchaseId), eq(fields.organizacaoId, userOrgId)),
			with: {
				fornecedor: {
					columns: {
						id: true,
						nome: true,
						cpfCnpj: true,
					},
				},
				itens: {
					with: {
						produto: {
							columns: {
								id: true,
								nome: true,
								codigo: true,
								imagemCapaUrl: true,
								unidade: true,
							},
						},
						lotes: {
							columns: {
								id: true,
								codigoLote: true,
								quantidadeInicial: true,
								quantidadeAtual: true,
								dataValidade: true,
								status: true,
							},
						},
					},
				},
				autor: {
					columns: {
						id: true,
						nome: true,
						avatarUrl: true,
					},
				},
				notasRecebidas: {
					columns: { id: true, chaveAcesso: true, situacao: true, manifestacaoAtual: true, completo: true, emitenteNome: true },
				},
				// Lançamentos de terceiros desta compra: fisco (DIFAL, antecipação) e transportadora (CT-e),
				// fora do valor do fornecedor.
				lancamentosTributos: {
					where: (fields, { eq, like, or }) =>
						or(
							eq(fields.origemTipo, "TRIBUTO_COMPRA"),
							like(fields.chaveIdempotencia, `compra:${purchaseId}:TRANSPORTADORA:%`),
							like(fields.chaveIdempotencia, `compra:${purchaseId}:DEVOLUCAO:%`),
						),
					columns: { id: true, titulo: true, valor: true, dataCompetencia: true },
					with: { transacoesFinanceiras: { columns: { id: true, titulo: true, valor: true, dataPrevisao: true, dataEfetivacao: true } } },
				},
				lancamentoContabil: {
					columns: {
						id: true,
						titulo: true,
						anotacoes: true,
						valor: true,
						valorPrevisto: true,
						dataCompetencia: true,
						origemTipo: true,
					},
					with: {
						transacoesFinanceiras: {
							orderBy: (fields, { asc }) => asc(fields.dataPrevisao),
							with: {
								contaFinanceira: {
									columns: {
										id: true,
										nome: true,
									},
								},
							},
						},
					},
				},
			},
		});
		if (!purchase) throw new createHttpError.NotFound("Compra não encontrada.");

		// De-paras do fornecedor que apontam para produtos desta compra. Os vínculos não guardam a compra
		// que os criou, então isto mostra os que valem para os itens, não "os aprendidos aqui".
		const purchaseProductIds = [...new Set(purchase.itens.map((item) => item.produtoId))];
		const vinculosFornecedor =
			purchase.fornecedorId && purchaseProductIds.length > 0
				? await db
						.select({
							id: supplierProductMappings.id,
							codigoFornecedor: supplierProductMappings.codigoFornecedor,
							ean: supplierProductMappings.ean,
							produtoId: supplierProductMappings.produtoId,
							produtoNome: products.nome,
							produtoUnidade: products.unidade,
							unidadeExterna: supplierProductMappings.unidadeExterna,
							fatorConversao: supplierProductMappings.fatorConversao,
						})
						.from(supplierProductMappings)
						.innerJoin(products, eq(products.id, supplierProductMappings.produtoId))
						.where(
							and(
								eq(supplierProductMappings.organizacaoId, userOrgId),
								eq(supplierProductMappings.fornecedorId, purchase.fornecedorId),
								inArray(supplierProductMappings.produtoId, purchaseProductIds),
							),
						)
				: [];

		return {
			data: {
				default: null,
				byId: { ...purchase, vinculosFornecedor },
			},
		};
	}

	const { page, search, status } = input;

	const conditions = [];

	conditions.push(eq(purchases.organizacaoId, userOrgId));
	if (search && search.trim().length > 0) {
		conditions.push(
			or(
				createSimplifiedSearchCondition(purchases.titulo, search),
				createSimplifiedSearchCondition(purchases.idExterno, search),
				createSimplifiedSearchCondition(purchases.pedidoFornecedorNome, search),
				createSimplifiedSearchCondition(purchases.transporteTransportadoraNome, search),
			),
		);
	}

	if (status && status.length > 0) {
		conditions.push(inArray(purchases.status, status as TPurchaseStatusEnum[]));
	}
	const PAGE_SIZE = 25;
	const skip = PAGE_SIZE * (page - 1);
	const limit = PAGE_SIZE;

	const purchasesMatchedResult = await db
		.select({ count: count() })
		.from(purchases)
		.where(and(...conditions));
	const purchasesMatched = purchasesMatchedResult[0]?.count ?? 0;

	const purchasesResult = await db.query.purchases.findMany({
		where: and(...conditions),
		with: {
			itens: {
				columns: {
					id: true,
					snapshotProdutoDescricao: true,
					quantidade: true,
				},
			},
			autor: {
				columns: {
					id: true,
					nome: true,
					avatarUrl: true,
				},
			},
		},
		orderBy: (fields, { desc }) => desc(fields.dataInsercao),
		limit,
		offset: skip,
	});

	const totalPages = Math.ceil(purchasesMatched / PAGE_SIZE);

	return {
		data: {
			default: {
				purchases: purchasesResult,
				purchasesMatched,
				totalPages,
			},
			byId: null,
		},
	};
}

export type TGetPurchasesOutput = Awaited<ReturnType<typeof getPurchases>>;
export type TGetPurchasesOutputDefault = Exclude<TGetPurchasesOutput["data"]["default"], null>;
export type TGetPurchasesOutputById = Exclude<TGetPurchasesOutput["data"]["byId"], null>;

async function getPurchasesRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const searchParams = request.nextUrl.searchParams;

	const input = GetPurchasesInputSchema.parse({
		id: searchParams.get("id") ?? undefined,
		page: searchParams.get("page") ?? undefined,
		search: searchParams.get("search") ?? undefined,
		status: searchParams.get("status") ?? undefined,
	});
	const result = await getPurchases({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({
	GET: getPurchasesRoute,
});

// `documentosImportados` fica fora do cabeçalho e entra por `importedDocuments`, sem caminho de
// arquivo: o snapshot descreve o documento, mas quem localiza o objeto é o servidor.
const PurchaseHeaderInputSchema = PurchaseSchema.omit({
	documentosImportados: true,
	devolucoes: true,
	organizacaoId: true,
	autorId: true,
	dataInsercao: true,
	dataEfetivacao: true,
	dataUltimaAtualizacao: true,
}).superRefine(refinePurchaseStatusAndDeliveryDate);

// Transações financeiras que quitam o lançamento contábil da compra. Organização, lançamento e autor são
// derivados no servidor a partir da própria compra.
const PurchaseAccountingEntryTransactionInputSchema = FinancialTransactionSchema.omit({
	organizacaoId: true,
	lancamentoContabilId: true,
	autorId: true,
	dataInsercao: true,
});
// Contas de débito/crédito, origem e autor são resolvidos no servidor a partir dos padrões da organização.
const PurchaseAccountingEntryFieldsSchema = AccountingEntrySchema.omit({
	organizacaoId: true,
	vendaId: true,
	loteId: true,
	origemTipo: true,
	idContaDebito: true,
	idContaCredito: true,
	autorId: true,
	dataInsercao: true,
});

const CreatePurchaseInputSchema = z.object({
	purchase: PurchaseHeaderInputSchema,
	importedDocuments: z.array(PurchaseImportedDocumentSchema).optional(),
	purchaseItems: z.array(PurchaseItemSchema.omit({ organizacaoId: true, compraId: true, dataInsercao: true })),
	lancamentoContabil: PurchaseAccountingEntryFieldsSchema.extend({
		transacoes: z.array(PurchaseAccountingEntryTransactionInputSchema),
	}),
	// Registered together with the purchase, in the same transaction, so abandoning a purchase never
	// leaves an orphan supplier, product or de-para behind.
	// A new supplier replaces `purchase.fornecedorId`; an existing one with the same CNPJ is reused.
	newSupplier: SupplierSchema.pick({ nome: true, cpfCnpj: true, inscricaoEstadual: true, telefone: true, email: true }).optional().nullable(),
	// The client generates each new product's id and uses it as `produtoId` in `purchaseItems`.
	newProducts: z
		.array(
			ProductSchema.pick({
				nome: true,
				codigo: true,
				codigoBarras: true,
				unidade: true,
				ncm: true,
				vendavel: true,
				rastreamentoEstoqueAtivo: true,
				natureza: true,
				precoCusto: true,
			}).extend({
				id: z
					.string({ required_error: "ID do novo produto não informado.", invalid_type_error: "Tipo não válido para o ID do novo produto." })
					.uuid("ID do novo produto inválido."),
			}),
		)
		.optional(),
	// De-paras of the purchase's supplier to remember for its next invoices.
	supplierProductMappings: z
		.array(
			SupplierProductMappingSchema.pick({
				codigoFornecedor: true,
				ean: true,
				produtoId: true,
				produtoVarianteId: true,
				unidadeExterna: true,
				fatorConversao: true,
				destinacao: true,
			}),
		)
		.optional(),
});
export type TCreatePurchaseInput = z.infer<typeof CreatePurchaseInputSchema>;

function assertAccountingEntryIsBalanced({
	entryValue,
	transactions,
}: {
	entryValue: number;
	transactions: { valor: number; deletar?: boolean | null }[];
}) {
	const balanceError = getAccountingEntryBalanceError({ entryValue, transactions });
	if (balanceError) throw new createHttpError.BadRequest(balanceError);
}

function normalizePurchaseFinancialTransaction<T extends { valor: number }>(transaction: T) {
	try {
		return { ...transaction, ...normalizeFinancialTransactionValue(transaction) };
	} catch (error) {
		throw new createHttpError.BadRequest(error instanceof Error ? error.message : "Modificadores monetários inválidos.");
	}
}

// Itens marcados para remoção não passam pelo cálculo: eles vão sair, e uma linha inválida (quantidade
// zerada, por exemplo) não pode impedir justamente a operação que a remove.
function normalizePurchaseItems<T extends TPurchaseItemInput>(items: T[]): T[] {
	for (const item of items) {
		if (item.deletar || !item.destinacao) continue;
		if (!SUPPORTED_PURCHASE_DESTINATIONS.includes(item.destinacao))
			throw new createHttpError.BadRequest(
				`Destinação "${ACQUISITION_NATURE_LABELS[item.destinacao]}" ainda não é suportada no recebimento de compras (chega com o módulo de patrimônio).`,
			);
	}
	try {
		return items.map((item) => (item.deletar ? item : normalizePurchaseItemCostValues(item)));
	} catch (error) {
		throw new createHttpError.BadRequest(error instanceof Error ? error.message : "Composição de custo da compra inválida.");
	}
}

function getImportedFiscalDocumentIds(documents: TPurchaseImportedDocument[] | undefined) {
	return (documents ?? []).map((document) => document.documentoFiscalId).filter((id): id is string => !!id);
}

function buildPurchaseImportedDocumentsSnapshot(documents: TPurchaseImportedDocument[] | undefined) {
	return { versao: 1 as const, documentos: documents ?? [] };
}

function assertPurchaseEntryMatchesItems({ entryValue, items }: { entryValue: number; items: TPurchaseItemInput[] }) {
	const itemsTotalCents = items.filter((item) => !item.deletar).reduce((total, item) => total + moneyToCents(item.valorTotalLiquido ?? 0), 0);
	if (itemsTotalCents !== moneyToCents(entryValue)) {
		throw new createHttpError.BadRequest("O valor do lançamento contábil precisa corresponder ao valor financeiro dos itens da compra.");
	}
}

/**
 * Depois do recebimento, o valor efetivo é um fato: ele bate com os itens congelados e com as linhas
 * contábeis já gravadas. Reprogramar pagamento continua livre; mudar quanto se deve, não — para isso
 * a compra é cancelada e refeita.
 */
async function assertReceivedPurchaseEntryValueUnchanged({
	tx,
	orgId,
	accountingEntryId,
	payloadValue,
}: {
	tx: DBTransaction;
	orgId: string;
	accountingEntryId: string | null;
	payloadValue: number;
}) {
	if (!accountingEntryId) return;
	const previousEntry = await tx.query.accountingEntries.findFirst({
		where: and(eq(accountingEntries.id, accountingEntryId), eq(accountingEntries.organizacaoId, orgId)),
		columns: { valor: true },
	});
	if (!previousEntry) return;
	if (moneyToCents(previousEntry.valor) !== moneyToCents(payloadValue))
		throw new createHttpError.BadRequest("O valor efetivo de uma compra recebida não pode ser alterado. Cancele a compra para corrigir.");
}

function getPurchaseAccountingAmounts(items: TPurchaseItemInput[]) {
	let financialCents = 0;
	let inventoryCents = 0;
	let taxCreditCents = 0;
	let ciapCreditCents = 0;
	let periodExpenseCents = 0;
	const inventoryCentsByDestination: Partial<Record<TAcquisitionNatureEnum, number>> = {};
	for (const item of items) {
		if (item.deletar) continue;
		const result = calculatePurchaseItemCost(item);
		const destination = item.destinacao ?? "REVENDA";
		// O que é devido ao fisco (TRIBUTO_COMPRA) ou à transportadora (CT-e) tem lançamento próprio: sai
		// das linhas do fornecedor, senão a mesma parcela de custo seria debitada duas vezes.
		let fiscoInventoryCents = 0;
		let fiscoCreditCents = 0;
		let fiscoExpenseCents = 0;
		for (const modifier of item.modificadoresCusto?.modificadores ?? []) {
			const counterparty = getModifierCounterparty(modifier);
			if (counterparty !== "FISCO" && counterparty !== "TRANSPORTADORA") continue;
			if (modifier.tratamento === "CUSTO_ESTOQUE") fiscoInventoryCents += modifier.valorCentavos;
			else if (modifier.tratamento === "CREDITO_TRIBUTARIO") fiscoCreditCents += modifier.valorCentavos;
			else fiscoExpenseCents += modifier.valorCentavos;
		}
		const itemInventoryCents = moneyToCents(result.valorTotalCusto) - fiscoInventoryCents;
		financialCents += moneyToCents(result.valorTotalLiquido);
		inventoryCents += itemInventoryCents;
		inventoryCentsByDestination[destination] = (inventoryCentsByDestination[destination] ?? 0) + itemInventoryCents;
		const itemCreditCents = moneyToCents(result.valorTotalCreditoTributario) - fiscoCreditCents;
		taxCreditCents += itemCreditCents;
		// ICMS de bem do ativo é CIAP: entra na conta de controle e é apropriado 1/48 por mês (decisão 8).
		if (destination === "ATIVO_IMOBILIZADO") ciapCreditCents += Math.min(itemCreditCents, getItemCiapCreditCents(item));
		periodExpenseCents += moneyToCents(result.valorTotalDespesaPeriodo) - fiscoExpenseCents;
	}
	return {
		valorFinanceiro: centsToMoney(financialCents),
		valorCustoEstoque: centsToMoney(inventoryCents),
		custoPorDestinacao: Object.fromEntries(
			Object.entries(inventoryCentsByDestination).map(([destination, cents]) => [destination, centsToMoney(cents)]),
		),
		valorCreditoTributario: centsToMoney(taxCreditCents),
		valorCreditoCiap: centsToMoney(ciapCreditCents),
		valorDespesaPeriodo: centsToMoney(periodExpenseCents),
	};
}

/** Conta de controle do CIAP, provisionada do seed quando a organização ainda não a tem. */
async function resolveCiapControlAccountId({ trx, organizationId }: { trx: DBTransaction; organizationId: string }) {
	const accounts = await resolveFixedAssetAccounts({ trx, organizationId, autoProvisionFromSeed: true });
	return accounts.ciapControleContaId;
}

async function syncPurchaseAccountingLines({
	trx,
	organizationId,
	accountingEntryId,
	entryValue,
	expectedValue,
	debitAccountId,
	creditAccountId,
	items,
	purchaseIsReceived,
	taxObligation,
}: {
	trx: DBTransaction;
	organizationId: string;
	accountingEntryId: string;
	entryValue: number;
	expectedValue?: number | null;
	debitAccountId: string;
	creditAccountId: string;
	items: TPurchaseItemInput[];
	purchaseIsReceived: boolean;
	// Lançamentos de terceiros (ADR-0002, decisão 5): fisco (DIFAL/antecipação) e transportadora (CT-e).
	// Os derivados dos itens nascem com o recebimento e somem sem ele; o frete anexado depois do
	// recebimento vive em `documents` e independe dele.
	taxObligation: { purchaseId: string; userId: string; purchaseTitle: string; dataCompetencia: Date; documents?: TPurchaseImportedDocument[] | null };
}) {
	const organization = await trx.query.organizations.findFirst({
		where: eq(organizations.id, organizationId),
		columns: { configuracao: true },
	});
	if (!organization) throw new createHttpError.NotFound("Organização não encontrada.");
	const purchaseDefaults = organization.configuracao.defaults.contabilidade.lancamentosPadrao.compras;
	const contasPorDestinacao = await resolvePurchaseDestinationAccountIds({
		trx,
		organizationId,
		configured: purchaseDefaults?.contasDebitoPorDestinacao,
		needed: ["REVENDA", "INSUMO", "USO_CONSUMO", "ATIVO_IMOBILIZADO"],
	});
	const syncCarriers = () =>
		syncPurchaseCarrierEntries({
			trx,
			organizationId,
			userId: taxObligation.userId,
			purchaseId: taxObligation.purchaseId,
			purchaseTitle: taxObligation.purchaseTitle,
			items,
			documents: taxObligation.documents,
			purchaseIsReceived,
			dataCompetencia: taxObligation.dataCompetencia,
			accounts: {
				estoqueContaId: debitAccountId,
				fornecedoresContaId: creditAccountId,
				contasPorDestinacao,
				creditoTributarioContaId: purchaseDefaults?.debitoCreditoTributarioContaId ?? null,
				despesaPeriodoContaId: purchaseDefaults?.debitoDespesaPeriodoContaId ?? null,
			},
		});

	if (!purchaseIsReceived) {
		await syncAccountingEntryLines({
			trx,
			organizationId,
			accountingEntryId,
			entryValue,
			lines: buildDefaultAccountingEntryLines({ debitAccountId, creditAccountId, value: entryValue, expectedValue }),
		});
		await removePurchaseTaxObligationEntry({ trx, organizationId, purchaseId: taxObligation.purchaseId });
		await syncCarriers();
		return;
	}

	const amounts = getPurchaseAccountingAmounts(items);
	await syncAccountingEntryLines({
		trx,
		organizationId,
		accountingEntryId,
		entryValue,
		lines: buildPurchaseAccountingEntryLines({
			amounts,
			accounts: {
				estoqueContaId: debitAccountId,
				fornecedoresContaId: creditAccountId,
				creditoTributarioContaId: purchaseDefaults?.debitoCreditoTributarioContaId,
				ciapControleContaId: amounts.valorCreditoCiap ? await resolveCiapControlAccountId({ trx, organizationId }) : null,
				despesaPeriodoContaId: purchaseDefaults?.debitoDespesaPeriodoContaId,
				contasPorDestinacao,
			},
		}),
	});
	await syncPurchaseTaxObligationEntry({
		trx,
		organizationId,
		userId: taxObligation.userId,
		purchaseId: taxObligation.purchaseId,
		purchaseTitle: taxObligation.purchaseTitle,
		items,
		dataCompetencia: taxObligation.dataCompetencia,
		accounts: {
			estoqueContaId: debitAccountId,
			contasPorDestinacao,
			creditoTributarioContaId: purchaseDefaults?.debitoCreditoTributarioContaId ?? null,
			despesaPeriodoContaId: purchaseDefaults?.debitoDespesaPeriodoContaId ?? null,
		},
		defaults: purchaseDefaults,
	});
	await syncCarriers();
}

function isPurchaseConsideredReceived(purchase: { status: TPurchaseStatusEnum; entregaDataRecebimentoEfetivacao?: Date | null }) {
	return purchase.status === "RECEBIDA" && !!purchase.entregaDataRecebimentoEfetivacao;
}

async function createPurchase({ input, session }: { input: TCreatePurchaseInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	if (!session.membership?.permissoes.compras.criar) throw new createHttpError.Unauthorized("Você não possui permissão para acessar esse recurso.");

	const { purchase: payloadPurchase, purchaseItems: payloadPurchaseItems, lancamentoContabil: payloadAccountingEntry } = input;
	const { transacoes: payloadAccountingEntryTransactions, ...accountingEntryFields } = payloadAccountingEntry;
	const normalizedPurchaseItems = normalizePurchaseItems(payloadPurchaseItems);

	assertAccountingEntryIsBalanced({ entryValue: accountingEntryFields.valor, transactions: payloadAccountingEntryTransactions });
	if (isPurchaseConsideredReceived(payloadPurchase))
		assertPurchaseEntryMatchesItems({ entryValue: accountingEntryFields.valor, items: normalizedPurchaseItems });

	const newSupplier = input.newSupplier ?? null;
	const newProducts = input.newProducts ?? [];
	const supplierProductMappingsInput = input.supplierProductMappings ?? [];
	if (newSupplier && payloadPurchase.fornecedorId)
		throw new createHttpError.BadRequest("Informe um fornecedor existente ou um novo fornecedor, não os dois.");
	if (supplierProductMappingsInput.length > 0 && !newSupplier && !payloadPurchase.fornecedorId)
		throw new createHttpError.BadRequest("Para lembrar vínculos de produtos, a compra precisa de um fornecedor.");
	const newProductIds = new Set(newProducts.map((product) => product.id));
	if (newProductIds.size !== newProducts.length) throw new createHttpError.BadRequest("Há novos produtos repetidos na compra.");
	if (newProductIds.size > 0) {
		const usedProductIds = new Set(normalizedPurchaseItems.map((item) => item.produtoId));
		if ([...newProductIds].some((id) => !usedProductIds.has(id)))
			throw new createHttpError.BadRequest("Todo novo produto precisa estar em algum item da compra.");
	}

	return await db
		.transaction(async (tx) => {
			// Fornecedor e produtos novos nascem antes da compra: ela e seus itens os referenciam.
			const supplierId = newSupplier
				? await resolveOrCreatePurchaseSupplier({ trx: tx, organizationId: userOrgId, supplier: newSupplier })
				: (payloadPurchase.fornecedorId ?? null);
			if (newProducts.length > 0) await insertPurchaseNewProducts({ trx: tx, organizationId: userOrgId, newProducts });
			// Primeiro o lançamento contábil, já que a compra referencia ele
			const { debitAccountId, creditAccountId } = await resolvePurchaseAccountingAccountIds({ trx: tx, orgId: userOrgId });
			// O id da compra nasce aqui: o lançamento do fornecedor e o do fisco apontam para ela.
			const purchaseId = randomUUID();
			const insertedAccountingEntry = await tx
				.insert(accountingEntries)
				.values({
					...accountingEntryFields,
					organizacaoId: userOrgId,
					origemTipo: "COMPRA",
					fornecedorId: supplierId,
					idContaDebito: debitAccountId,
					idContaCredito: creditAccountId,
					autorId: session.user.id,
				})
				.returning({ id: accountingEntries.id });

			const insertedAccountingEntryId = insertedAccountingEntry[0]?.id;
			if (!insertedAccountingEntryId) throw new createHttpError.InternalServerError("Erro ao criar lançamento contábil da compra.");

			const insertedPurchase = await tx
				.insert(purchases)
				.values({
					...payloadPurchase,
					id: purchaseId,
					fornecedorId: supplierId,
					pedidoFornecedorNome: payloadPurchase.pedidoFornecedorNome ?? newSupplier?.nome ?? null,
					pedidoFornecedorCnpj: payloadPurchase.pedidoFornecedorCnpj ?? newSupplier?.cpfCnpj ?? null,
					pedidoFornecedorTelefone: payloadPurchase.pedidoFornecedorTelefone ?? newSupplier?.telefone ?? null,
					pedidoFornecedorEmail: payloadPurchase.pedidoFornecedorEmail ?? newSupplier?.email ?? null,
					documentosImportados: buildPurchaseImportedDocumentsSnapshot(input.importedDocuments),
					lancamentoContabilId: insertedAccountingEntryId,
					organizacaoId: userOrgId,
					autorId: session.user.id,
				})
				.returning({ id: purchases.id });

			const insertedPurchaseId = insertedPurchase[0]?.id;
			if (!insertedPurchaseId) throw new createHttpError.InternalServerError("Erro ao criar compra.");
			await tx.update(accountingEntries).set({ compraId: insertedPurchaseId }).where(eq(accountingEntries.id, insertedAccountingEntryId));
			await syncPurchaseAccountingLines({
				trx: tx,
				organizationId: userOrgId,
				accountingEntryId: insertedAccountingEntryId,
				entryValue: accountingEntryFields.valor,
				expectedValue: accountingEntryFields.valorPrevisto,
				debitAccountId,
				creditAccountId,
				items: normalizedPurchaseItems,
				purchaseIsReceived: isPurchaseConsideredReceived(payloadPurchase),
				taxObligation: {
					purchaseId: insertedPurchaseId,
					userId: session.user.id,
					purchaseTitle: payloadPurchase.titulo,
					dataCompetencia: accountingEntryFields.dataCompetencia,
					documents: input.importedDocuments,
				},
			});
			// A nota passa a pertencer a esta compra na mesma transação: nenhuma janela em que ela
			// apareça como "a lançar" com a compra já salva.
			if (isPurchaseConsideredReceived(payloadPurchase))
				await assertLinkedInboundDocumentsReceivable({
					trx: tx,
					organizationId: userOrgId,
					purchaseId: null,
					documentIds: getImportedFiscalDocumentIds(input.importedDocuments),
				});
			await linkInboundDocumentsToPurchase({
				trx: tx,
				organizationId: userOrgId,
				purchaseId: insertedPurchaseId,
				documentIds: getImportedFiscalDocumentIds(input.importedDocuments),
			});

			// Então as transações financeiras que quitam o lançamento
			if (payloadAccountingEntryTransactions.length > 0)
				await tx.insert(financialTransactions).values(
					payloadAccountingEntryTransactions.map((transaction) => ({
						...normalizePurchaseFinancialTransaction(transaction),
						lancamentoContabilId: insertedAccountingEntryId,
						organizacaoId: userOrgId,
						autorId: session.user.id,
					})),
				);

			const operation: TPurchaseItemStockOperation = isPurchaseConsideredReceived(payloadPurchase) ? "RECEIVING" : "UPDATING_UNRECEIVED";

			for (const item of normalizedPurchaseItems) {
				await handlePurchaseItemStockProcessing({
					trx: tx,
					organizationId: userOrgId,
					userId: session.user.id,
					purchaseId: insertedPurchaseId,
					operation,
					item,
				});
			}

			if (supplierId && supplierProductMappingsInput.length > 0)
				await upsertSupplierProductMappings({ trx: tx, organizationId: userOrgId, supplierId, mappings: supplierProductMappingsInput });

			return {
				data: { insertedPurchaseId },
				message: "Compra criada com sucesso.",
			};
		})
		.then(async (result) => {
			// Fora da transação e best-effort: a SEFAZ fora do ar não desfaz a compra.
			if (isPurchaseConsideredReceived(payloadPurchase))
				await confirmInboundDocumentsOnReceive({ organizationId: userOrgId, purchaseId: result.data.insertedPurchaseId });
			return result;
		});
}
export type TCreatePurchaseOutput = Awaited<ReturnType<typeof createPurchase>>;

/** Idempotent by CNPJ within the org, same as POST /api/suppliers: re-importing an invoice never duplicates the supplier. */
async function resolveOrCreatePurchaseSupplier({
	trx,
	organizationId,
	supplier,
}: {
	trx: DBTransaction;
	organizationId: string;
	supplier: NonNullable<TCreatePurchaseInput["newSupplier"]>;
}) {
	const cpfCnpj = (supplier.cpfCnpj ?? "").replace(/\D/g, "") || null;
	if (cpfCnpj) {
		const [existing] = await trx
			.select({ id: suppliers.id })
			.from(suppliers)
			.where(and(eq(suppliers.organizacaoId, organizationId), eq(suppliers.cpfCnpj, cpfCnpj)))
			.limit(1);
		if (existing) return existing.id;
	}
	const [inserted] = await trx
		.insert(suppliers)
		.values({
			organizacaoId: organizationId,
			nome: supplier.nome.trim(),
			cpfCnpj,
			inscricaoEstadual: supplier.inscricaoEstadual?.trim() || null,
			telefone: supplier.telefone?.trim() || null,
			email: supplier.email?.trim() || null,
		})
		.returning({ id: suppliers.id });
	if (!inserted) throw new createHttpError.InternalServerError("Erro ao criar fornecedor.");
	return inserted.id;
}

async function insertPurchaseNewProducts({
	trx,
	organizationId,
	newProducts,
}: {
	trx: DBTransaction;
	organizationId: string;
	newProducts: NonNullable<TCreatePurchaseInput["newProducts"]>;
}) {
	const clashing = await trx
		.select({ id: products.id })
		.from(products)
		.where(
			inArray(
				products.id,
				newProducts.map((product) => product.id),
			),
		)
		.limit(1);
	if (clashing.length > 0) throw new createHttpError.Conflict("Um dos novos produtos já existe. Recarregue a página e tente novamente.");
	await trx.insert(products).values(
		newProducts.map((product) => ({
			id: product.id,
			organizacaoId: organizationId,
			nome: product.nome.trim(),
			codigo: product.codigo.trim(),
			codigoBarras: product.codigoBarras ?? null,
			unidade: product.unidade.trim() || "UN",
			ncm: product.ncm.trim(),
			tipo: "",
			grupo: "",
			vendavel: product.vendavel,
			rastreamentoEstoqueAtivo: product.rastreamentoEstoqueAtivo,
			natureza: product.natureza ?? "REVENDA",
			precoCusto: product.precoCusto ?? null,
			// Estoque inicial em 0: é a própria compra que dará a entrada, quando for recebida.
			quantidade: 0,
		})),
	);
}

async function createPurchaseRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const body = await request.json();
	const input = CreatePurchaseInputSchema.parse(body);
	const result = await createPurchase({ input, session });
	return NextResponse.json(result, { status: 201 });
}
export const POST = appApiHandler({
	POST: createPurchaseRoute,
});

const UpdatePurchaseInputSchema = z.object({
	purchaseId: z.string({
		required_error: "ID da compra não informado.",
		invalid_type_error: "Tipo não válido para ID da compra.",
	}),
	purchase: PurchaseHeaderInputSchema,
	importedDocuments: z.array(PurchaseImportedDocumentSchema).optional(),
	purchaseItems: z.array(
		PurchaseItemSchema.omit({ organizacaoId: true, compraId: true, dataInsercao: true }).extend({
			id: z
				.string({
					invalid_type_error: "Tipo não válido para ID do item da compra.",
				})
				.optional(),
			deletar: z
				.boolean({
					invalid_type_error: "Tipo não válido para deletar item da compra.",
				})
				.optional(),
		}),
	),
	lancamentoContabil: PurchaseAccountingEntryFieldsSchema.extend({
		id: z.string({ invalid_type_error: "Tipo não válido para o ID do lançamento contábil." }).optional(),
		transacoes: z.array(
			PurchaseAccountingEntryTransactionInputSchema.extend({
				id: z.string({ invalid_type_error: "Tipo não válido para o ID da transação financeira da compra." }).optional(),
				deletar: z.boolean({ invalid_type_error: "Tipo não válido para deletar transação financeira da compra." }).optional(),
			}),
		),
	}),
});
export type TUpdatePurchaseInput = z.infer<typeof UpdatePurchaseInputSchema>;

function resolvePurchaseTransition(
	previous: { status: TPurchaseStatusEnum; entregaDataRecebimentoEfetivacao: Date | null },
	next: { status: TPurchaseStatusEnum; entregaDataRecebimentoEfetivacao: Date | null },
): TPurchaseItemStockOperation {
	const wasReceived = isPurchaseConsideredReceived(previous);
	const willBeReceived = isPurchaseConsideredReceived(next);
	if (!wasReceived && willBeReceived) return "RECEIVING";
	if (wasReceived && !willBeReceived) return "UNRECEIVING";
	if (wasReceived && willBeReceived) return "UPDATING_RECEIVED";
	return "UPDATING_UNRECEIVED";
}

type PreviousPurchaseItem = TPurchaseItemInput & { id: string; produtoVarianteId: string | null };
type PayloadPurchaseItem = TUpdatePurchaseInput["purchaseItems"][number];

// A received purchase freezes its items: once lots were spawned we don't allow silent add/remove/edit,
// which would desync the lot sub-ledger. Corrections go through cancellation or the stock-lot flows.
function assertReceivedPurchaseItemsUnchanged({
	previousItems,
	payloadItems,
}: {
	previousItems: PreviousPurchaseItem[];
	payloadItems: PayloadPurchaseItem[];
}) {
	const previousById = new Map(previousItems.map((item) => [item.id, item]));
	for (const item of payloadItems) {
		if (!item.id) throw new createHttpError.BadRequest("Não é possível adicionar itens a uma compra já recebida.");
		if (item.deletar) throw new createHttpError.BadRequest("Não é possível remover itens de uma compra já recebida.");
		const previous = previousById.get(item.id);
		if (!previous) throw new createHttpError.BadRequest("Item informado não pertence a esta compra.");
		const normalizedPrevious = normalizePurchaseItemCostValues(previous);
		const normalizedPayload = normalizePurchaseItemCostValues(item);
		const changed =
			normalizedPrevious.produtoId !== normalizedPayload.produtoId ||
			(normalizedPrevious.produtoVarianteId ?? null) !== (normalizedPayload.produtoVarianteId ?? null) ||
			normalizedPrevious.quantidade !== normalizedPayload.quantidade ||
			normalizedPrevious.valorUnitarioBruto !== normalizedPayload.valorUnitarioBruto ||
			normalizedPrevious.valorTotalBruto !== normalizedPayload.valorTotalBruto ||
			normalizedPrevious.valorTotalLiquido !== normalizedPayload.valorTotalLiquido ||
			normalizedPrevious.valorUnitarioLiquido !== normalizedPayload.valorUnitarioLiquido ||
			normalizedPrevious.valorTotalCusto !== normalizedPayload.valorTotalCusto ||
			normalizedPrevious.valorUnitarioCusto !== normalizedPayload.valorUnitarioCusto ||
			JSON.stringify(normalizedPrevious.modificadoresCusto) !== JSON.stringify(normalizedPayload.modificadoresCusto) ||
			(normalizedPrevious.dataValidade?.getTime() ?? null) !== (normalizedPayload.dataValidade?.getTime() ?? null) ||
			(normalizedPrevious.destinacao ?? "REVENDA") !== (normalizedPayload.destinacao ?? "REVENDA");
		if (changed) throw new createHttpError.BadRequest("Não é possível alterar itens de uma compra já recebida. Cancele a compra para corrigir.");
	}
	const activePayloadCount = payloadItems.filter((item) => !item.deletar).length;
	if (activePayloadCount !== previousItems.length)
		throw new createHttpError.BadRequest("Não é possível alterar a composição de itens de uma compra já recebida.");
}

// Stock effects of a received purchase are only reversible while every lot it spawned is still pristine
// (untouched quantity and ATIVO). Once a lot is consumed/discarded/expired, un-receiving or cancelling
// would break the FEFO sub-ledger, so we block it and point the user to the stock-lot flows.
async function assertPurchaseLotsArePristine({ tx, organizationId, purchaseId }: { tx: DBTransaction; organizationId: string; purchaseId: string }) {
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

/**
 * Sincroniza o lançamento contábil da compra e as transações financeiras que o quitam.
 * Compras criadas antes do módulo contábil não possuem lançamento — nesse caso ele é criado agora e a
 * referência é gravada na compra.
 */
async function syncPurchaseAccountingEntry({
	tx,
	orgId,
	userId,
	purchaseId,
	previousAccountingEntryId,
	payload,
	items,
	purchaseIsReceived,
	purchaseTitle,
	supplierId,
	documents,
	synchronizeLines = true,
}: {
	tx: DBTransaction;
	orgId: string;
	userId: string;
	purchaseId: string;
	previousAccountingEntryId: string | null;
	payload: TUpdatePurchaseInput["lancamentoContabil"];
	items: TPurchaseItemInput[];
	purchaseIsReceived: boolean;
	synchronizeLines?: boolean;
	purchaseTitle: string;
	supplierId: string | null;
	documents?: TPurchaseImportedDocument[] | null;
}) {
	const { id: _payloadEntryId, transacoes: payloadTransactions, ...entryFields } = payload;

	let accountingEntryId = previousAccountingEntryId;

	if (accountingEntryId) {
		await tx
			.update(accountingEntries)
			.set({ ...entryFields, compraId: purchaseId, fornecedorId: supplierId })
			.where(and(eq(accountingEntries.id, accountingEntryId), eq(accountingEntries.organizacaoId, orgId)));
	} else {
		const { debitAccountId, creditAccountId } = await resolvePurchaseAccountingAccountIds({ trx: tx, orgId });
		const insertedAccountingEntry = await tx
			.insert(accountingEntries)
			.values({
				...entryFields,
				organizacaoId: orgId,
				origemTipo: "COMPRA",
				compraId: purchaseId,
				fornecedorId: supplierId,
				idContaDebito: debitAccountId,
				idContaCredito: creditAccountId,
				autorId: userId,
			})
			.returning({ id: accountingEntries.id });

		accountingEntryId = insertedAccountingEntry[0]?.id ?? null;
		if (!accountingEntryId) throw new createHttpError.InternalServerError("Erro ao criar lançamento contábil da compra.");

		await tx
			.update(purchases)
			.set({ lancamentoContabilId: accountingEntryId })
			.where(and(eq(purchases.id, purchaseId), eq(purchases.organizacaoId, orgId)));
	}

	if (synchronizeLines) {
		const { debitAccountId, creditAccountId } = await resolvePurchaseAccountingAccountIds({ trx: tx, orgId });
		await syncPurchaseAccountingLines({
			trx: tx,
			organizationId: orgId,
			accountingEntryId,
			entryValue: entryFields.valor,
			expectedValue: entryFields.valorPrevisto,
			debitAccountId,
			creditAccountId,
			items,
			purchaseIsReceived,
			taxObligation: { purchaseId, userId, purchaseTitle, dataCompetencia: entryFields.dataCompetencia, documents },
		});
	}

	await handleSimpleChildRowsProcessing({
		trx: tx,
		table: financialTransactions,
		// `autorId` só é atribuído nas transações novas — atualizar não muda quem criou a transação.
		entities: payloadTransactions.map((transaction) => ({
			...normalizePurchaseFinancialTransaction(transaction),
			...(transaction.id ? {} : { autorId: userId }),
		})),
		fatherEntityKey: "lancamentoContabilId",
		fatherEntityId: accountingEntryId,
		organizacaoId: orgId,
	});
}

async function updatePurchase({ input, session }: { input: TUpdatePurchaseInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	if (!session.membership?.permissoes.compras.editar) throw new createHttpError.Unauthorized("Você não possui permissão para editar essa compra.");

	const { purchaseId, purchase: payloadPurchase, purchaseItems: payloadPurchaseItems, lancamentoContabil: payloadAccountingEntry } = input;

	assertAccountingEntryIsBalanced({ entryValue: payloadAccountingEntry.valor, transactions: payloadAccountingEntry.transacoes });

	const result = await db.transaction(async (tx) => {
		const lockedRows = await tx
			.select({ id: purchases.id })
			.from(purchases)
			.where(and(eq(purchases.id, purchaseId), eq(purchases.organizacaoId, userOrgId)))
			.for("update");
		if (lockedRows.length === 0) throw new createHttpError.NotFound("Compra não encontrada.");

		const previousPurchase = await tx.query.purchases.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, purchaseId), eq(fields.organizacaoId, userOrgId)),
			with: {
				itens: true,
			},
		});
		if (!previousPurchase) throw new createHttpError.NotFound("Compra não encontrada.");

		if (previousPurchase.status === "CANCELADA" && payloadPurchase.status !== "CANCELADA")
			throw new createHttpError.BadRequest("Não é possível reabrir uma compra cancelada.");

		const isCancelTransition = payloadPurchase.status === "CANCELADA" && previousPurchase.status !== "CANCELADA";

		if (isCancelTransition) {
			const wasReceived = isPurchaseConsideredReceived(previousPurchase);
			if (wasReceived) {
				await assertPurchaseLotsArePristine({ tx, organizationId: userOrgId, purchaseId });
				for (const previousItem of previousPurchase.itens) {
					await handlePurchaseItemStockProcessing({
						trx: tx,
						organizationId: userOrgId,
						userId: session.user.id,
						purchaseId,
						operation: "UNRECEIVING",
						item: {
							id: previousItem.id,
							deletar: false,
							produtoId: previousItem.produtoId,
							produtoVarianteId: previousItem.produtoVarianteId,
							snapshotProdutoDescricao: previousItem.snapshotProdutoDescricao,
							snapshotProdutoCodigo: previousItem.snapshotProdutoCodigo,
							quantidade: previousItem.quantidade,
							valorUnitarioBruto: previousItem.valorUnitarioBruto,
							valorUnitarioLiquido: previousItem.valorUnitarioLiquido,
							valorTotalBruto: previousItem.valorTotalBruto,
							valorTotalLiquido: previousItem.valorTotalLiquido,
							descontosTotal: previousItem.descontosTotal,
							acrescimosTotal: previousItem.acrescimosTotal,
							modificadoresCusto: previousItem.modificadoresCusto,
							valorTotalCusto: previousItem.valorTotalCusto,
							valorUnitarioCusto: previousItem.valorUnitarioCusto,
							externoQtde: previousItem.externoQtde,
							externoValor: previousItem.externoValor,
							externoUnidade: previousItem.externoUnidade,
							externoFatorConversao: previousItem.externoFatorConversao,
							anotacoes: previousItem.anotacoes,
							documentoRef: previousItem.documentoRef,
							documentoItem: previousItem.documentoItem,
							dataValidade: previousItem.dataValidade,
							destinacao: previousItem.destinacao,
						},
						reasonOverride: { exit: "Rollback - compra cancelada" },
					});
				}
			}

			await tx
				.update(purchases)
				.set({
					...payloadPurchase,
					entregaDataRecebimentoEfetivacao: null,
					dataUltimaAtualizacao: new Date(),
				})
				.where(and(eq(purchases.id, purchaseId), eq(purchases.organizacaoId, userOrgId)));
			await unlinkInboundDocumentsFromPurchase({ trx: tx, organizationId: userOrgId, purchaseId });
			await removePurchaseTaxObligationEntry({ trx: tx, organizationId: userOrgId, purchaseId });
			await removePurchaseCarrierEntries({ trx: tx, organizationId: userOrgId, purchaseId });

			return {
				data: { updatedPurchaseId: purchaseId },
				message: "Compra cancelada com sucesso.",
			};
		}

		const operation = resolvePurchaseTransition(previousPurchase, payloadPurchase);
		if (operation === "RECEIVING")
			await assertLinkedInboundDocumentsReceivable({
				trx: tx,
				organizationId: userOrgId,
				purchaseId,
				documentIds: getImportedFiscalDocumentIds(input.importedDocuments),
			});
		const normalizedPurchaseItems = normalizePurchaseItems(payloadPurchaseItems);
		if (operation === "RECEIVING") assertPurchaseEntryMatchesItems({ entryValue: payloadAccountingEntry.valor, items: normalizedPurchaseItems });

		// Received purchase staying received: items are frozen. Reprocessing them here would roll back and
		// re-apply stock on every save (and desync spawned lots), so we only update the header.
		if (operation === "UPDATING_RECEIVED") {
			assertReceivedPurchaseItemsUnchanged({ previousItems: previousPurchase.itens, payloadItems: normalizedPurchaseItems });
			// O valor efetivo espelha itens que já geraram lotes e linhas contábeis. Congelá-lo aqui é o que
			// permite pular a resincronização das linhas logo abaixo sem deixá-las defasadas.
			await assertReceivedPurchaseEntryValueUnchanged({
				tx,
				orgId: userOrgId,
				accountingEntryId: previousPurchase.lancamentoContabilId,
				payloadValue: payloadAccountingEntry.valor,
			});
			await tx
				.update(purchases)
				.set({
					...payloadPurchase,
					documentosImportados: buildPurchaseImportedDocumentsSnapshot(input.importedDocuments),
					dataUltimaAtualizacao: new Date(),
				})
				.where(and(eq(purchases.id, purchaseId), eq(purchases.organizacaoId, userOrgId)));
			await linkInboundDocumentsToPurchase({
				trx: tx,
				organizationId: userOrgId,
				purchaseId,
				documentIds: getImportedFiscalDocumentIds(input.importedDocuments),
			});
			// O congelamento vale para os itens (que geraram lotes), não para a programação de pagamento:
			// reprogramar um pagamento após o recebimento é o caso de uso principal.
			await syncPurchaseAccountingEntry({
				tx,
				orgId: userOrgId,
				userId: session.user.id,
				purchaseId,
				previousAccountingEntryId: previousPurchase.lancamentoContabilId,
				payload: payloadAccountingEntry,
				items: normalizedPurchaseItems,
				purchaseIsReceived: true,
				purchaseTitle: payloadPurchase.titulo,
				supplierId: payloadPurchase.fornecedorId ?? null,
				documents: input.importedDocuments,
				synchronizeLines: false,
			});
			return {
				data: { updatedPurchaseId: purchaseId },
				message: "Compra atualizada com sucesso.",
			};
		}

		// Un-receiving (RECEBIDA → anterior) rolls back stock and zeroes the spawned lots; only allowed
		// while those lots are pristine.
		if (operation === "UNRECEIVING") {
			await assertPurchaseLotsArePristine({ tx, organizationId: userOrgId, purchaseId });
		}

		await tx
			.update(purchases)
			.set({
				...payloadPurchase,
				documentosImportados: buildPurchaseImportedDocumentsSnapshot(input.importedDocuments),
				dataUltimaAtualizacao: new Date(),
			})
			.where(and(eq(purchases.id, purchaseId), eq(purchases.organizacaoId, userOrgId)));
		await linkInboundDocumentsToPurchase({
			trx: tx,
			organizationId: userOrgId,
			purchaseId,
			documentIds: getImportedFiscalDocumentIds(input.importedDocuments),
		});

		await syncPurchaseAccountingEntry({
			tx,
			orgId: userOrgId,
			userId: session.user.id,
			purchaseId,
			previousAccountingEntryId: previousPurchase.lancamentoContabilId,
			payload: payloadAccountingEntry,
			items: normalizedPurchaseItems,
			purchaseIsReceived: isPurchaseConsideredReceived(payloadPurchase),
			purchaseTitle: payloadPurchase.titulo,
			supplierId: payloadPurchase.fornecedorId ?? null,
			documents: input.importedDocuments,
		});

		for (const item of normalizedPurchaseItems) {
			await handlePurchaseItemStockProcessing({
				trx: tx,
				organizationId: userOrgId,
				userId: session.user.id,
				purchaseId,
				operation,
				item,
			});
		}

		return {
			data: { updatedPurchaseId: purchaseId },
			message: "Compra atualizada com sucesso.",
		};
	});
	// Fora da transação e best-effort (idempotente: só notas ainda em ciência sobem para confirmada).
	if (isPurchaseConsideredReceived(payloadPurchase)) await confirmInboundDocumentsOnReceive({ organizationId: userOrgId, purchaseId });
	return result;
}
export type TUpdatePurchaseOutput = Awaited<ReturnType<typeof updatePurchase>>;

async function updatePurchaseRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const body = await request.json();
	const input = UpdatePurchaseInputSchema.parse(body);
	const result = await updatePurchase({ input, session });
	return NextResponse.json(result);
}
export const PUT = appApiHandler({
	PUT: updatePurchaseRoute,
});
