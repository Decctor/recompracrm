import { z } from "zod";
import { MessageTemplateSchema, TMessageTemplateContent } from "@/schemas/message-templates";
import { useCallback, useMemo, useState } from "react";
import {
	getDefaultMessageTemplateVariableExample,
	getMessageTemplateButtonPreset,
	MessageTemplateNativeVariablesById,
	TMessageTemplateButtonPresetId,
} from "@/lib/message-templates";
import { TTemplateParameterDraft } from "@/app/dashboard/communication/_components/template-draft-store";

export function extractTemplateVariables(sources: string[]) {
	const identifiers = new Set<string>();
	for (const source of sources) {
		for (const match of source.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) {
			if (match[1] && MessageTemplateNativeVariablesById.has(match[1])) identifiers.add(match[1]);
		}
		for (const match of source.matchAll(/data-id=["']([^"']+)["']/g)) {
			if (match[1] && MessageTemplateNativeVariablesById.has(match[1])) identifiers.add(match[1]);
		}
	}
	return Array.from(identifiers);
}

export function extractUnknownTemplateVariables(sources: string[]) {
	const identifiers = new Set<string>();
	for (const source of sources) {
		for (const match of source.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) {
			if (match[1] && !MessageTemplateNativeVariablesById.has(match[1])) identifiers.add(match[1]);
		}
		for (const match of source.matchAll(/data-id=["']([^"']+)["']/g)) {
			if (match[1] && !MessageTemplateNativeVariablesById.has(match[1])) identifiers.add(match[1]);
		}
	}
	return Array.from(identifiers);
}

export function replaceTemplateVariables(text: string, parametros: TTemplateParameterDraft[]) {
	return parametros.reduce((result, parametro) => {
		const value = parametro.exemplo || `{{${parametro.identificadorInterno}}}`;
		return result.replaceAll(new RegExp(`\\{\\{\\s*${parametro.identificadorInterno}\\s*\\}\\}`, "g"), value);
	}, text);
}

function buildEmptyMessageTemplateInitialState(organizationName: string): TMessageTemplateState {
	return {
		messageTemplate: {
			nome: "",
			status: "RASCUNHO",
			linguagem: "pt_BR",
			categoria: "MARKETING",
			metadados: {
				porNumeroTelefone: {},
			},
			conteudo: {
				assunto: "",
				preheader: "",
				corpo: {
					conteudo: `Olá {{clientName}}, temos uma condição especial esperando por você na ${organizationName}.`,
					parametros: [
						{
							identificadorInterno: "clientName",
							identificadorExterno: "1",
							exemplo: getDefaultMessageTemplateVariableExample("clientName"),
						},
					],
				},
				rodape: "Responda esta mensagem se quiser falar com nossa equipe.",
				botoes: [{ tipo: "URL", texto: "Ver oferta", url: "https://recompracrm.com.br" }],
			},
		},
	};
}
const MessageTemplateStateSchema = z.object({
	messageTemplate: MessageTemplateSchema.omit({ autorId: true, dataInsercao: true }),
});
type TMessageTemplateState = z.infer<typeof MessageTemplateStateSchema>;

type TUseMessageTemplateStateProps = {
	organizationName: string;
	initialState?: TMessageTemplateState;
};
export function useMessageTemplateState({ organizationName, initialState }: TUseMessageTemplateStateProps) {
	const finalInitialState = useMemo(() => initialState || buildEmptyMessageTemplateInitialState(organizationName), [organizationName, initialState]);
	const [state, setState] = useState<TMessageTemplateState>(finalInitialState);

	const updateTemplate = useCallback((update: Partial<TMessageTemplateState["messageTemplate"]>) => {
		setState((prev) => ({ ...prev, messageTemplate: { ...prev.messageTemplate, ...update } as TMessageTemplateState["messageTemplate"] }));
	}, []);

	const updateTemplateContent = useCallback((update: Partial<TMessageTemplateState["messageTemplate"]["conteudo"]>) => {
		setState((current) => ({
			...current,
			messageTemplate: { ...current.messageTemplate, conteudo: { ...current.messageTemplate.conteudo, ...update } },
		}));
	}, []);

	const updateTemplateContentHeader = useCallback((update: Partial<TMessageTemplateState["messageTemplate"]["conteudo"]["cabecalho"]>) => {
		setState((current) => ({
			...current,
			messageTemplate: {
				...current.messageTemplate,
				conteudo: {
					...current.messageTemplate.conteudo,
					cabecalho: { ...current.messageTemplate.conteudo.cabecalho, ...update } as TMessageTemplateState["messageTemplate"]["conteudo"]["cabecalho"],
				},
			},
		}));
	}, []);

	const updateTemplateContentBody = useCallback((update: Partial<TMessageTemplateState["messageTemplate"]["conteudo"]["corpo"]>) => {
		setState((current) => ({
			...current,
			messageTemplate: {
				...current.messageTemplate,
				conteudo: { ...current.messageTemplate.conteudo, corpo: { ...current.messageTemplate.conteudo.corpo, ...update } },
			},
		}));
	}, []);

	const updateTemplateContentBodyParameter = useCallback(
		(index: number, update: Partial<TMessageTemplateState["messageTemplate"]["conteudo"]["corpo"]["parametros"][number]>) => {
			setState((current) => ({
				...current,
				messageTemplate: {
					...current.messageTemplate,
					conteudo: {
						...current.messageTemplate.conteudo,
						corpo: {
							...current.messageTemplate.conteudo.corpo,
							parametros: current.messageTemplate.conteudo.corpo.parametros.map((parametro, itemIndex) =>
								itemIndex === index ? { ...parametro, ...update } : parametro,
							),
						},
					},
				},
			}));
		},
		[],
	);

	const addContentButton = useCallback(() => {
		setState((current) => ({
			...current,
			messageTemplate: {
				...current.messageTemplate,
				conteudo: {
					...current.messageTemplate.conteudo,
					botoes: [...current.messageTemplate.conteudo.botoes, { tipo: "URL", texto: "Abrir link", url: "https://" }],
				},
			},
		}));
	}, []);

	const addContentPresetButton = useCallback((presetId: TMessageTemplateButtonPresetId) => {
		const preset = getMessageTemplateButtonPreset(presetId);
		if (!preset) return;
		setState((current) => ({
			...current,
			messageTemplate: {
				...current.messageTemplate,
				conteudo: {
					...current.messageTemplate.conteudo,
					botoes: [
						...current.messageTemplate.conteudo.botoes,
						{
							tipo: "URL_PRESET",
							preset: preset.id,
							texto: preset.defaultText,
							exemplo: preset.resolveWhatsappParameterExample(),
						},
					],
				},
			},
		}));
	}, []);

	// Botões de pesquisa entram em lote (uma opção do campo por botão), então o append é genérico.
	const appendContentButtons = useCallback((buttons: TMessageTemplateContent["botoes"]) => {
		if (buttons.length === 0) return;
		setState((current) => ({
			...current,
			messageTemplate: {
				...current.messageTemplate,
				conteudo: { ...current.messageTemplate.conteudo, botoes: [...current.messageTemplate.conteudo.botoes, ...buttons] },
			},
		}));
	}, []);

	const updateContentButton = useCallback((index: number, button: TMessageTemplateContent["botoes"][number]) => {
		setState((current) => ({
			...current,
			messageTemplate: {
				...current.messageTemplate,
				conteudo: {
					...current.messageTemplate.conteudo,
					botoes: current.messageTemplate.conteudo.botoes.map((item, itemIndex) => (itemIndex === index ? button : item)),
				},
			},
		}));
	}, []);

	const removeContentButton = useCallback((index: number) => {
		setState((current) => ({
			...current,
			messageTemplate: {
				...current.messageTemplate,
				conteudo: { ...current.messageTemplate.conteudo, botoes: current.messageTemplate.conteudo.botoes.filter((_, itemIndex) => itemIndex !== index) },
			},
		}));
	}, []);

	const resetState = useCallback(() => {
		setState(finalInitialState);
	}, [finalInitialState]);

	const redefineState = useCallback((newState: TMessageTemplateState) => {
		setState(newState);
	}, []);

	const detectedVariables = useMemo(
		() =>
			extractTemplateVariables([
				state.messageTemplate.conteudo.assunto,
				state.messageTemplate.conteudo.preheader,
				state.messageTemplate.conteudo.cabecalho?.conteudoTexto ?? "",
				state.messageTemplate.conteudo.corpo.conteudo,
				state.messageTemplate.conteudo.rodape ?? "",
				...state.messageTemplate.conteudo.botoes.map((button) => button.texto),
			]),
		[state.messageTemplate],
	);
	const unknownVariables = useMemo(
		() =>
			extractUnknownTemplateVariables([
				state.messageTemplate.conteudo.assunto,
				state.messageTemplate.conteudo.preheader,
				state.messageTemplate.conteudo.cabecalho?.conteudoTexto ?? "",
				state.messageTemplate.conteudo.corpo.conteudo,
				state.messageTemplate.conteudo.rodape ?? "",
				...state.messageTemplate.conteudo.botoes.map((button) => button.texto),
			]),
		[state.messageTemplate],
	);
	const whatsappWarnings = useMemo(() => {
		const warnings: string[] = [];
		if (state.messageTemplate.conteudo.corpo.conteudo.length > 1024) warnings.push("O corpo está longo para WhatsApp.");
		if (state.messageTemplate.conteudo.botoes.length > 3) warnings.push("WhatsApp costuma funcionar melhor com até 3 botões.");
		if (
			state.messageTemplate.conteudo.cabecalho?.tipo !== "NENHUM" &&
			state.messageTemplate.conteudo.cabecalho?.tipo !== "TEXTO" &&
			state.messageTemplate.conteudo.cabecalho?.tipo !== "IMAGEM_DINAMICA" &&
			!state.messageTemplate.conteudo.cabecalho?.conteudoMidiaUrl
		) {
			warnings.push("Envie a mídia do cabeçalho.");
		}
		return warnings;
	}, [state.messageTemplate]);

	const emailWarnings = useMemo(() => {
		const warnings: string[] = [];
		if (!state.messageTemplate.conteudo.assunto.trim()) warnings.push("O e-mail precisa de assunto.");
		if (state.messageTemplate.conteudo.assunto.length > 80) warnings.push("O assunto pode ficar cortado em caixas de entrada.");
		if (!state.messageTemplate.conteudo.preheader.trim()) warnings.push("Preheader recomendado para melhorar leitura na caixa de entrada.");
		return warnings;
	}, [state.messageTemplate]);

	return {
		state,
		updateTemplate,
		updateTemplateContent,
		updateTemplateContentHeader,
		updateTemplateContentBody,
		updateTemplateContentBodyParameter,
		addContentButton,
		addContentPresetButton,
		appendContentButtons,
		updateContentButton,
		removeContentButton,
		resetState,
		redefineState,
		detectedVariables,
		unknownVariables,
		whatsappWarnings,
		emailWarnings,
	};
}
export type TUseMessageTemplateState = ReturnType<typeof useMessageTemplateState>;
