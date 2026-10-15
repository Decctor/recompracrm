import { PreparationStationRuleSchema, PreparationStationSchema } from "@/schemas/preparation-stations";
import { useCallback, useMemo, useState } from "react";
import z from "zod";

// Regras são substituição completa no PUT (sem `id`/`deletar`): o estado guarda só o que vai.
// `produto` acompanha a regra PRODUTO apenas para exibição (nome) e não é enviado.
const PreparationStationStateSchema = z.object({
	station: PreparationStationSchema.omit({ organizacaoId: true, dataInsercao: true, dataAtualizacao: true }),
	rules: z.array(
		PreparationStationRuleSchema.pick({ criterio: true, valor: true }).extend({
			produto: z.object({ id: z.string(), nome: z.string() }).optional().nullable(),
		}),
	),
});
export type TPreparationStationState = z.infer<typeof PreparationStationStateSchema>;
export type TPreparationStationStateRule = TPreparationStationState["rules"][number];

function normalizeGroup(grupo: string) {
	return grupo.trim().toLocaleLowerCase("pt-BR");
}

function isSameRule(a: TPreparationStationStateRule["valor"], b: TPreparationStationStateRule["valor"]) {
	if (a.criterio === "GRUPO" && b.criterio === "GRUPO") return normalizeGroup(a.grupo) === normalizeGroup(b.grupo);
	if (a.criterio === "PRODUTO" && b.criterio === "PRODUTO") return a.produtoId === b.produtoId;
	return false;
}

type UseInternalPreparationStationStateProps = {
	initialState?: Partial<TPreparationStationState>;
};
export function useInternalPreparationStationState({ initialState }: UseInternalPreparationStationStateProps = {}) {
	const initialStateHolder: TPreparationStationState = useMemo(
		() => ({
			station: {
				nome: initialState?.station?.nome ?? "",
				ordem: initialState?.station?.ordem ?? 0,
				ativa: initialState?.station?.ativa ?? true,
				padrao: initialState?.station?.padrao ?? false,
				escopoTicket: initialState?.station?.escopoTicket ?? "PEDIDO",
			},
			rules: initialState?.rules ?? [],
		}),
		[initialState],
	);
	const [state, setState] = useState<TPreparationStationState>(initialStateHolder);

	const updateStation = useCallback((station: Partial<TPreparationStationState["station"]>) => {
		setState((prev) => ({ ...prev, station: { ...prev.station, ...station } }));
	}, []);

	// Regra repetida (mesmo grupo sem caixa/espaços, mesmo produto) não entra duas vezes.
	const addRule = useCallback((rule: TPreparationStationStateRule) => {
		setState((prev) => (prev.rules.some((current) => isSameRule(current.valor, rule.valor)) ? prev : { ...prev, rules: [...prev.rules, rule] }));
	}, []);

	const removeRule = useCallback((rule: TPreparationStationStateRule["valor"]) => {
		setState((prev) => ({ ...prev, rules: prev.rules.filter((current) => !isSameRule(current.valor, rule)) }));
	}, []);

	// O multi-select de grupos devolve a seleção inteira: troca só as regras GRUPO.
	const replaceGroupRules = useCallback((grupos: string[]) => {
		setState((prev) => ({
			...prev,
			rules: [
				...prev.rules.filter((rule) => rule.valor.criterio !== "GRUPO"),
				...grupos.map((grupo) => ({ criterio: "GRUPO" as const, valor: { criterio: "GRUPO" as const, grupo } })),
			],
		}));
	}, []);

	const resetState = useCallback(() => setState(initialStateHolder), [initialStateHolder]);
	const redefineState = useCallback((next: TPreparationStationState) => setState(next), []);

	return { state, updateStation, addRule, removeRule, replaceGroupRules, redefineState, resetState };
}
export type TUseInternalPreparationStationState = ReturnType<typeof useInternalPreparationStationState>;

/** Payload `{ station, rules }` da API: tira o rótulo de exibição das regras; `criterio` sai sempre de valor.criterio. */
export function toPreparationStationPayload(state: TPreparationStationState) {
	return { station: state.station, rules: state.rules.map((rule) => ({ criterio: rule.valor.criterio, valor: rule.valor })) };
}
