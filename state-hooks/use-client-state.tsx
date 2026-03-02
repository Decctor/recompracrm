import { ClientLocationSchema, ClientSchema } from "@/schemas/clients";
import { useCallback, useMemo, useState } from "react";
import z from "zod";

export const ClientLocationStateSchema = ClientLocationSchema.omit({
	organizacaoId: true,
	clienteId: true,
	dataInsercao: true,
}).extend({
	id: z
		.string({
			invalid_type_error: "Tipo não válido para ID da localização.",
		})
		.optional()
		.nullable(),
	deletar: z
		.boolean({
			invalid_type_error: "Tipo não válido para marcador de exclusão.",
		})
		.optional()
		.nullable(),
});

export const ClientStateSchema = z.object({
	client: ClientSchema,
	clientLocations: z.array(ClientLocationStateSchema),
});

export type TClientState = z.infer<typeof ClientStateSchema>;
export type TClientLocationState = TClientState["clientLocations"][number];

type UseClientStateProps = {
	initialState?: Partial<TClientState>;
};

function getDefaultState(initialState?: Partial<TClientState>): TClientState {
	return {
		client: {
			idExterno: initialState?.client?.idExterno ?? null,
			nome: initialState?.client?.nome ?? "",
			cpfCnpj: initialState?.client?.cpfCnpj ?? null,
			telefone: initialState?.client?.telefone ?? "",
			telefoneBase: initialState?.client?.telefoneBase ?? "",
			email: initialState?.client?.email ?? "",
			localizacaoCep: initialState?.client?.localizacaoCep ?? null,
			localizacaoEstado: initialState?.client?.localizacaoEstado ?? null,
			localizacaoCidade: initialState?.client?.localizacaoCidade ?? null,
			localizacaoBairro: initialState?.client?.localizacaoBairro ?? null,
			localizacaoLogradouro: initialState?.client?.localizacaoLogradouro ?? null,
			localizacaoNumero: initialState?.client?.localizacaoNumero ?? null,
			localizacaoComplemento: initialState?.client?.localizacaoComplemento ?? null,
			canalAquisicao: initialState?.client?.canalAquisicao ?? null,
			primeiraCompraData: initialState?.client?.primeiraCompraData ?? null,
			primeiraCompraId: initialState?.client?.primeiraCompraId ?? "",
			ultimaCompraData: initialState?.client?.ultimaCompraData ?? null,
			ultimaCompraId: initialState?.client?.ultimaCompraId ?? "",
			analiseRFMTitulo: initialState?.client?.analiseRFMTitulo ?? null,
			analiseRFMNotasRecencia: initialState?.client?.analiseRFMNotasRecencia ?? null,
			analiseRFMNotasFrequencia: initialState?.client?.analiseRFMNotasFrequencia ?? null,
			analiseRFMNotasMonetario: initialState?.client?.analiseRFMNotasMonetario ?? null,
			analiseRFMUltimaAtualizacao: initialState?.client?.analiseRFMUltimaAtualizacao ?? null,
			dataNascimento: initialState?.client?.dataNascimento ?? null,
			dataInsercao: initialState?.client?.dataInsercao ?? new Date(),
		},
		clientLocations: initialState?.clientLocations ?? [],
	};
}

function syncClientMainLocation(state: TClientState): TClientState {
	const firstLocation = state.clientLocations.find((location) => !location.deletar);
	if (!firstLocation) {
		return {
			...state,
			client: {
				...state.client,
				localizacaoCep: null,
				localizacaoEstado: null,
				localizacaoCidade: null,
				localizacaoBairro: null,
				localizacaoLogradouro: null,
				localizacaoNumero: null,
				localizacaoComplemento: null,
			},
		};
	}

	return {
		...state,
		client: {
			...state.client,
			localizacaoCep: firstLocation.localizacaoCep,
			localizacaoEstado: firstLocation.localizacaoEstado,
			localizacaoCidade: firstLocation.localizacaoCidade,
			localizacaoBairro: firstLocation.localizacaoBairro,
			localizacaoLogradouro: firstLocation.localizacaoLogradouro,
			localizacaoNumero: firstLocation.localizacaoNumero,
			localizacaoComplemento: firstLocation.localizacaoComplemento,
		},
	};
}

export function useClientState({ initialState }: UseClientStateProps = {}) {
	const initialDefaultState = useMemo(() => getDefaultState(initialState), [initialState]);
	const [state, setState] = useState<TClientState>(() => syncClientMainLocation(initialDefaultState));

	const updateClient = useCallback((changes: Partial<TClientState["client"]>) => {
		setState((prev) => ({
			...prev,
			client: {
				...prev.client,
				...changes,
			},
		}));
	}, []);

	const addClientLocation = useCallback((location?: Partial<TClientLocationState>) => {
		setState((prev) => {
			const nextState = {
				...prev,
				clientLocations: [
					...prev.clientLocations,
					{
						id: location?.id ?? null,
						deletar: location?.deletar ?? false,
						titulo: location?.titulo ?? "",
						localizacaoCep: location?.localizacaoCep ?? null,
						localizacaoEstado: location?.localizacaoEstado ?? null,
						localizacaoCidade: location?.localizacaoCidade ?? null,
						localizacaoBairro: location?.localizacaoBairro ?? null,
						localizacaoLogradouro: location?.localizacaoLogradouro ?? null,
						localizacaoNumero: location?.localizacaoNumero ?? null,
						localizacaoComplemento: location?.localizacaoComplemento ?? null,
						localizacaoLatitude: location?.localizacaoLatitude ?? null,
						localizacaoLongitude: location?.localizacaoLongitude ?? null,
					},
				],
			};

			return syncClientMainLocation(nextState);
		});
	}, []);

	const updateClientLocation = useCallback((index: number, changes: Partial<TClientLocationState>) => {
		setState((prev) => {
			const nextState = {
				...prev,
				clientLocations: prev.clientLocations.map((location, locationIndex) => {
					if (locationIndex !== index) return location;
					return {
						...location,
						...changes,
					};
				}),
			};

			return syncClientMainLocation(nextState);
		});
	}, []);

	const removeClientLocation = useCallback((index: number) => {
		setState((prev) => {
			const location = prev.clientLocations[index];
			if (!location) return prev;

			const nextLocations = location.id
				? prev.clientLocations.map((current, currentIndex) =>
						currentIndex === index
							? {
									...current,
									deletar: true,
								}
							: current,
					)
				: prev.clientLocations.filter((_, currentIndex) => currentIndex !== index);

			return syncClientMainLocation({
				...prev,
				clientLocations: nextLocations,
			});
		});
	}, []);

	const redefineState = useCallback((newState: TClientState) => {
		setState(syncClientMainLocation(newState));
	}, []);

	const resetState = useCallback(() => {
		setState(syncClientMainLocation(initialDefaultState));
	}, [initialDefaultState]);

	return {
		state,
		updateClient,
		addClientLocation,
		updateClientLocation,
		removeClientLocation,
		redefineState,
		resetState,
	};
}

export type TUseClientState = ReturnType<typeof useClientState>;
