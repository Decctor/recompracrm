"use client";

import type { TCreateProductionInput } from "@/app/api/productions/route";
import type { TGetProductionRecipesOutputDefault } from "@/app/api/productions/recipes/route";
import { getErrorMessage } from "@/lib/errors";
import { createProduction } from "@/lib/mutations/productions";
import { appRoutes } from "@/lib/navigation/routes";
import { useProductionRecipeById } from "@/lib/queries/productions";
import { useInternalProductionState, type TUseInternalProductionState } from "@/state-hooks/use-internal-production-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { addDuration, formatDayMonth } from "../helpers/format";
import {
	buildRecipePlan,
	buildRecipeProductionPayload,
	getRecipeDefaults,
	type TBuilderRecipe,
	type TProductionPayloadStatus,
	type TRecipePlan,
	type TRecipeQuantities,
	type TReincorporationState,
} from "../helpers/plan";
import { STAGE_ORDER, type TBuilderStageId } from "../helpers/stages";

export type TRecipeListItem = TGetProductionRecipesOutputDefault["recipes"][number];

export type TBuilderSelection = { kind: "recipe"; recipeId: string; preview: TRecipeListItem | null } | { kind: "manual" } | null;

type TBuilderContext = {
	stage: TBuilderStageId;
	goToStage: (stage: TBuilderStageId) => void;
	isStageLocked: (stage: TBuilderStageId) => boolean;
	next: () => void;
	back: () => void;

	selection: TBuilderSelection;
	pickRecipe: (recipe: TRecipeListItem) => void;
	pickManual: () => void;

	recipe: TBuilderRecipe | null;
	recipeLoading: boolean;
	recipeError: string | null;
	plan: TRecipePlan | null;
	quantities: TRecipeQuantities | null;
	setTarget: (target: number) => void;
	updateReinc: (patch: Partial<TReincorporationState>) => void;

	manual: TUseInternalProductionState;
	manualInputsCount: number;
	manualOutputsCount: number;

	title: string;
	titleIsAuto: boolean;
	setTitle: (title: string) => void;

	start: Date;
	startIsAuto: boolean;
	setStart: (date: Date | null) => void;
	end: Date | null;
	endIsAuto: boolean;
	setEnd: (date: Date | null) => void;

	/** A etapa de quantidades está completa (receita escalada sem bloqueio, ou itens livres com saída). */
	quantitiesReady: boolean;
	/** Motivo pelo qual a revisão ainda não pode ser confirmada. */
	reviewIssue: string | null;
	submit: (status: TProductionPayloadStatus) => void;
	isSubmitting: boolean;
	submittingStatus: TProductionPayloadStatus | null;
};

const BuilderContext = createContext<TBuilderContext | null>(null);

export function useBuilder() {
	const context = useContext(BuilderContext);
	if (!context) throw new Error("useBuilder must be used inside <BuilderProvider>.");
	return context;
}

/** "Agora" que acompanha o relógio: a página fica aberta no tablet da cozinha. */
function useNow(intervalMs: number) {
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		const timer = setInterval(() => setNow(new Date()), intervalMs);
		return () => clearInterval(timer);
	}, [intervalMs]);
	return now;
}

function stripItemState<T extends { id?: string | null; deletar?: boolean | null; produto?: unknown; produtoVariante?: unknown }>(item: T) {
	const { id: _id, deletar: _deletar, produto: _produto, produtoVariante: _produtoVariante, ...rest } = item;
	return rest;
}

export function BuilderProvider({ initialRecipeId, children }: { initialRecipeId: string | null; children: ReactNode }) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const now = useNow(30_000);

	const [stage, setStage] = useState<TBuilderStageId>(initialRecipeId ? "quantities" : "recipe");
	const [selection, setSelection] = useState<TBuilderSelection>(initialRecipeId ? { kind: "recipe", recipeId: initialRecipeId, preview: null } : null);
	// Quantidades valem para a receita em que foram definidas; trocar de receita volta aos padrões dela.
	const [quantitiesState, setQuantitiesState] = useState<(TRecipeQuantities & { recipeId: string }) | null>(null);
	const [titleOverride, setTitleOverride] = useState<string | null>(null);
	const [startOverride, setStartOverride] = useState<Date | null>(null);
	const [endOverride, setEndOverride] = useState<{ value: Date | null } | null>(null);

	const manual = useInternalProductionState({ initialState: {} });

	const recipeId = selection?.kind === "recipe" ? selection.recipeId : null;
	const recipeQuery = useProductionRecipeById({ id: recipeId });
	const recipe = recipeId && recipeQuery.data?.id === recipeId ? recipeQuery.data : null;
	const recipeError = recipeId && recipeQuery.isError ? getErrorMessage(recipeQuery.error) : null;
	const recipeLoading = !!recipeId && !recipe && !recipeError;

	const quantities = useMemo(() => {
		if (!recipe) return null;
		if (quantitiesState?.recipeId === recipe.id) return { target: quantitiesState.target, reinc: quantitiesState.reinc };
		return getRecipeDefaults(recipe);
	}, [recipe, quantitiesState]);

	const start = startOverride ?? now;
	const plan = useMemo(() => (recipe && quantities ? buildRecipePlan({ recipe, quantities, start }) : null), [recipe, quantities, start]);

	const autoEnd = plan?.duration ? addDuration(start, plan.duration.valor, plan.duration.medida) : null;
	const end = endOverride ? endOverride.value : autoEnd;

	const autoTitle = recipe ? `${recipe.titulo} · ${formatDayMonth(start)}` : "";
	const title = titleOverride ?? autoTitle;

	const activeInputs = manual.state.productionInputs.filter((item) => !item.deletar);
	const activeOutputs = manual.state.productionOutputs.filter((item) => !item.deletar);

	const quantitiesReady = selection?.kind === "manual" ? activeOutputs.length > 0 : !!plan && !plan.blocked;
	let reviewIssue: string | null = null;
	if (!quantitiesReady) reviewIssue = "Defina as quantidades antes de continuar.";
	else if (!title.trim()) reviewIssue = "Informe o título da produção.";
	else if (end && end.getTime() < start.getTime()) reviewIssue = "A previsão de conclusão é anterior ao início.";

	const isStageLocked = useCallback(
		(target: TBuilderStageId) => {
			if (target === "recipe") return false;
			if (!selection) return true;
			if (target === "review") return !quantitiesReady;
			return false;
		},
		[selection, quantitiesReady],
	);

	const goToStage = useCallback(
		(target: TBuilderStageId) => {
			if (isStageLocked(target)) return;
			setStage(target);
		},
		[isStageLocked],
	);

	const next = useCallback(() => {
		const nextStage = STAGE_ORDER[STAGE_ORDER.indexOf(stage) + 1];
		if (nextStage) goToStage(nextStage);
	}, [stage, goToStage]);

	const back = useCallback(() => {
		const previousStage = STAGE_ORDER[STAGE_ORDER.indexOf(stage) - 1];
		if (previousStage) setStage(previousStage);
	}, [stage]);

	const pickRecipe = useCallback((item: TRecipeListItem) => {
		setSelection({ kind: "recipe", recipeId: item.id, preview: item });
		setQuantitiesState(null);
		// Título, início e conclusão ajustados à mão valiam para a receita anterior.
		setTitleOverride(null);
		setStartOverride(null);
		setEndOverride(null);
		setStage("quantities");
	}, []);

	const pickManual = useCallback(() => {
		setSelection({ kind: "manual" });
		setTitleOverride(null);
		setStartOverride(null);
		setEndOverride(null);
		setStage("quantities");
	}, []);

	const updateQuantities = useCallback(
		(patch: (current: TRecipeQuantities) => TRecipeQuantities) => {
			if (!recipe || !quantities) return;
			setQuantitiesState({ ...patch(quantities), recipeId: recipe.id });
		},
		[recipe, quantities],
	);

	const setTarget = useCallback((target: number) => updateQuantities((current) => ({ ...current, target })), [updateQuantities]);
	const updateReinc = useCallback(
		(reincPatch: Partial<TReincorporationState>) => updateQuantities((current) => ({ ...current, reinc: { ...current.reinc, ...reincPatch } })),
		[updateQuantities],
	);

	// Fica travado depois do sucesso: a navegação para o detalhe ainda leva um instante.
	const [submitted, setSubmitted] = useState(false);
	const { mutate, isPending, variables } = useMutation({
		mutationKey: ["create-production-builder"],
		mutationFn: createProduction,
		onSuccess: async (data) => {
			setSubmitted(true);
			toast.success(data.message);
			void queryClient.invalidateQueries({ queryKey: ["production-recipes"] });
			void queryClient.invalidateQueries({ queryKey: ["production-stats"] });
			await queryClient.invalidateQueries({ queryKey: ["productions"] });
			router.push(appRoutes.productions.detail(data.data.insertedId));
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	function submit(status: TProductionPayloadStatus) {
		if (reviewIssue || isPending || submitted) {
			if (reviewIssue) toast.error(reviewIssue);
			return;
		}
		// Recalcula "agora" no clique: o início automático é o instante em que a produção é criada.
		const submitNow = new Date();
		const effectiveStart = startOverride ?? submitNow;
		// Criada já em produção sem início escolhido: o servidor começa a contar o tempo.
		const dataInicio = startOverride ?? (status === "EM_PRODUCAO" ? null : submitNow);
		const dataPrevisaoConclusao = endOverride
			? endOverride.value
			: plan?.duration
				? addDuration(effectiveStart, plan.duration.valor, plan.duration.medida)
				: null;
		const titulo = title.trim();

		if (selection?.kind === "recipe" && recipe && plan) {
			mutate(buildRecipeProductionPayload({ recipe, plan, titulo, status, dataInicio, dataPrevisaoConclusao }));
			return;
		}
		if (selection?.kind === "manual") {
			const payload: TCreateProductionInput = {
				production: {
					...manual.state.production,
					receitaId: null,
					titulo,
					origem: "MANUAL",
					status,
					dataInicio,
					dataPrevisaoConclusao,
				},
				productionInputs: activeInputs.map(stripItemState),
				productionOutputs: activeOutputs.map(stripItemState),
			};
			mutate(payload);
		}
	}

	const value: TBuilderContext = {
		stage,
		goToStage,
		isStageLocked,
		next,
		back,
		selection,
		pickRecipe,
		pickManual,
		recipe,
		recipeLoading,
		recipeError,
		plan,
		quantities,
		setTarget,
		updateReinc,
		manual,
		manualInputsCount: activeInputs.length,
		manualOutputsCount: activeOutputs.length,
		title,
		titleIsAuto: titleOverride === null && !!autoTitle,
		setTitle: setTitleOverride,
		start,
		startIsAuto: startOverride === null,
		setStart: setStartOverride,
		end,
		endIsAuto: endOverride === null && !!autoEnd,
		setEnd: (date) => setEndOverride({ value: date }),
		quantitiesReady,
		reviewIssue,
		submit,
		isSubmitting: isPending || submitted,
		submittingStatus: isPending || submitted ? ((variables?.production.status as TProductionPayloadStatus | undefined) ?? null) : null,
	};

	return <BuilderContext.Provider value={value}>{children}</BuilderContext.Provider>;
}
