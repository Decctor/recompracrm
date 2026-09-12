"use client";

import {
	type TClientRegistryClient,
	type TClientRegistrySection,
	buildClientSectionUpdateInput,
	mapClientToState,
	validateClientSectionState,
} from "@/lib/clients/client-registry-state";
import { getErrorMessage } from "@/lib/errors";
import { updateClient as updateClientMutation } from "@/lib/mutations/clients";
import { useClientState } from "@/state-hooks/use-client-state";
import { useDirtyFlag, wrapWithDirty } from "@/state-hooks/use-product-section-editor";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";

type ClientSectionEditorCallbacks = {
	onMutate?: () => void;
	onSuccess?: () => void;
	onError?: (error: Error) => void;
	onSettled?: () => void;
};

type UseClientSectionEditorParams = {
	client: TClientRegistryClient;
	section: TClientRegistrySection;
	callbacks?: ClientSectionEditorCallbacks;
};

/**
 * Rascunho de uma seção do cadastro do cliente, com barra de aplicar própria — o mesmo contrato do
 * cadastro de produto (`use-product-section-editor`).
 *
 * Cada seção mantém o estado inteiro do cliente para poder ler o que precisa (o endereço principal
 * depende da lista de localizações, a completude depende de tudo), mas o que ela envia é recortado
 * em `buildClientSectionUpdateInput`: só os campos que a seção edita saem do rascunho, o resto vem
 * do cliente do servidor. Enquanto a seção está suja ela ignora o refetch — senão uma invalidação
 * disparada por outra seção apagaria o que o usuário acabou de digitar aqui.
 */
export function useClientSectionEditor({ client, section, callbacks }: UseClientSectionEditorParams) {
	const initialState = useMemo(() => mapClientToState(client), [client]);
	const { isDirty, isDirtyRef, markDirty, clearDirty } = useDirtyFlag();
	const clientState = useClientState({ initialState });
	const { state, redefineState } = clientState;

	const discard = useCallback(() => {
		redefineState(mapClientToState(client));
		clearDirty();
	}, [clearDirty, client, redefineState]);

	useEffect(() => {
		if (!isDirtyRef.current) redefineState(mapClientToState(client));
	}, [client, isDirtyRef, redefineState]);

	const { mutate: applyMutation, isPending } = useMutation({
		mutationKey: ["apply-client-section", section, client.id],
		mutationFn: async () => {
			const validationError = validateClientSectionState(section, state);
			if (validationError) throw new Error(validationError);

			return updateClientMutation(buildClientSectionUpdateInput({ client, draft: state, section }));
		},
		onMutate: () => callbacks?.onMutate?.(),
		onSuccess: (data) => {
			clearDirty();
			callbacks?.onSuccess?.();
			toast.success(data.message);
		},
		onError: (error) => {
			callbacks?.onError?.(error as Error);
			toast.error(getErrorMessage(error));
		},
		onSettled: () => callbacks?.onSettled?.(),
	});

	const apply = useCallback(() => applyMutation(), [applyMutation]);

	const updaters = useMemo(
		() => ({
			updateClient: wrapWithDirty(clientState.updateClient, markDirty),
			addClientLocation: wrapWithDirty(clientState.addClientLocation, markDirty),
			updateClientLocation: wrapWithDirty(clientState.updateClientLocation, markDirty),
			removeClientLocation: wrapWithDirty(clientState.removeClientLocation, markDirty),
			addClientTag: wrapWithDirty(clientState.addClientTag, markDirty),
			removeClientTag: wrapWithDirty(clientState.removeClientTag, markDirty),
		}),
		[
			clientState.addClientLocation,
			clientState.addClientTag,
			clientState.removeClientLocation,
			clientState.removeClientTag,
			clientState.updateClient,
			clientState.updateClientLocation,
			markDirty,
		],
	);

	return {
		state,
		isDirty,
		isPending,
		apply,
		discard,
		...updaters,
	};
}

export type TUseClientSectionEditor = ReturnType<typeof useClientSectionEditor>;
