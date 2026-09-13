import CheckboxInput from "@/components/Inputs/CheckboxInput";
import DateTimeInput from "@/components/Inputs/DateTimeInput";
import NumberInput from "@/components/Inputs/NumberInput";
import CouponBlockShell from "./BlockShell";
import { formatDateForInputValue } from "@/lib/formatting";
import type { TUseInternalCouponState } from "@/state-hooks/use-internal-coupon-state";
import { CalendarClock } from "lucide-react";

type CouponValidityAndLimitsBlockProps = {
	coupon: TUseInternalCouponState["state"]["coupon"];
	updateCoupon: TUseInternalCouponState["updateCoupon"];
	embedded?: boolean;
};
export default function CouponValidityAndLimitsBlock({ coupon, updateCoupon, embedded }: CouponValidityAndLimitsBlockProps) {
	return (
		<CouponBlockShell embedded={embedded} title="VIGÊNCIA, LIMITES E RESGATE" icon={<CalendarClock className="h-4 min-h-4 w-4 min-w-4" />}>
			<div className="w-full flex items-center gap-2 flex-col lg:flex-row">
				<div className="w-full lg:w-1/2">
					<DateTimeInput
						label="INÍCIO DA VIGÊNCIA"
						value={formatDateForInputValue(coupon.vigenciaInicio, "datetime")}
						handleChange={(value) => updateCoupon({ vigenciaInicio: value ? new Date(value) : null })}
					/>
				</div>
				<div className="w-full lg:w-1/2">
					<DateTimeInput
						label="FIM DA VIGÊNCIA"
						value={formatDateForInputValue(coupon.vigenciaFim, "datetime")}
						handleChange={(value) => updateCoupon({ vigenciaFim: value ? new Date(value) : null })}
					/>
				</div>
			</div>
			<div className="w-full flex items-center gap-2 flex-col lg:flex-row">
				<div className="w-full lg:w-1/2">
					<NumberInput
						value={coupon.limiteResgatesTotal}
						label="LIMITE TOTAL DE RESGATES"
						placeholder="Vazio = ilimitado..."
						handleChange={(value) => updateCoupon({ limiteResgatesTotal: value })}
					/>
				</div>
				<div className="w-full lg:w-1/2">
					<NumberInput
						value={coupon.limiteResgatesPorCliente}
						label="LIMITE DE RESGATES POR CLIENTE"
						placeholder="Ex: 1"
						handleChange={(value) => updateCoupon({ limiteResgatesPorCliente: value })}
					/>
				</div>
			</div>
			<div className="w-full flex items-center gap-2 flex-col lg:flex-row">
				<div className="w-full flex items-center justify-center lg:w-1/3">
					<CheckboxInput
						checked={coupon.resgatePermitirViaPos}
						labelTrue="RESGATÁVEL VIA PDV"
						labelFalse="RESGATÁVEL VIA PDV"
						handleChange={(value) => updateCoupon({ resgatePermitirViaPos: value })}
						justify="justify-center"
					/>
				</div>
				<div className="w-full flex items-center justify-center lg:w-1/3">
					<CheckboxInput
						checked={coupon.resgatePermitirViaPontoInteracao}
						labelTrue="RESGATÁVEL VIA PONTO DE INTERAÇÃO"
						labelFalse="RESGATÁVEL VIA PONTO DE INTERAÇÃO"
						handleChange={(value) => updateCoupon({ resgatePermitirViaPontoInteracao: value })}
						justify="justify-center"
					/>
				</div>
				<div className="w-full flex items-center justify-center lg:w-1/3">
					<CheckboxInput
						checked={coupon.resgatePermitirViaLojaDigital}
						labelTrue="RESGATÁVEL VIA LOJA DIGITAL"
						labelFalse="RESGATÁVEL VIA LOJA DIGITAL"
						handleChange={(value) => updateCoupon({ resgatePermitirViaLojaDigital: value })}
						justify="justify-center"
					/>
				</div>
			</div>
			{coupon.validacaoModo === "MANUAL" && coupon.resgatePermitirViaLojaDigital ? (
				<p className="text-xs text-amber-600 text-center">
					A loja digital é autoatendimento: cupons de validação manual aparecem nela apenas como aviso, com resgate no balcão.
				</p>
			) : null}
		</CouponBlockShell>
	);
}
