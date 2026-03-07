import type { TCampaignFlowState } from "@/schemas/campaign-flows";
import { useCallback, useState } from "react";

type TUseInternalCampaignFlowStateProps = {
	initialState: Partial<TCampaignFlowState>;
};

export function useInternalCampaignFlowState({ initialState }: TUseInternalCampaignFlowStateProps) {
	const buildInitialState = (): TCampaignFlowState => ({
		campaignFlow: {
			titulo: initialState.campaignFlow?.titulo ?? "",
			descricao: initialState.campaignFlow?.descricao ?? null,
			status: initialState.campaignFlow?.status ?? "RASCUNHO",
			tipo: initialState.campaignFlow?.tipo ?? "EVENTO",
			recorrenciaTipo: initialState.campaignFlow?.recorrenciaTipo ?? null,
			recorrenciaIntervalo: initialState.campaignFlow?.recorrenciaIntervalo ?? 1,
			recorrenciaDiasSemana: initialState.campaignFlow?.recorrenciaDiasSemana ?? null,
			recorrenciaDiasMes: initialState.campaignFlow?.recorrenciaDiasMes ?? null,
			recorrenciaBlocoHorario: initialState.campaignFlow?.recorrenciaBlocoHorario ?? null,
			unicaDataExecucao: initialState.campaignFlow?.unicaDataExecucao ?? null,
			unicaExecutada: initialState.campaignFlow?.unicaExecutada ?? false,
			atribuicaoModelo: initialState.campaignFlow?.atribuicaoModelo ?? "LAST_TOUCH",
			atribuicaoJanelaDias: initialState.campaignFlow?.atribuicaoJanelaDias ?? 14,
			publicoId: initialState.campaignFlow?.publicoId ?? null,
		},
		nos: initialState.nos ?? [],
		arestas: initialState.arestas ?? [],
	});

	const [state, setState] = useState<TCampaignFlowState>(buildInitialState);

	// ── Campaign flow root ─────────────────────────────────────────────────────

	const updateCampaignFlow = useCallback((changes: Partial<TCampaignFlowState["campaignFlow"]>) => {
		setState((prev) => ({
			...prev,
			campaignFlow: { ...prev.campaignFlow, ...changes },
		}));
	}, []);

	// ── Nodes ──────────────────────────────────────────────────────────────────

	const addNo = useCallback((no: TCampaignFlowState["nos"][number]) => {
		setState((prev) => ({
			...prev,
			nos: [...prev.nos, no],
		}));
	}, []);

	const updateNo = useCallback(({ index, changes }: { index: number; changes: Partial<TCampaignFlowState["nos"][number]> }) => {
		setState((prev) => ({
			...prev,
			nos: prev.nos.map((n, i) => (i === index ? { ...n, ...changes } : n)),
		}));
	}, []);

	const removeNo = useCallback((index: number) => {
		setState((prev) => {
			const isExisting = prev.nos.find((n, i) => i === index && !!n.id);
			if (!isExisting) return { ...prev, nos: prev.nos.filter((_, i) => i !== index) };
			return {
				...prev,
				nos: prev.nos.map((n, i) => (i === index ? { ...n, deletar: true } : n)),
			};
		});
	}, []);

	// ── Edges ──────────────────────────────────────────────────────────────────

	const addAresta = useCallback((aresta: TCampaignFlowState["arestas"][number]) => {
		setState((prev) => ({
			...prev,
			arestas: [...prev.arestas, aresta],
		}));
	}, []);

	const updateAresta = useCallback(({ index, changes }: { index: number; changes: Partial<TCampaignFlowState["arestas"][number]> }) => {
		setState((prev) => ({
			...prev,
			arestas: prev.arestas.map((a, i) => (i === index ? { ...a, ...changes } : a)),
		}));
	}, []);

	const removeAresta = useCallback((index: number) => {
		setState((prev) => {
			const isExisting = prev.arestas.find((a, i) => i === index && !!a.id);
			if (!isExisting) return { ...prev, arestas: prev.arestas.filter((_, i) => i !== index) };
			return {
				...prev,
				arestas: prev.arestas.map((a, i) => (i === index ? { ...a, deletar: true } : a)),
			};
		});
	}, []);

	// ── Full graph replace (for React Flow onChange) ───────────────────────────

	const replaceGraph = useCallback(
		({ nos, arestas }: { nos: TCampaignFlowState["nos"]; arestas: TCampaignFlowState["arestas"] }) => {
			setState((prev) => ({ ...prev, nos, arestas }));
		},
		[],
	);

	// ── Reset / redefine ───────────────────────────────────────────────────────

	const redefineState = useCallback((newState: TCampaignFlowState) => {
		setState(newState);
	}, []);

	const resetState = useCallback(() => {
		setState(buildInitialState());
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	return {
		state,
		updateCampaignFlow,
		addNo,
		updateNo,
		removeNo,
		addAresta,
		updateAresta,
		removeAresta,
		replaceGraph,
		redefineState,
		resetState,
	};
}
export type TUseInternalCampaignFlowState = ReturnType<typeof useInternalCampaignFlowState>;
