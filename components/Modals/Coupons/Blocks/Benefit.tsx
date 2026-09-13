import NumberInput from "@/components/Inputs/NumberInput";
import SelectInput from "@/components/Inputs/SelectInput";
import CouponBlockShell from "./BlockShell";
import type { TUseInternalCouponState } from "@/state-hooks/use-internal-coupon-state";
import { CouponBenefitScopeOptions, CouponBenefitTypeOptions } from "@/utils/select-options";
import { BadgePercent } from "lucide-react";

type CouponBenefitBlockProps = {
	coupon: TUseInternalCouponState["state"]["coupon"];
	updateCoupon: TUseInternalCouponState["updateCoupon"];
	embedded?: boolean;
};
export default function CouponBenefitBlock({ coupon, updateCoupon, embedded }: CouponBenefitBlockProps) {
	return (
		<CouponBlockShell embedded={embedded} title="BENEFÍCIO" icon={<BadgePercent className="h-4 min-h-4 w-4 min-w-4" />}>
			<div className="w-full flex items-center gap-2 flex-col lg:flex-row">
				<div className="w-full lg:w-1/2">
					<SelectInput
						value={coupon.beneficioTipo}
						label="TIPO DE BENEFÍCIO"
						resetOptionLabel="DESCONTO PERCENTUAL (%)"
						handleChange={(value) => updateCoupon({ beneficioTipo: value as TUseInternalCouponState["state"]["coupon"]["beneficioTipo"] })}
						options={CouponBenefitTypeOptions}
						onReset={() => updateCoupon({ beneficioTipo: "DESCONTO_PERCENTUAL" })}
					/>
				</div>
				<div className="w-full lg:w-1/2">
					<SelectInput
						value={coupon.beneficioAplicacao}
						label="ONDE O DESCONTO VALE"
						resetOptionLabel="NA COMPRA TODA"
						handleChange={(value) => updateCoupon({ beneficioAplicacao: value as TUseInternalCouponState["state"]["coupon"]["beneficioAplicacao"] })}
						options={CouponBenefitScopeOptions}
						onReset={() => updateCoupon({ beneficioAplicacao: "VENDA_TOTAL" })}
					/>
				</div>
			</div>
			{coupon.beneficioTipo === "COMPRE_X_LEVE_Y" ? (
				<div className="w-full flex items-center gap-2 flex-col lg:flex-row">
					<div className="w-full lg:w-1/2">
						<NumberInput
							value={coupon.beneficioLeveQuantidade}
							label="LEVE (QTDE TOTAL)"
							placeholder="Ex: 2 para leve 2..."
							handleChange={(value) => updateCoupon({ beneficioLeveQuantidade: value })}
						/>
					</div>
					<div className="w-full lg:w-1/2">
						<NumberInput
							value={coupon.beneficioCompreQuantidade}
							label="PAGUE (QTDE PAGA)"
							placeholder="Ex: 1 para pague 1..."
							handleChange={(value) => updateCoupon({ beneficioCompreQuantidade: value })}
						/>
					</div>
				</div>
			) : (
				<div className="w-full flex items-center gap-2 flex-col lg:flex-row">
					<div className="w-full lg:w-1/2">
						<NumberInput
							value={coupon.beneficioValor}
							label={
								coupon.beneficioTipo === "DESCONTO_PERCENTUAL"
									? "DESCONTO (%)"
									: coupon.beneficioTipo === "PRECO_FIXO"
										? "PREÇO POR UNIDADE (R$)"
										: "DESCONTO (R$)"
							}
							placeholder={coupon.beneficioTipo === "DESCONTO_PERCENTUAL" ? "Ex: 10 para 10% de desconto..." : "Ex: 25 para R$ 25,00..."}
							handleChange={(value) => updateCoupon({ beneficioValor: value })}
						/>
					</div>
					{coupon.beneficioTipo === "DESCONTO_PERCENTUAL" ? (
						<div className="w-full lg:w-1/2">
							<NumberInput
								value={coupon.beneficioDescontoMaximo}
								label="DESCONTO MÁXIMO (R$)"
								placeholder="Teto do desconto em R$ (opcional)..."
								handleChange={(value) => updateCoupon({ beneficioDescontoMaximo: value })}
							/>
						</div>
					) : null}
				</div>
			)}
		</CouponBlockShell>
	);
}
