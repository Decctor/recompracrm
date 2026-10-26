"use client";

import NumberInput from "@/components/Inputs/NumberInput";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import { getBenefitCard } from "../../helpers/benefits";
import BenefitPicker from "../benefit-picker";
import { useBuilderCoupon, useBuilderUi } from "../builder-provider";

export default function StageBenefit() {
	const { benefitPicked, reopenBenefitPicker } = useBuilderUi();
	const { state, updateCoupon } = useBuilderCoupon();
	const { coupon } = state;

	if (!benefitPicked) return <BenefitPicker />;

	const card = getBenefitCard(coupon.beneficioTipo);
	const Icon = card?.icon;

	return (
		<div className="flex w-full flex-col gap-4">
			<div className="flex w-full items-center justify-between gap-2 rounded-xl border border-primary bg-primary/[0.06] px-3 py-2.5">
				<div className="flex items-center gap-2.5">
					{Icon ? (
						<span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
							<Icon className="h-4 w-4" />
						</span>
					) : null}
					<div className="flex flex-col">
						<span className="text-[10px] font-semibold uppercase tracking-wider text-primary/80">Benefício escolhido</span>
						<h3 className="text-sm font-semibold tracking-tight">{card?.label}</h3>
					</div>
				</div>
				<Button type="button" variant="ghost" size="sm" onClick={reopenBenefitPicker} className="flex items-center gap-1.5">
					<Pencil className="h-3.5 w-3.5" />
					TROCAR
				</Button>
			</div>

			{coupon.beneficioTipo === "BRINDE" ? (
				<p className="text-sm text-muted-foreground">
					Uma unidade de um dos produtos escolhidos será grátis. Adicionais e entrega são cobrados à parte. O brinde não conta para atingir as condições de
					compra.
				</p>
			) : coupon.beneficioTipo === "COMPRE_X_LEVE_Y" ? (
				<div className="flex w-full flex-col gap-2 lg:flex-row">
					<div className="w-full lg:w-1/2">
						<NumberInput
							value={coupon.beneficioLeveQuantidade}
							label="LEVE (QUANTIDADE)"
							placeholder="Ex: 3"
							handleChange={(value) => updateCoupon({ beneficioLeveQuantidade: value })}
						/>
					</div>
					<div className="w-full lg:w-1/2">
						<NumberInput
							value={coupon.beneficioCompreQuantidade}
							label="PAGUE (QUANTIDADE)"
							placeholder="Ex: 2"
							handleChange={(value) => updateCoupon({ beneficioCompreQuantidade: value })}
						/>
					</div>
				</div>
			) : (
				<div className="flex w-full flex-col gap-2 lg:flex-row">
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
							placeholder={coupon.beneficioTipo === "DESCONTO_PERCENTUAL" ? "Ex: 10" : "Ex: 25"}
							handleChange={(value) => updateCoupon({ beneficioValor: value })}
						/>
					</div>
					{coupon.beneficioTipo === "DESCONTO_PERCENTUAL" ? (
						<div className="w-full lg:w-1/2">
							<NumberInput
								value={coupon.beneficioDescontoMaximo}
								label="DESCONTO MÁXIMO (R$)"
								placeholder="Teto em R$ (opcional)"
								handleChange={(value) => updateCoupon({ beneficioDescontoMaximo: value })}
							/>
						</div>
					) : null}
				</div>
			)}
		</div>
	);
}
