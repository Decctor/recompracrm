import type { TCampaignAudienceState } from "@/schemas/campaign-audiences";
import type { TFilterTree } from "@/schemas/campaign-audiences";
import { useCallback, useState } from "react";

type TUseInternalCampaignAudienceStateProps = {
	initialState: Partial<TCampaignAudienceState>;
};

const DEFAULT_FILTER_TREE: TFilterTree = {
	logica: "AND",
	condicoes: [],
	grupos: [],
};

export function useInternalCampaignAudienceState({ initialState }: TUseInternalCampaignAudienceStateProps) {
	const buildInitialState = (): TCampaignAudienceState => ({
		audience: {
			titulo: initialState.audience?.titulo ?? "",
			descricao: initialState.audience?.descricao ?? null,
			filtros: initialState.audience?.filtros ?? DEFAULT_FILTER_TREE,
		},
	});

	const [state, setState] = useState<TCampaignAudienceState>(buildInitialState);

	const updateAudience = useCallback((changes: Partial<TCampaignAudienceState["audience"]>) => {
		setState((prev) => ({
			...prev,
			audience: { ...prev.audience, ...changes },
		}));
	}, []);

	const setFiltros = useCallback((filtros: TFilterTree) => {
		setState((prev) => ({
			...prev,
			audience: { ...prev.audience, filtros },
		}));
	}, []);

	const redefineState = useCallback((newState: TCampaignAudienceState) => {
		setState(newState);
	}, []);

	const resetState = useCallback(() => {
		setState(buildInitialState());
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	return {
		state,
		updateAudience,
		setFiltros,
		redefineState,
		resetState,
	};
}
export type TUseInternalCampaignAudienceState = ReturnType<typeof useInternalCampaignAudienceState>;
