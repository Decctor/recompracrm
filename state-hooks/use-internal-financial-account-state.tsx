"use client";

import type { TCreateFinancialAccountInput, TUpdateFinancialAccountInput } from "@/app/api/finances/financial-accounts/route";
import { getDefaultFinancialAccountConfiguration } from "@/lib/finances/financial-account-configuration";
import type { TFinancialAccountConfiguration } from "@/schemas/financial";
import type { TFinancialAccountTypeEnum } from "@/schemas/enums";
import { useCallback, useState } from "react";

export type TFinancialAccountFormState = TCreateFinancialAccountInput["financialAccount"] & { id?: string; chaveSistema?: string | null };

type UseInternalFinancialAccountStateParams = {
	initialState?: Partial<TFinancialAccountFormState>;
};

function getDefaultState(): TFinancialAccountFormState {
	return {
		nome: "",
		descricao: null,
		tipo: "BANCO",
		moeda: "BRL",
		ativo: true,
		contaContabilId: null,
		saldoInicial: 0,
		dataSaldoInicial: new Date(),
		configuracao: getDefaultFinancialAccountConfiguration("BANCO"),
	};
}

export function useInternalFinancialAccountState({ initialState }: UseInternalFinancialAccountStateParams = {}) {
	const [state, setState] = useState<TFinancialAccountFormState>(() => ({ ...getDefaultState(), ...initialState }));

	const updateState = useCallback((patch: Partial<TFinancialAccountFormState>) => {
		setState((previous) => ({ ...previous, ...patch }));
	}, []);

	const updateConfiguration = useCallback((patch: Partial<TFinancialAccountConfiguration>) => {
		setState((previous) => ({
			...previous,
			configuracao: { ...previous.configuracao, ...patch } as TFinancialAccountConfiguration,
		}));
	}, []);

	const updateType = useCallback((tipo: TFinancialAccountTypeEnum) => {
		setState((previous) => ({ ...previous, tipo, configuracao: { ...getDefaultFinancialAccountConfiguration(tipo), recebimentos: previous.configuracao.recebimentos ?? getDefaultFinancialAccountConfiguration(tipo).recebimentos } }));
	}, []);

	const redefineState = useCallback((nextState: Partial<TFinancialAccountFormState>) => {
		setState((previous) => ({ ...previous, ...nextState }));
	}, []);

	const resetState = useCallback(() => {
		setState(getDefaultState());
	}, []);

	function getCreatePayload(): TCreateFinancialAccountInput {
		return { financialAccount: state };
	}

	function getUpdatePayload(): TUpdateFinancialAccountInput {
		if (!state.id) throw new Error("ID da conta financeira não informado.");
		return { financialAccountId: state.id, financialAccount: state };
	}

	return {
		state,
		updateState,
		updateConfiguration,
		updateType,
		redefineState,
		resetState,
		getCreatePayload,
		getUpdatePayload,
	};
}

export type TUseInternalFinancialAccountState = ReturnType<typeof useInternalFinancialAccountState>;
