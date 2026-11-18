"use client";

import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/mutations/clients";
import type { TCreateClientInput } from "@/app/api/clients/route";
import { useClientState } from "@/state-hooks/use-client-state";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import ClientGeneralBlock from "./Blocks/General";
import ClientLocationsBlock from "./Blocks/Locations";
import ClientProfileBlock from "./Blocks/Profile";
import ClientSocialsBlock from "./Blocks/Socials";
import ClientTagsBlock from "./Blocks/Tags";

type NewClientProps = {
	closeModal: () => void;
	/** clientes.gerenciarBase: permite criar etiqueta nova no bloco de tags. Ausente = não cria. */
	canCreateTags?: boolean;
	callbacks?: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: () => void;
		onSettled?: () => void;
	};
};

function buildCreateClientInput(input: TCreateClientInput): TCreateClientInput {
	return {
		client: input.client,
		clientLocations: input.clientLocations,
		clientTags: input.clientTags,
	};
}

function NewClient({ closeModal, canCreateTags = false, callbacks }: NewClientProps) {
	const { state, updateClient, addClientLocation, updateClientLocation, removeClientLocation, resetState, addClientTag, removeClientTag } =
		useClientState();

	const { mutate: handleCreateClient, isPending } = useMutation({
		mutationKey: ["create-client"],
		mutationFn: createClient,
		onMutate: async () => {
			if (callbacks?.onMutate) callbacks.onMutate();
			return;
		},
		onSuccess: async (response) => {
			if (callbacks?.onSuccess) callbacks.onSuccess();
			toast.success(response.message);
			resetState();
			closeModal();
		},
		onError: (error) => {
			if (callbacks?.onError) callbacks.onError();
			toast.error(getErrorMessage(error));
		},
		onSettled: async () => {
			if (callbacks?.onSettled) callbacks.onSettled();
			return;
		},
	});

	function handleSubmit() {
		if (!state.client.nome.trim()) {
			toast.error("Nome do cliente não informado.");
			return;
		}

		handleCreateClient(
			buildCreateClientInput({
				client: state.client,
				clientLocations: state.clientLocations
					.filter((location) => !location.deletar)
					.map((location) => ({
						titulo: location.titulo,
						localizacaoCep: location.localizacaoCep,
						localizacaoEstado: location.localizacaoEstado,
						localizacaoCidade: location.localizacaoCidade,
						localizacaoBairro: location.localizacaoBairro,
						localizacaoLogradouro: location.localizacaoLogradouro,
						localizacaoNumero: location.localizacaoNumero,
						localizacaoComplemento: location.localizacaoComplemento,
						localizacaoLatitude: location.localizacaoLatitude,
						localizacaoLongitude: location.localizacaoLongitude,
					})),
				clientTags: state.clientTags
					.filter((tagReference) => !tagReference.deletar)
					.map((tagReference) => ({
						clienteTagId: tagReference.clienteTagId,
					})),
			}),
		);
	}

	return (
		<ResponsiveMenu
			menuTitle="NOVO CLIENTE"
			menuDescription="Preencha os dados para cadastrar um novo cliente."
			menuActionButtonText="CRIAR CLIENTE"
			menuCancelButtonText="CANCELAR"
			actionFunction={handleSubmit}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
			dialogVariant="md"
			drawerVariant="md"
		>
			<ClientGeneralBlock client={state.client} updateClient={updateClient} />
			<ClientSocialsBlock client={state.client} updateClient={updateClient} />
			<ClientProfileBlock client={state.client} updateClient={updateClient} />
			<ClientLocationsBlock
				locations={state.clientLocations}
				addClientLocation={addClientLocation}
				updateClientLocation={updateClientLocation}
				removeClientLocation={removeClientLocation}
			/>
			<ClientTagsBlock tags={state.clientTags} addClientTag={addClientTag} removeClientTag={removeClientTag} canCreateTags={canCreateTags} />
		</ResponsiveMenu>
	);
}

export default NewClient;
