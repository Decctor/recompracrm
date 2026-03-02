import { ClientLocationSchema } from "@/schemas/clients";
import { useCallback, useState } from "react";
import type z from "zod";

export const ClientLocationStateSchema = ClientLocationSchema.omit({
	organizacaoId: true,
	clienteId: true,
	dataInsercao: true,
	localizacaoLatitude: true,
	localizacaoLongitude: true,
});

export type TClientLocationState = z.infer<typeof ClientLocationStateSchema>;

type UseClientLocationStateProps = {
	initialState?: Partial<TClientLocationState>;
};

export function useClientLocationState({ initialState }: UseClientLocationStateProps = {}) {
	const [state, setState] = useState<TClientLocationState>({
		titulo: initialState?.titulo ?? "",
		localizacaoCep: initialState?.localizacaoCep ?? null,
		localizacaoEstado: initialState?.localizacaoEstado ?? null,
		localizacaoCidade: initialState?.localizacaoCidade ?? null,
		localizacaoBairro: initialState?.localizacaoBairro ?? null,
		localizacaoLogradouro: initialState?.localizacaoLogradouro ?? null,
		localizacaoNumero: initialState?.localizacaoNumero ?? null,
		localizacaoComplemento: initialState?.localizacaoComplemento ?? null,
	});

	const updateClientLocation = useCallback((changes: Partial<TClientLocationState>) => {
		setState((prev) => ({ ...prev, ...changes }));
	}, []);

	const redefineState = useCallback((newState: TClientLocationState) => {
		setState(newState);
	}, []);

	const resetState = useCallback(() => {
		setState({
			titulo: initialState?.titulo ?? "",
			localizacaoCep: initialState?.localizacaoCep ?? null,
			localizacaoEstado: initialState?.localizacaoEstado ?? null,
			localizacaoCidade: initialState?.localizacaoCidade ?? null,
			localizacaoBairro: initialState?.localizacaoBairro ?? null,
			localizacaoLogradouro: initialState?.localizacaoLogradouro ?? null,
			localizacaoNumero: initialState?.localizacaoNumero ?? null,
			localizacaoComplemento: initialState?.localizacaoComplemento ?? null,
		});
	}, [
		initialState?.titulo,
		initialState?.localizacaoCep,
		initialState?.localizacaoEstado,
		initialState?.localizacaoCidade,
		initialState?.localizacaoBairro,
		initialState?.localizacaoLogradouro,
		initialState?.localizacaoNumero,
		initialState?.localizacaoComplemento,
	]);

	return {
		state,
		updateClientLocation,
		redefineState,
		resetState,
	};
}

export type TUseClientLocationState = ReturnType<typeof useClientLocationState>;
