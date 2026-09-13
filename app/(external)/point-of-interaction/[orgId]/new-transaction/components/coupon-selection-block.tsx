"use client";

import { formatToMoney } from "@/lib/formatting";
import type { TPoiAvailableCoupon } from "@/lib/queries/coupons";
import { cn } from "@/lib/utils";
import { Check, Ticket } from "lucide-react";

function formatCouponBenefit(coupon: TPoiAvailableCoupon) {
	if (coupon.beneficioTipo === "DESCONTO_FIXO") return `${formatToMoney(coupon.beneficioValor ?? 0)} de desconto`;
	if (coupon.beneficioTipo === "DESCONTO_PERCENTUAL")
		return `${coupon.beneficioValor ?? 0}% de desconto${coupon.beneficioDescontoMaximo ? ` (máx ${formatToMoney(coupon.beneficioDescontoMaximo)})` : ""}`;
	return "Benefício especial";
}

type CouponSelectionBlockProps = {
	coupons: TPoiAvailableCoupon[];
	isLoading: boolean;
	selectedCouponId: string | null;
	onSelect: (coupon: TPoiAvailableCoupon) => void;
	onClear: () => void;
};

/**
 * Bloco de seleção de cupons no fluxo de nova venda do ponto de interação.
 * Cupons AUTOMATICA exibem o desconto estimado (computado no servidor sobre o valor da venda);
 * cupons MANUAL exibem as condições e são validados pelo operador na confirmação/aprovação.
 */
export function CouponSelectionBlock({ coupons, isLoading, selectedCouponId, onSelect, onClear }: CouponSelectionBlockProps) {
	if (isLoading || coupons.length === 0) return null;

	return (
		<div className="bg-card rounded-3xl short:rounded-xl p-6 short:p-3 border border-brand/10 flex flex-col gap-4 short:gap-2 animate-in fade-in slide-in-from-bottom-4">
			<div className="flex items-center gap-3 short:gap-1.5">
				<div className="p-2 short:p-1 bg-brand/10 rounded-lg short:rounded text-brand">
					<Ticket className="w-5 h-5 short:w-3.5 short:h-3.5" />
				</div>
				<h3 className="font-bold short:text-xs">Cupons disponíveis</h3>
			</div>
			<div className="flex flex-col gap-2 short:gap-1.5">
				{coupons.map((coupon) => {
					const isSelected = selectedCouponId === coupon.id;
					const isAutomatic = coupon.validacaoModo === "AUTOMATICA";
					const evaluation = coupon.avaliacao;
					const isSelectable = isAutomatic ? !!evaluation?.elegivel : evaluation?.elegivel !== false;
					return (
						<button
							key={coupon.id}
							type="button"
							disabled={!isSelectable && !isSelected}
							onClick={() => (isSelected ? onClear() : isSelectable ? onSelect(coupon) : undefined)}
							className={cn(
								"w-full flex items-center justify-between gap-3 short:gap-1.5 rounded-2xl short:rounded-lg border px-4 py-3 short:px-2.5 short:py-2 text-left transition-all",
								isSelected ? "border-brand bg-brand/10 shadow-sm" : "border-brand/10 bg-background hover:border-brand/40",
								!isSelectable && !isSelected && "opacity-50 cursor-not-allowed hover:border-brand/10",
							)}
						>
							<div className="flex flex-col min-w-0">
								<span className="font-bold text-sm short:text-xs tracking-tight truncate">
									{coupon.codigo} — {coupon.titulo}
								</span>
								<span className="text-xs short:text-[0.65rem] text-muted-foreground">{formatCouponBenefit(coupon)}</span>
								{coupon.validacaoModo === "MANUAL" && coupon.condicoesTexto ? (
									<span className="text-xs short:text-[0.65rem] text-muted-foreground italic">Condições: {coupon.condicoesTexto}</span>
								) : null}
								{coupon.validacaoModo === "MANUAL" ? (
									<span className="text-[0.65rem] short:text-[0.6rem] font-bold text-amber-600 uppercase">Validação com o operador no balcão</span>
								) : null}
								{evaluation && !evaluation.elegivel ? (
									<span className="text-xs short:text-[0.65rem] text-muted-foreground italic">{evaluation.motivo}</span>
								) : null}
							</div>
							<div className="flex items-center gap-2 short:gap-1 shrink-0">
								{isAutomatic && evaluation?.elegivel ? (
									<span className="font-black text-brand text-lg short:text-sm">-{formatToMoney(evaluation.valorDesconto)}</span>
								) : null}
								<div
									className={cn(
										"w-6 h-6 short:w-5 short:h-5 rounded-full border-2 flex items-center justify-center",
										isSelected ? "bg-brand border-brand text-brand-foreground" : "border-brand/30",
									)}
								>
									{isSelected ? <Check className="w-4 h-4 short:w-3 short:h-3" /> : null}
								</div>
							</div>
						</button>
					);
				})}
			</div>
		</div>
	);
}
