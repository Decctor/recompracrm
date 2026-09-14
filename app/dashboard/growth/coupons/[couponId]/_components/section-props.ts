import type { TGetCouponsOutputById } from "@/app/api/coupons/route";

/** Contrato comum das seções editáveis da aba CADASTRO do cupom. */
export type CouponSectionProps = {
	coupon: TGetCouponsOutputById;
	callbacks?: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};
