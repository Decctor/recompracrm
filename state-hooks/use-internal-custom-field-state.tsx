import { buildUniqueCustomFieldOptionValues } from "@/lib/custom-fields/option-values";
import { CustomFieldOptionSchema, CustomFieldSchema } from "@/schemas/custom-fields";
import { useCallback, useMemo, useState } from "react";
import z from "zod";

// Tipos que carregam opções: o editor de opções só aparece para eles.
export const CUSTOM_FIELD_CHOICE_TYPES = ["ESCOLHA_UNICA", "ESCOLHA_MULTIPLA"] as const;
export type TCustomFieldChoiceType = (typeof CUSTOM_FIELD_CHOICE_TYPES)[number];

export function isCustomFieldChoiceType(tipo: string): tipo is TCustomFieldChoiceType {
	return (CUSTOM_FIELD_CHOICE_TYPES as readonly string[]).includes(tipo);
}

const CustomFieldStateSchema = z.object({
	customField: CustomFieldSchema.omit({ organizacaoId: true, dataInsercao: true, dataAtualizacao: true }).extend({
		// `valor` fica vazio nas opções novas até o submit, quando é derivado do título
		// (lib/custom-fields/option-values.ts). Opções já gravadas mantêm o valor: ele é o que
		// está nos clientes e nos botões de pesquisa.
		opcoes: z.array(CustomFieldOptionSchema).nullable(),
	}),
});
export type TCustomFieldState = z.infer<typeof CustomFieldStateSchema>;
export type TCustomFieldStateOption = TCustomFieldState["customField"]["opcoes"] extends (infer T)[] | null ? T : never;

export type TUseInternalCustomFieldStateProps = {
	initialState?: Partial<TCustomFieldState>;
};

export function useInternalCustomFieldState({ initialState }: TUseInternalCustomFieldStateProps = {}) {
	const initialStateHolder: TCustomFieldState = useMemo(
		() => ({
			customField: {
				entidade: initialState?.customField?.entidade ?? "CLIENTE",
				chaveNativa: initialState?.customField?.chaveNativa ?? null,
				titulo: initialState?.customField?.titulo ?? "",
				descricao: initialState?.customField?.descricao ?? null,
				tipo: initialState?.customField?.tipo ?? "ESCOLHA_UNICA",
				opcoes: initialState?.customField?.opcoes ?? [
					{ valor: "", titulo: "", legenda: null, icone: null },
					{ valor: "", titulo: "", legenda: null, icone: null },
				],
				ativo: initialState?.customField?.ativo ?? true,
			},
		}),
		[initialState],
	);
	const [state, setState] = useState<TCustomFieldState>(initialStateHolder);

	const updateCustomField = useCallback((customField: Partial<TCustomFieldState["customField"]>) => {
		setState((prev) => ({ ...prev, customField: { ...prev.customField, ...customField } }));
	}, []);

	const addOption = useCallback(() => {
		setState((prev) => ({
			...prev,
			customField: { ...prev.customField, opcoes: [...(prev.customField.opcoes ?? []), { valor: "", titulo: "", legenda: null, icone: null }] },
		}));
	}, []);

	const updateOption = useCallback((index: number, option: Partial<TCustomFieldStateOption>) => {
		setState((prev) => ({
			...prev,
			customField: {
				...prev.customField,
				opcoes: (prev.customField.opcoes ?? []).map((item, itemIndex) => (itemIndex === index ? { ...item, ...option } : item)),
			},
		}));
	}, []);

	const removeOption = useCallback((index: number) => {
		setState((prev) => ({
			...prev,
			customField: { ...prev.customField, opcoes: (prev.customField.opcoes ?? []).filter((_, itemIndex) => itemIndex !== index) },
		}));
	}, []);

	// A ordem das opções é a ordem dos botões gerados e dos cartões do cadastro: mover é trocar
	// de lugar com o vizinho.
	const moveOption = useCallback((index: number, direction: -1 | 1) => {
		setState((prev) => {
			const opcoes = [...(prev.customField.opcoes ?? [])];
			const target = index + direction;
			if (!opcoes[index] || !opcoes[target]) return prev;
			[opcoes[index], opcoes[target]] = [opcoes[target], opcoes[index]];
			return { ...prev, customField: { ...prev.customField, opcoes } };
		});
	}, []);

	const resetState = useCallback(() => setState(initialStateHolder), [initialStateHolder]);
	const redefineState = useCallback((next: TCustomFieldState) => setState(next), []);

	return {
		state,
		updateCustomField,
		addOption,
		updateOption,
		removeOption,
		moveOption,
		resetState,
		redefineState,
	};
}
export type TUseInternalCustomFieldState = ReturnType<typeof useInternalCustomFieldState>;

/**
 * Prepara o campo para o envio: opções sem título caem fora, valores novos são derivados do
 * título (únicos entre si e frente aos já gravados) e campos sem opções não mandam `opcoes`.
 * Lança com a mensagem que o modal mostra ao usuário.
 */
export function prepareCustomFieldForSubmit(customField: TCustomFieldState["customField"]) {
	const titulo = customField.titulo.trim();
	if (!titulo) throw new Error("Informe o título do campo.");

	if (!isCustomFieldChoiceType(customField.tipo)) {
		return { ...customField, titulo, descricao: customField.descricao?.trim() || null, opcoes: null };
	}

	const filled = (customField.opcoes ?? []).map((option) => ({ ...option, titulo: option.titulo.trim() })).filter((option) => option.titulo);
	if (filled.length === 0) throw new Error("Campos de escolha precisam de ao menos uma opção.");

	const existingValues = new Set(filled.map((option) => option.valor).filter(Boolean));
	const derived = buildUniqueCustomFieldOptionValues(filled.map((option) => option.titulo));
	const opcoes = filled.map((option, index) => {
		if (option.valor) return option;
		let valor = derived[index];
		let suffix = 2;
		while (existingValues.has(valor)) valor = `${derived[index].slice(0, 60)}_${suffix++}`;
		existingValues.add(valor);
		return { ...option, valor };
	});

	return { ...customField, titulo, descricao: customField.descricao?.trim() || null, opcoes };
}
