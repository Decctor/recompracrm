import { moneyToCents, centsToMoney } from "@/lib/purchase/costing";
import type { TAcquisitionNatureEnum } from "@/schemas/enums";
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
	// Custo capitalizado de TODAS as destinações; `custoPorDestinacao` é a abertura (ADR-0002).
	valorCustoEstoque: number;
	custoPorDestinacao?: Partial<Record<TAcquisitionNatureEnum, number>>;
	valorCreditoTributario: number;
	valorDespesaPeriodo: number;
};

export type TPurchaseAccountingAccounts = {
	estoqueContaId: string;
	fornecedoresContaId: string;
	creditoTributarioContaId?: string | null;
	despesaPeriodoContaId?: string | null;
	// Débito do custo por destinação; REVENDA (e qualquer ausente) cai em `estoqueContaId`.
	contasPorDestinacao?: Partial<Record<TAcquisitionNatureEnum, string | null>>;
};

const DESTINATION_DESCRIPTIONS: Record<TAcquisitionNatureEnum, string> = {
	REVENDA: "Custo de estoque da compra",
	INSUMO: "Custo de insumos da compra",
	USO_CONSUMO: "Material de uso e consumo da compra",
	ATIVO_IMOBILIZADO: "Ativo imobilizado da compra",
};
const DESTINATION_ORDER: TAcquisitionNatureEnum[] = ["REVENDA", "INSUMO", "USO_CONSUMO", "ATIVO_IMOBILIZADO"];

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
		destination,
	}: {
		accountId?: string | null;
		value: number;
		description: string;
		treatment: string;
		destination?: TAcquisitionNatureEnum;
	}) => {
		const valueCents = moneyToCents(value);
		if (valueCents === 0) return;
		if (valueCents < 0) throw new Error("Valores contábeis por tratamento não podem ser negativos.");
		// Sem flag para desligar as linhas, esta é a falha que o operador realmente encontra: a mensagem
		// precisa dizer onde resolver, não apenas o que faltou.
		if (!accountId)
			throw new Error(
				`Conta contábil não configurada para ${description.toLowerCase()}. Defina-a em Configurações › Financeiro › Lançamentos padrão › Compras.`,
			);
		lines.push({
			contaContabilId: accountId,
			natureza: "DEBITO",
			valor: centsToMoney(valueCents),
			descricao: description,
			ordem: order++,
			metadados: { origem: "COMPRA", tratamento: treatment, ...(destination ? { destinacao: destination } : {}) },
		});
	};

	// Uma linha por destinação com valor. Sem abertura (compras anteriores ao ADR-0002), tudo é revenda.
	const costByDestination = amounts.custoPorDestinacao ?? { REVENDA: amounts.valorCustoEstoque };
	const openedCents = DESTINATION_ORDER.reduce((total, destination) => total + moneyToCents(costByDestination[destination] ?? 0), 0);
	if (openedCents !== moneyToCents(amounts.valorCustoEstoque))
		throw new Error("A abertura do custo por destinação não fecha com o custo total da compra.");
	for (const destination of DESTINATION_ORDER) {
		const value = costByDestination[destination] ?? 0;
		appendDebit({
			accountId: destination === "REVENDA" ? accounts.estoqueContaId : (accounts.contasPorDestinacao?.[destination] ?? null),
			value,
			description: DESTINATION_DESCRIPTIONS[destination],
			treatment: "CUSTO_ESTOQUE",
			destination,
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
