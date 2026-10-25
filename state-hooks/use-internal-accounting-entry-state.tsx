"use client";

import type { TCreateAccountingEntryInput, TUpdateAccountingEntryInput } from "@/app/api/finances/accounting-entries/route";
import { useCallback, useState } from "react";

type TAccountingEntryState = TUpdateAccountingEntryInput;
export type TAccountingEntryFinancialTransactionState = TAccountingEntryState["entryFinancialTransactions"][number];
export type TAccountingEntryLineState = TAccountingEntryState["entryLines"][number];

type UseInternalAccountingEntryStateParams = {
	initialState?: Partial<TAccountingEntryState>;
};

export function getDefaultAccountingEntryLineState(patch?: Partial<TAccountingEntryLineState>): TAccountingEntryLineState {
	return {
		contaContabilId: "",
		natureza: "DEBITO",
		valor: 0,
		descricao: null,
		...patch,
	};
}

function getDefaultState(): TAccountingEntryState {
	return {
		entryId: "",
		entry: {
			titulo: "",
			anotacoes: "",
			idContaDebito: "",
			idContaCredito: "",
			valor: 0,
			valorPrevisto: null,
			dataCompetencia: new Date(),
			clienteId: null,
			fornecedorId: null,
		},
		// Todo lançamento nasce com o esqueleto mínimo da partida dobrada; o par legado acima é
		// derivado das linhas no servidor.
		entryLines: [getDefaultAccountingEntryLineState({ natureza: "DEBITO" }), getDefaultAccountingEntryLineState({ natureza: "CREDITO" })],
		entryFinancialTransactions: [],
	};
}

export function getDefaultAccountingEntryTransactionState(
	patch?: Partial<TAccountingEntryFinancialTransactionState>,
): TAccountingEntryFinancialTransactionState {
	return {
		contaFinanceiraId: null,
		titulo: "",
		tipo: "ENTRADA",
		valor: 0,
		metodo: "A_DEFINIR",
		dataPrevisao: new Date(),
		dataEfetivacao: null,
		parcela: null,
		totalParcelas: null,
		...patch,
	};
}

export function useInternalAccountingEntryState({ initialState }: UseInternalAccountingEntryStateParams = {}) {
	const defaultState = getDefaultState();
	const [state, setState] = useState<TAccountingEntryState>({
		entryId: initialState?.entryId ?? defaultState.entryId,
		entry: {
			...defaultState.entry,
			...initialState?.entry,
		},
		entryLines: initialState?.entryLines ?? defaultState.entryLines,
		entryFinancialTransactions: initialState?.entryFinancialTransactions ?? defaultState.entryFinancialTransactions,
	});

	const updateEntry = useCallback((patch: Partial<TAccountingEntryState["entry"]>) => {
		setState((prev) => ({
			...prev,
			entry: {
				...prev.entry,
				...patch,
			},
		}));
	}, []);

	const addEntryLine = useCallback((line?: Partial<TAccountingEntryLineState>) => {
		setState((prev) => ({
			...prev,
			entryLines: [...prev.entryLines, getDefaultAccountingEntryLineState(line)],
		}));
	}, []);

	const updateEntryLine = useCallback(({ index, changes }: { index: number; changes: Partial<TAccountingEntryLineState> }) => {
		setState((prev) => ({
			...prev,
			entryLines: prev.entryLines.map((line, lineIndex) => (lineIndex === index ? { ...line, ...changes } : line)),
		}));
	}, []);

	// Sem soft-delete: as linhas são sincronizadas por substituição no servidor, então remover é filtrar.
	const removeEntryLine = useCallback((index: number) => {
		setState((prev) => ({
			...prev,
			entryLines: prev.entryLines.filter((_, lineIndex) => lineIndex !== index),
		}));
	}, []);

	const redefineEntryLines = useCallback((nextLines: TAccountingEntryState["entryLines"]) => {
		setState((prev) => ({
			...prev,
			entryLines: nextLines,
		}));
	}, []);

	const addFinancialTransaction = useCallback((transaction?: Partial<TAccountingEntryFinancialTransactionState>) => {
		setState((prev) => ({
			...prev,
			entryFinancialTransactions: [...prev.entryFinancialTransactions, getDefaultAccountingEntryTransactionState(transaction)],
		}));
	}, []);

	const updateFinancialTransaction = useCallback(
		({ index, changes }: { index: number; changes: Partial<TAccountingEntryFinancialTransactionState> }) => {
			setState((prev) => ({
				...prev,
				entryFinancialTransactions: prev.entryFinancialTransactions.map((transaction, transactionIndex) =>
					transactionIndex === index ? { ...transaction, ...changes } : transaction,
				),
			}));
		},
		[],
	);

	const removeFinancialTransaction = useCallback((index: number) => {
		setState((prev) => {
			const target = prev.entryFinancialTransactions[index];
			if (!target) return prev;
			if (!target.id) {
				return {
					...prev,
					entryFinancialTransactions: prev.entryFinancialTransactions.filter((_, transactionIndex) => transactionIndex !== index),
				};
			}
			return {
				...prev,
				entryFinancialTransactions: prev.entryFinancialTransactions.map((transaction, transactionIndex) =>
					transactionIndex === index ? { ...transaction, deletar: true } : transaction,
				),
			};
		});
	}, []);

	const redefineFinancialTransactions = useCallback((nextTransactions: TAccountingEntryState["entryFinancialTransactions"]) => {
		setState((prev) => ({
			...prev,
			entryFinancialTransactions: nextTransactions,
		}));
	}, []);

	const redefineState = useCallback((nextState: Partial<TAccountingEntryState>) => {
		setState((prev) => ({
			...prev,
			...nextState,
			entry: {
				...prev.entry,
				...nextState.entry,
			},
			entryLines: nextState.entryLines ?? prev.entryLines,
			entryFinancialTransactions: nextState.entryFinancialTransactions ?? prev.entryFinancialTransactions,
		}));
	}, []);

	const resetState = useCallback(() => {
		setState(getDefaultState());
	}, []);

	function getCreatePayload(): TCreateAccountingEntryInput {
		return {
			entry: state.entry,
			entryLines: state.entryLines,
			entryFinancialTransactions: state.entryFinancialTransactions.filter((transaction) => !transaction.deletar),
		};
	}

	return {
		state,
		updateEntry,
		addEntryLine,
		updateEntryLine,
		removeEntryLine,
		redefineEntryLines,
		addFinancialTransaction,
		updateFinancialTransaction,
		removeFinancialTransaction,
		redefineFinancialTransactions,
		redefineState,
		resetState,
		getCreatePayload,
	};
}

export type TUseInternalAccountingEntryState = ReturnType<typeof useInternalAccountingEntryState>;
