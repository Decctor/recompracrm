import dayjs from "dayjs";
import { and, eq, inArray } from "drizzle-orm";
import { writeDefaultAccountingEntryLines } from "./accounting-entry-lines";
import { getCreditCardForecastDate } from "./credit-card";
import { normalizeFinancialTransactionValue } from "./financial-transaction-value";
import { getNextRecurringOccurrence, getRecurringOccurrencesUntil } from "./recurrence";
import type { DB } from "@/services/drizzle";
import { accountingEntries, financialAccounts, financialRecurringRules, financialTransactions } from "@/services/drizzle/schema";
import type { TFinancialRecurringRuleConfig, TFinancialRecurringRuleTransactionTemplate } from "@/schemas/financial-recurring";

function getDateOnOccurrence(occurrenceDate: Date, day: number) {
	const month = dayjs(occurrenceDate).startOf("month");
	return month.date(Math.min(Math.max(Math.trunc(day), 1), month.daysInMonth())).toDate();
}

export function getTransactionForecastDate({
	occurrenceDate,
	template,
	account,
}: {
	occurrenceDate: Date;
	template: TFinancialRecurringRuleTransactionTemplate;
	account?: { tipo: string; configuracao: unknown };
}) {
	if (
		account?.tipo === "CARTAO_CREDITO" &&
		typeof account.configuracao === "object" &&
		account.configuracao !== null &&
		"categoria" in account.configuracao &&
		account.configuracao.categoria === "CARTAO_CREDITO"
	) {
		return getCreditCardForecastDate(
			occurrenceDate,
			account.configuracao as { categoria: "CARTAO_CREDITO"; diaFechamentoFatura: number; diaVencimentoFatura: number },
		);
	}
	return getDateOnOccurrence(occurrenceDate, template.diaPrevisao ?? dayjs(occurrenceDate).date());
}

export async function generateRecurringAccountingEntries(db: DB, referenceDate = new Date()) {
	const rules = await db.query.financialRecurringRules.findMany({ where: eq(financialRecurringRules.status, "ATIVA") });
	const errors: string[] = [];
	let entriesCreated = 0;

	for (const rule of rules) {
		try {
			const config = rule.config as TFinancialRecurringRuleConfig;
			const horizon = dayjs(referenceDate).add(config.gerarComAntecedenciaDias, "day").endOf("day").toDate();
			const nextOccurrence = rule.proximaGeracaoEm ?? config.inicio;
			if (!nextOccurrence || dayjs(nextOccurrence).isAfter(horizon)) continue;
			const occurrenceDates = getRecurringOccurrencesUntil(config, nextOccurrence, horizon);
			const accountIds = rule.templateTransacoes.map((transaction) => transaction.contaFinanceiraId).filter((id): id is string => !!id);
			const accounts = accountIds.length
				? await db.query.financialAccounts.findMany({
						where: and(eq(financialAccounts.organizacaoId, rule.organizacaoId), inArray(financialAccounts.id, accountIds)),
						columns: { id: true, tipo: true, configuracao: true },
					})
				: [];
			const accountById = new Map(accounts.map((account) => [account.id, account]));
			if (accounts.length !== new Set(accountIds).size) throw new Error("Conta financeira de uma regra recorrente não encontrada.");
			let lastGeneratedDate: Date | null = null;

			for (const occurrenceDate of occurrenceDates) {
				const created = await db.transaction(async (tx) => {
					const [entry] = await tx
						.insert(accountingEntries)
						.values({
							organizacaoId: rule.organizacaoId,
							origemTipo: "RECORRENCIA",
							clienteId: rule.templateLancamento.clienteId ?? null,
							fornecedorId: rule.templateLancamento.fornecedorId ?? null,
							titulo: rule.templateLancamento.titulo,
							anotacoes: rule.templateLancamento.anotacoes,
							idContaDebito: rule.templateLancamento.idContaDebito,
							idContaCredito: rule.templateLancamento.idContaCredito,
							valor: rule.templateLancamento.valor,
							valorPrevisto: rule.templateLancamento.valorPrevisto,
							dataCompetencia: occurrenceDate,
							recorrenciaRegraId: rule.id,
							recorrenciaInstanciaData: occurrenceDate,
							recorrenciaGeradoEm: referenceDate,
							autorId: rule.autorId,
						})
						.onConflictDoNothing({ target: [accountingEntries.recorrenciaRegraId, accountingEntries.recorrenciaInstanciaData] })
						.returning({ id: accountingEntries.id });
					if (!entry) return false;
					await writeDefaultAccountingEntryLines({
						trx: tx,
						organizationId: rule.organizacaoId,
						accountingEntryId: entry.id,
						entryValue: rule.templateLancamento.valor,
						expectedValue: rule.templateLancamento.valorPrevisto,
						debitAccountId: rule.templateLancamento.idContaDebito,
						creditAccountId: rule.templateLancamento.idContaCredito,
					});
					if (rule.templateTransacoes.length > 0) {
						await tx.insert(financialTransactions).values(
							rule.templateTransacoes.map((template) => ({
								...normalizeFinancialTransactionValue(template),
								organizacaoId: rule.organizacaoId,
								lancamentoContabilId: entry.id,
								contaFinanceiraId: template.contaFinanceiraId,
								titulo: template.titulo,
								tipo: template.tipo,
								metodo: template.metodo,
								dataPrevisao: getTransactionForecastDate({
									occurrenceDate,
									template,
									account: template.contaFinanceiraId ? accountById.get(template.contaFinanceiraId) : undefined,
								}),
								dataEfetivacao: null,
								parcela: null,
								totalParcelas: null,
								autorId: rule.autorId,
							})),
						);
					}
					return true;
				});
				if (created) entriesCreated++;
				lastGeneratedDate = occurrenceDate;
			}

			if (lastGeneratedDate) {
				await db
					.update(financialRecurringRules)
					.set({ ultimaGeracaoEm: referenceDate, proximaGeracaoEm: getNextRecurringOccurrence(lastGeneratedDate, config) })
					.where(eq(financialRecurringRules.id, rule.id));
			}
		} catch (error) {
			errors.push(`Falha ao gerar a regra recorrente ${rule.id}: ${String(error)}`);
		}
	}

	return { rulesProcessed: rules.length, entriesCreated, errors };
}
