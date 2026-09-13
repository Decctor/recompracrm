"use client";

import TextareaInput from "@/components/Inputs/TextareaInput";
import CouponTargetsBlock from "@/components/Modals/Coupons/Blocks/Targets";
import CouponCheckoutConditionsBlock from "@/components/Modals/Coupons/Blocks/CheckoutConditions";
import type { TCouponBenefitScopeEnum, TCouponValidationModeEnum } from "@/schemas/enums";
import { ClipboardCheck, Package, Plus, ShoppingCart, SlidersHorizontal, Sparkles } from "lucide-react";
import { useState } from "react";
import { benefitIsItemScoped } from "../../helpers/benefits";
import { useBuilderCoupon } from "../builder-provider";
import ChoiceCards from "../choice-cards";

export default function StageRules() {
	const { state, updateCoupon, addCouponTarget, updateCouponTarget, removeCouponTarget } = useBuilderCoupon();
	const { coupon, couponTargets } = state;
	const itemScoped = benefitIsItemScoped(coupon.beneficioTipo);

	// Quando o benefício exige produtos específicos (preço fixo, leve-x-pague-y) ou o
	// desconto foi restrito a "itens elegíveis", selecionar produtos é obrigatório e a
	// seção fica sempre visível. Caso o cupom valha "na compra toda", produtos e
	// condições são totalmente opcionais e ficam atrás de um progressive disclosure.
	const targetsRequired = itemScoped || coupon.beneficioAplicacao === "ITENS_ELEGIVEIS";

	// Estado inferido: qualquer condição já preenchida mantém a seção aberta (ex.: ao
	// editar um cupom existente). O override local permite abri-la a partir do vazio.
	const hasActiveTargets = couponTargets.some((target) => !target.deletar);
	const hasConditions =
		coupon.condicaoValorMinimoVenda != null ||
		coupon.condicaoQuantidadeMinimaItens != null ||
		(coupon.condicaoModalidadesEntrega?.length ?? 0) > 0 ||
		coupon.condicaoPrimeiraCompra ||
		coupon.condicaoAlvosOperador !== "QUALQUER" ||
		hasActiveTargets;
	const [conditionsOpened, setConditionsOpened] = useState(false);
	const conditionsOpen = conditionsOpened || hasConditions;

	// Recolher volta o cupom para "vale para qualquer compra": limpa as condições e
	// remove os alvos (soft-delete para os já persistidos). Um item escondido nunca
	// deve continuar valendo silenciosamente — a prévia e a revisão leem do estado.
	function clearConditions() {
		updateCoupon({
			condicaoValorMinimoVenda: null,
			condicaoQuantidadeMinimaItens: null,
			condicaoModalidadesEntrega: [],
			condicaoPrimeiraCompra: false,
			condicaoAlvosOperador: "QUALQUER",
		});
		for (let index = couponTargets.length - 1; index >= 0; index--) {
			if (!couponTargets[index].deletar) removeCouponTarget(index);
		}
		setConditionsOpened(false);
	}

	return (
		<div className="flex w-full flex-col gap-5">
			<ChoiceCards<TCouponValidationModeEnum>
				label="Como o resgate é validado?"
				value={coupon.validacaoModo}
				onChange={(value) => updateCoupon({ validacaoModo: value })}
				options={[
					{ value: "AUTOMATICA", label: "Automática", description: "O sistema confere as regras e aplica o desconto sozinho.", icon: Sparkles },
					{ value: "MANUAL", label: "Manual, no balcão", description: "O operador lê as condições e confere na hora do resgate.", icon: ClipboardCheck },
				]}
			/>

			{coupon.validacaoModo === "MANUAL" ? (
				<>
					<CouponCheckoutConditionsBlock coupon={coupon} updateCoupon={updateCoupon} />
					<TextareaInput
						value={coupon.condicoesTexto ?? ""}
						label="CONDIÇÕES DE RESGATE"
						placeholder="Ex: Desconto válido apenas em calças. O operador deve conferir se há uma calça na compra..."
						handleChange={(value) => updateCoupon({ condicoesTexto: value })}
					/>
				</>
			) : (
				<>
					{itemScoped ? (
						<p className="text-xs font-medium text-muted-foreground">Este benefício vale sobre os produtos que você escolher abaixo.</p>
					) : (
						<ChoiceCards<TCouponBenefitScopeEnum>
							label="Onde o desconto vale?"
							value={coupon.beneficioAplicacao}
							onChange={(value) => updateCoupon({ beneficioAplicacao: value })}
							options={[
								{ value: "VENDA_TOTAL", label: "Na compra toda", description: "O desconto incide sobre o valor total da venda.", icon: ShoppingCart },
								{
									value: "ITENS_ELEGIVEIS",
									label: "Em produtos específicos",
									description: "O desconto incide só sobre os produtos que você escolher.",
									icon: Package,
								},
							]}
						/>
					)}
					{targetsRequired ? (
						<CouponTargetsBlock
							coupon={coupon}
							couponTargets={couponTargets}
							updateCoupon={updateCoupon}
							addCouponTarget={addCouponTarget}
							updateCouponTarget={updateCouponTarget}
							removeCouponTarget={removeCouponTarget}
						/>
					) : conditionsOpen ? (
						<div className="duration-200 animate-in fade-in slide-in-from-top-1 motion-reduce:animate-none">
							<CouponTargetsBlock
								coupon={coupon}
								couponTargets={couponTargets}
								updateCoupon={updateCoupon}
								addCouponTarget={addCouponTarget}
								updateCouponTarget={updateCouponTarget}
								removeCouponTarget={removeCouponTarget}
								onRemoveConditions={clearConditions}
							/>
						</div>
					) : (
						<button
							type="button"
							onClick={() => setConditionsOpened(true)}
							className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3.5 text-left transition-all hover:border-primary/40 hover:bg-primary/[0.03]"
						>
							<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
								<SlidersHorizontal className="h-4 w-4" />
							</span>
							<div className="flex min-w-0 flex-1 flex-col gap-0.5">
								<h4 className="text-sm font-semibold tracking-tight text-foreground">Restringir produtos ou exigir condições?</h4>
								<p className="text-xs leading-snug text-muted-foreground">
									Sem isso, o cupom vale para qualquer compra. Ative para pedir um produto no carrinho, um valor mínimo de venda ou uma quantidade de itens.
								</p>
							</div>
							<span className="flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-semibold text-muted-foreground">
								<Plus className="h-3.5 w-3.5" />
								<span className="hidden sm:inline">ADICIONAR</span>
							</span>
						</button>
					)}
				</>
			)}
		</div>
	);
}
