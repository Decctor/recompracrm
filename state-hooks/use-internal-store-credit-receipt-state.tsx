"use client";

import { useCallback, useMemo, useState } from "react";
import { allocateStoreCreditReceipt, getStoreCreditTitlesTotal, type TStoreCreditOpenTitle } from "@/lib/finances/store-credit/allocate";
import { formatDateForInputValue } from "@/lib/formatting";
import type { TPaymentMethodEnum } from "@/schemas/enums";

export type TStoreCreditReceiptState = {
	valor: number;
	dataRecebimento: string | undefined;
	metodo: TPaymentMethodEnum;
	contaFinanceiraId: string | null;
	sessaoVendaId: string | null;
	observacoes: string;
	novaDataPrevisao: string | undefined;
	/**
	 * `AUTOMATICA`: o valor manda e o FIFO distribui. `MANUAL`: as linhas mandam e o valor passa a
	 * ser a soma delas. Guardar os dois sentidos no mesmo campo faria o total discordar das linhas
	 * na tela, que é justamente o que o operador confere antes de confirmar.
	 */
	modoAlocacao: "AUTOMATICA" | "MANUAL";
	alocacaoManual: Record<string, number>;
};

type UseInternalStoreCreditReceiptStateParams = {
	titulos: TStoreCreditOpenTitle[];
	initialState?: Partial<TStoreCreditReceiptState>;
	/** Título escolhido na expansão: abre o menu já apontando só para ele. */
	initialTransacaoId?: string | null;
};

export function useInternalStoreCreditReceiptState({ titulos, initialState, initialTransacaoId }: UseInternalStoreCreditReceiptStateParams) {
	const saldoTotal = useMemo(() => getStoreCreditTitlesTotal(titulos), [titulos]);
	const tituloInicial = initialTransacaoId ? titulos.find((titulo) => titulo.transacaoId === initialTransacaoId) : null;

	const [state, setState] = useState<TStoreCreditReceiptState>(() => ({
		valor: initialState?.valor ?? (tituloInicial ? tituloInicial.saldo : saldoTotal),
		dataRecebimento: initialState?.dataRecebimento ?? formatDateForInputValue(new Date()),
		metodo: initialState?.metodo ?? "DINHEIRO",
		contaFinanceiraId: initialState?.contaFinanceiraId ?? null,
		sessaoVendaId: initialState?.sessaoVendaId ?? null,
		observacoes: initialState?.observacoes ?? "",
		novaDataPrevisao: initialState?.novaDataPrevisao ?? undefined,
		modoAlocacao: tituloInicial ? "MANUAL" : "AUTOMATICA",
		alocacaoManual: tituloInicial ? { [tituloInicial.transacaoId]: tituloInicial.saldo } : {},
	}));

	/**
	 * A alocação efetiva. Em modo automático ela é derivada, nunca guardada: guardar um FIFO que o
	 * usuário ainda pode invalidar mudando o valor é como as duas versões saem de sincronia.
	 */
	const { alocacao, sobra } = useMemo(() => {
		if (state.modoAlocacao === "MANUAL") {
			const entries = Object.entries(state.alocacaoManual)
				.filter(([, valor]) => valor > 0)
				.map(([transacaoId, valor]) => ({ transacaoId, valor }));
			return { alocacao: entries, sobra: 0 };
		}
		const resultado = allocateStoreCreditReceipt({ titles: titulos, valorRecebido: state.valor });
		return { alocacao: resultado.allocations, sobra: resultado.sobra };
	}, [state.modoAlocacao, state.alocacaoManual, state.valor, titulos]);

	const totalAlocado = useMemo(() => getStoreCreditTitlesTotal(alocacao.map((item) => ({ saldo: item.valor }))), [alocacao]);

	const updateReceipt = useCallback((changes: Partial<Omit<TStoreCreditReceiptState, "modoAlocacao" | "alocacaoManual">>) => {
		setState((previous) => ({ ...previous, ...changes }));
	}, []);

	/** Digitar o valor devolve o controle ao FIFO: é o gesto de "recalcula para mim". */
	const updateValor = useCallback((valor: number) => {
		setState((previous) => ({ ...previous, valor, modoAlocacao: "AUTOMATICA", alocacaoManual: {} }));
	}, []);

	const updateAllocation = useCallback(
		(transacaoId: string, valor: number) => {
			setState((previous) => {
				const base =
					previous.modoAlocacao === "MANUAL" ? previous.alocacaoManual : Object.fromEntries(alocacao.map((item) => [item.transacaoId, item.valor]));
				const titulo = titulos.find((item) => item.transacaoId === transacaoId);
				const limite = titulo?.saldo ?? 0;
				const proximo = { ...base, [transacaoId]: Math.max(0, Math.min(valor, limite)) };
				const somaCents = Object.values(proximo).reduce((acc, item) => acc + Math.round((item + Number.EPSILON) * 100), 0);
				return { ...previous, modoAlocacao: "MANUAL", alocacaoManual: proximo, valor: somaCents / 100 };
			});
		},
		[alocacao, titulos],
	);

	const settleAll = useCallback(() => {
		setState((previous) => ({ ...previous, valor: saldoTotal, modoAlocacao: "AUTOMATICA", alocacaoManual: {} }));
	}, [saldoTotal]);

	const resetAllocation = useCallback(() => {
		setState((previous) => ({ ...previous, modoAlocacao: "AUTOMATICA", alocacaoManual: {} }));
	}, []);

	return { state, alocacao, sobra, totalAlocado, saldoTotal, updateReceipt, updateValor, updateAllocation, settleAll, resetAllocation };
}

export type TUseInternalStoreCreditReceiptState = ReturnType<typeof useInternalStoreCreditReceiptState>;
