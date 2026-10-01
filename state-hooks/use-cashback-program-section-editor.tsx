"use client";

import {
	type TCashbackProgram,
	type TCashbackProgramSection,
	buildCashbackProgramSectionUpdateInput,
	getCashbackProgramSectionBlockReason,
	mapCashbackProgramToDraft,
} from "@/lib/cashback/program-registry-state";
import { getErrorMessage } from "@/lib/errors";
import { updateCashbackProgram } from "@/lib/mutations/cashback-programs";
import { useCashbackProgramState } from "@/state-hooks/use-cashback-program-state";
import { useDirtyFlag, wrapWithDirty } from "@/state-hooks/use-product-section-editor";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";

type CashbackProgramSectionEditorCallbacks = {
	onMutate?: () => void;
	onSuccess?: () => void;
	onError?: (error: Error) => void;
	onSettled?: () => void;
};

/**
 * Rascunho de uma seção da aba Meu Programa, com barra de aplicar. Mesmo contrato de
 * `use-coupon-section-editor`: o estado carrega o programa inteiro, mas o que a seção envia é
 * recortado por `buildCashbackProgramSectionUpdateInput`, e a re-hidratação a cada refetch só
 * acontece enquanto a seção está limpa.
 */
export function useCashbackProgramSectionEditor({
	program,
	section,
	callbacks,
}: {
	program: TCashbackProgram;
	section: TCashbackProgramSection;
	callbacks?: CashbackProgramSectionEditorCallbacks;
}) {
	const { isDirty, isDirtyRef, markDirty, clearDirty } = useDirtyFlag();
	// Semeado já no primeiro render: hidratar só no efeito pintava os campos vazios por um quadro.
	const programState = useCashbackProgramState({ initialState: { cashbackProgram: mapCashbackProgramToDraft(program) } });
	const { state, redefineState } = programState;

	const hydrate = useCallback(() => {
		redefineState({ cashbackProgram: mapCashbackProgramToDraft(program), cashbackProgramPrizes: [] });
	}, [program, redefineState]);

	const discard = useCallback(() => {
		hydrate();
		clearDirty();
	}, [clearDirty, hydrate]);

	useEffect(() => {
		if (!isDirtyRef.current) hydrate();
	}, [hydrate, isDirtyRef]);

	const blockReason = getCashbackProgramSectionBlockReason({ draft: state.cashbackProgram, section });

	const { mutate: applyMutation, isPending } = useMutation({
		mutationKey: ["apply-cashback-program-section", section, program.id],
		mutationFn: async () => {
			if (blockReason) throw new Error(blockReason);
			return updateCashbackProgram(buildCashbackProgramSectionUpdateInput({ program, draft: state.cashbackProgram, section }));
		},
		onMutate: () => callbacks?.onMutate?.(),
		onSuccess: (data) => {
			clearDirty();
			callbacks?.onSuccess?.();
			toast.success(data.message);
		},
		onError: (error) => {
			callbacks?.onError?.(error as Error);
			toast.error(getErrorMessage(error));
		},
		onSettled: () => callbacks?.onSettled?.(),
	});

	const apply = useCallback(() => applyMutation(), [applyMutation]);
	const updateCashbackProgramDraft = useMemo(
		() => wrapWithDirty(programState.updateCashbackProgram, markDirty),
		[programState.updateCashbackProgram, markDirty],
	);

	return { draft: state.cashbackProgram, isDirty, isPending, blockReason, apply, discard, updateCashbackProgram: updateCashbackProgramDraft };
}

export type TUseCashbackProgramSectionEditor = ReturnType<typeof useCashbackProgramSectionEditor>;
