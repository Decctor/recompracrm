"use client";

import type { TCreateStockTransactionsInput } from "@/app/api/products/stock-transactions/route";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { formatDecimalPlaces } from "@/lib/formatting";
import { createStockTransactions } from "@/lib/mutations/product-stock-transactions";
import { isManualStockInflow } from "@/lib/stock/manual-stock-movements";
import type { TManualStockMovementTypeEnum } from "@/schemas/enums";
import {
	createEmptyStockTransactionItem,
	type TStockTransactionState,
	useInternalStockTransactionState,
} from "@/state-hooks/use-internal-stock-transaction-state";
import { useMutation } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import StockTransactionItemsBlock, {
	buildStockTransactionItemProduct,
	getTrackedStockEntityOptions,
	type TStockTransactionProductSource,
} from "./Blocks/Items";
import StockTransactionMovementTypeBlock from "./Blocks/MovementType";

type NewStockTransactionProps = {
	closeModal: () => void;
	/** Produto fixo (página do produto). Sem ele, o usuário escolhe os produtos no próprio menu. */
	product?: TStockTransactionProductSource | null;
	productVariantId?: string | null;
	initialType?: TManualStockMovementTypeEnum;
	callbacks?: {
		onMutate?: (variables: TCreateStockTransactionsInput) => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

function buildInitialItems(product?: TStockTransactionProductSource | null, productVariantId?: string | null) {
	if (!product) return [createEmptyStockTransactionItem()];
	const options = getTrackedStockEntityOptions(product);
	if (productVariantId) return [createEmptyStockTransactionItem(buildStockTransactionItemProduct({ product, productVariantId }))];
	// Com um único saldo rastreado não há o que escolher; com vários, o usuário escolhe no item.
	if (options.length === 1) {
		const onlyVariantId = options[0].id === product.id ? null : options[0].id;
		return [createEmptyStockTransactionItem(buildStockTransactionItemProduct({ product, productVariantId: onlyVariantId }))];
	}
	return [createEmptyStockTransactionItem()];
}

// Primeiro problema que impede o envio, na linguagem do formulário. O servidor valida de novo
// (e com o saldo travado), isto só evita a ida e volta nos erros óbvios.
function getStockTransactionStateError(state: TStockTransactionState) {
	if (!state.reason.trim()) return "Informe o motivo da movimentação.";
	if (state.items.length === 0) return "Informe ao menos um item para movimentar.";
	const inflow = isManualStockInflow(state.type);
	for (const item of state.items) {
		if (!item.productId || !item.produto) return "Selecione o produto de todos os itens.";
		if (!item.produto.rastreamentoEstoqueAtivo) return `"${item.produto.nome}" não possui rastreamento de estoque ativo.`;
		if (!item.quantity || item.quantity <= 0) return `Informe a quantidade de "${item.produto.nome}".`;
		if (!inflow && item.quantity > item.produto.quantidade) {
			return `Saldo insuficiente para "${item.produto.nome}": disponível ${formatDecimalPlaces(item.produto.quantidade)} ${item.produto.unidade}.`;
		}
	}
	return null;
}

function buildCreateStockTransactionsInput(state: TStockTransactionState): TCreateStockTransactionsInput {
	const inflow = isManualStockInflow(state.type);
	return {
		type: state.type,
		reason: state.reason.trim(),
		items: state.items.map((item) => {
			const hasNewLot = inflow && !!item.newLot && (!!item.newLot.code.trim() || !!item.newLot.expirationDate);
			return {
				productId: item.productId ?? "",
				productVariantId: item.productVariantId,
				quantity: item.quantity ?? 0,
				unitCost: inflow ? item.unitCost : null,
				lotId: inflow ? null : item.lotId,
				newLot: hasNewLot && item.newLot ? { code: item.newLot.code.trim() || null, expirationDate: item.newLot.expirationDate } : null,
			};
		}),
	};
}

export default function NewStockTransaction({ closeModal, product, productVariantId, initialType, callbacks }: NewStockTransactionProps) {
	const initialState = useMemo(
		() => ({ type: initialType ?? "SAIDA", items: buildInitialItems(product, productVariantId) }),
		[initialType, product, productVariantId],
	);
	const { state, updateType, updateReason, addItem, updateItem, removeItem } = useInternalStockTransactionState({ initialState });

	const { mutate, isPending } = useMutation({
		mutationKey: ["create-stock-transactions"],
		mutationFn: createStockTransactions,
		onMutate: (variables) => callbacks?.onMutate?.(variables),
		onSuccess: (data) => {
			callbacks?.onSuccess?.();
			toast.success(data.message);
			closeModal();
		},
		onError: (error) => {
			callbacks?.onError?.(error);
			toast.error(getErrorMessage(error));
		},
		onSettled: () => callbacks?.onSettled?.(),
	});

	function handleSubmit() {
		const error = getStockTransactionStateError(state);
		if (error) {
			toast.error(error);
			return;
		}
		mutate(buildCreateStockTransactionsInput(state));
	}

	return (
		<ResponsiveMenu
			menuTitle="NOVA MOVIMENTAÇÃO DE ESTOQUE"
			menuDescription="Lance manualmente entradas, usos e descartes que aconteceram fora do app."
			menuActionButtonText="REGISTRAR MOVIMENTAÇÃO"
			menuActionButtonClassName={state.type === "DESCARTE" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
			menuCancelButtonText="CANCELAR"
			actionFunction={handleSubmit}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
			dialogVariant="md"
			drawerVariant="md"
			lockClose={isPending}
		>
			<StockTransactionMovementTypeBlock type={state.type} reason={state.reason} updateType={updateType} updateReason={updateReason} />
			<StockTransactionItemsBlock
				type={state.type}
				items={state.items}
				lockedProduct={product}
				addItem={addItem}
				updateItem={updateItem}
				removeItem={removeItem}
			/>
			{state.type === "DESCARTE" ? (
				<p className="text-muted-foreground text-xs">
					O descarte gera um lançamento contábil de perda de estoque valorado pelo custo médio atual de cada item. Sem custo conhecido, apenas a
					movimentação de estoque é registrada.
				</p>
			) : null}
		</ResponsiveMenu>
	);
}
