import { assertAccountingEntryLinesBalanced, syncAccountingEntryLines, type TAccountingEntryLineInput } from "@/lib/finances/accounting-entry-lines";
import { resolvePurchaseAccountingAccountIds, resolvePurchaseDestinationAccountIds } from "@/lib/purchase/accounting-accounts";
import { calculatePurchaseItemCost, centsToMoney, getModifierCounterparty, moneyToCents } from "@/lib/purchase/costing";
import { applyPurchaseItemStockExit } from "@/lib/purchase-processing/process-purchase-item-stock";
import type { TAcquisitionNatureEnum } from "@/schemas/enums";
import { PurchaseImportedDocumentsSnapshotSchema, PurchaseReturnsSnapshotSchema, type TPurchaseReturn } from "@/schemas/purchases";
import type { DBTransaction } from "@/services/drizzle";
import {
	accountingEntries,
	financialTransactions,
	organizations,
	productStockLots,
	purchases,
	type TPurchaseItemEntity,
} from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { randomUUID } from "node:crypto";

/**
 * Devolução ao fornecedor (ADR-0002, Fase 8): parte de uma compra recebida volta. Sem entidade
 * nova — três efeitos sobre primitivos que já existem:
 *   1. saída de estoque dos itens devolvidos (lote da compra quando houver), ao custo da entrada;
 *   2. lançamento de crédito com o fornecedor (`compra:{id}:DEVOLUCAO:{ref}`, origem COMPRA,
 *      contraparte o fornecedor): D Fornecedores × C estoque/crédito/despesa, na proporção do item;
 *   3. snapshot em `purchases.devolucoes`, com a chave da NF-e de origem para a NF-e de devolução.
 * A emissão da NF-e de devolução de compra é passo à parte (não automatizado nesta fase).
 */

export function buildPurchaseReturnKey(purchaseId: string, referencia: string) {
	return `compra:${purchaseId}:DEVOLUCAO:${referencia}`;
}

type TReturnBucket = {
	fornecedorCentavos: number;
	custoPorDestinacao: Partial<Record<TAcquisitionNatureEnum, number>>;
	creditoCentavos: number;
	despesaCentavos: number;
};

/** Parcela de um item devolvido, por tratamento, excluindo o que é devido a terceiros (fisco, transportadora). */
function proportionalItemAmounts(item: TPurchaseItemEntity, quantidade: number): TReturnBucket {
	const result = calculatePurchaseItemCost(item);
	let thirdInventory = 0;
	let thirdCredit = 0;
	let thirdExpense = 0;
	for (const modifier of item.modificadoresCusto?.modificadores ?? []) {
		const counterparty = getModifierCounterparty(modifier);
		if (counterparty !== "FISCO" && counterparty !== "TRANSPORTADORA") continue;
		if (modifier.tratamento === "CUSTO_ESTOQUE") thirdInventory += modifier.valorCentavos;
		else if (modifier.tratamento === "CREDITO_TRIBUTARIO") thirdCredit += modifier.valorCentavos;
		else thirdExpense += modifier.valorCentavos;
	}
	const ratio = quantidade / item.quantidade;
	const share = (cents: number) => Math.round(cents * ratio);
	const fornecedorCentavos = share(moneyToCents(result.valorTotalLiquido));
	const creditoCentavos = share(moneyToCents(result.valorTotalCreditoTributario) - thirdCredit);
	const despesaCentavos = share(moneyToCents(result.valorTotalDespesaPeriodo) - thirdExpense);
	// O custo fecha a identidade pelo resto: fornecedor = custo + crédito + despesa.
	const custoCentavos = fornecedorCentavos - creditoCentavos - despesaCentavos;
	void thirdInventory;
	return { fornecedorCentavos, custoPorDestinacao: { [item.destinacao ?? "REVENDA"]: custoCentavos }, creditoCentavos, despesaCentavos };
}

export async function registerPurchaseReturn({
	trx,
	organizationId,
	userId,
	purchaseId,
	data,
	motivo,
	itens,
}: {
	trx: DBTransaction;
	organizationId: string;
	userId: string;
	purchaseId: string;
	data: Date;
	motivo: string;
	itens: { itemId: string; quantidade: number }[];
}) {
	const [locked] = await trx
		.select({ id: purchases.id })
		.from(purchases)
		.where(and(eq(purchases.id, purchaseId), eq(purchases.organizacaoId, organizationId)))
		.for("update");
	if (!locked) throw new createHttpError.NotFound("Compra não encontrada.");
	const purchase = await trx.query.purchases.findFirst({ where: eq(purchases.id, purchaseId), with: { itens: true } });
	if (!purchase) throw new createHttpError.NotFound("Compra não encontrada.");
	if (purchase.status !== "RECEBIDA" || !purchase.entregaDataRecebimentoEfetivacao)
		throw new createHttpError.BadRequest("Só uma compra recebida pode ter itens devolvidos. Antes do recebimento, basta ajustar os itens.");
	const existing = purchase.devolucoes ? PurchaseReturnsSnapshotSchema.parse(purchase.devolucoes).devolucoes : [];
	const returnedSoFar = new Map<string, number>();
	for (const previous of existing)
		for (const item of previous.itens) returnedSoFar.set(item.itemId, (returnedSoFar.get(item.itemId) ?? 0) + item.quantidade);

	const organization = await trx.query.organizations.findFirst({ where: eq(organizations.id, organizationId), columns: { configuracao: true } });
	const purchaseDefaults = organization?.configuracao.defaults.contabilidade.lancamentosPadrao.compras;
	const { debitAccountId: estoqueContaId, creditAccountId: fornecedoresContaId } = await resolvePurchaseAccountingAccountIds({
		trx,
		orgId: organizationId,
	});
	const contasPorDestinacao = await resolvePurchaseDestinationAccountIds({
		trx,
		organizationId,
		configured: purchaseDefaults?.contasDebitoPorDestinacao,
		needed: ["REVENDA", "INSUMO", "USO_CONSUMO", "ATIVO_IMOBILIZADO"],
	});

	const referencia = randomUUID();
	const total: TReturnBucket = { fornecedorCentavos: 0, custoPorDestinacao: {}, creditoCentavos: 0, despesaCentavos: 0 };
	const returnItems: TPurchaseReturn["itens"] = [];
	for (const requested of itens) {
		if (requested.quantidade <= 0) continue;
		const item = purchase.itens.find((candidate) => candidate.id === requested.itemId);
		if (!item) throw new createHttpError.BadRequest("Item da devolução não pertence a esta compra.");
		if (item.destinacao === "ATIVO_IMOBILIZADO")
			throw new createHttpError.BadRequest(
				`"${item.snapshotProdutoDescricao}" entrou como bem do ativo: devolva-o pela baixa em Produtos › Patrimônio.`,
			);
		const available = item.quantidade - (returnedSoFar.get(item.id) ?? 0);
		if (requested.quantidade > available + 1e-9)
			throw new createHttpError.BadRequest(`"${item.snapshotProdutoDescricao}": só ${available} disponível para devolução.`);

		// Saída de estoque ao custo da entrada, presa ao lote que a compra gerou quando ele existe.
		const lot = await trx.query.productStockLots.findFirst({
			where: and(eq(productStockLots.organizacaoId, organizationId), eq(productStockLots.compraItemId, item.id)),
		});
		if (lot) {
			if (lot.quantidadeAtual + 1e-9 < requested.quantidade)
				throw new createHttpError.BadRequest(`"${item.snapshotProdutoDescricao}": o lote ${lot.codigoLote} tem só ${lot.quantidadeAtual} em estoque.`);
			const nextQuantity = Math.round((lot.quantidadeAtual - requested.quantidade) * 1e6) / 1e6;
			await trx
				.update(productStockLots)
				.set({ quantidadeAtual: nextQuantity, status: nextQuantity <= 0 ? "ESGOTADO" : lot.status })
				.where(eq(productStockLots.id, lot.id));
		}
		await applyPurchaseItemStockExit({
			trx,
			organizationId,
			userId,
			purchaseId,
			purchaseItemId: item.id,
			produtoId: item.produtoId,
			produtoVarianteId: item.produtoVarianteId,
			quantidade: requested.quantidade,
			unitCost: item.valorUnitarioCusto ?? item.valorUnitarioLiquido ?? item.valorUnitarioBruto,
			reason: `Devolução ao fornecedor — ${motivo}`,
		});

		const amounts = proportionalItemAmounts(item, requested.quantidade);
		total.fornecedorCentavos += amounts.fornecedorCentavos;
		total.creditoCentavos += amounts.creditoCentavos;
		total.despesaCentavos += amounts.despesaCentavos;
		for (const [destination, cents] of Object.entries(amounts.custoPorDestinacao) as [TAcquisitionNatureEnum, number][])
			total.custoPorDestinacao[destination] = (total.custoPorDestinacao[destination] ?? 0) + cents;
		returnItems.push({
			itemId: item.id,
			produtoId: item.produtoId,
			produtoVarianteId: item.produtoVarianteId,
			descricao: item.snapshotProdutoDescricao,
			quantidade: requested.quantidade,
			valorTotalFornecedor: centsToMoney(amounts.fornecedorCentavos),
			valorTotalCusto: centsToMoney(Object.values(amounts.custoPorDestinacao).reduce((sum, cents) => sum + cents, 0)),
		});
	}
	if (returnItems.length === 0) throw new createHttpError.BadRequest("Informe a quantidade devolvida de ao menos um item.");

	// Lançamento de crédito com o fornecedor: a dívida diminui (ou vira crédito a receber).
	let entryId: string | null = null;
	if (total.fornecedorCentavos > 0) {
		const lines: TAccountingEntryLineInput[] = [];
		let order = 0;
		lines.push({
			contaContabilId: fornecedoresContaId,
			natureza: "DEBITO",
			valor: centsToMoney(total.fornecedorCentavos),
			descricao: "Fornecedores — devolução",
			ordem: order++,
			metadados: { origem: "COMPRA", tipo: "DEVOLUCAO" },
		});
		const credit = (accountId: string | null | undefined, cents: number, descricao: string) => {
			if (cents <= 0) return;
			if (!accountId)
				throw new createHttpError.BadRequest(
					`Conta contábil não configurada para ${descricao.toLowerCase()}. Defina-a em Configurações › Financeiro › Lançamentos padrão › Compras.`,
				);
			lines.push({
				contaContabilId: accountId,
				natureza: "CREDITO",
				valor: centsToMoney(cents),
				descricao,
				ordem: order++,
				metadados: { origem: "COMPRA", tipo: "DEVOLUCAO" },
			});
		};
		for (const [destination, cents] of Object.entries(total.custoPorDestinacao) as [TAcquisitionNatureEnum, number][])
			credit(
				destination === "REVENDA" ? estoqueContaId : contasPorDestinacao[destination],
				cents,
				`Estoque devolvido (${destination.toLowerCase().replace("_", " e ")})`,
			);
		credit(purchaseDefaults?.debitoCreditoTributarioContaId, total.creditoCentavos, "Crédito tributário estornado");
		credit(purchaseDefaults?.debitoDespesaPeriodoContaId, total.despesaCentavos, "Despesa do período estornada");
		const valor = centsToMoney(total.fornecedorCentavos);
		assertAccountingEntryLinesBalanced({ entryValue: valor, lines });
		const [inserted] = await trx
			.insert(accountingEntries)
			.values({
				organizacaoId: organizationId,
				compraId: purchaseId,
				fornecedorId: purchase.fornecedorId,
				origemTipo: "COMPRA",
				titulo: `Devolução ao fornecedor — ${purchase.titulo}`,
				anotacoes: motivo,
				idContaDebito: fornecedoresContaId,
				idContaCredito: lines[1].contaContabilId,
				valor,
				dataCompetencia: data,
				chaveIdempotencia: buildPurchaseReturnKey(purchaseId, referencia),
				autorId: userId,
			})
			.returning({ id: accountingEntries.id });
		if (!inserted) throw new createHttpError.InternalServerError("Erro ao lançar a devolução.");
		entryId = inserted.id;
		await syncAccountingEntryLines({ trx, organizationId, accountingEntryId: entryId, entryValue: valor, lines });
		// Crédito a receber do fornecedor (abatimento ou reembolso): uma parcela ENTRADA, reprogramável.
		await trx.insert(financialTransactions).values({
			organizacaoId: organizationId,
			lancamentoContabilId: entryId,
			titulo: `Crédito com fornecedor — devolução ${purchase.titulo}`,
			tipo: "ENTRADA",
			valor,
			valorBase: valor,
			metodo: "OUTRO",
			dataPrevisao: new Date(data.getTime() + 30 * 24 * 60 * 60 * 1000),
			dataEfetivacao: null,
			parcela: 1,
			totalParcelas: 1,
			autorId: userId,
		});
	}

	// Chave da NF-e de origem (para a refNFe da NF-e de devolução): a do documento dos itens, se houver.
	const documents = purchase.documentosImportados ? PurchaseImportedDocumentsSnapshotSchema.parse(purchase.documentosImportados).documentos : [];
	const firstItemRef = purchase.itens.find((item) => returnItems.some((returned) => returned.itemId === item.id))?.documentoRef;
	const sourceDocument = documents.find((document) => document.referencia === firstItemRef) ?? documents.find((document) => document.chaveAcesso);
	const record: TPurchaseReturn = {
		referencia,
		data: data.toISOString(),
		motivo,
		itens: returnItems,
		valorTotalFornecedor: centsToMoney(total.fornecedorCentavos),
		valorTotalCusto: centsToMoney(Object.values(total.custoPorDestinacao).reduce((sum, cents) => sum + cents, 0)),
		lancamentoContabilId: entryId,
		chaveNfeOrigem: sourceDocument?.chaveAcesso ?? null,
		documentoFiscalId: null,
		autorId: userId,
		dataInsercao: new Date().toISOString(),
	};
	await trx
		.update(purchases)
		.set({ devolucoes: { versao: 1, devolucoes: [...existing, record] }, dataUltimaAtualizacao: new Date() })
		.where(eq(purchases.id, purchaseId));
	return record;
}
