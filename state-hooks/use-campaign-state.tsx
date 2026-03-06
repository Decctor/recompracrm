import type { TCampaignState } from "@/schemas/campaigns";
import { useCallback, useState } from "react";

export function useCampaignState() {
	const initialState: TCampaignState = {
		campaign: {
			ativo: true,
			titulo: "",
			descricao: "",
			gatilhoTipo: "NOVA-COMPRA",
			gatilhoCashbackExpirandoAntecedenciaValor: null,
			gatilhoCashbackExpirandoAntecedenciaMedida: null,
			recorrenciaTipo: null,
			recorrenciaIntervalo: 1,
			recorrenciaDiasSemana: null,
			recorrenciaDiasMes: null,
			execucaoAgendadaMedida: "DIAS",
			execucaoAgendadaValor: 0,
			execucaoAgendadaBloco: "06:00",
			whatsappTemplateId: "",
			whatsappConexaoTelefoneId: "",
			permitirRecorrencia: true,
			frequenciaIntervaloValor: 0,
			frequenciaIntervaloMedida: "DIAS",
			atribuicaoModelo: "LAST_TOUCH",
			atribuicaoJanelaDias: 14,
			cashbackGeracaoAtivo: false,
			cashbackGeracaoTipo: null,
			cashbackGeracaoValor: null,
			cashbackGeracaoExpiracaoMedida: null,
			cashbackGeracaoExpiracaoValor: null,
		},
		segmentations: [],
	};

	const [state, setState] = useState<TCampaignState>(initialState);

	const updateCampaign = useCallback((campaign: Partial<TCampaignState["campaign"]>) => {
		setState((prev) => ({
			...prev,
			campaign: { ...prev.campaign, ...campaign },
		}));
	}, []);
	const addSegmentation = useCallback((segmentation: TCampaignState["segmentations"][number]) => {
		setState((prev) => ({
			...prev,
			segmentations: [...prev.segmentations, segmentation],
		}));
	}, []);
	const updateSegmentation = useCallback((segmentation: TCampaignState["segmentations"][number]) => {
		setState((prev) => ({
			...prev,
			segmentations: prev.segmentations.map((s) => (s.id === segmentation.id ? { ...s, ...segmentation } : s)),
		}));
	}, []);
	const deleteSegmentation = useCallback(
		(index: number) => {
			const isExistingSegmentation = state.segmentations.find((s, sIndex) => sIndex === index && !!s.id);
			setState((prev) => ({
				...prev,
				segmentations: isExistingSegmentation
					? prev.segmentations.map((p) => (p.id === isExistingSegmentation.id ? { ...p, deletar: true } : p)) // flagging for deletion
					: prev.segmentations.filter((_, sIndex) => sIndex !== index),
			}));
		},
		[state.segmentations],
	);

	const resetState = useCallback(() => {
		setState(initialState);
	}, []);
	const redefineState = useCallback((state: TCampaignState) => {
		setState(state);
	}, []);
	return {
		state,
		updateCampaign,
		addSegmentation,
		updateSegmentation,
		deleteSegmentation,
		resetState,
		redefineState,
	};
}
export type TUseCampaignState = ReturnType<typeof useCampaignState>;
