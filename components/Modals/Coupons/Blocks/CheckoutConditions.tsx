import CheckboxInput from "@/components/Inputs/CheckboxInput";
import type { TUseInternalCouponState } from "@/state-hooks/use-internal-coupon-state";

export default function CouponCheckoutConditionsBlock({
	coupon,
	updateCoupon,
}: {
	coupon: TUseInternalCouponState["state"]["coupon"];
	updateCoupon: TUseInternalCouponState["updateCoupon"];
}) {
	const deliveryModes = [
		{ value: "PRESENCIAL", label: "PRESENCIAL" },
		{ value: "RETIRADA", label: "RETIRADA" },
		{ value: "ENTREGA", label: "ENTREGA" },
		{ value: "COMANDA", label: "COMANDA" },
	] as const;
	const selectedDeliveryModes = coupon.condicaoModalidadesEntrega ?? [];
	function toggleDeliveryMode(mode: (typeof deliveryModes)[number]["value"]) {
		updateCoupon({
			condicaoModalidadesEntrega: selectedDeliveryModes.includes(mode)
				? selectedDeliveryModes.filter((item) => item !== mode)
				: [...selectedDeliveryModes, mode],
		});
	}
	return (
		<div className="w-full rounded-xl border border-border bg-card/50 p-3 space-y-3">
			<div>
				<p className="text-xs font-semibold uppercase">Modalidades permitidas</p>
				<p className="text-xs text-muted-foreground">Sem seleção, o cupom vale para todas as modalidades.</p>
			</div>
			<div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
				{deliveryModes.map((mode) => (
					<CheckboxInput
						key={mode.value}
						checked={selectedDeliveryModes.includes(mode.value)}
						labelTrue={mode.label}
						labelFalse={mode.label}
						handleChange={() => toggleDeliveryMode(mode.value)}
						justify="justify-start"
						padding="0.5rem"
					/>
				))}
			</div>
			<CheckboxInput
				checked={coupon.condicaoPrimeiraCompra}
				labelTrue="SOMENTE NA PRIMEIRA COMPRA"
				labelFalse="SOMENTE NA PRIMEIRA COMPRA"
				description="Exige que o cliente não possua outra venda confirmada nesta organização."
				handleChange={(value) => updateCoupon({ condicaoPrimeiraCompra: value })}
				justify="justify-start"
				padding="0.5rem"
			/>
		</div>
	);
}
