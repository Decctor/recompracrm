import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatToMoney } from "@/lib/formatting";
import { type TPosAvailableCoupon, usePosAvailableCoupons } from "@/lib/queries/coupons";
import type { TUseSaleState } from "@/state-hooks/use-sale-state";
import { ChevronDown, ChevronUp, Ticket, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

function formatCouponBenefit(coupon: TPosAvailableCoupon) {
	if (coupon.beneficioTipo === "DESCONTO_FIXO") return `${formatToMoney(coupon.beneficioValor ?? 0)} DE DESCONTO`;
	if (coupon.beneficioTipo === "DESCONTO_PERCENTUAL")
		return `${coupon.beneficioValor ?? 0}% DE DESCONTO${coupon.beneficioDescontoMaximo ? ` (MÁX ${formatToMoney(coupon.beneficioDescontoMaximo)})` : ""}`;
	if (coupon.beneficioTipo === "PRECO_FIXO") return `PREÇO FIXO DE ${formatToMoney(coupon.beneficioValor ?? 0)}`;
	if (coupon.beneficioTipo === "COMPRE_X_LEVE_Y") return `LEVE ${coupon.beneficioLeveQuantidade ?? 0} PAGUE ${coupon.beneficioCompreQuantidade ?? 0}`;
	return "BRINDE";
}

type CouponRedemptionSectionProps = {
	saleState: TUseSaleState;
	clientId: string;
};

export default function CouponRedemptionSection({ saleState, clientId }: CouponRedemptionSectionProps) {
	const [isListOpen, setIsListOpen] = useState(false);

	const cartItemsForEvaluation = useMemo(
		() =>
			saleState.state.itens.map((item) => ({
				produtoId: item.produtoId,
				produtoVarianteId: item.produtoVarianteId ?? null,
				quantidade: item.quantidade,
				valorVendaUnitario: item.valorUnitarioFinal,
			})),
		[saleState.state.itens],
	);

	const { data: availableCoupons, isLoading } = usePosAvailableCoupons({
		clienteId: clientId,
		itens: cartItemsForEvaluation,
		entregaModalidade: saleState.state.entregaModalidade,
	});

	const appliedCoupon = saleState.state.cupomResgate;

	// Mantém o cupom AUTOMATICA aplicado em sincronia com o carrinho: o desconto do servidor
	// é o autoritativo; se o cupom deixa de ser elegível, é removido com aviso ao operador.
	useEffect(() => {
		if (!appliedCoupon || !availableCoupons) return;
		const freshCoupon = availableCoupons.find((coupon) => coupon.id === appliedCoupon.cupomId);
		if (!freshCoupon || freshCoupon.avaliacao?.elegivel === false || (appliedCoupon.validacaoModo === "AUTOMATICA" && !freshCoupon.avaliacao)) {
			saleState.setCupomResgate(null);
			toast.warning("O cupom aplicado deixou de ser elegível para o carrinho atual e foi removido.");
			return;
		}
		if (freshCoupon.avaliacao?.elegivel && Math.abs(freshCoupon.avaliacao.valorDesconto - appliedCoupon.valorDesconto) > 0.01) {
			saleState.setCupomResgate({ ...appliedCoupon, valorDesconto: freshCoupon.avaliacao.valorDesconto });
		}
	}, [appliedCoupon, availableCoupons, saleState.setCupomResgate]);

	if (appliedCoupon) {
		return (
			<div className="w-full flex flex-col gap-1.5 rounded-lg border border-primary/35 bg-primary/10 px-2 py-2">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-1.5">
						<Ticket className="w-3 h-3 text-primary" />
						<span className="text-xs font-semibold text-primary">
							CUPOM {appliedCoupon.codigo ?? ""} — {appliedCoupon.titulo ?? "APLICADO"}
						</span>
					</div>
					<span className="text-xs font-bold text-primary">-{formatToMoney(appliedCoupon.valorDesconto)}</span>
				</div>
				<Button type="button" size="sm" variant="ghost" className="self-end flex items-center gap-1.5" onClick={() => saleState.setCupomResgate(null)}>
					<X className="w-3 h-3 min-w-3 min-h-3" />
					REMOVER CUPOM
				</Button>
			</div>
		);
	}

	const couponsCount = availableCoupons?.length ?? 0;

	return (
		<div className="w-full flex flex-col gap-1.5 rounded-lg border border-primary/35 bg-primary/10 px-2 py-2">
			<button type="button" className="flex items-center justify-between cursor-pointer" onClick={() => setIsListOpen((prev) => !prev)}>
				<div className="flex items-center gap-1.5">
					<Ticket className="w-3 h-3 text-primary" />
					<span className="text-xs font-semibold text-primary">
						{isLoading
							? "BUSCANDO CUPONS..."
							: couponsCount > 0
								? `${couponsCount} ${couponsCount === 1 ? "CUPOM DISPONÍVEL" : "CUPONS DISPONÍVEIS"}`
								: "NENHUM CUPOM DISPONÍVEL"}
					</span>
				</div>
				{couponsCount > 0 ? isListOpen ? <ChevronUp className="w-3 h-3 text-primary" /> : <ChevronDown className="w-3 h-3 text-primary" /> : null}
			</button>
			{isListOpen && availableCoupons ? (
				<div className="w-full flex flex-col gap-1.5">
					{availableCoupons.map((coupon) => (
						<AvailableCouponCard key={coupon.id} coupon={coupon} saleState={saleState} onApplied={() => setIsListOpen(false)} />
					))}
				</div>
			) : null}
		</div>
	);
}

function AvailableCouponCard({ coupon, saleState, onApplied }: { coupon: TPosAvailableCoupon; saleState: TUseSaleState; onApplied: () => void }) {
	const [manualDiscountValue, setManualDiscountValue] = useState<number>(0);

	const isAutomatic = coupon.validacaoModo === "AUTOMATICA";
	const evaluation = coupon.avaliacao;
	const isEligible = isAutomatic ? !!evaluation?.elegivel : evaluation?.elegivel !== false;
	const manualMaxDiscount = saleState.valorAntesCupom;

	function handleApply() {
		if (isAutomatic) {
			if (!evaluation?.elegivel) return;
			saleState.setCupomResgate({
				cupomId: coupon.id,
				valorDesconto: evaluation.valorDesconto,
				codigo: coupon.codigo,
				titulo: coupon.titulo,
				validacaoModo: "AUTOMATICA",
			});
		} else {
			if (manualDiscountValue <= 0) {
				toast.error("Informe o valor do desconto do cupom.");
				return;
			}
			if (manualDiscountValue > manualMaxDiscount) {
				toast.error("O desconto do cupom não pode superar o valor da venda.");
				return;
			}
			saleState.setCupomResgate({
				cupomId: coupon.id,
				valorDesconto: manualDiscountValue,
				codigo: coupon.codigo,
				titulo: coupon.titulo,
				validacaoModo: "MANUAL",
			});
		}
		onApplied();
	}

	return (
		<div className="w-full flex flex-col gap-1 rounded-lg border border-border bg-card px-2 py-1.5">
			<div className="flex items-center justify-between gap-2">
				<div className="flex flex-col">
					<span className="text-xs font-bold uppercase">
						{coupon.codigo} — {coupon.titulo}
					</span>
					<span className="text-[11px] text-muted-foreground uppercase">{formatCouponBenefit(coupon)}</span>
				</div>
				{isAutomatic && evaluation?.elegivel ? <span className="text-xs font-bold text-primary">-{formatToMoney(evaluation.valorDesconto)}</span> : null}
			</div>
			{evaluation && !evaluation.elegivel ? <p className="text-[11px] text-muted-foreground">{evaluation.motivo}</p> : null}
			{!isAutomatic ? (
				<div className="flex flex-col gap-1">
					{coupon.condicoesTexto ? <p className="text-[11px] text-muted-foreground">CONDIÇÕES: {coupon.condicoesTexto}</p> : null}
					<Input
						type="number"
						placeholder="Valor do desconto (validação do operador)"
						className="w-full text-xs font-bold"
						value={manualDiscountValue || ""}
						onChange={(event) => {
							const inputValue = Number(event.target.value);
							setManualDiscountValue(Number.isFinite(inputValue) ? Math.max(0, inputValue) : 0);
						}}
					/>
				</div>
			) : null}
			<Button type="button" size="sm" variant="ghost" className="self-end" disabled={!isEligible} onClick={handleApply}>
				APLICAR CUPOM
			</Button>
		</div>
	);
}
