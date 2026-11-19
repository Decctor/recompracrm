"use client";
import { FiscalSaleChoicesSchema } from "@/schemas/fiscal";

import { FiscalDocumentTypeEnum } from "@/schemas/enums";
import { useCallback, useState } from "react";
import { z } from "zod";

const InternalFiscalDocumentStateSchema = z.object({
	...FiscalSaleChoicesSchema.shape,
	vendaId: z.string({ invalid_type_error: "Tipo nao valido para o ID da venda." }).default(""),
	tipo: FiscalDocumentTypeEnum.default("NFCE"),
});

type TInternalFiscalDocumentState = z.infer<typeof InternalFiscalDocumentStateSchema>;

export function useInternalFiscalDocumentState({ initialState }: { initialState: Partial<TInternalFiscalDocumentState> }) {
	const [state, setState] = useState<TInternalFiscalDocumentState>({
		fiscalDestinacao: initialState.fiscalDestinacao,
		fiscalCreditoIcms: initialState.fiscalCreditoIcms,
		vendaId: initialState.vendaId ?? "",
		tipo: initialState.tipo ?? "NFCE",
	});

	const updateDocument = useCallback((patch: Partial<TInternalFiscalDocumentState>) => {
		setState((prev) => ({ ...prev, ...patch }));
	}, []);

	const redefineState = useCallback((nextState: Partial<TInternalFiscalDocumentState>) => {
		setState((prev) => ({ ...prev, ...nextState }));
	}, []);

	const resetState = useCallback(() => {
		setState({
			fiscalDestinacao: initialState.fiscalDestinacao,
			fiscalCreditoIcms: initialState.fiscalCreditoIcms,
			vendaId: initialState.vendaId ?? "",
			tipo: initialState.tipo ?? "NFCE",
		});
	}, [initialState.tipo, initialState.vendaId]);

	return {
		state,
		updateDocument,
		redefineState,
		resetState,
	};
}

export type TUseInternalFiscalDocumentState = ReturnType<typeof useInternalFiscalDocumentState>;
