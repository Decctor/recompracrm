"use client";

import TextInput from "@/components/Inputs/TextInput";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { getErrorMessage } from "@/lib/errors";
import { updateClientLocation } from "@/lib/mutations/clients/locations";
import { useClientLocationById } from "@/lib/queries/clients/locations";
import type { TUpdateClientLocationInput } from "@/pages/api/clients/locations";
import { useClientLocationState } from "@/state-hooks/use-client-location-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

type ControlClientLocationProps = {
	clientLocationId: string;
	closeModal: () => void;
	callbacks?: {
		onMutate?: (variables: TUpdateClientLocationInput) => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

export function ControlClientLocation({ clientLocationId, closeModal, callbacks }: ControlClientLocationProps) {
	const queryClient = useQueryClient();
	const { data: location, isLoading, error, queryKey } = useClientLocationById({ id: clientLocationId });
	const { state, updateClientLocation: updateState, redefineState } = useClientLocationState({ initialState: {} });

	useEffect(() => {
		if (!location) return;
		redefineState({
			titulo: location.titulo,
			localizacaoCep: location.localizacaoCep,
			localizacaoEstado: location.localizacaoEstado,
			localizacaoCidade: location.localizacaoCidade,
			localizacaoBairro: location.localizacaoBairro,
			localizacaoLogradouro: location.localizacaoLogradouro,
			localizacaoNumero: location.localizacaoNumero,
			localizacaoComplemento: location.localizacaoComplemento,
		});
	}, [location, redefineState]);

	const { mutate: handleUpdateClientLocation, isPending } = useMutation({
		mutationKey: ["update-client-location", clientLocationId],
		mutationFn: updateClientLocation,
		onMutate: async (variables) => {
			await queryClient.cancelQueries({ queryKey });
			if (callbacks?.onMutate) callbacks.onMutate(variables);
		},
		onSuccess: async (data) => {
			if (callbacks?.onSuccess) callbacks.onSuccess();
			toast.success(data.message);
			closeModal();
		},
		onError: async (mutationError) => {
			if (callbacks?.onError) callbacks.onError(mutationError as Error);
			toast.error(getErrorMessage(mutationError));
		},
		onSettled: async () => {
			if (callbacks?.onSettled) callbacks.onSettled();
			await queryClient.invalidateQueries({ queryKey });
		},
	});

	return (
		<ResponsiveMenu
			menuTitle="EDITAR LOCALIZAÇÃO"
			menuDescription="Atualize os dados do endereço do cliente."
			menuActionButtonText="SALVAR ALTERAÇÕES"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => {
				if (!location?.clienteId) return;
				handleUpdateClientLocation({ id: clientLocationId, clienteId: location.clienteId, ...state });
			}}
			actionIsLoading={isPending}
			stateIsLoading={isLoading}
			stateError={error ? getErrorMessage(error) : null}
			closeMenu={closeModal}
		>
			<ResponsiveMenuSection title="ENDEREÇO" icon={<MapPin className="h-4 w-4" />}>
				<TextInput label="Título" placeholder="Ex: Casa, Trabalho" value={state.titulo} handleChange={(value) => updateState({ titulo: value })} />
				<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
					<TextInput
						label="CEP"
						placeholder="Digite o CEP"
						value={state.localizacaoCep ?? ""}
						handleChange={(value) => updateState({ localizacaoCep: value || null })}
					/>
					<TextInput
						label="Estado"
						placeholder="Digite o estado"
						value={state.localizacaoEstado ?? ""}
						handleChange={(value) => updateState({ localizacaoEstado: value || null })}
					/>
					<TextInput
						label="Cidade"
						placeholder="Digite a cidade"
						value={state.localizacaoCidade ?? ""}
						handleChange={(value) => updateState({ localizacaoCidade: value || null })}
					/>
					<TextInput
						label="Bairro"
						placeholder="Digite o bairro"
						value={state.localizacaoBairro ?? ""}
						handleChange={(value) => updateState({ localizacaoBairro: value || null })}
					/>
					<TextInput
						label="Logradouro"
						placeholder="Digite o logradouro"
						value={state.localizacaoLogradouro ?? ""}
						handleChange={(value) => updateState({ localizacaoLogradouro: value || null })}
					/>
					<TextInput
						label="Número"
						placeholder="Digite o número"
						value={state.localizacaoNumero ?? ""}
						handleChange={(value) => updateState({ localizacaoNumero: value || null })}
					/>
				</div>
				<TextInput
					label="Complemento"
					placeholder="Apartamento, bloco, referência..."
					value={state.localizacaoComplemento ?? ""}
					handleChange={(value) => updateState({ localizacaoComplemento: value || null })}
				/>
			</ResponsiveMenuSection>
		</ResponsiveMenu>
	);
}
