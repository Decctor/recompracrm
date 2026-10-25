"use client";

import type { TCreateFixedAssetInput, TCreateFixedAssetOutput } from "@/app/api/fixed-assets/route";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { createFixedAsset } from "@/lib/mutations/fixed-assets";
import { serializeFixedAssetState, useInternalFixedAssetState } from "@/state-hooks/use-internal-fixed-asset-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import FixedAssetGeneralBlock from "./Blocks/General";
import FixedAssetValuesBlock from "./Blocks/Values";

type NewFixedAssetProps = {
	closeModal: () => void;
	callbacks?: {
		onMutate?: (variables: TCreateFixedAssetInput) => void;
		onSuccess?: (response: TCreateFixedAssetOutput) => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

/** Cadastro manual de bem: o que já existia antes do sistema. Compras recebidas criam bens sozinhas. */
export default function NewFixedAsset({ closeModal, callbacks }: NewFixedAssetProps) {
	const queryClient = useQueryClient();
	const { state, updateAsset } = useInternalFixedAssetState();

	const { mutate, isPending } = useMutation({
		mutationKey: ["create-fixed-asset"],
		mutationFn: createFixedAsset,
		onMutate: (variables) => callbacks?.onMutate?.(variables),
		onSuccess: async (response) => {
			await queryClient.invalidateQueries({ queryKey: ["fixed-assets"] });
			callbacks?.onSuccess?.(response);
			toast.success(response.message);
			closeModal();
		},
		onError: (error) => {
			callbacks?.onError?.(error);
			toast.error(getErrorMessage(error));
		},
		onSettled: () => callbacks?.onSettled?.(),
	});

	return (
		<ResponsiveMenu
			menuTitle="NOVO BEM"
			menuDescription="Um bem do ativo imobilizado que já existia ou foi comprado fora do sistema. Compras recebidas com destinação de ativo criam bens sozinhas."
			menuActionButtonText="CADASTRAR"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => mutate({ asset: serializeFixedAssetState(state.asset) })}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
			dialogVariant="lg"
		>
			<FixedAssetGeneralBlock asset={state.asset} updateAsset={updateAsset} />
			<FixedAssetValuesBlock asset={state.asset} updateAsset={updateAsset} />
		</ResponsiveMenu>
	);
}
