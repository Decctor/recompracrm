import { AccountingEntrySchema, FinancialTransactionSchema } from "@/schemas/financial";
import { ProductSchema, ProductVariantSchema } from "@/schemas/products";
import { PurchaseItemSchema, PurchaseSchema } from "@/schemas/purchases";
import { useCallback, useMemo, useState } from "react";
import z from "zod";

// Transações financeiras que quitam o lançamento contábil da compra. Organização, lançamento e autor são
// derivados no servidor a partir da própria compra.
export const PurchaseAccountingEntryTransactionSchema = FinancialTransactionSchema.omit({
	organizacaoId: true,
	lancamentoContabilId: true,
	autorId: true,
	dataInsercao: true,
}).extend({
	id: z.string({ invalid_type_error: "Tipo não válido para o ID da transação financeira da compra." }).optional(),
	deletar: z.boolean({ invalid_type_error: "Tipo não válido para deletar transação financeira da compra." }).optional(),
});
export type TPurchaseAccountingEntryTransaction = z.infer<typeof PurchaseAccountingEntryTransactionSchema>;

export const PurchaseStateSchema = z.object({
	purchase: PurchaseSchema.omit({
		organizacaoId: true,
		idExterno: true,
		devolucoes: true,
		autorId: true,
		dataInsercao: true,
		dataUltimaAtualizacao: true,
	}),
	purchaseItems: z.array(
		PurchaseItemSchema.omit({
			organizacaoId: true,
			compraId: true,
			dataInsercao: true,
		}).extend({
			produto: ProductSchema.pick({
				nome: true,
				imagemCapaUrl: true,
				codigo: true,
				unidade: true,
			}),
			produtoVariante: ProductVariantSchema.pick({
				nome: true,
				codigo: true,
				imagemCapaUrl: true,
			}).optional(),
			// Derived lots spawned by receiving this item (read-only, for the edit UI). Stripped by the
			// server schema on submit; never sent back as input.
			lotes: z
				.array(
					z.object({
						id: z.string(),
						codigoLote: z.string().nullable(),
						quantidadeInicial: z.number(),
						quantidadeAtual: z.number(),
						dataValidade: z.date().nullable(),
						status: z.string(),
					}),
				)
				.optional(),
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
	// Lançamento contábil da compra. As contas de débito/crédito, a origem e o autor são resolvidos no
	// servidor a partir dos padrões contábeis da organização.
	lancamentoContabil: AccountingEntrySchema.omit({
		organizacaoId: true,
		vendaId: true,
		loteId: true,
		origemTipo: true,
		idContaDebito: true,
		idContaCredito: true,
		autorId: true,
		dataInsercao: true,
	}).extend({
		id: z.string({ invalid_type_error: "Tipo não válido para o ID do lançamento contábil." }).optional(),
		transacoes: z.array(PurchaseAccountingEntryTransactionSchema, {
			required_error: "Lista das transações financeiras da compra não informada.",
			invalid_type_error: "Tipo não válido para a lista das transações financeiras da compra.",
		}),
	}),
});
export type TPurchaseState = z.infer<typeof PurchaseStateSchema>;

type UsePurchaseStateProps = {
	initialState?: Partial<TPurchaseState>;
};
export const usePurchaseState = ({ initialState }: UsePurchaseStateProps = {}) => {
	const initialStateHolder = useMemo(
		() => ({
			purchase: {
				titulo: initialState?.purchase?.titulo ?? "",
				anotacoes: initialState?.purchase?.anotacoes ?? null,
				status: initialState?.purchase?.status ?? "RASCUNHO",
				documentosImportados: initialState?.purchase?.documentosImportados ?? { versao: 1, documentos: [] },
				pedidoData: initialState?.purchase?.pedidoData ?? null,
				entregaDataEnvio: initialState?.purchase?.entregaDataEnvio ?? null,
				entregaDataRecebimentoPrevisao: initialState?.purchase?.entregaDataRecebimentoPrevisao ?? null,
				entregaDataRecebimentoEfetivacao: initialState?.purchase?.entregaDataRecebimentoEfetivacao ?? null,
				dataEfetivacao: initialState?.purchase?.dataEfetivacao ?? null,
				lancamentoContabilId: initialState?.purchase?.lancamentoContabilId ?? null,
				fornecedorId: initialState?.purchase?.fornecedorId ?? null,
				pedidoFornecedorNome: initialState?.purchase?.pedidoFornecedorNome ?? null,
				pedidoFornecedorCnpj: initialState?.purchase?.pedidoFornecedorCnpj ?? null,
				pedidoFornecedorTelefone: initialState?.purchase?.pedidoFornecedorTelefone ?? null,
				pedidoFornecedorEmail: initialState?.purchase?.pedidoFornecedorEmail ?? null,
				transporteTransportadoraNome: initialState?.purchase?.transporteTransportadoraNome ?? null,
				transporteTransportadoraCnpj: initialState?.purchase?.transporteTransportadoraCnpj ?? null,
				transporteTransportadoraTelefone: initialState?.purchase?.transporteTransportadoraTelefone ?? null,
				transporteTransportadoraEmail: initialState?.purchase?.transporteTransportadoraEmail ?? null,
				transporteLinkRastreio: initialState?.purchase?.transporteLinkRastreio ?? null,
			},
			purchaseItems: initialState?.purchaseItems ?? [],
			lancamentoContabil: {
				id: initialState?.lancamentoContabil?.id,
				titulo: initialState?.lancamentoContabil?.titulo ?? "",
				anotacoes: initialState?.lancamentoContabil?.anotacoes ?? null,
				valor: initialState?.lancamentoContabil?.valor ?? 0,
				valorPrevisto: initialState?.lancamentoContabil?.valorPrevisto ?? null,
				dataCompetencia: initialState?.lancamentoContabil?.dataCompetencia ?? new Date(),
				transacoes: initialState?.lancamentoContabil?.transacoes ?? [],
			},
		}),
		[initialState],
	);
	const [state, setState] = useState<TPurchaseState>(initialStateHolder);

	const updatePurchase = useCallback((updates: Partial<TPurchaseState["purchase"]>) => {
		setState((prev) => ({
			...prev,
			purchase: {
				...prev.purchase,
				...updates,
			},
		}));
	}, []);

	const addPurchaseItem = useCallback((item: TPurchaseState["purchaseItems"][number]) => {
		setState((prev) => ({
			...prev,
			purchaseItems: [...prev.purchaseItems, item],
		}));
	}, []);

	const updatePurchaseItem = useCallback(({ index, item }: { index: number; item: Partial<TPurchaseState["purchaseItems"][number]> }) => {
		setState((prev) => ({
			...prev,
			purchaseItems: prev.purchaseItems.map((i, iIndex) => (iIndex === index ? { ...i, ...item } : i)),
		}));
	}, []);

	const removePurchaseItem = useCallback(({ index }: { index: number }) => {
		setState((prev) => {
			const itemInArray = prev.purchaseItems[index];
			if (!itemInArray) return prev;

			// If is an existing item (has id), mark as deletar
			if (itemInArray.id) {
				return { ...prev, purchaseItems: prev.purchaseItems.map((i, iIndex) => (iIndex === index ? { ...i, deletar: true } : i)) };
			}

			return { ...prev, purchaseItems: prev.purchaseItems.filter((_, iIndex) => iIndex !== index) };
		});
	}, []);

	const updateAccountingEntry = useCallback((updates: Partial<TPurchaseState["lancamentoContabil"]>) => {
		setState((prev) => ({
			...prev,
			lancamentoContabil: {
				...prev.lancamentoContabil,
				...updates,
			},
		}));
	}, []);

	const addAccountingEntryTransaction = useCallback((transaction: TPurchaseAccountingEntryTransaction) => {
		setState((prev) => ({
			...prev,
			lancamentoContabil: {
				...prev.lancamentoContabil,
				transacoes: [...prev.lancamentoContabil.transacoes, transaction],
			},
		}));
	}, []);

	const updateAccountingEntryTransaction = useCallback(({ index, item }: { index: number; item: Partial<TPurchaseAccountingEntryTransaction> }) => {
		setState((prev) => ({
			...prev,
			lancamentoContabil: {
				...prev.lancamentoContabil,
				transacoes: prev.lancamentoContabil.transacoes.map((t, tIndex) => (tIndex === index ? { ...t, ...item } : t)),
			},
		}));
	}, []);

	const removeAccountingEntryTransaction = useCallback(({ index }: { index: number }) => {
		setState((prev) => {
			const target = prev.lancamentoContabil.transacoes[index];
			if (!target) return prev;

			// If is an existing transaction (has id), mark as deletar
			const transacoes = target.id
				? prev.lancamentoContabil.transacoes.map((t, tIndex) => (tIndex === index ? { ...t, deletar: true } : t))
				: prev.lancamentoContabil.transacoes.filter((_, tIndex) => tIndex !== index);

			return { ...prev, lancamentoContabil: { ...prev.lancamentoContabil, transacoes } };
		});
	}, []);

	const resetState = useCallback(() => {
		setState(initialStateHolder);
	}, [initialStateHolder]);

	const redefineState = useCallback((state: TPurchaseState) => {
		setState(state);
	}, []);

	return {
		state,
		updatePurchase,
		addPurchaseItem,
		updatePurchaseItem,
		removePurchaseItem,
		updateAccountingEntry,
		addAccountingEntryTransaction,
		updateAccountingEntryTransaction,
		removeAccountingEntryTransaction,
		resetState,
		redefineState,
	};
};
export type TUsePurchaseState = ReturnType<typeof usePurchaseState>;
