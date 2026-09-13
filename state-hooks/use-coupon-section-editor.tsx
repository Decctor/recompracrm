"use client";

import type { TGetCouponsOutputById } from "@/app/api/coupons/route";
import { buildCouponSectionUpdateInput, mapCouponToState, validateCouponSectionState } from "@/lib/coupons/coupon-registry-state";
import { getErrorMessage } from "@/lib/errors";
import { updateCoupon } from "@/lib/mutations/coupons";
import { useDirtyFlag, wrapWithDirty } from "@/state-hooks/use-product-section-editor";
import { useInternalCouponState } from "@/state-hooks/use-internal-coupon-state";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";

type CouponSectionEditorCallbacks = {
	onMutate?: () => void;
	onSuccess?: () => void;
	onError?: (error: Error) => void;
	onSettled?: () => void;
};

type TCouponSection = "general" | "benefit" | "validity" | "audience";

/**
 * Rascunho de uma seção do cadastro do cupom, com barra de aplicar — o mesmo contrato do cadastro
 * de produto (`use-product-section-editor`), do qual este hook reaproveita o marcador de sujeira.
 *
 * Cada seção carrega o cupom inteiro no estado porque a rota de atualização recebe o cupom inteiro;
 * o que a seção *envia* é recortado por `buildCouponSectionUpdateInput`, que reenvia os campos de
 * fora da seção a partir do servidor. Assim duas seções abertas ao mesmo tempo não se atropelam.
 *
 * A re-hidratação a cada refetch só acontece enquanto a seção está limpa: um `invalidateQueries`
 * disparado por outra seção não pode apagar o que o usuário acabou de digitar nesta.
 */
export function useCouponSectionEditor({
	coupon,
	section,
	callbacks,
}: {
	coupon: TGetCouponsOutputById;
	section: TCouponSection;
	callbacks?: CouponSectionEditorCallbacks;
}) {
	const { isDirty, isDirtyRef, markDirty, clearDirty } = useDirtyFlag();
	const couponState = useInternalCouponState({});
	const { state, redefineState } = couponState;

	const discard = useCallback(() => {
		redefineState(mapCouponToState(coupon));
		clearDirty();
	}, [clearDirty, coupon, redefineState]);

	useEffect(() => {
		if (!isDirtyRef.current) redefineState(mapCouponToState(coupon));
	}, [coupon, isDirtyRef, redefineState]);

	const { mutate: applyMutation, isPending } = useMutation({
		mutationKey: ["apply-coupon-section", section, coupon.id],
		mutationFn: async () => {
			const validationError = validateCouponSectionState({ state, section });
			if (validationError) throw new Error(validationError);
			return updateCoupon(buildCouponSectionUpdateInput({ coupon, state, section }));
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

	const updaters = useMemo(
		() => ({
			updateCoupon: wrapWithDirty(couponState.updateCoupon, markDirty),
			addCouponTarget: wrapWithDirty(couponState.addCouponTarget, markDirty),
			updateCouponTarget: wrapWithDirty(couponState.updateCouponTarget, markDirty),
			removeCouponTarget: wrapWithDirty(couponState.removeCouponTarget, markDirty),
			addCouponAudience: wrapWithDirty(couponState.addCouponAudience, markDirty),
			removeCouponAudience: wrapWithDirty(couponState.removeCouponAudience, markDirty),
		}),
		[
			couponState.addCouponAudience,
			couponState.addCouponTarget,
			couponState.removeCouponAudience,
			couponState.removeCouponTarget,
			couponState.updateCoupon,
			couponState.updateCouponTarget,
			markDirty,
		],
	);

	return { state, isDirty, isPending, apply, discard, ...updaters };
}

export type TUseCouponSectionEditor = ReturnType<typeof useCouponSectionEditor>;
