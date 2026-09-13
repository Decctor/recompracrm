import type { TCreateCouponInput } from "@/app/api/coupons/route";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { createCoupon } from "@/lib/mutations/coupons";
import { useInternalCouponState } from "@/state-hooks/use-internal-coupon-state";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import CouponAudienceBlock from "./Blocks/Audience";
import CouponBenefitBlock from "./Blocks/Benefit";
import CouponGeneralBlock from "./Blocks/General";
import CouponTargetsBlock from "./Blocks/Targets";
import CouponCheckoutConditionsBlock from "./Blocks/CheckoutConditions";
import CouponValidityAndLimitsBlock from "./Blocks/ValidityAndLimits";

type NewCouponProps = {
	closeModal: () => void;
	callbacks?: {
		onMutate?: (variables: TCreateCouponInput) => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

export default function NewCoupon({ closeModal, callbacks }: NewCouponProps) {
	const { state, updateCoupon, addCouponTarget, updateCouponTarget, removeCouponTarget, addCouponAudience, removeCouponAudience } =
		useInternalCouponState({});

	const { mutate: handleCreateCouponMutation, isPending } = useMutation({
		mutationKey: ["create-coupon"],
		mutationFn: createCoupon,
		onMutate: (variables) => callbacks?.onMutate?.(variables),
		onSuccess: (data) => {
			callbacks?.onSuccess?.();
			toast.success(data.message);
			closeModal();
		},
		onError: (error) => {
			callbacks?.onError?.(error);
			toast.error(getErrorMessage(error));
		},
		onSettled: () => callbacks?.onSettled?.(),
	});

	return (
		<ResponsiveMenu
			menuTitle="NOVO CUPOM"
			menuDescription="Preencha os campos abaixo para criar um novo cupom"
			menuActionButtonText="CRIAR CUPOM"
			menuCancelButtonText="CANCELAR"
			actionFunction={() =>
				handleCreateCouponMutation({
					coupon: state.coupon,
					couponTargets: state.couponTargets,
					couponAudiences: state.couponAudiences,
				})
			}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
			dialogVariant="md"
		>
			<CouponGeneralBlock coupon={state.coupon} updateCoupon={updateCoupon} />
			<CouponBenefitBlock coupon={state.coupon} updateCoupon={updateCoupon} />
			{state.coupon.validacaoModo === "AUTOMATICA" ? (
				<CouponTargetsBlock
					coupon={state.coupon}
					couponTargets={state.couponTargets}
					updateCoupon={updateCoupon}
					addCouponTarget={addCouponTarget}
					updateCouponTarget={updateCouponTarget}
					removeCouponTarget={removeCouponTarget}
				/>
			) : (
				<CouponCheckoutConditionsBlock coupon={state.coupon} updateCoupon={updateCoupon} />
			)}
			{state.coupon.escopo === "GLOBAL" ? (
				<CouponAudienceBlock couponAudiences={state.couponAudiences} addCouponAudience={addCouponAudience} removeCouponAudience={removeCouponAudience} />
			) : null}
			<CouponValidityAndLimitsBlock coupon={state.coupon} updateCoupon={updateCoupon} />
		</ResponsiveMenu>
	);
}
