"use client";

import ClientLocationAddressPaste from "@/components/Clients/ClientLocationAddressPaste";
import SelectInput from "@/components/Inputs/SelectInput";
import TextInput from "@/components/Inputs/TextInput";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { getErrorMessage } from "@/lib/errors";
import { useClientLocationAutofill } from "@/lib/hooks/use-client-location-autofill";
import { createClientLocation } from "@/lib/mutations/clients/locations";
import { useOrganizationRegion } from "@/lib/queries/organizations";
import type { TCreateClientLocationInput, TCreateClientLocationOutput } from "@/app/api/clients/locations/route";
import { CLIENT_LOCATION_STREET_REQUIRED_MESSAGE, hasClientLocationStreet } from "@/schemas/clients";
import { useClientLocationState } from "@/state-hooks/use-client-location-state";
import { BrazilianCitiesOptionsFromUF, BrazilianStatesOptions } from "@/utils/states-cities";
import { useMutation } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

type NewClientLocationProps = {
	clienteId: string;
	closeModal: () => void;
	callbacks?: {
		onMutate?: (variables: TCreateClientLocationInput) => void;
		onSuccess?: (location: TCreateClientLocationOutput["data"]["location"]) => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

export function NewClientLocation({ clienteId, closeModal, callbacks }: NewClientLocationProps) {
	const { state, updateClientLocation, resetState } = useClientLocationState({ initialState: {} });
	const { data: organizationRegion } = useOrganizationRegion();
	const autofill = useClientLocationAutofill({ location: state, updateLocation: updateClientLocation, defaultRegion: organizationRegion });

	// O endereço começa na cidade da organização. A região pode chegar depois da abertura do modal,
	// então entra uma vez só, e só se o operador ainda não definiu estado (por CEP ou colando).
	const regionAppliedRef = useRef(false);
	useEffect(() => {
		if (!organizationRegion || regionAppliedRef.current) return;
		regionAppliedRef.current = true;
		if (state.localizacaoEstado) return;
		updateClientLocation(organizationRegion);
	}, [organizationRegion, state.localizacaoEstado, updateClientLocation]);

	const { mutate: handleCreateClientLocation, isPending } = useMutation({
		mutationKey: ["create-client-location", clienteId],
		mutationFn: createClientLocation,
		onMutate: async (variables) => {
			if (callbacks?.onMutate) callbacks.onMutate(variables);
		},
		onSuccess: async (data) => {
			if (callbacks?.onSuccess) callbacks.onSuccess(data.data.location);
			toast.success(data.message);
			resetState();
			closeModal();
		},
		onError: async (error) => {
			if (callbacks?.onError) callbacks.onError(error as Error);
			toast.error(getErrorMessage(error));
		},
		onSettled: async () => {
			if (callbacks?.onSettled) callbacks.onSettled();
		},
	});

	return (
		<ResponsiveMenu
			menuTitle="NOVA LOCALIZAÇÃO"
			menuDescription="Preencha os campos abaixo para cadastrar um novo endereço."
			menuActionButtonText="SALVAR LOCALIZAÇÃO"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => {
				if (!hasClientLocationStreet(state)) {
					toast.error(CLIENT_LOCATION_STREET_REQUIRED_MESSAGE);
					return;
				}
				handleCreateClientLocation({ clienteId, ...state });
			}}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
		>
			<ResponsiveMenuSection title="ENDEREÇO" icon={<MapPin className="h-4 w-4" />}>
				<ClientLocationAddressPaste autofill={autofill} />
				<TextInput
					label="Título"
					placeholder="Ex: Casa, Trabalho"
					value={state.titulo}
					handleChange={(value) => updateClientLocation({ titulo: value })}
				/>
				<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
					<TextInput label="CEP" placeholder="Digite o CEP" value={state.localizacaoCep ?? ""} handleChange={autofill.handleCepChange} />
					<SelectInput
						label="Estado"
						value={state.localizacaoEstado ?? null}
						options={BrazilianStatesOptions}
						handleChange={autofill.handleStateChange}
						onReset={() => updateClientLocation({ localizacaoEstado: null, localizacaoCidade: null })}
						resetOptionLabel="NÃO DEFINIDO"
					/>
					<SelectInput
						label="Cidade"
						value={state.localizacaoCidade ?? null}
						options={BrazilianCitiesOptionsFromUF(state.localizacaoEstado ?? "")}
						handleChange={(value) => updateClientLocation({ localizacaoCidade: value || null })}
						onReset={() => updateClientLocation({ localizacaoCidade: null })}
						resetOptionLabel="NÃO DEFINIDO"
					/>
					<TextInput
						label="Bairro"
						placeholder="Digite o bairro"
						value={state.localizacaoBairro ?? ""}
						handleChange={(value) => updateClientLocation({ localizacaoBairro: value || null })}
					/>
					<TextInput
						label="Logradouro"
						placeholder="Digite o logradouro"
						value={state.localizacaoLogradouro ?? ""}
						handleChange={(value) => updateClientLocation({ localizacaoLogradouro: value || null })}
					/>
					<TextInput
						id={autofill.numberInputId}
						label="Número"
						placeholder="Digite o número"
						value={state.localizacaoNumero ?? ""}
						handleChange={(value) => updateClientLocation({ localizacaoNumero: value || null })}
					/>
				</div>
				<TextInput
					label="Complemento"
					placeholder="Apartamento, bloco, referência..."
					value={state.localizacaoComplemento ?? ""}
					handleChange={(value) => updateClientLocation({ localizacaoComplemento: value || null })}
				/>
			</ResponsiveMenuSection>
		</ResponsiveMenu>
	);
}
