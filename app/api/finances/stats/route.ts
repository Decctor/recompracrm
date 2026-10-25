import { TAuthUserSession } from "@/lib/authentication/types";
import { isDateOverdue } from "@/lib/dates";
import { canViewFinances } from "@/lib/permissions/finances";
import { FINANCIAL_TRANSFER_METHOD, getAccountChartIdsByNatureza } from "@/lib/finances";
import { getPreviousPeriod, getTrailingMonthKeys, getTrailingMonthsRange } from "@/lib/finances/analytics/periods";
import { db } from "@/services/drizzle";
import { accountingEntries, accountingEntryLines, financialTransactions } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import createHttpError from "http-errors";
import z from "zod";
import { and, eq, gte, isNotNull, lte, ne, sql, sum } from "drizzle-orm";
import { formatAsNumber } from "@/lib/formatting";
import { appApiHandler } from "@/lib/app-api";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { inOperationTimezone, OPERATION_TIMEZONE } from "@/lib/operation-timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

type TGeneralFinancesStatsReduced = {
	totalPendingTransactions: {
		inflow: number;
		outflow: number;
	};
	totalPendingTransactionsForToday: {
		inflow: number;
		outflow: number;
	};
	totalPendingTransactionsOverdue: {
		inflow: number;
		outflow: number;
	};
	totalPendingTransactionsNext7Days: {
		inflow: number;
		outflow: number;
	};
	pendingOverdueCount: number;
	daily: {
		[key: string]: {
			expected: number;
			effective: number;
			// Componentes brutos do líquido acima, para gráficos de entradas × saídas.
			entradasEfetivadas: number;
			saidasEfetivadas: number;
			entradasPrevistas: number;
			saidasPrevistas: number;
		};
	};
};
type TAccountResult = {
	accountId: string;
	accountName: string;
	totalCredited: number;
	totalDebited: number;
	netBalance: number;
};

const GetFinancesOverallStatsInputSchema = z.object({
	periodAfter: z
		.string({
			required_error: "Período não informado.",
			invalid_type_error: "Tipo inválido para período.",
		})
		.datetime({ message: "Tipo inválido para período." })
		.transform((val) => new Date(val)),
	periodBefore: z
		.string({
			required_error: "Período não informado.",
			invalid_type_error: "Tipo inválido para período.",
		})
		.datetime({ message: "Tipo inválido para período." })
		.transform((val) => new Date(val)),
});
export type TGetFinancesOverallStatsInput = z.infer<typeof GetFinancesOverallStatsInputSchema>;

async function getFinancesOverallStats({ input, session }: { input: TGetFinancesOverallStatsInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	const { periodAfter, periodBefore } = input;
	// Dias no fuso da operação: o fim de um mês em São Paulo já é o dia 1º seguinte em UTC.
	const datesStrs: string[] = [];
	const lastDay = dayjs(periodBefore).tz(OPERATION_TIMEZONE).startOf("day");
	for (let day = dayjs(periodAfter).tz(OPERATION_TIMEZONE).startOf("day"); !day.isAfter(lastDay); day = day.add(1, "day"))
		datesStrs.push(day.format("DD/MM"));

	// Agregação pelas linhas contábeis (conta + natureza), não pelo par legado do lançamento: partidas
	// compostas atribuem cada valor à sua própria conta. Ver ADR-0001.
	const groupedLinesForRange = (range: { after: Date; before: Date }) =>
		db
			.select({
				accountId: accountingEntryLines.contaContabilId,
				natureza: accountingEntryLines.natureza,
				total: sum(accountingEntryLines.valor),
			})
			.from(accountingEntryLines)
			.innerJoin(accountingEntries, eq(accountingEntryLines.lancamentoContabilId, accountingEntries.id))
			.where(
				and(
					eq(accountingEntryLines.organizacaoId, userOrgId),
					gte(accountingEntries.dataCompetencia, range.after),
					lte(accountingEntries.dataCompetencia, range.before),
				),
			)
			.groupBy(accountingEntryLines.contaContabilId, accountingEntryLines.natureza);

	const currentLineRows = await groupedLinesForRange({ after: periodAfter, before: periodBefore });
	const creditedByAccount = currentLineRows
		.filter((row) => row.natureza === "CREDITO")
		.map((row) => ({ accountId: row.accountId, totalCredited: row.total }));
	const debitedByAccount = currentLineRows
		.filter((row) => row.natureza === "DEBITO")
		.map((row) => ({ accountId: row.accountId, totalDebited: row.total }));

	// Fetch account details for proper naming
	const accounts = await db.query.accountsCharts.findMany({
		where: (fields, { eq }) => eq(fields.organizacaoId, userOrgId),
		columns: {
			id: true,
			nome: true,
			natureza: true,
		},
	});

	// Create account map for easier lookup
	const accountMap = new Map(accounts.map((account) => [account.id, account.nome]));
	const revenueAccountIds = getAccountChartIdsByNatureza(accounts, "RECEITA");
	const expenseAccountIds = getAccountChartIdsByNatureza(accounts, "DESPESA");
	const costAccountIds = getAccountChartIdsByNatureza(accounts, "CUSTO");

	// Combine the results into a single data structure
	const resultMap = new Map<string, TAccountResult>();

	// Process credited amounts
	for (const item of creditedByAccount) {
		const accountName = accountMap.get(item.accountId) || "Unknown Account";
		resultMap.set(item.accountId, {
			accountId: item.accountId,
			accountName,
			totalCredited: formatAsNumber(item.totalCredited),
			totalDebited: 0,
			netBalance: formatAsNumber(item.totalCredited),
		});
	}

	// Process debited amounts
	for (const item of debitedByAccount) {
		if (resultMap.has(item.accountId)) {
			const account = resultMap.get(item.accountId);
			if (!account) continue;
			const debited = formatAsNumber(item.totalDebited);
			const credited = formatAsNumber(account.totalCredited);
			account.totalDebited = debited;
			account.netBalance = credited - debited;
		} else {
			const accountName = accountMap.get(item.accountId) || "Unknown Account";
			const debited = formatAsNumber(item.totalDebited);
			resultMap.set(item.accountId, {
				accountId: item.accountId,
				accountName,
				totalCredited: 0,
				totalDebited: debited,
				netBalance: -debited,
			});
		}
	}
	const resultByAccounts = Array.from(resultMap.values());

	// Soma das linhas de um lado (crédito p/ receita, débito p/ custo e despesa) já agrupadas acima —
	// o período anterior é a única consulta extra.
	const sumLineRows = (rows: Awaited<ReturnType<typeof groupedLinesForRange>>, accountIds: string[], side: "CREDITO" | "DEBITO") => {
		if (accountIds.length === 0) return 0;
		const accountIdSet = new Set(accountIds);
		return rows.filter((row) => row.natureza === side && accountIdSet.has(row.accountId)).reduce((total, row) => total + formatAsNumber(row.total), 0);
	};

	const currentRange = { after: periodAfter, before: periodBefore };
	const previousRange = getPreviousPeriod(currentRange);
	const previousLineRows = await groupedLinesForRange(previousRange);

	const totalRevenueResultValue = sumLineRows(currentLineRows, revenueAccountIds, "CREDITO");
	const totalExpenseResultValue = sumLineRows(currentLineRows, expenseAccountIds, "DEBITO");
	const totalCostResultValue = sumLineRows(currentLineRows, costAccountIds, "DEBITO");
	const previousTotalRevenue = sumLineRows(previousLineRows, revenueAccountIds, "CREDITO");
	const previousTotalExpense = sumLineRows(previousLineRows, expenseAccountIds, "DEBITO");
	const previousTotalCost = sumLineRows(previousLineRows, costAccountIds, "DEBITO");

	// Transferências entre contas zeram no líquido, mas inflariam os fluxos medidos abaixo.
	const totalInFlowResult = await db
		.select({ total: sum(financialTransactions.valor) })
		.from(financialTransactions)
		.where(
			and(
				eq(financialTransactions.organizacaoId, userOrgId),
				eq(financialTransactions.tipo, "ENTRADA"),
				ne(financialTransactions.metodo, FINANCIAL_TRANSFER_METHOD),
				gte(financialTransactions.dataEfetivacao, periodAfter),
				lte(financialTransactions.dataEfetivacao, periodBefore),
			),
		);
	const totalInFlow = formatAsNumber(totalInFlowResult[0]?.total ?? 0);

	const totalOutFlowResult = await db
		.select({ total: sum(financialTransactions.valor) })
		.from(financialTransactions)
		.where(
			and(
				eq(financialTransactions.organizacaoId, userOrgId),
				eq(financialTransactions.tipo, "SAIDA"),
				ne(financialTransactions.metodo, FINANCIAL_TRANSFER_METHOD),
				gte(financialTransactions.dataEfetivacao, periodAfter),
				lte(financialTransactions.dataEfetivacao, periodBefore),
			),
		);
	const totalOutFlow = formatAsNumber(totalOutFlowResult[0]?.total ?? 0);

	// Fluxo efetivado do período anterior e série mensal de 12 meses (encerrando no mês final do período).
	const monthKeys = getTrailingMonthKeys(periodBefore);
	const monthsRange = getTrailingMonthsRange(periodBefore);
	const signedFlowSums = {
		entradas: sql<number>`COALESCE(SUM(CASE WHEN ${financialTransactions.tipo} = 'ENTRADA' THEN ${financialTransactions.valor} ELSE 0 END), 0)`,
		saidas: sql<number>`COALESCE(SUM(CASE WHEN ${financialTransactions.tipo} = 'SAIDA' THEN ${financialTransactions.valor} ELSE 0 END), 0)`,
	};
	const effectiveFlowWhere = (range: { after: Date; before: Date }) =>
		and(
			eq(financialTransactions.organizacaoId, userOrgId),
			ne(financialTransactions.metodo, FINANCIAL_TRANSFER_METHOD),
			isNotNull(financialTransactions.dataEfetivacao),
			gte(financialTransactions.dataEfetivacao, range.after),
			lte(financialTransactions.dataEfetivacao, range.before),
		);
	const [previousFlowRows, monthlyFlowRows] = await Promise.all([
		db.select(signedFlowSums).from(financialTransactions).where(effectiveFlowWhere(previousRange)),
		db
			.select({
				mes: sql<string>`to_char(date_trunc('month', ${inOperationTimezone(financialTransactions.dataEfetivacao)}), 'YYYY-MM')`,
				...signedFlowSums,
			})
			.from(financialTransactions)
			.where(effectiveFlowWhere(monthsRange))
			.groupBy(sql`date_trunc('month', ${inOperationTimezone(financialTransactions.dataEfetivacao)})`),
	]);
	const monthlyFlowsByKey = new Map(monthlyFlowRows.map((row) => [row.mes, row]));
	const monthlyCashFlow = monthKeys.map((mes) => {
		const row = monthlyFlowsByKey.get(mes);
		const entradas = formatAsNumber(row?.entradas ?? 0);
		const saidas = formatAsNumber(row?.saidas ?? 0);
		return { mes, entradas, saidas, liquido: entradas - saidas };
	});
	const transactions = await db.query.financialTransactions.findMany({
		where: (fields, { and, or, gte, lte, eq, ne, isNull }) =>
			and(
				eq(fields.organizacaoId, userOrgId),
				ne(fields.metodo, FINANCIAL_TRANSFER_METHOD),
				or(isNull(fields.dataEfetivacao), and(gte(fields.dataEfetivacao, periodAfter), lte(fields.dataEfetivacao, periodBefore))),
			),
		columns: {
			tipo: true,
			valor: true,
			dataPrevisao: true,
			dataEfetivacao: true,
		},
	});

	const initialReducedAcc: TGeneralFinancesStatsReduced = {
		totalPendingTransactions: {
			inflow: 0,
			outflow: 0,
		},
		totalPendingTransactionsForToday: {
			inflow: 0,
			outflow: 0,
		},
		totalPendingTransactionsOverdue: {
			inflow: 0,
			outflow: 0,
		},
		totalPendingTransactionsNext7Days: {
			inflow: 0,
			outflow: 0,
		},
		pendingOverdueCount: 0,
		daily: datesStrs.reduce((acc: TGeneralFinancesStatsReduced["daily"], current) => {
			acc[current] = { expected: 0, effective: 0, entradasEfetivadas: 0, saidasEfetivadas: 0, entradasPrevistas: 0, saidasPrevistas: 0 };
			return acc;
		}, {}),
	};

	const reduced = transactions.reduce((acc: TGeneralFinancesStatsReduced, current) => {
		const transactionType = current.tipo;
		const transactionValue = current.valor;
		const transactionExpectedDate = current.dataPrevisao;
		const transactionExpectedDay = dayjs(transactionExpectedDate).tz(OPERATION_TIMEZONE).format("DD/MM");
		const transactionEffectiveDate = current.dataEfetivacao || null;
		const transactionEffectiveDay = dayjs(transactionEffectiveDate).tz(OPERATION_TIMEZONE).format("DD/MM");

		if (transactionEffectiveDate) {
			const effectiveDay = acc.daily[transactionEffectiveDay];
			if (effectiveDay) {
				effectiveDay.effective += transactionType === "ENTRADA" ? +transactionValue : -transactionValue;
				if (transactionType === "ENTRADA") effectiveDay.entradasEfetivadas += transactionValue;
				else effectiveDay.saidasEfetivadas += transactionValue;
			}
		} else {
			// Defining flags based on the transaction date
			const currentDateDayJs = dayjs().tz(OPERATION_TIMEZONE);
			const transactionIsForToday = transactionExpectedDate && dayjs(transactionExpectedDate).isSame(new Date(), "day");
			const transactionIsOverdue =
				transactionExpectedDate && isDateOverdue({ date: transactionExpectedDate, inRelationTo: currentDateDayJs, useEndOfDay: true });
			// Próximos 7 dias: de amanhã até daqui a 7 dias (hoje e vencidos têm as próprias linhas).
			const daysUntilDue = transactionExpectedDate ? dayjs(transactionExpectedDate).startOf("day").diff(currentDateDayJs.startOf("day"), "day") : null;
			const transactionIsNext7Days = daysUntilDue !== null && daysUntilDue >= 1 && daysUntilDue <= 7;
			if (transactionIsOverdue) acc.pendingOverdueCount += 1;
			const expectedDay = acc.daily[transactionExpectedDay];
			if (expectedDay) {
				if (transactionType === "ENTRADA") expectedDay.entradasPrevistas += transactionValue;
				else expectedDay.saidasPrevistas += transactionValue;
			}

			if (transactionType === "ENTRADA") {
				acc.totalPendingTransactions.inflow += transactionValue;
				// Updating the daily holder
				if (acc.daily[transactionExpectedDay]) acc.daily[transactionExpectedDay].expected += +transactionValue;
				if (transactionIsForToday) acc.totalPendingTransactionsForToday.inflow += transactionValue;
				if (transactionIsOverdue) acc.totalPendingTransactionsOverdue.inflow += transactionValue;
				if (transactionIsNext7Days) acc.totalPendingTransactionsNext7Days.inflow += transactionValue;
			} else {
				acc.totalPendingTransactions.outflow += transactionValue;
				// Updating the daily holder
				if (acc.daily[transactionExpectedDay]) acc.daily[transactionExpectedDay].expected += -transactionValue;
				if (transactionIsForToday) acc.totalPendingTransactionsForToday.outflow += transactionValue;
				if (transactionIsOverdue) acc.totalPendingTransactionsOverdue.outflow += transactionValue;
				if (transactionIsNext7Days) acc.totalPendingTransactionsNext7Days.outflow += transactionValue;
			}
		}
		return acc;
	}, initialReducedAcc);

	return {
		data: {
			resultByAccounts,
			totalRevenue: totalRevenueResultValue,
			totalExpense: totalExpenseResultValue,
			totalCost: totalCostResultValue,
			// Mesmas métricas na janela imediatamente anterior de duração idêntica, para deltas na UI.
			// Campos em inglês por consistência com o payload legado deste endpoint.
			previous: {
				totalRevenue: previousTotalRevenue,
				totalExpense: previousTotalExpense,
				totalCost: previousTotalCost,
				totalInFlow: formatAsNumber(previousFlowRows[0]?.entradas ?? 0),
				totalOutFlow: formatAsNumber(previousFlowRows[0]?.saidas ?? 0),
			},
			monthlyCashFlow,
			totalInFlow,
			totalOutFlow,
			totalPendingTransactions: reduced.totalPendingTransactions,
			totalPendingTransactionsForToday: reduced.totalPendingTransactionsForToday,
			totalPendingTransactionsOverdue: reduced.totalPendingTransactionsOverdue,
			totalPendingTransactionsNext7Days: reduced.totalPendingTransactionsNext7Days,
			pendingOverdueCount: reduced.pendingOverdueCount,
			daily: Object.entries(reduced.daily).map(([key, value]) => ({ day: key, ...value })),
		},
	};
}
export type TGetFinancesOverallStatsOutput = Awaited<ReturnType<typeof getFinancesOverallStats>>;

async function getFinancesOverallStatsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	if (!canViewFinances(session.membership?.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para acessar o módulo financeiro.");
	const searchParams = request.nextUrl.searchParams;
	const input = GetFinancesOverallStatsInputSchema.parse({
		periodAfter: searchParams.get("periodAfter") ?? null,
		periodBefore: searchParams.get("periodBefore") ?? null,
	});
	const result = await getFinancesOverallStats({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getFinancesOverallStatsRoute });
