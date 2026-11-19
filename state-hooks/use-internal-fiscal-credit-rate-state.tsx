"use client";
import type { TCreateFiscalCreditRatesInput } from "@/app/api/fiscal/credit-rates/route";
import { getFiscalCreditCompetence } from "@/lib/fiscal/simples-credit";
import { useCallback, useState } from "react";

export function useInternalFiscalCreditRateState() {
	const [state, setState] = useState<TCreateFiscalCreditRatesInput>(() => ({
		competencia: getFiscalCreditCompetence(),
		percentual: 0,
		observacao: "",
		groupIds: [],
	}));
	const updateRate = useCallback((patch: Partial<TCreateFiscalCreditRatesInput>) => setState((prev) => ({ ...prev, ...patch })), []);
	const toggleGroup = useCallback(
		(id: string) =>
			setState((prev) => ({ ...prev, groupIds: prev.groupIds.includes(id) ? prev.groupIds.filter((value) => value !== id) : [...prev.groupIds, id] })),
		[],
	);
	return { state, updateRate, toggleGroup };
}
