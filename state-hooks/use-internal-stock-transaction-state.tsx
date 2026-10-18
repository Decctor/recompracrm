import { isManualStockInflow } from "@/lib/stock/manual-stock-movements";
import type { TManualStockMovementTypeEnum } from "@/schemas/enums";
import { useCallback, useState } from "react";

// Retrato do produto/variante no momento da seleção: só para exibição (nome, unidade, saldo
// projetado). O servidor relê e trava o saldo ao aplicar a movimentação.
export type TStockTransactionItemProduct = {
	nome: string;
	varianteNome: string | null;
	codigo: string | null;
	unidade: string;
	imagemCapaUrl: string | null;
	quantidade: number;
	precoCusto: number | null;
	rastreamentoEstoqueAtivo: boolean;
};

export type TStockTransactionItemState = {
	key: string;
	productId: string | null;
	productVariantId: string | null;
	quantity: number | null;
	unitCost: number | null;
	lotId: string | null;
	newLot: { code: string; expirationDate: Date | null } | null;
	produto: TStockTransactionItemProduct | null;
};

export type TStockTransactionState = {
	type: TManualStockMovementTypeEnum;
	reason: string;
	items: TStockTransactionItemState[];
};

export function createEmptyStockTransactionItem(initial?: Partial<TStockTransactionItemState>): TStockTransactionItemState {
	return {
		key: crypto.randomUUID(),
		productId: null,
		productVariantId: null,
		quantity: null,
		unitCost: null,
		lotId: null,
		newLot: null,
		produto: null,
		...initial,
	};
}

type UseInternalStockTransactionStateProps = {
	initialState?: Partial<TStockTransactionState>;
};

export function useInternalStockTransactionState({ initialState }: UseInternalStockTransactionStateProps = {}) {
	const buildInitialState = useCallback(
		(): TStockTransactionState => ({
			type: initialState?.type ?? "SAIDA",
			reason: initialState?.reason ?? "",
			items: initialState?.items ?? [createEmptyStockTransactionItem()],
		}),
		[initialState],
	);
	const [state, setState] = useState<TStockTransactionState>(buildInitialState);

	// Trocar a direção descarta os campos que só valem para a outra: custo e lote novo são de
	// entrada; lote existente é de saída.
	const updateType = useCallback((type: TManualStockMovementTypeEnum) => {
		setState((prev) => {
			const inflow = isManualStockInflow(type);
			return {
				...prev,
				type,
				items: prev.items.map((item) => (inflow ? { ...item, lotId: null } : { ...item, unitCost: null, newLot: null })),
			};
		});
	}, []);

	const updateReason = useCallback((reason: string) => {
		setState((prev) => ({ ...prev, reason }));
	}, []);

	const addItem = useCallback((item?: Partial<TStockTransactionItemState>) => {
		setState((prev) => ({ ...prev, items: [...prev.items, createEmptyStockTransactionItem(item)] }));
	}, []);

	const updateItem = useCallback((key: string, changes: Partial<Omit<TStockTransactionItemState, "key">>) => {
		setState((prev) => ({ ...prev, items: prev.items.map((item) => (item.key === key ? { ...item, ...changes } : item)) }));
	}, []);

	// Itens só existem no formulário (a movimentação é criada de uma vez), então remover é filtrar.
	const removeItem = useCallback((key: string) => {
		setState((prev) => ({ ...prev, items: prev.items.filter((item) => item.key !== key) }));
	}, []);

	const redefineState = useCallback((newState: TStockTransactionState) => {
		setState(newState);
	}, []);

	const resetState = useCallback(() => {
		setState(buildInitialState());
	}, [buildInitialState]);

	return {
		state,
		updateType,
		updateReason,
		addItem,
		updateItem,
		removeItem,
		redefineState,
		resetState,
	};
}
export type TUseInternalStockTransactionState = ReturnType<typeof useInternalStockTransactionState>;
