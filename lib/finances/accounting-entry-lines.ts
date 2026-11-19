import { moneyToCents, centsToMoney } from "@/lib/purchase/costing";
import type { DBTransaction } from "@/services/drizzle";
import { accountingEntryLines } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";

export type TAccountingEntryLineInput = {
	contaContabilId: string;
	natureza: "DEBITO" | "CREDITO";
	valor: number;
	valorPrevisto?: number | null;
	descricao?: string | null;
	ordem?: number;
	metadados?: Record<string, unknown> | null;
};

export type TPurchaseAccountingAmounts = {
	valorFinanceiro: number;
	/** Custo dos itens que entram no estoque (destino padrão). */
	valorCustoEstoque: number;
	valorCreditoTributario: number;
	valorDespesaPeriodo: number;
	/**
	 * Custo dos itens com destino próprio (manutenção, imobilizado, uso e consumo…), somado por conta.
	 * É o mesmo custo capitalizável do item (`valorTotalCusto`), só que debitado na conta escolhida na
	 * entrada da nota em vez da conta de estoque. Ver lib/purchase/destination.ts.
	 */
	custosPorDestino?: { contaContabilId: string; valor: number }[];
};

export type TPurchaseAccountingAccounts = {
	estoqueContaId: string;
	fornecedoresContaId: string;
	creditoTributarioContaId?: string | null;
	despesaPeriodoContaId?: string | null;
};

export function assertAccountingEntryLinesBalanced({ entryValue, lines }: { entryValue: number; lines: TAccountingEntryLineInput[] }) {
	if (lines.length < 2) throw new Error("O lançamento contábil precisa ter ao menos uma linha de débito e uma de crédito.");
	const debitCents = lines.filter((line) => line.natureza === "DEBITO").reduce((total, line) => total + moneyToCents(line.valor), 0);
	const creditCents = lines.filter((line) => line.natureza === "CREDITO").reduce((total, line) => total + moneyToCents(line.valor), 0);
	const entryCents = moneyToCents(entryValue);

	if (debitCents !== creditCents) throw new Error("As linhas contábeis não estão balanceadas.");
	if (debitCents !== entryCents) throw new Error("O total das linhas contábeis não corresponde ao valor do lançamento.");
}

export function buildDefaultAccountingEntryLines({
	debitAccountId,
	creditAccountId,
	value,
	expectedValue,
}: {
	debitAccountId: string;
	creditAccountId: string;
	value: number;
	expectedValue?: number | null;
}): TAccountingEntryLineInput[] {
	const lines: TAccountingEntryLineInput[] = [
		{ contaContabilId: debitAccountId, natureza: "DEBITO", valor: value, valorPrevisto: expectedValue, ordem: 0 },
		{ contaContabilId: creditAccountId, natureza: "CREDITO", valor: value, valorPrevisto: expectedValue, ordem: 1 },
	];
	assertAccountingEntryLinesBalanced({ entryValue: value, lines });
	return lines;
}

/**
 * Traduz destinos econômicos já calculados em contas. Modificadores não atravessam esta interface:
 * a contabilidade recebe valores agregados por tratamento e o plano de contas decide a linha real.
 */
export function buildPurchaseAccountingEntryLines({
	amounts,
	accounts,
}: {
	amounts: TPurchaseAccountingAmounts;
	accounts: TPurchaseAccountingAccounts;
}): TAccountingEntryLineInput[] {
	const lines: TAccountingEntryLineInput[] = [];
	let order = 0;
	const appendDebit = ({
		accountId,
		value,
		description,
		treatment,
	}: {
		accountId?: string | null;
		value: number;
		description: string;
		treatment: string;
	}) => {
		const valueCents = moneyToCents(value);
		if (valueCents === 0) return;
		if (valueCents < 0) throw new Error("Valores contábeis por tratamento não podem ser negativos.");
		// Sem flag para desligar as linhas, esta é a falha que o operador realmente encontra: a mensagem
		// precisa dizer onde resolver, não apenas o que faltou.
		if (!accountId)
			throw new Error(`Conta contábil não configurada para ${description.toLowerCase()}. Defina-a em Configurações › Financeiro › Lançamentos padrão › Compras.`);
		lines.push({
			contaContabilId: accountId,
			natureza: "DEBITO",
			valor: centsToMoney(valueCents),
			descricao: description,
			ordem: order++,
			metadados: { origem: "COMPRA", tratamento: treatment },
		});
	};

	appendDebit({
		accountId: accounts.estoqueContaId,
		value: amounts.valorCustoEstoque,
		description: "Custo de estoque da compra",
		treatment: "CUSTO_ESTOQUE",
	});
	for (const destination of amounts.custosPorDestino ?? []) {
		const valueCents = moneyToCents(destination.valor);
		if (valueCents === 0) continue;
		if (valueCents < 0) throw new Error("Valores contábeis por destino não podem ser negativos.");
		lines.push({
			contaContabilId: destination.contaContabilId,
			natureza: "DEBITO",
			valor: centsToMoney(valueCents),
			descricao: "Custo da compra com destino próprio",
			ordem: order++,
			metadados: { origem: "COMPRA", tratamento: "CUSTO_ESTOQUE", destino: "CONTA_PROPRIA" },
		});
	}
	appendDebit({
		accountId: accounts.creditoTributarioContaId,
		value: amounts.valorCreditoTributario,
		description: "Créditos tributários da compra",
		treatment: "CREDITO_TRIBUTARIO",
	});
	appendDebit({
		accountId: accounts.despesaPeriodoContaId,
		value: amounts.valorDespesaPeriodo,
		description: "Despesas do período da compra",
		treatment: "DESPESA_PERIODO",
	});
	lines.push({
		contaContabilId: accounts.fornecedoresContaId,
		natureza: "CREDITO",
		valor: amounts.valorFinanceiro,
		descricao: "Fornecedores",
		ordem: order,
		metadados: { origem: "COMPRA", contrapartida: true },
	});

	assertAccountingEntryLinesBalanced({ entryValue: amounts.valorFinanceiro, lines });
	return lines;
}

/**
 * Linhas do estorno de um lançamento: cada linha original volta com a natureza invertida, na mesma
 * conta e no mesmo valor — o que funciona para partidas compostas (compra com estoque, destinos
 * próprios e tributos), onde inverter só o par débito/crédito legado perderia as demais pernas.
 *
 * `retained` é a parte do valor que o estorno NÃO devolve à contrapartida e reconhece numa conta
 * própria (no cancelamento de compra: parcelas pagas sem devolução e parcelas mantidas — o custo do
 * cancelamento). Ela é descontada dos débitos que revertem os créditos originais (a contrapartida,
 * ex. Fornecedores) e vira um débito na conta informada. O estorno continua balanceado e com o mesmo
 * valor do lançamento original.
 */
export function buildReversalAccountingEntryLines({
	lines,
	retained,
}: {
	lines: Pick<TAccountingEntryLineInput, "contaContabilId" | "natureza" | "valor" | "descricao" | "metadados">[];
	retained?: { contaContabilId: string; valor: number; descricao: string } | null;
}): { entryValue: number; lines: TAccountingEntryLineInput[] } {
	const reversed = lines.map((line) => ({
		contaContabilId: line.contaContabilId,
		natureza: line.natureza === "DEBITO" ? ("CREDITO" as const) : ("DEBITO" as const),
		valueCents: moneyToCents(line.valor),
		descricao: line.descricao ? `Estorno: ${line.descricao}` : "Estorno",
		metadados: { ...(line.metadados ?? {}), estorno: true },
		revertsCounterpart: line.natureza === "CREDITO",
	}));
	const entryCents = reversed.filter((line) => line.natureza === "CREDITO").reduce((total, line) => total + line.valueCents, 0);

	const retainedTotalCents = retained ? moneyToCents(retained.valor) : 0;
	if (retainedTotalCents < 0) throw new Error("O valor retido no estorno não pode ser negativo.");
	if (retainedTotalCents > entryCents) throw new Error("O valor retido no estorno não pode passar do valor do lançamento.");
	let remainingCents = retainedTotalCents;
	for (const line of reversed) {
		if (remainingCents === 0) break;
		if (!line.revertsCounterpart) continue;
		const taken = Math.min(line.valueCents, remainingCents);
		line.valueCents -= taken;
		remainingCents -= taken;
	}

	const result: TAccountingEntryLineInput[] = [];
	let order = 0;
	for (const line of reversed) {
		if (line.valueCents === 0) continue;
		result.push({
			contaContabilId: line.contaContabilId,
			natureza: line.natureza,
			valor: centsToMoney(line.valueCents),
			descricao: line.descricao,
			ordem: order++,
			metadados: line.metadados,
		});
	}
	if (retained && retainedTotalCents > 0)
		result.push({
			contaContabilId: retained.contaContabilId,
			natureza: "DEBITO",
			valor: centsToMoney(retainedTotalCents),
			descricao: retained.descricao,
			ordem: order++,
			metadados: { estorno: true, retido: true },
		});

	const entryValue = centsToMoney(entryCents);
	assertAccountingEntryLinesBalanced({ entryValue, lines: result });
	return { entryValue, lines: result };
}

/**
 * Caminho padrão para origens de par único (venda, transferência, perda, fatura de cartão…): o
 * lançamento continua nascendo com `idContaDebito`/`idContaCredito`, e este helper materializa o
 * mesmo par como linhas. Quando os leitores só consultarem linhas, o par vira sombra derivada e a
 * remoção das colunas é uma migração trivial. Ver ADR-0001.
 */
export async function writeDefaultAccountingEntryLines({
	trx,
	organizationId,
	accountingEntryId,
	entryValue,
	expectedValue,
	debitAccountId,
	creditAccountId,
}: {
	trx: DBTransaction;
	organizationId: string;
	accountingEntryId: string;
	entryValue: number;
	expectedValue?: number | null;
	debitAccountId: string;
	creditAccountId: string;
}) {
	await syncAccountingEntryLines({
		trx,
		organizationId,
		accountingEntryId,
		entryValue,
		lines: buildDefaultAccountingEntryLines({ debitAccountId, creditAccountId, value: entryValue, expectedValue }),
	});
}

export async function syncAccountingEntryLines({
	trx,
	organizationId,
	accountingEntryId,
	entryValue,
	lines,
}: {
	trx: DBTransaction;
	organizationId: string;
	accountingEntryId: string;
	entryValue: number;
	lines: TAccountingEntryLineInput[];
}) {
	assertAccountingEntryLinesBalanced({ entryValue, lines });

	await trx
		.delete(accountingEntryLines)
		.where(and(eq(accountingEntryLines.lancamentoContabilId, accountingEntryId), eq(accountingEntryLines.organizacaoId, organizationId)));
	await trx.insert(accountingEntryLines).values(
		lines.map((line) => ({
			organizacaoId: organizationId,
			lancamentoContabilId: accountingEntryId,
			contaContabilId: line.contaContabilId,
			natureza: line.natureza,
			valor: line.valor,
			valorPrevisto: line.valorPrevisto ?? null,
			descricao: line.descricao ?? null,
			ordem: line.ordem ?? 0,
			metadados: line.metadados ?? null,
		})),
	);
}
