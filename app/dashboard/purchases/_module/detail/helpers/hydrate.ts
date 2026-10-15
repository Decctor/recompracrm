import type { TGetPurchasesOutputById } from "@/app/api/purchases/route";
import { getPurchaseItemsTotal } from "@/components/Modals/Purchases/Blocks/Items";
import type { TPurchaseState } from "@/state-hooks/use-purchase-state";

export type TPurchaseById = TGetPurchasesOutputById;

/**
 * Editable state of a saved purchase. Purchases created before the accounting module have no entry;
 * one is seeded from the purchase itself, so the next save starts generating it.
 */
export function buildPurchaseStateFromPurchase(purchase: TPurchaseById): TPurchaseState {
	return {
		purchase: {
			titulo: purchase.titulo,
			anotacoes: purchase.anotacoes ?? null,
			status: purchase.status,
			documentosImportados: purchase.documentosImportados ?? { versao: 1, documentos: [] },
			lancamentoContabilId: purchase.lancamentoContabilId,
			pedidoData: purchase.pedidoData,
			fornecedorId: purchase.fornecedorId,
			pedidoFornecedorNome: purchase.pedidoFornecedorNome,
			pedidoFornecedorCnpj: purchase.pedidoFornecedorCnpj,
			pedidoFornecedorTelefone: purchase.pedidoFornecedorTelefone,
			pedidoFornecedorEmail: purchase.pedidoFornecedorEmail,
			transporteTransportadoraNome: purchase.transporteTransportadoraNome,
			transporteTransportadoraCnpj: purchase.transporteTransportadoraCnpj,
			transporteTransportadoraTelefone: purchase.transporteTransportadoraTelefone,
			transporteTransportadoraEmail: purchase.transporteTransportadoraEmail,
			transporteLinkRastreio: purchase.transporteLinkRastreio,
			entregaDataEnvio: purchase.entregaDataEnvio,
			entregaDataRecebimentoPrevisao: purchase.entregaDataRecebimentoPrevisao,
			entregaDataRecebimentoEfetivacao: purchase.entregaDataRecebimentoEfetivacao,
			dataEfetivacao: purchase.dataEfetivacao,
		},
		purchaseItems: purchase.itens,
		lancamentoContabil: purchase.lancamentoContabil
			? {
					id: purchase.lancamentoContabil.id,
					titulo: purchase.lancamentoContabil.titulo,
					anotacoes: purchase.lancamentoContabil.anotacoes,
					valor: purchase.lancamentoContabil.valor,
					valorPrevisto: purchase.lancamentoContabil.valorPrevisto,
					dataCompetencia: purchase.lancamentoContabil.dataCompetencia,
					transacoes: purchase.lancamentoContabil.transacoesFinanceiras.map((transaction) => ({
						id: transaction.id,
						contaFinanceiraId: transaction.contaFinanceiraId,
						titulo: transaction.titulo,
						tipo: transaction.tipo,
						valor: transaction.valor,
						valorBase: transaction.valorBase,
						valorJuros: transaction.valorJuros,
						valorMulta: transaction.valorMulta,
						valorTaxas: transaction.valorTaxas,
						valorDesconto: transaction.valorDesconto,
						modificadoresMetadata: transaction.modificadoresMetadata,
						metodo: transaction.metodo,
						dataPrevisao: transaction.dataPrevisao,
						dataEfetivacao: transaction.dataEfetivacao,
						parcela: transaction.parcela,
						totalParcelas: transaction.totalParcelas,
					})),
				}
			: {
					titulo: purchase.titulo,
					anotacoes: null,
					valor: getPurchaseItemsTotal(purchase.itens),
					valorPrevisto: null,
					dataCompetencia: purchase.pedidoData ?? purchase.dataInsercao ?? new Date(),
					transacoes: [],
				},
	};
}

/** Slices of the editable state, one per tab, to tell which tab holds unsaved changes. */
export function getRegistrySlice(state: TPurchaseState) {
	// Status and receipt date only change through the header actions, which save right away.
	const { status: _status, documentosImportados: _documents, entregaDataRecebimentoEfetivacao: _receivedAt, ...fields } = state.purchase;
	return fields;
}

export type TDetailTab = "cadastro" | "itens" | "financeiro" | "documentos";

export function getDirtyTabs(state: TPurchaseState, baseline: TPurchaseState | null): Set<TDetailTab> {
	const dirty = new Set<TDetailTab>();
	if (!baseline) return dirty;
	const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
	if (!same(getRegistrySlice(state), getRegistrySlice(baseline))) dirty.add("cadastro");
	if (!same(state.purchaseItems, baseline.purchaseItems)) dirty.add("itens");
	if (!same(state.lancamentoContabil, baseline.lancamentoContabil)) dirty.add("financeiro");
	return dirty;
}
