"use client";

import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { createAudience } from "@/lib/mutations/audiences";
import type { TCreateAudienceInput } from "@/schemas/audiences";
import {
	normalizeAudienceFiltersForSubmit,
	useInternalAudienceState,
	type TUseInternalAudienceState,
} from "@/state-hooks/use-internal-audience-state";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import AudienceGeneralBlock from "./Blocks/General";
import AudienceFiltersBlock from "./Blocks/Filters";
import AudienceSegmentationsBlock from "./Blocks/Segmentations";

type NewAudienceProps = {
	closeModal: () => void;
	/** Estado inicial: os resultados de uma pesquisa abrem o modal já com o filtro da opção escolhida. */
	initialState?: Parameters<typeof useInternalAudienceState>[0]["initialState"];
	callbacks?: {
		onMutate?: (variables: TCreateAudienceInput) => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};
export function NewAudience({ closeModal, initialState, callbacks }: NewAudienceProps) {
	const {
		state,
		updateAudience,
		toggleSegmentacao,
		addFilterCondition,
		updateFilterCondition,
		addFilterGroup,
		updateFilterGroupOperator,
		removeFilterNode,
	} = useInternalAudienceState({ initialState: initialState ?? {} });

	async function handleCreateAudience(state: TUseInternalAudienceState["state"]) {
		const nome = state.audience.nome.trim();
		if (!nome) throw new Error("Informe o nome do público.");
		const filtros = normalizeAudienceFiltersForSubmit(state.filtros);
		if (state.segmentacoes.length === 0 && !filtros) throw new Error("Selecione ao menos uma segmentação ou filtro.");
		return await createAudience({
			nome,
			descricao: state.audience.descricao?.trim() || null,
			segmentacoes: state.segmentacoes,
			filtros,
		});
	}

	const { mutate, isPending } = useMutation({
		mutationKey: ["create-audience"],
		mutationFn: handleCreateAudience,
		onMutate: (variables) => callbacks?.onMutate?.(variables as unknown as TCreateAudienceInput),
		onSuccess: (data) => {
			callbacks?.onSuccess?.();
			toast.success(data.message);
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
			menuTitle="NOVO PÚBLICO"
			menuDescription="Construa um público a partir de segmentações RFM e filtros avançados."
			menuActionButtonText="CRIAR PÚBLICO"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => mutate(state)}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
			dialogVariant="md"
			drawerVariant="lg"
		>
			<AudienceGeneralBlock audience={state.audience} updateAudience={updateAudience} />
			<AudienceSegmentationsBlock segmentacoes={state.segmentacoes} toggleSegmentacao={toggleSegmentacao} />
			<AudienceFiltersBlock
				filtros={state.filtros}
				segmentacoes={state.segmentacoes}
				addFilterCondition={addFilterCondition}
				updateFilterCondition={updateFilterCondition}
				addFilterGroup={addFilterGroup}
				updateFilterGroupOperator={updateFilterGroupOperator}
				removeFilterNode={removeFilterNode}
			/>
		</ResponsiveMenu>
	);
}
