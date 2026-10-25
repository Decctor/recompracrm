import { getDefaultAccountChartCodeByKey, RecompraCRMDefaultAccountingDefaults } from "@/config/onboarding";
import { assertAccountingEntryLinesBalanced, syncAccountingEntryLines, type TAccountingEntryLineInput } from "@/lib/finances/accounting-entry-lines";
import { getUfIcmsParameters } from "@/lib/fiscal/entry/uf-parameters";
import { centsToMoney, getModifierCounterparty, moneyToCents } from "@/lib/purchase/costing";
import type { TPurchaseItemInput } from "@/lib/purchase-processing/process-purchase-item-stock";
import type { TAcquisitionNatureEnum } from "@/schemas/enums";
import type { TOrganizationDefaults } from "@/schemas/organizations";
import type { DBTransaction } from "@/services/drizzle";
import { accountingEntries, accountingEntryLines, financialTransactions } from "@/services/drizzle/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import createHttpError from "http-errors";

/**
 * Lançamento da dívida com o fisco nascida de uma compra (ADR-0002, decisão 5): um por compra,
 * origem TRIBUTO_COMPRA, identificado por `chaveIdempotencia = compra:{id}:FISCO`. Nasce no
 * recebimento (é a entrada da mercadoria que gera DIFAL/antecipação), some quando a compra deixa
 * de estar recebida — a menos que a guia já tenha sido paga, e aí fica para decisão humana.
 */

export type TPurchaseTaxObligationAmounts = {
	totalCentavos: number;
	custoPorDestinacao: Partial<Record<TAcquisitionNatureEnum, number>>;
	creditoCentavos: number;
	despesaCentavos: number;
	uf: string | null;
};

export function buildTaxObligationIdempotencyKey(purchaseId: string) {
	return `compra:${purchaseId}:FISCO`;
}

/** Soma os componentes com contrapartida FISCO dos itens, pelo destino contábil de cada um. */
export function getPurchaseTaxObligationAmounts(items: TPurchaseItemInput[]): TPurchaseTaxObligationAmounts {
	const amounts: TPurchaseTaxObligationAmounts = { totalCentavos: 0, custoPorDestinacao: {}, creditoCentavos: 0, despesaCentavos: 0, uf: null };
	for (const item of items) {
		if (item.deletar) continue;
		const destination = item.destinacao ?? "REVENDA";
		for (const modifier of item.modificadoresCusto?.modificadores ?? []) {
			if (getModifierCounterparty(modifier) !== "FISCO") continue;
			if (modifier.efeito !== "ACRESCIMO") throw new createHttpError.BadRequest("Um valor devido ao fisco não pode ser redução.");
			amounts.totalCentavos += modifier.valorCentavos;
			amounts.uf ??= modifier.memoriaCalculo?.uf ?? null;
			if (modifier.tratamento === "CUSTO_ESTOQUE")
				amounts.custoPorDestinacao[destination] = (amounts.custoPorDestinacao[destination] ?? 0) + modifier.valorCentavos;
			else if (modifier.tratamento === "CREDITO_TRIBUTARIO") amounts.creditoCentavos += modifier.valorCentavos;
			else amounts.despesaCentavos += modifier.valorCentavos;
		}
	}
	return amounts;
}

type TTaxObligationAccounts = {
	estoqueContaId: string;
	contasPorDestinacao: Partial<Record<TAcquisitionNatureEnum, string | null>>;
	creditoTributarioContaId: string | null;
	despesaPeriodoContaId: string | null;
	obrigacoesTributariasContaId: string;
};

function buildTaxObligationLines(amounts: TPurchaseTaxObligationAmounts, accounts: TTaxObligationAccounts): TAccountingEntryLineInput[] {
	const lines: TAccountingEntryLineInput[] = [];
	let order = 0;
	const debit = (accountId: string | null | undefined, cents: number, descricao: string, extra: Record<string, unknown>) => {
		if (cents <= 0) return;
		if (!accountId)
			throw new createHttpError.BadRequest(
				`Conta contábil não configurada para ${descricao.toLowerCase()}. Defina-a em Configurações › Financeiro › Lançamentos padrão › Compras.`,
			);
		lines.push({
			contaContabilId: accountId,
			natureza: "DEBITO",
			valor: centsToMoney(cents),
			descricao,
			ordem: order++,
			metadados: { origem: "TRIBUTO_COMPRA", ...extra },
		});
	};
	for (const [destination, cents] of Object.entries(amounts.custoPorDestinacao) as [TAcquisitionNatureEnum, number][]) {
		debit(
			destination === "REVENDA" ? accounts.estoqueContaId : accounts.contasPorDestinacao[destination],
			cents,
			`Tributo de compra capitalizado (${destination.toLowerCase().replace("_", " e ")})`,
			{ tratamento: "CUSTO_ESTOQUE", destinacao: destination },
		);
	}
	debit(accounts.creditoTributarioContaId, amounts.creditoCentavos, "Tributo de compra recuperável", { tratamento: "CREDITO_TRIBUTARIO" });
	debit(accounts.despesaPeriodoContaId, amounts.despesaCentavos, "Tributo de compra como despesa", { tratamento: "DESPESA_PERIODO" });
	lines.push({
		contaContabilId: accounts.obrigacoesTributariasContaId,
		natureza: "CREDITO",
		valor: centsToMoney(amounts.totalCentavos),
		descricao: "Obrigações tributárias",
		ordem: order,
		metadados: { origem: "TRIBUTO_COMPRA", contrapartida: "FISCO" },
	});
	assertAccountingEntryLinesBalanced({ entryValue: centsToMoney(amounts.totalCentavos), lines });
	return lines;
}

async function resolveObligationsAccountId({
	trx,
	organizationId,
	defaults,
}: {
	trx: DBTransaction;
	organizationId: string;
	defaults: TOrganizationDefaults["contabilidade"]["lancamentosPadrao"]["compras"] | undefined;
}) {
	if (defaults?.creditoTributoCompraContaId) return defaults.creditoTributoCompraContaId;
	const key = defaults?.creditoTributoCompraContaKey ?? RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.compras.creditoTributoCompraKey;
	const code = getDefaultAccountChartCodeByKey(key);
	const account = code
		? await trx.query.accountsCharts.findFirst({
				where: (fields, { and, eq }) => and(eq(fields.organizacaoId, organizationId), eq(fields.codigo, code)),
				columns: { id: true },
			})
		: null;
	if (!account)
		throw new createHttpError.BadRequest(
			"Conta de obrigações tributárias não configurada. Defina-a em Configurações › Financeiro › Lançamentos padrão › Compras.",
		);
	return account.id;
}

async function findTaxObligationEntry(trx: DBTransaction, organizationId: string, purchaseId: string) {
	return trx.query.accountingEntries.findFirst({
		where: and(
			eq(accountingEntries.organizacaoId, organizationId),
			eq(accountingEntries.chaveIdempotencia, buildTaxObligationIdempotencyKey(purchaseId)),
		),
		with: { transacoesFinanceiras: { columns: { id: true, dataEfetivacao: true, valor: true } } },
	});
}

/** Remove o lançamento do fisco quando a compra deixa de estar recebida. Guia paga não some sozinha. */
export async function removePurchaseTaxObligationEntry({
	trx,
	organizationId,
	purchaseId,
}: {
	trx: DBTransaction;
	organizationId: string;
	purchaseId: string;
}) {
	const existing = await findTaxObligationEntry(trx, organizationId, purchaseId);
	if (!existing) return;
	if (existing.transacoesFinanceiras.some((transaction) => transaction.dataEfetivacao))
		throw new createHttpError.BadRequest(
			"A guia de tributos desta compra já foi paga. Estorne o pagamento antes de desfazer o recebimento ou cancelar.",
		);
	await trx.delete(financialTransactions).where(eq(financialTransactions.lancamentoContabilId, existing.id));
	await trx.delete(accountingEntryLines).where(eq(accountingEntryLines.lancamentoContabilId, existing.id));
	await trx.delete(accountingEntries).where(eq(accountingEntries.id, existing.id));
}

/**
 * Cria ou atualiza o lançamento do fisco de uma compra recebida. Sem valor devido, remove o que
 * existia. A guia (uma transação SAIDA) nasce com vencimento sugerido pelo prazo da UF e é
 * reprogramável no Financeiro; depois de paga, o valor não é mais tocado.
 */
export async function syncPurchaseTaxObligationEntry({
	trx,
	organizationId,
	userId,
	purchaseId,
	purchaseTitle,
	items,
	dataCompetencia,
	accounts,
	defaults,
}: {
	trx: DBTransaction;
	organizationId: string;
	userId: string;
	purchaseId: string;
	purchaseTitle: string;
	items: TPurchaseItemInput[];
	dataCompetencia: Date;
	accounts: Omit<TTaxObligationAccounts, "obrigacoesTributariasContaId">;
	defaults: TOrganizationDefaults["contabilidade"]["lancamentosPadrao"]["compras"] | undefined;
}) {
	const amounts = getPurchaseTaxObligationAmounts(items);
	if (amounts.totalCentavos === 0) {
		await removePurchaseTaxObligationEntry({ trx, organizationId, purchaseId });
		return null;
	}
	const obrigacoesTributariasContaId = await resolveObligationsAccountId({ trx, organizationId, defaults });
	const lines = buildTaxObligationLines(amounts, { ...accounts, obrigacoesTributariasContaId });
	const valor = centsToMoney(amounts.totalCentavos);
	const titulo = `Tributos de compra (DIFAL/antecipação) — ${purchaseTitle}`;
	const existing = await findTaxObligationEntry(trx, organizationId, purchaseId);

	let entryId: string;
	if (existing) {
		entryId = existing.id;
		const paid = existing.transacoesFinanceiras.some((transaction) => transaction.dataEfetivacao);
		if (paid && moneyToCents(existing.valor) !== amounts.totalCentavos)
			throw new createHttpError.BadRequest("A guia de tributos desta compra já foi paga com outro valor. Ajuste o lançamento no Financeiro.");
		await trx
			.update(accountingEntries)
			.set({
				titulo,
				valor,
				dataCompetencia,
				idContaDebito: lines[0].contaContabilId,
				idContaCredito: obrigacoesTributariasContaId,
				compraId: purchaseId,
			})
			.where(eq(accountingEntries.id, entryId));
		if (!paid) {
			// Uma guia só: reprogramar o vencimento é livre, o valor acompanha a compra.
			await trx
				.update(financialTransactions)
				.set({ valor, valorBase: valor })
				.where(and(eq(financialTransactions.lancamentoContabilId, entryId), isNotNull(financialTransactions.id)));
		}
	} else {
		const [inserted] = await trx
			.insert(accountingEntries)
			.values({
				organizacaoId: organizationId,
				compraId: purchaseId,
				origemTipo: "TRIBUTO_COMPRA",
				titulo,
				idContaDebito: lines[0].contaContabilId,
				idContaCredito: obrigacoesTributariasContaId,
				valor,
				dataCompetencia,
				chaveIdempotencia: buildTaxObligationIdempotencyKey(purchaseId),
				autorId: userId,
			})
			.returning({ id: accountingEntries.id });
		if (!inserted) throw new createHttpError.InternalServerError("Erro ao criar o lançamento de tributos da compra.");
		entryId = inserted.id;
		const prazoDias = (amounts.uf ? getUfIcmsParameters(amounts.uf, dataCompetencia)?.prazoVencimentoDias : null) ?? 30;
		const dataPrevisao = new Date(dataCompetencia.getTime() + prazoDias * 24 * 60 * 60 * 1000);
		await trx.insert(financialTransactions).values({
			organizacaoId: organizationId,
			lancamentoContabilId: entryId,
			titulo: `Guia de ICMS${amounts.uf ? ` ${amounts.uf}` : ""} — ${purchaseTitle}`,
			tipo: "SAIDA",
			valor,
			valorBase: valor,
			metodo: "BOLETO",
			dataPrevisao,
			dataEfetivacao: null,
			parcela: 1,
			totalParcelas: 1,
			autorId: userId,
		});
	}
	await syncAccountingEntryLines({ trx, organizationId, accountingEntryId: entryId, entryValue: valor, lines });
	return entryId;
}
