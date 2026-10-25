import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { TAuthUserSession } from "@/lib/authentication/types";
import { canCreateFinances, canEditFinances, canViewFinances } from "@/lib/permissions/finances";
import { getCreditCardForecastDate } from "@/lib/finances/credit-card";
import { normalizeFinancialTransactionValue } from "@/lib/finances/financial-transaction-value";
import { getNextRecurringOccurrence } from "@/lib/finances/recurrence";
import {
	assertAccountingEntryLinesBalanced,
	buildDefaultAccountingEntryLines,
	syncAccountingEntryLines,
	type TAccountingEntryLineInput,
} from "@/lib/finances/accounting-entry-lines";
import { db, type DBTransaction } from "@/services/drizzle";
import {
	accountingEntries,
	accountsCharts,
	clients,
	financialAccounts,
	financialRecurringRules,
	financialTransactions,
	suppliers,
} from "@/services/drizzle/schema";
import { AccountingEntryLineSchema, AccountingEntrySchema, FinancialTransactionSchema } from "@/schemas/financial";
import { FinancialRecurringRuleConfigSchema } from "@/schemas/financial-recurring";
import { AccountingEntryOriginTypeEnum, TAccountingEntryOriginTypeEnum } from "@/schemas/enums";
import type { TFinancialAccountConfiguration } from "@/schemas/financial";
import { and, count, eq, gte, ilike, inArray, isNotNull, isNull, lte, notInArray, or } from "drizzle-orm";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import z from "zod";
import dayjs from "dayjs";

const AccountingEntryTransactionStatusSchema = z.enum(["PAGO", "PARCIALMENTE_PAGO", "PENDENTE", "SEM_TRANSACOES"]);
export type TAccountingEntryTransactionStatus = z.infer<typeof AccountingEntryTransactionStatusSchema>;

const GetAccountingEntriesInputSchema = z.object({
	id: z
		.string({
			invalid_type_error: "Tipo inválido para ID do lançamento.",
		})
		.optional()
		.nullable(),
	page: z
		.string({ invalid_type_error: "Tipo inválido para página." })
		.optional()
		.nullable()
		.transform((v) => (v ? Number(v) : 1)),
	search: z.string({ invalid_type_error: "Tipo inválido para busca." }).optional().nullable(),
	periodAfter: z
		.string({ invalid_type_error: "Tipo inválido para período." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	periodBefore: z
		.string({ invalid_type_error: "Tipo inválido para período." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	originTypes: z
		.string({
			invalid_type_error: "Tipo inválido para os tipos de origem.",
		})
		.optional()
		.nullable()
		.transform((val) =>
			val ? (val.split(",").filter((v) => AccountingEntryOriginTypeEnum.safeParse(v).success) as TAccountingEntryOriginTypeEnum[]) : [],
		),
	transactionStatuses: z
		.string({ invalid_type_error: "Tipo inválido para os status das transações." })
		.optional()
		.nullable()
		.transform((val) =>
			val
				? val.split(",").filter((status): status is TAccountingEntryTransactionStatus => AccountingEntryTransactionStatusSchema.safeParse(status).success)
				: [],
		),
	sortOrder: z
		.enum(["asc", "desc"], { invalid_type_error: "Tipo inválido para a ordenação." })
		.optional()
		.nullable()
		.transform((val) => val ?? "desc"),
});
export type TGetAccountingEntriesInput = z.infer<typeof GetAccountingEntriesInputSchema>;

function getAccountingEntryTransactionStatus(transactions: { dataEfetivacao: Date | null }[]): TAccountingEntryTransactionStatus {
	if (transactions.length === 0) return "SEM_TRANSACOES";
	const paidCount = transactions.filter((transaction) => transaction.dataEfetivacao !== null).length;
	if (paidCount === 0) return "PENDENTE";
	if (paidCount === transactions.length) return "PAGO";
	return "PARCIALMENTE_PAGO";
}

async function getAccountingEntries({ input, session }: { input: TGetAccountingEntriesInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const { id, page, search, periodAfter, periodBefore, originTypes, transactionStatuses, sortOrder } = input;

	if (id) {
		const entry = await db.query.accountingEntries.findFirst({
			where: and(eq(accountingEntries.id, id), eq(accountingEntries.organizacaoId, userOrgId)),
			with: {
				contaDebito: { columns: { id: true, nome: true, codigo: true, natureza: true } },
				contaCredito: { columns: { id: true, nome: true, codigo: true, natureza: true } },
				cliente: { columns: { id: true, nome: true } },
				fornecedor: { columns: { id: true, nome: true } },
				linhas: {
					with: { contaContabil: { columns: { id: true, nome: true, codigo: true, natureza: true } } },
					orderBy: (fields, { asc }) => asc(fields.ordem),
				},
				autor: { columns: { id: true, nome: true, avatarUrl: true } },
				transacoesFinanceiras: {
					with: {
						contaFinanceira: { columns: { id: true, nome: true, tipo: true } },
					},
					orderBy: (fields, { asc }) => asc(fields.dataPrevisao),
				},
			},
		});
		if (!entry) throw new createHttpError.NotFound("Lançamento contábil não encontrado.");

		const recorrenciaRegra = entry.recorrenciaRegraId
			? await db.query.financialRecurringRules.findFirst({
					where: and(eq(financialRecurringRules.id, entry.recorrenciaRegraId), eq(financialRecurringRules.organizacaoId, userOrgId)),
				})
			: null;

		return {
			data: {
				byId: { ...entry, recorrenciaRegra },
				default: null,
			},
			message: "Lançamento contábil recuperado com sucesso.",
		};
	}

	const conditions = [eq(accountingEntries.organizacaoId, userOrgId)];
	if (search && search.trim().length > 0) conditions.push(ilike(accountingEntries.titulo, `%${search.trim()}%`));
	if (periodAfter) conditions.push(gte(accountingEntries.dataCompetencia, periodAfter));
	if (periodBefore) conditions.push(lte(accountingEntries.dataCompetencia, periodBefore));
	if (originTypes.length > 0) conditions.push(inArray(accountingEntries.origemTipo, originTypes));
	if (transactionStatuses.length > 0) {
		const entryIdsWithTransactions = db
			.select({ id: financialTransactions.lancamentoContabilId })
			.from(financialTransactions)
			.where(eq(financialTransactions.organizacaoId, userOrgId));
		const entryIdsWithPaidTransactions = db
			.select({ id: financialTransactions.lancamentoContabilId })
			.from(financialTransactions)
			.where(and(eq(financialTransactions.organizacaoId, userOrgId), isNotNull(financialTransactions.dataEfetivacao)));
		const entryIdsWithPendingTransactions = db
			.select({ id: financialTransactions.lancamentoContabilId })
			.from(financialTransactions)
			.where(and(eq(financialTransactions.organizacaoId, userOrgId), isNull(financialTransactions.dataEfetivacao)));
		const statusConditions = transactionStatuses.map((status) => {
			switch (status) {
				case "SEM_TRANSACOES":
					return notInArray(accountingEntries.id, entryIdsWithTransactions);
				case "PENDENTE":
					return and(inArray(accountingEntries.id, entryIdsWithPendingTransactions), notInArray(accountingEntries.id, entryIdsWithPaidTransactions));
				case "PARCIALMENTE_PAGO":
					return and(inArray(accountingEntries.id, entryIdsWithPaidTransactions), inArray(accountingEntries.id, entryIdsWithPendingTransactions));
				case "PAGO":
					return and(inArray(accountingEntries.id, entryIdsWithPaidTransactions), notInArray(accountingEntries.id, entryIdsWithPendingTransactions));
			}
		});
		conditions.push(or(...statusConditions)!);
	}

	const PAGE_SIZE = 25;
	const skip = PAGE_SIZE * (page - 1);

	const [countResult, entriesResult] = await Promise.all([
		db
			.select({ count: count() })
			.from(accountingEntries)
			.where(and(...conditions)),
		db.query.accountingEntries.findMany({
			where: and(...conditions),
			with: {
				contaDebito: { columns: { id: true, nome: true } },
				contaCredito: { columns: { id: true, nome: true } },
				autor: { columns: { id: true, nome: true, avatarUrl: true } },
				transacoesFinanceiras: { columns: { dataEfetivacao: true } },
			},
			orderBy: (fields, { asc, desc }) =>
				sortOrder === "asc" ? [asc(fields.dataCompetencia), asc(fields.dataInsercao)] : [desc(fields.dataCompetencia), desc(fields.dataInsercao)],
			limit: PAGE_SIZE,
			offset: skip,
		}),
	]);

	const entriesMatched = countResult[0]?.count ?? 0;
	const totalPages = Math.ceil(entriesMatched / PAGE_SIZE);

	return {
		data: {
			byId: null,
			default: {
				entries: entriesResult.map(({ transacoesFinanceiras, ...entry }) => ({
					...entry,
					statusTransacoes: getAccountingEntryTransactionStatus(transacoesFinanceiras),
				})),
				entriesMatched,
				totalPages,
			},
		},
		message: "Lançamentos contábeis recuperados com sucesso.",
	};
}
export type TGetAccountingEntriesOutput = Awaited<ReturnType<typeof getAccountingEntries>>;
export type TGetAccountingEntriesOutputDefault = Exclude<TGetAccountingEntriesOutput["data"]["default"], null>;
export type TGetAccountingEntriesOutputById = Exclude<TGetAccountingEntriesOutput["data"]["byId"], null>;

async function getAccountingEntriesRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	if (!canViewFinances(session.membership?.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para acessar o módulo financeiro.");
	const searchParams = request.nextUrl.searchParams;
	const input = GetAccountingEntriesInputSchema.parse({
		id: searchParams.get("id") ?? undefined,
		page: searchParams.get("page") ?? undefined,
		search: searchParams.get("search") ?? undefined,
		periodAfter: searchParams.get("periodAfter") ?? undefined,
		periodBefore: searchParams.get("periodBefore") ?? undefined,
		originTypes: searchParams.get("originTypes") ?? undefined,
		transactionStatuses: searchParams.get("transactionStatuses") ?? undefined,
		sortOrder: searchParams.get("sortOrder") ?? undefined,
	});
	const result = await getAccountingEntries({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getAccountingEntriesRoute });

const AccountingEntryMutationSchema = AccountingEntrySchema.pick({
	titulo: true,
	// Contraparte (ADR-0002, decisão 5): no máximo um dos dois; vazio = sem contraparte.
	clienteId: true,
	fornecedorId: true,
	anotacoes: true,
	idContaDebito: true,
	idContaCredito: true,
	valor: true,
	valorPrevisto: true,
	dataCompetencia: true,
});

const FinancialTransactionMutationSchema = FinancialTransactionSchema.pick({
	contaFinanceiraId: true,
	titulo: true,
	tipo: true,
	valor: true,
	valorBase: true,
	valorJuros: true,
	valorMulta: true,
	valorTaxas: true,
	valorDesconto: true,
	modificadoresMetadata: true,
	metodo: true,
	dataPrevisao: true,
	dataEfetivacao: true,
	parcela: true,
	totalParcelas: true,
});

const AccountingEntryLineInputSchema = AccountingEntryLineSchema.pick({
	contaContabilId: true,
	natureza: true,
	valor: true,
	descricao: true,
});
export type TAccountingEntryLineInputState = z.infer<typeof AccountingEntryLineInputSchema>;

const CreateAccountingEntryInputSchema = z.object({
	entry: AccountingEntryMutationSchema,
	// Vazio = lançamento de par único; o par vira as duas linhas padrão. Preenchido = partida
	// composta; o par das colunas legadas é derivado da primeira linha de cada natureza.
	entryLines: z.array(AccountingEntryLineInputSchema).default([]),
	entryFinancialTransactions: z.array(FinancialTransactionMutationSchema).default([]),
	recurrenceRule: FinancialRecurringRuleConfigSchema.optional().nullable(),
});
export type TCreateAccountingEntryInput = z.infer<typeof CreateAccountingEntryInputSchema>;

const UpdateAccountingEntryInputSchema = z.object({
	entryId: z.string({
		required_error: "ID do lançamento contábil não informado.",
		invalid_type_error: "Tipo inválido para ID do lançamento contábil.",
	}),
	entry: AccountingEntryMutationSchema,
	entryLines: z.array(AccountingEntryLineInputSchema).default([]),
	entryFinancialTransactions: z
		.array(
			FinancialTransactionMutationSchema.extend({
				id: z
					.string({
						required_error: "ID da transação financeira não informado.",
						invalid_type_error: "Tipo inválido para ID da transação financeira.",
					})
					.optional()
					.nullable(),
				deletar: z
					.boolean({
						required_error: "Deletar transação financeira não informado.",
						invalid_type_error: "Tipo inválido para deletar transação financeira.",
					})
					.optional()
					.nullable(),
			}),
		)
		.default([]),
});
export type TUpdateAccountingEntryInput = z.infer<typeof UpdateAccountingEntryInputSchema>;

type TAccountingEntryTransactionInput = TUpdateAccountingEntryInput["entryFinancialTransactions"][number];
type TExistingAccountingEntryForUpdate = NonNullable<Awaited<ReturnType<typeof getExistingAccountingEntryForUpdate>>>;

async function getExistingAccountingEntryForUpdate({ entryId, orgId }: { entryId: string; orgId: string }) {
	return db.query.accountingEntries.findFirst({
		where: and(eq(accountingEntries.id, entryId), eq(accountingEntries.organizacaoId, orgId)),
		columns: {
			id: true,
			origemTipo: true,
			titulo: true,
			anotacoes: true,
			idContaDebito: true,
			idContaCredito: true,
			valor: true,
			valorPrevisto: true,
			dataCompetencia: true,
		},
	});
}

function validateTransactionTotal({ entryValue, transactions }: { entryValue: number; transactions: { valor: number; deletar?: boolean | null }[] }) {
	const activeTransactions = transactions.filter((transaction) => !transaction.deletar);
	if (activeTransactions.length === 0) return;

	const total = activeTransactions.reduce((acc, transaction) => acc + (transaction.valor || 0), 0);
	if (Math.abs(total - entryValue) > 0.02) {
		throw new createHttpError.BadRequest("A soma das transações financeiras precisa bater o valor do lançamento.");
	}
}

function datesMatch(a: Date | string | null | undefined, b: Date | string | null | undefined) {
	if (!a && !b) return true;
	if (!a || !b) return false;
	return new Date(a).getTime() === new Date(b).getTime();
}

function nullableNumbersMatch(a: number | null | undefined, b: number | null | undefined) {
	return (a ?? null) === (b ?? null);
}

function assertLockedEntryFieldsUnchanged({
	inputEntry,
	existingEntry,
}: {
	inputEntry: TUpdateAccountingEntryInput["entry"];
	existingEntry: TExistingAccountingEntryForUpdate;
}) {
	const lockedFieldChanged =
		inputEntry.titulo !== existingEntry.titulo ||
		inputEntry.idContaDebito !== existingEntry.idContaDebito ||
		inputEntry.idContaCredito !== existingEntry.idContaCredito ||
		inputEntry.valor !== existingEntry.valor ||
		!nullableNumbersMatch(inputEntry.valorPrevisto, existingEntry.valorPrevisto) ||
		!datesMatch(inputEntry.dataCompetencia, existingEntry.dataCompetencia);

	if (lockedFieldChanged) {
		throw new createHttpError.BadRequest(
			"Lançamentos originados por venda ou estorno não permitem alterar título, valor, competência ou contas contábeis.",
		);
	}
}

/**
 * Resolve as linhas efetivas do lançamento e o par legado que as espelha. Sem linhas explícitas o
 * par informado É o lançamento, materializado como as duas linhas padrão; com linhas, o par vira
 * sombra derivada (primeira linha de cada natureza) apenas porque as colunas ainda são NOT NULL —
 * os leitores migrados consultam as linhas. Ver ADR-0001.
 */
function resolveManualEntryLines({
	entry,
	entryLines,
}: {
	entry: TCreateAccountingEntryInput["entry"];
	entryLines: TAccountingEntryLineInputState[];
}): { lines: TAccountingEntryLineInput[]; idContaDebito: string; idContaCredito: string } {
	if (entryLines.length === 0) {
		if (entry.idContaDebito === entry.idContaCredito) {
			throw new createHttpError.BadRequest("A conta de débito e a conta de crédito precisam ser diferentes.");
		}
		return {
			lines: buildDefaultAccountingEntryLines({
				debitAccountId: entry.idContaDebito,
				creditAccountId: entry.idContaCredito,
				value: entry.valor,
				expectedValue: entry.valorPrevisto,
			}),
			idContaDebito: entry.idContaDebito,
			idContaCredito: entry.idContaCredito,
		};
	}

	const lines: TAccountingEntryLineInput[] = entryLines.map((line, index) => ({
		contaContabilId: line.contaContabilId,
		natureza: line.natureza,
		valor: line.valor,
		descricao: line.descricao ?? null,
		ordem: index,
	}));
	try {
		assertAccountingEntryLinesBalanced({ entryValue: entry.valor, lines });
	} catch (error) {
		throw new createHttpError.BadRequest(error instanceof Error ? error.message : "Linhas contábeis inválidas.");
	}
	const firstDebit = lines.find((line) => line.natureza === "DEBITO");
	const firstCredit = lines.find((line) => line.natureza === "CREDITO");
	if (!firstDebit || !firstCredit) throw new createHttpError.BadRequest("O lançamento precisa de ao menos uma linha de débito e uma de crédito.");
	return { lines, idContaDebito: firstDebit.contaContabilId, idContaCredito: firstCredit.contaContabilId };
}

async function validateAccountingEntryRelations({
	tx,
	orgId,
	chartAccountIds,
	transactions,
}: {
	tx: DBTransaction;
	orgId: string;
	chartAccountIds: string[];
	transactions: TAccountingEntryTransactionInput[];
}) {
	const uniqueChartIds = Array.from(new Set(chartAccountIds));
	if (uniqueChartIds.length > 0) {
		const charts = await tx.query.accountsCharts.findMany({
			where: and(eq(accountsCharts.organizacaoId, orgId), inArray(accountsCharts.id, uniqueChartIds)),
			columns: { id: true },
		});
		const foundChartIds = new Set(charts.map((chart) => chart.id));
		for (const chartId of uniqueChartIds) {
			if (!foundChartIds.has(chartId)) throw new createHttpError.NotFound("Conta contábil não encontrada para esta organização.");
		}
	}

	const financialAccountIds = Array.from(new Set(transactions.map((transaction) => transaction.contaFinanceiraId).filter(Boolean))) as string[];
	const accountById = new Map<string, { id: string; tipo: string; configuracao: TFinancialAccountConfiguration }>();
	if (financialAccountIds.length === 0) return accountById;

	const accounts = await tx.query.financialAccounts.findMany({
		where: and(eq(financialAccounts.organizacaoId, orgId), inArray(financialAccounts.id, financialAccountIds)),
		columns: { id: true, tipo: true, configuracao: true },
	});
	for (const account of accounts) accountById.set(account.id, account);
	for (const accountId of financialAccountIds) {
		if (!accountById.has(accountId)) throw new createHttpError.NotFound("Conta financeira não encontrada.");
	}
	return accountById;
}

function getTransactionValues(
	transaction: TAccountingEntryTransactionInput,
	{
		account,
		referenceDate,
	}: {
		account?: { tipo: string; configuracao: TFinancialAccountConfiguration };
		referenceDate: Date;
	},
) {
	const dataPrevisao =
		account?.tipo === "CARTAO_CREDITO" && account.configuracao.categoria === "CARTAO_CREDITO"
			? getCreditCardForecastDate(referenceDate, account.configuracao)
			: transaction.dataPrevisao;
	let monetaryValues;
	try {
		monetaryValues = normalizeFinancialTransactionValue(transaction);
	} catch (error) {
		throw new createHttpError.BadRequest(error instanceof Error ? error.message : "Modificadores monetários inválidos.");
	}
	return {
		contaFinanceiraId: transaction.contaFinanceiraId ?? null,
		titulo: transaction.titulo,
		tipo: transaction.tipo,
		...monetaryValues,
		metodo: transaction.metodo,
		dataPrevisao,
		dataEfetivacao: transaction.dataEfetivacao ?? null,
		parcela: transaction.parcela ?? null,
		totalParcelas: transaction.totalParcelas ?? null,
	};
}

async function createAccountingEntry({ input, session }: { input: TCreateAccountingEntryInput; session: TAuthUserSession }) {
	const userMembership = session.membership;
	if (!userMembership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const orgId = userMembership.organizacao.id;
	validateTransactionTotal({ entryValue: input.entry.valor, transactions: input.entryFinancialTransactions });
	const resolvedLines = resolveManualEntryLines({ entry: input.entry, entryLines: input.entryLines });
	// O template de recorrência ainda guarda só o par; uma partida composta geraria ocorrências que
	// não reproduzem as linhas originais. Duas linhas custom equivalem ao par derivado, então passam.
	if (input.recurrenceRule && input.entryLines.length > 2) {
		throw new createHttpError.BadRequest("Lançamentos com mais de duas linhas contábeis ainda não suportam recorrência.");
	}

	const transactionReturn = await db.transaction(async (tx) => {
		const accountById = await validateAccountingEntryRelations({
			tx,
			orgId,
			chartAccountIds: resolvedLines.lines.map((line) => line.contaContabilId),
			transactions: input.entryFinancialTransactions,
		});

		const counterparty = await resolveEntryCounterparty({ tx, orgId, entry: input.entry });
		const [createdEntry] = await tx
			.insert(accountingEntries)
			.values({
				organizacaoId: orgId,
				origemTipo: "MANUAL",
				...counterparty,
				titulo: input.entry.titulo,
				anotacoes: input.entry.anotacoes ?? null,
				idContaDebito: resolvedLines.idContaDebito,
				idContaCredito: resolvedLines.idContaCredito,
				valor: input.entry.valor,
				valorPrevisto: input.entry.valorPrevisto ?? null,
				dataCompetencia: input.entry.dataCompetencia,
				autorId: session.user.id,
			})
			.returning({ id: accountingEntries.id });

		if (!createdEntry?.id) {
			throw new createHttpError.InternalServerError("Erro ao criar lançamento contábil.");
		}

		await syncAccountingEntryLines({
			trx: tx,
			organizationId: orgId,
			accountingEntryId: createdEntry.id,
			entryValue: input.entry.valor,
			lines: resolvedLines.lines,
		});

		if (input.entryFinancialTransactions.length > 0) {
			await tx.insert(financialTransactions).values(
				input.entryFinancialTransactions.map((transaction) => ({
					organizacaoId: orgId,
					lancamentoContabilId: createdEntry.id,
					autorId: session.user.id,
					...getTransactionValues(transaction, {
						account: accountById.get(transaction.contaFinanceiraId ?? ""),
						referenceDate: input.entry.dataCompetencia,
					}),
				})),
			);
		}

		if (input.recurrenceRule) {
			const config = input.recurrenceRule;
			const templateTransacoes = input.entryFinancialTransactions.map((transaction) => {
				const account = transaction.contaFinanceiraId ? accountById.get(transaction.contaFinanceiraId) : undefined;
				return {
					...normalizeFinancialTransactionValue(transaction),
					contaFinanceiraId: transaction.contaFinanceiraId ?? null,
					titulo: transaction.titulo,
					tipo: transaction.tipo,
					metodo: transaction.metodo,
					diaPrevisao: account?.tipo === "CARTAO_CREDITO" ? null : dayjs(transaction.dataPrevisao).date(),
					previsaoModo: account?.tipo === "CARTAO_CREDITO" ? ("INFERIR_PELA_CONTA" as const) : ("DIA_FIXO" as const),
				};
			});
			const [createdRule] = await tx
				.insert(financialRecurringRules)
				.values({
					organizacaoId: orgId,
					autorId: session.user.id,
					lancamentoContabilOrigemId: createdEntry.id,
					status: "ATIVA",
					config,
					templateLancamento: {
						titulo: input.entry.titulo,
						anotacoes: input.entry.anotacoes ?? null,
						idContaDebito: resolvedLines.idContaDebito,
						idContaCredito: resolvedLines.idContaCredito,
						valor: input.entry.valor,
						valorPrevisto: input.entry.valorPrevisto ?? null,
						dataCompetencia: input.entry.dataCompetencia,
					},
					templateTransacoes,
					proximaGeracaoEm: getNextRecurringOccurrence(input.entry.dataCompetencia, config),
					gerarAte: config.fim ?? null,
				})
				.returning({ id: financialRecurringRules.id });
			if (!createdRule) throw new createHttpError.InternalServerError("Não foi possível criar a regra de recorrência.");
			await tx
				.update(accountingEntries)
				.set({ recorrenciaRegraId: createdRule.id, recorrenciaInstanciaData: input.entry.dataCompetencia })
				.where(eq(accountingEntries.id, createdEntry.id));
		}

		return createdEntry.id;
	});

	return {
		data: {
			entryId: transactionReturn,
		},
		message: "Lançamento contábil criado com sucesso.",
	};
}
export type TCreateAccountingEntryOutput = Awaited<ReturnType<typeof createAccountingEntry>>;

/**
 * Contraparte do lançamento (ADR-0002, decisão 5). Confere que o cliente/fornecedor é da
 * organização e devolve as duas colunas prontas para gravar — nulas quando nada foi informado.
 */
async function resolveEntryCounterparty({
	tx,
	orgId,
	entry,
}: {
	tx: DBTransaction;
	orgId: string;
	entry: { clienteId?: string | null; fornecedorId?: string | null };
}) {
	const clienteId = entry.clienteId ?? null;
	const fornecedorId = entry.fornecedorId ?? null;
	if (clienteId && fornecedorId) throw new createHttpError.BadRequest("Um lançamento tem uma contraparte só: cliente ou fornecedor.");
	if (clienteId) {
		const client = await tx.query.clients.findFirst({ where: and(eq(clients.id, clienteId), eq(clients.organizacaoId, orgId)), columns: { id: true } });
		if (!client) throw new createHttpError.NotFound("Cliente da contraparte não encontrado.");
	}
	if (fornecedorId) {
		const supplier = await tx.query.suppliers.findFirst({
			where: and(eq(suppliers.id, fornecedorId), eq(suppliers.organizacaoId, orgId)),
			columns: { id: true },
		});
		if (!supplier) throw new createHttpError.NotFound("Fornecedor da contraparte não encontrado.");
	}
	return { clienteId, fornecedorId };
}

async function createAccountingEntryRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	if (!canCreateFinances(session.membership?.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para criar lançamentos financeiros.");
	const input = CreateAccountingEntryInputSchema.parse(await request.json());
	const result = await createAccountingEntry({ input, session });
	return NextResponse.json(result, { status: 201 });
}

export const POST = appApiHandler({ POST: createAccountingEntryRoute });

async function updateAccountingEntry({ input, session }: { input: TUpdateAccountingEntryInput; session: TAuthUserSession }) {
	const userMembership = session.membership;
	if (!userMembership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const orgId = userMembership.organizacao.id;
	const existingEntry = await getExistingAccountingEntryForUpdate({ entryId: input.entryId, orgId });
	if (!existingEntry) throw new createHttpError.NotFound("Lançamento contábil não encontrado.");

	const canUpdateAccountingFields = existingEntry.origemTipo === "MANUAL";
	// Lançamentos de venda e de compra têm os dados contábeis controlados pela origem, mas a programação
	// de pagamento pode ser ajustada aqui — é onde o time financeiro trabalha.
	const canUpdateTransactions = existingEntry.origemTipo === "MANUAL" || existingEntry.origemTipo === "VENDA" || existingEntry.origemTipo === "COMPRA";

	let resolvedLines: ReturnType<typeof resolveManualEntryLines> | null = null;
	if (canUpdateAccountingFields) {
		validateTransactionTotal({ entryValue: input.entry.valor, transactions: input.entryFinancialTransactions });
		resolvedLines = resolveManualEntryLines({ entry: input.entry, entryLines: input.entryLines });
	} else {
		assertLockedEntryFieldsUnchanged({ inputEntry: input.entry, existingEntry });
		if (canUpdateTransactions) {
			validateTransactionTotal({ entryValue: existingEntry.valor, transactions: input.entryFinancialTransactions });
		}
	}

	const transactionReturn = await db.transaction(async (tx) => {
		if (resolvedLines) {
			await validateAccountingEntryRelations({
				tx,
				orgId,
				chartAccountIds: resolvedLines.lines.map((line) => line.contaContabilId),
				transactions: input.entryFinancialTransactions,
			});
		}

		// Vendas e compras têm a contraparte decidida pela origem; só o lançamento manual escolhe a sua.
		const counterparty = canUpdateAccountingFields ? await resolveEntryCounterparty({ tx, orgId, entry: input.entry }) : {};
		const [updatedEntry] = await tx
			.update(accountingEntries)
			.set({
				anotacoes: input.entry.anotacoes ?? null,
				...counterparty,
				...(resolvedLines
					? {
							titulo: input.entry.titulo,
							idContaDebito: resolvedLines.idContaDebito,
							idContaCredito: resolvedLines.idContaCredito,
							valor: input.entry.valor,
							valorPrevisto: input.entry.valorPrevisto ?? null,
							dataCompetencia: input.entry.dataCompetencia,
						}
					: {}),
			})
			.where(and(eq(accountingEntries.id, input.entryId), eq(accountingEntries.organizacaoId, orgId)))
			.returning({ id: accountingEntries.id });

		if (!updatedEntry?.id) {
			throw new createHttpError.InternalServerError("Erro ao atualizar lançamento contábil.");
		}

		if (resolvedLines) {
			await syncAccountingEntryLines({
				trx: tx,
				organizationId: orgId,
				accountingEntryId: updatedEntry.id,
				entryValue: input.entry.valor,
				lines: resolvedLines.lines,
			});
		}

		if (!canUpdateTransactions) return updatedEntry.id;

		const accountById = await validateAccountingEntryRelations({
			tx,
			orgId,
			// Origens travadas já têm as contas validadas; aqui só o mapa de contas financeiras importa.
			chartAccountIds: [],
			transactions: input.entryFinancialTransactions,
		});

		for (const transaction of input.entryFinancialTransactions) {
			if (transaction.id && transaction.deletar) {
				await tx
					.delete(financialTransactions)
					.where(
						and(
							eq(financialTransactions.id, transaction.id),
							eq(financialTransactions.lancamentoContabilId, input.entryId),
							eq(financialTransactions.organizacaoId, orgId),
						),
					);
				continue;
			}

			if (transaction.id) {
				await tx
					.update(financialTransactions)
					.set(
						getTransactionValues(transaction, {
							account: accountById.get(transaction.contaFinanceiraId ?? ""),
							referenceDate: input.entry.dataCompetencia,
						}),
					)
					.where(
						and(
							eq(financialTransactions.id, transaction.id),
							eq(financialTransactions.lancamentoContabilId, input.entryId),
							eq(financialTransactions.organizacaoId, orgId),
						),
					);
				continue;
			}

			await tx.insert(financialTransactions).values({
				organizacaoId: orgId,
				lancamentoContabilId: input.entryId,
				autorId: session.user.id,
				...getTransactionValues(transaction, {
					account: accountById.get(transaction.contaFinanceiraId ?? ""),
					referenceDate: input.entry.dataCompetencia,
				}),
			});
		}

		return updatedEntry.id;
	});

	return {
		data: {
			entryId: transactionReturn,
		},
		message: "Lançamento contábil atualizado com sucesso.",
	};
}
export type TUpdateAccountingEntryOutput = Awaited<ReturnType<typeof updateAccountingEntry>>;

async function updateAccountingEntryRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	if (!canEditFinances(session.membership?.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para editar lançamentos financeiros.");
	const input = UpdateAccountingEntryInputSchema.parse(await request.json());
	const result = await updateAccountingEntry({ input, session });
	return NextResponse.json(result);
}

export const PUT = appApiHandler({ PUT: updateAccountingEntryRoute });
