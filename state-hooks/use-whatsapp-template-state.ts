import type {
	TWhatsappTemplateBodyParameter,
	TWhatsappTemplateButton,
	TWhatsappTemplateComponents,
	TWhatsappTemplateState,
} from "@/schemas/whatsapp-templates";
import { useCallback, useState } from "react";

type WhatsappTemplateActions = {
	updateTemplate: (update: Partial<TWhatsappTemplateState["whatsappTemplate"]>) => void;
	updateComponents: (update: Partial<TWhatsappTemplateComponents>) => void;
	updateBodyParameters: (parameters: TWhatsappTemplateBodyParameter[]) => void;
	addBodyParameter: (parameter: TWhatsappTemplateBodyParameter) => void;
	removeBodyParameter: (index: number) => void;
	updateButton: (index: number, button: TWhatsappTemplateButton) => void;
	addButton: (button: TWhatsappTemplateButton) => void;
	removeButton: (index: number) => void;
	redefineState: (newState: TWhatsappTemplateState) => void;
	resetState: () => void;
};

type UseWhatsappTemplateStateProps = {
	initialState?: Partial<TWhatsappTemplateState>;
};

export const useWhatsappTemplateState = ({ initialState }: UseWhatsappTemplateStateProps) => {
	const [state, setState] = useState<TWhatsappTemplateState>({
		whatsappTemplate: initialState?.whatsappTemplate || {
			nome: "",
			categoria: "MARKETING",
			componentes: {
				cabecalho: null,
				corpo: {
					conteudo: "",
					parametros: [],
				},
				rodape: null,
				botoes: null,
			},
		},
	});

	const updateTemplate = useCallback((changes: Partial<TWhatsappTemplateState["whatsappTemplate"]>) => {
		return setState((prev) => ({ ...prev, whatsappTemplate: { ...prev.whatsappTemplate, ...changes } as TWhatsappTemplateState["whatsappTemplate"] }));
	}, []);

	const updateComponents = useCallback((changes: Partial<TWhatsappTemplateState["whatsappTemplate"]["componentes"]>) => {
		return setState((prev) => ({
			...prev,
			whatsappTemplate: {
				...prev.whatsappTemplate,
				componentes: { ...prev.whatsappTemplate.componentes, ...changes } as TWhatsappTemplateState["whatsappTemplate"]["componentes"],
			},
		}));
	}, []);

	const updateBodyParameters = useCallback((parameters: TWhatsappTemplateBodyParameter[]) => {
		return setState((prev) => ({
			...prev,
			whatsappTemplate: {
				...prev.whatsappTemplate,
				componentes: { ...prev.whatsappTemplate.componentes, corpo: { ...prev.whatsappTemplate.componentes.corpo, parametros: parameters } },
			},
		}));
	}, []);

	const addBodyParameter = useCallback((parameter: TWhatsappTemplateBodyParameter) => {
		return setState((prev) => ({
			...prev,
			whatsappTemplate: {
				...prev.whatsappTemplate,
				componentes: {
					...prev.whatsappTemplate.componentes,
					corpo: {
						...prev.whatsappTemplate.componentes.corpo,
						parametros: [...prev.whatsappTemplate.componentes.corpo.parametros, parameter] as TWhatsappTemplateBodyParameter[],
					},
				},
			},
		}));
	}, []);

	const removeBodyParameter = useCallback((index: number) => {
		return setState((prev) => ({
			...prev,
			whatsappTemplate: {
				...prev.whatsappTemplate,
				componentes: {
					...prev.whatsappTemplate.componentes,
					corpo: {
						...prev.whatsappTemplate.componentes.corpo,
						parametros: prev.whatsappTemplate.componentes.corpo.parametros.filter((_, i) => i !== index) as TWhatsappTemplateBodyParameter[],
					},
				},
			},
		}));
	}, []);

	const updateButton = useCallback((index: number, button: TWhatsappTemplateButton) => {
		return setState((prev) => ({
			...prev,
			whatsappTemplate: {
				...prev.whatsappTemplate,
				componentes: {
					...prev.whatsappTemplate.componentes,
					botoes: prev.whatsappTemplate.componentes.botoes?.map((b, i) => (i === index ? button : b)) as TWhatsappTemplateButton[],
				},
			},
		}));
	}, []);

	const addButton = useCallback((button: TWhatsappTemplateButton) => {
		return setState((prev) => ({
			...prev,
			whatsappTemplate: {
				...prev.whatsappTemplate,
				componentes: {
					...prev.whatsappTemplate.componentes,
					botoes: [...(prev.whatsappTemplate.componentes.botoes || []), button] as TWhatsappTemplateButton[],
				},
			},
		}));
	}, []);

	const removeButton = useCallback((index: number) => {
		return setState((prev) => ({
			...prev,
			whatsappTemplate: {
				...prev.whatsappTemplate,
				componentes: {
					...prev.whatsappTemplate.componentes,
					botoes: prev.whatsappTemplate.componentes.botoes?.filter((_, i) => i !== index) as TWhatsappTemplateButton[],
				},
			},
		}));
	}, []);

	const resetState = useCallback(() => {
		return setState({
			whatsappTemplate: {
				nome: "",
				categoria: "UTILIDADE",
				componentes: {
					cabecalho: null,
					corpo: {
						conteudo: "",
						parametros: [],
					},
					rodape: null,
					botoes: null,
				},
			},
		});
	}, []);
	const redefineState = useCallback((state: TWhatsappTemplateState) => {
		return setState(state);
	}, []);

	return {
		state,
		updateTemplate,
		updateComponents,
		updateBodyParameters,
		addBodyParameter,
		removeBodyParameter,
		updateButton,
		addButton,
		removeButton,
		redefineState,
		resetState,
	};
};
export type TUseWhatsappTemplateState = ReturnType<typeof useWhatsappTemplateState>;
