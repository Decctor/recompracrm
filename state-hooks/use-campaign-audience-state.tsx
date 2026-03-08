import type { TCampaignAudienceState } from "@/schemas/campaign-audiences";
import type { TFilterTree } from "@/schemas/campaign-audiences";
import { useCallback, useState } from "react";

type TUseCampaignAudienceStateProps = {
	initialState: Partial<TCampaignAudienceState>;
};

const DEFAULT_FILTER_TREE: TFilterTree = {
	logica: "AND",
	condicoes: [],
	grupos: [],
};

export function useCampaignAudienceState({ initialState }: TUseCampaignAudienceStateProps) {
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

	const setFilters = useCallback((filtros: TFilterTree) => {
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
		setFilters,
		redefineState,
		resetState,
	};
}
export type TUseCampaignAudienceState = ReturnType<typeof useCampaignAudienceState>;
