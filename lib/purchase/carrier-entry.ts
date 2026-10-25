import { assertAccountingEntryLinesBalanced, syncAccountingEntryLines, type TAccountingEntryLineInput } from "@/lib/finances/accounting-entry-lines";
import { centsToMoney, getModifierCounterparty, moneyToCents } from "@/lib/purchase/costing";
import type { TPurchaseItemInput } from "@/lib/purchase-processing/process-purchase-item-stock";
import type { TAcquisitionNatureEnum } from "@/schemas/enums";
import type { TPurchaseImportedDocument } from "@/schemas/purchases";
import type { DBTransaction } from "@/services/drizzle";
import { accountingEntries, accountingEntryLines, financialTransactions } from "@/services/drizzle/schema";
import { and, eq, like } from "drizzle-orm";
import createHttpError from "http-errors";

/**
 * Dívida com a transportadora nascida de um CT-e (ADR-0002, decisão 5 e fluxo E): um lançamento por
 * CT-e, origem COMPRA, contraparte `fornecedorId` = transportadora, identificado por
 * `chaveIdempotencia = compra:{id}:TRANSPORTADORA:{documentoRef}`.
 *
 * Duas fontes para o valor, decididas pelo snapshot do documento (`frete.capitalizado`):
 * - capitalizado: o frete virou componentes `TRANSPORTADORA` nos itens; o lançamento nasce com o
 *   recebimento e some sem ele, como o do fisco.
 * - não capitalizado (CT-e anexado a compra já recebida): o custo do estoque não muda em silêncio
 *   (ADR-0001), então o frete é despesa do período (menos o crédito de ICMS) e o lançamento existe
 *   independentemente do recebimento.
 */

export const CARRIER_IDEMPOTENCY_PREFIX = "TRANSPORTADORA";

export function buildCarrierIdempotencyKey(purchaseId: string, documentoRef: string) {
	return `compra:${purchaseId}:${CARRIER_IDEMPOTENCY_PREFIX}:${documentoRef}`;
}

export type TPurchaseCarrierAmounts = {
	totalCentavos: number;
	custoPorDestinacao: Partial<Record<TAcquisitionNatureEnum, number>>;
	creditoCentavos: number;
	despesaCentavos: number;
};

/** Componentes TRANSPORTADORA do documento, somados pelo destino contábil de cada item. */
export function getCarrierAmountsFromItems(items: TPurchaseItemInput[], documentoRef: string): TPurchaseCarrierAmounts {
	const amounts: TPurchaseCarrierAmounts = { totalCentavos: 0, custoPorDestinacao: {}, creditoCentavos: 0, despesaCentavos: 0 };
	for (const item of items) {
		if (item.deletar) continue;
		const destination = item.destinacao ?? "REVENDA";
		for (const modifier of item.modificadoresCusto?.modificadores ?? []) {
			if (getModifierCounterparty(modifier) !== "TRANSPORTADORA" || modifier.documentoRef !== documentoRef) continue;
			if (modifier.efeito !== "ACRESCIMO") throw new createHttpError.BadRequest("Um valor devido à transportadora não pode ser redução.");
			amounts.totalCentavos += modifier.valorCentavos;
			if (modifier.tratamento === "CUSTO_ESTOQUE")
				amounts.custoPorDestinacao[destination] = (amounts.custoPorDestinacao[destination] ?? 0) + modifier.valorCentavos;
			else if (modifier.tratamento === "CREDITO_TRIBUTARIO") amounts.creditoCentavos += modifier.valorCentavos;
			else amounts.despesaCentavos += modifier.valorCentavos;
		}
	}
	return amounts;
}

/** CT-e anexado depois do recebimento: frete como despesa, crédito de ICMS preservado. */
export function getCarrierAmountsFromDocument(document: TPurchaseImportedDocument): TPurchaseCarrierAmounts {
	const frete = document.frete;
	if (!frete) return { totalCentavos: 0, custoPorDestinacao: {}, creditoCentavos: 0, despesaCentavos: 0 };
	const creditoCentavos = Math.min(frete.icmsCreditoCentavos, frete.valorCentavos);
	return { totalCentavos: frete.valorCentavos, custoPorDestinacao: {}, creditoCentavos, despesaCentavos: frete.valorCentavos - creditoCentavos };
}

export type TCarrierEntryAccounts = {
	estoqueContaId: string;
	fornecedoresContaId: string;
	contasPorDestinacao: Partial<Record<TAcquisitionNatureEnum, string | null>>;
	creditoTributarioContaId: string | null;
	despesaPeriodoContaId: string | null;
};

function buildCarrierLines(amounts: TPurchaseCarrierAmounts, accounts: TCarrierEntryAccounts): TAccountingEntryLineInput[] {
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
			metadados: { origem: "COMPRA", contrapartida: "TRANSPORTADORA", ...extra },
		});
	};
	for (const [destination, cents] of Object.entries(amounts.custoPorDestinacao) as [TAcquisitionNatureEnum, number][]) {
		debit(
			destination === "REVENDA" ? accounts.estoqueContaId : accounts.contasPorDestinacao[destination],
			cents,
			`Frete capitalizado (${destination.toLowerCase().replace("_", " e ")})`,
			{ tratamento: "CUSTO_ESTOQUE", destinacao: destination },
		);
	}
	debit(accounts.creditoTributarioContaId, amounts.creditoCentavos, "Crédito de ICMS do frete", { tratamento: "CREDITO_TRIBUTARIO" });
	debit(accounts.despesaPeriodoContaId, amounts.despesaCentavos, "Frete como despesa do período", { tratamento: "DESPESA_PERIODO" });
	lines.push({
		contaContabilId: accounts.fornecedoresContaId,
		natureza: "CREDITO",
		valor: centsToMoney(amounts.totalCentavos),
		descricao: "Transportadora",
		ordem: order,
		metadados: { origem: "COMPRA", contrapartida: "TRANSPORTADORA" },
	});
	assertAccountingEntryLinesBalanced({ entryValue: centsToMoney(amounts.totalCentavos), lines });
	return lines;
}

async function findCarrierEntry(trx: DBTransaction, organizationId: string, key: string) {
	return trx.query.accountingEntries.findFirst({
		where: and(eq(accountingEntries.organizacaoId, organizationId), eq(accountingEntries.chaveIdempotencia, key)),
		with: { transacoesFinanceiras: { columns: { id: true, dataEfetivacao: true, valor: true } } },
	});
}

async function deleteEntry(trx: DBTransaction, entryId: string) {
	await trx.delete(financialTransactions).where(eq(financialTransactions.lancamentoContabilId, entryId));
	await trx.delete(accountingEntryLines).where(eq(accountingEntryLines.lancamentoContabilId, entryId));
	await trx.delete(accountingEntries).where(eq(accountingEntries.id, entryId));
}

/** Remove o lançamento de um CT-e; frete já pago não some sozinho. */
async function removeCarrierEntry({ trx, organizationId, key }: { trx: DBTransaction; organizationId: string; key: string }) {
	const existing = await findCarrierEntry(trx, organizationId, key);
	if (!existing) return;
	if (existing.transacoesFinanceiras.some((transaction) => transaction.dataEfetivacao))
		throw new createHttpError.BadRequest(
			"O frete desta compra já foi pago à transportadora. Estorne o pagamento antes de desfazer o recebimento ou cancelar.",
		);
	await deleteEntry(trx, existing.id);
}

/** Compra cancelada: todos os lançamentos de transportadora saem (ou a operação é recusada se algum foi pago). */
export async function removePurchaseCarrierEntries({
	trx,
	organizationId,
	purchaseId,
}: {
	trx: DBTransaction;
	organizationId: string;
	purchaseId: string;
}) {
	const entries = await trx.query.accountingEntries.findMany({
		where: and(
			eq(accountingEntries.organizacaoId, organizationId),
			like(accountingEntries.chaveIdempotencia, `compra:${purchaseId}:${CARRIER_IDEMPOTENCY_PREFIX}:%`),
		),
		columns: { chaveIdempotencia: true },
	});
	for (const entry of entries) if (entry.chaveIdempotencia) await removeCarrierEntry({ trx, organizationId, key: entry.chaveIdempotencia });
}

export function getCarrierDocuments(documents: TPurchaseImportedDocument[] | null | undefined) {
	return (documents ?? []).filter((document) => document.modelo === "CTE" && !!document.frete && document.frete.valorCentavos > 0);
}

/**
 * Cria, atualiza ou remove o lançamento de cada CT-e da compra. Reprogramar o vencimento é livre no
 * Financeiro; depois de pago, o valor não é mais tocado (divergência vira erro).
 */
export async function syncPurchaseCarrierEntries({
	trx,
	organizationId,
	userId,
	purchaseId,
	purchaseTitle,
	items,
	documents,
	purchaseIsReceived,
	dataCompetencia,
	accounts,
}: {
	trx: DBTransaction;
	organizationId: string;
	userId: string;
	purchaseId: string;
	purchaseTitle: string;
	items: TPurchaseItemInput[];
	documents: TPurchaseImportedDocument[] | null | undefined;
	purchaseIsReceived: boolean;
	dataCompetencia: Date;
	accounts: TCarrierEntryAccounts;
}) {
	const entryIds: string[] = [];
	for (const document of getCarrierDocuments(documents)) {
		const frete = document.frete!;
		const key = buildCarrierIdempotencyKey(purchaseId, document.referencia);
		const amounts = frete.capitalizado ? getCarrierAmountsFromItems(items, document.referencia) : getCarrierAmountsFromDocument(document);
		// Frete capitalizado acompanha o estoque: só existe como lançamento enquanto a compra está recebida.
		if (amounts.totalCentavos === 0 || (frete.capitalizado && !purchaseIsReceived)) {
			await removeCarrierEntry({ trx, organizationId, key });
			continue;
		}
		const lines = buildCarrierLines(amounts, accounts);
		const valor = centsToMoney(amounts.totalCentavos);
		const label = document.numero ? `CT-e nº ${document.numero}` : "CT-e";
		const titulo = `Frete (${label}) — ${purchaseTitle}`;
		const existing = await findCarrierEntry(trx, organizationId, key);
		let entryId: string;
		if (existing) {
			entryId = existing.id;
			const paid = existing.transacoesFinanceiras.some((transaction) => transaction.dataEfetivacao);
			if (paid && moneyToCents(existing.valor) !== amounts.totalCentavos)
				throw new createHttpError.BadRequest("O frete desta compra já foi pago com outro valor. Ajuste o lançamento no Financeiro.");
			await trx
				.update(accountingEntries)
				.set({
					titulo,
					valor,
					idContaDebito: lines[0].contaContabilId,
					idContaCredito: accounts.fornecedoresContaId,
					compraId: purchaseId,
					fornecedorId: frete.transportadoraFornecedorId ?? null,
				})
				.where(eq(accountingEntries.id, entryId));
			if (!paid) await trx.update(financialTransactions).set({ valor, valorBase: valor }).where(eq(financialTransactions.lancamentoContabilId, entryId));
		} else {
			const [inserted] = await trx
				.insert(accountingEntries)
				.values({
					organizacaoId: organizationId,
					compraId: purchaseId,
					fornecedorId: frete.transportadoraFornecedorId ?? null,
					origemTipo: "COMPRA",
					titulo,
					anotacoes: frete.capitalizado ? null : "Frete anexado após o recebimento: lançado como despesa, sem alterar o custo do estoque (ADR-0001).",
					idContaDebito: lines[0].contaContabilId,
					idContaCredito: accounts.fornecedoresContaId,
					valor,
					dataCompetencia,
					chaveIdempotencia: key,
					autorId: userId,
				})
				.returning({ id: accountingEntries.id });
			if (!inserted) throw new createHttpError.InternalServerError("Erro ao criar o lançamento do frete da compra.");
			entryId = inserted.id;
			// O CT-e não traz duplicatas: vencimento sugerido em 30 dias, reprogramável no Financeiro.
			const dataPrevisao = new Date(dataCompetencia.getTime() + 30 * 24 * 60 * 60 * 1000);
			await trx.insert(financialTransactions).values({
				organizacaoId: organizationId,
				lancamentoContabilId: entryId,
				titulo: `Frete ${label}${frete.transportadoraNome ? ` — ${frete.transportadoraNome}` : ""}`,
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
		entryIds.push(entryId);
	}
	return entryIds;
}
