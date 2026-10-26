"use client";

import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { useInternalCouponState, type TUseInternalCouponState } from "@/state-hooks/use-internal-coupon-state";
import { toast } from "sonner";
import CouponTargetsBlock from "./Blocks/Targets";

export default function ControlCouponGiftProducts({
	initialState,
	onSave,
	closeModal,
}: {
	initialState: TUseInternalCouponState["state"];
	onSave: (state: TUseInternalCouponState["state"]) => void;
	closeModal: () => void;
}) {
	const editor = useInternalCouponState({ initialState });
	return (
		<ResponsiveMenu
			menuTitle="PRODUTOS DO BRINDE"
			menuDescription="Escolha as alternativas de brinde e as condições de compra."
			menuActionButtonText="CONCLUIR"
			menuCancelButtonText="CANCELAR"
			actionIsLoading={false}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
			actionFunction={() => {
				if (!editor.state.couponTargets.some((target) => !target.deletar && target.papel === "BENEFICIADO")) {
					toast.error("Escolha pelo menos um produto ou grupo que ganha o brinde.");
					return;
				}
				onSave(editor.state);
				closeModal();
			}}
		>
			<CouponTargetsBlock
				coupon={editor.state.coupon}
				couponTargets={editor.state.couponTargets}
				updateCoupon={editor.updateCoupon}
				addCouponTarget={editor.addCouponTarget}
				updateCouponTarget={editor.updateCouponTarget}
				removeCouponTarget={editor.removeCouponTarget}
			/>
		</ResponsiveMenu>
	);
}
