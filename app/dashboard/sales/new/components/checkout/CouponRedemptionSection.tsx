import CouponRemovalAction from "@/components/Coupons/CouponRemovalAction";
import { resolveAppliedCouponEvaluation, type TCouponGiftOption } from "@/lib/coupons/gifts";
import { usePosCouponGiftProducts } from "@/lib/queries/coupons";
import ProductBuilderModal from "../ProductBuilderModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatToMoney } from "@/lib/formatting";
import { type TPosAvailableCoupon, usePosAvailableCoupons } from "@/lib/queries/coupons";
import type { TCartItem, TUseSaleState } from "@/state-hooks/use-sale-state";
import { ChevronDown, ChevronUp, Gift, Loader2, Ticket } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

function formatCouponBenefit(coupon: TPosAvailableCoupon) {
	if (coupon.beneficioTipo === "DESCONTO_FIXO") return `${formatToMoney(coupon.beneficioValor ?? 0)} DE DESCONTO`;
	if (coupon.beneficioTipo === "DESCONTO_PERCENTUAL")
		return `${coupon.beneficioValor ?? 0}% DE DESCONTO${coupon.beneficioDescontoMaximo ? ` (MÁX ${formatToMoney(coupon.beneficioDescontoMaximo)})` : ""}`;
	if (coupon.beneficioTipo === "PRECO_FIXO") return `PREÇO FIXO DE ${formatToMoney(coupon.beneficioValor ?? 0)}`;
	if (coupon.beneficioTipo === "COMPRE_X_LEVE_Y") return `LEVE ${coupon.beneficioLeveQuantidade ?? 0} PAGUE ${coupon.beneficioCompreQuantidade ?? 0}`;
	return "PRODUTO GRÁTIS";
}

/** Linha que o operador acabou de adicionar para ser o brinde, esperando a reavaliação do servidor. */
type TPendingGift = { couponId: string; itemChave: string };

type CouponRedemptionSectionProps = {
	saleState: TUseSaleState;
	clientId: string;
};

export default function CouponRedemptionSection({ saleState, clientId }: CouponRedemptionSectionProps) {
	const [isListOpen, setIsListOpen] = useState(false);
	const [pendingGift, setPendingGift] = useState<TPendingGift | null>(null);

	const cartItemsForEvaluation = useMemo(
		() =>
			saleState.state.itens.map((item) => ({
				chave: item.tempId,
				valorUnitarioBase: item.valorUnitarioBase,
				valorDesconto: item.valorDesconto,
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

	function applyGift(coupon: TPosAvailableCoupon, option: TCouponGiftOption) {
		if (!option.avaliacao.elegivel) return;
		saleState.setCupomResgate({
			cupomId: coupon.id,
			valorDesconto: option.avaliacao.valorDesconto,
			codigo: coupon.codigo,
			titulo: coupon.titulo,
			validacaoModo: "AUTOMATICA",
			brinde: { itemChave: option.itemChave, quantidade: 1 },
		});
		setIsListOpen(false);
	}

	// "Adicionar grátis" é um gesto só: a linha entra no carrinho e o cupom é aplicado nela assim que
	// a avaliação do servidor enxerga a linha nova. Se o servidor recusar (condição de compra não
	// atendida, preço zerado), a linha sai de novo: o operador pediu um brinde, não um item pago.
	useEffect(() => {
		if (!pendingGift) return;
		if (!saleState.state.itens.some((item) => item.tempId === pendingGift.itemChave)) {
			setPendingGift(null); // o operador tirou a linha antes da avaliação voltar
			return;
		}
		if (!availableCoupons) return;
		const coupon = availableCoupons.find((candidate) => candidate.id === pendingGift.couponId);
		const option = coupon?.brindes.find((candidate) => candidate.itemChave === pendingGift.itemChave);
		if (coupon && !option) return; // avaliação ainda não inclui a linha nova
		setPendingGift(null);
		if (coupon && option?.avaliacao.elegivel) {
			applyGift(coupon, option);
			toast.success("Brinde aplicado.");
			return;
		}
		saleState.removeItem(pendingGift.itemChave);
		const reason = option && !option.avaliacao.elegivel ? option.avaliacao.motivo : "O cupom deixou de estar disponível para este cliente.";
		toast.error(`Brinde não aplicado. ${reason}`);
	}, [pendingGift, availableCoupons, saleState.state.itens]);

	// Mantém o cupom AUTOMATICA aplicado em sincronia com o carrinho: o desconto do servidor
	// é o autoritativo; se o cupom deixa de ser elegível, é removido com aviso ao operador.
	useEffect(() => {
		if (!appliedCoupon || !availableCoupons) return;
		const freshCoupon = availableCoupons.find((coupon) => coupon.id === appliedCoupon.cupomId);
		const evaluation = resolveAppliedCouponEvaluation(freshCoupon, appliedCoupon);
		if (!freshCoupon || evaluation?.elegivel === false || (freshCoupon.validacaoModo === "AUTOMATICA" && !evaluation)) {
			saleState.setCupomResgate(null);
			toast.warning("O cupom aplicado deixou de ser elegível para o carrinho atual e foi removido.");
			return;
		}
		if (evaluation?.elegivel && Math.abs(evaluation.valorDesconto - appliedCoupon.valorDesconto) > (appliedCoupon.brinde ? 0.000001 : 0.01)) {
			saleState.setCupomResgate({ ...appliedCoupon, valorDesconto: evaluation.valorDesconto });
		}
	}, [appliedCoupon, availableCoupons, saleState.setCupomResgate]);

	if (appliedCoupon) {
		const giftItem = appliedCoupon.brinde ? saleState.state.itens.find((item) => item.tempId === appliedCoupon.brinde?.itemChave) : null;
		return (
			<div className="w-full flex flex-col gap-1.5 rounded-lg border border-primary/35 bg-primary/10 px-2 py-2">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-1.5">
						<Ticket className="w-3 h-3 text-primary" />
						<span className="text-xs font-semibold text-primary">CUPOM {appliedCoupon.titulo ?? appliedCoupon.codigo ?? "APLICADO"}</span>
					</div>
					<span className="text-xs font-bold text-primary">-{formatToMoney(appliedCoupon.valorDesconto)}</span>
				</div>
				{appliedCoupon.brinde ? (
					<p className="text-xs text-muted-foreground">
						{giftItem?.nome ?? "Produto selecionado"} sai grátis (1 unidade). Adicionais são cobrados à parte.
					</p>
				) : null}
				<CouponRemovalAction
					hasGift={!!appliedCoupon.brinde}
					onRemove={() => saleState.setCupomResgate(null)}
					onRemoveGift={() => {
						if (!giftItem) return;
						if (giftItem.quantidade <= 1) saleState.removeItem(giftItem.tempId);
						else saleState.updateItemQuantity(giftItem.tempId, giftItem.quantidade - 1);
					}}
				/>
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
						<AvailableCouponCard
							key={coupon.id}
							coupon={coupon}
							saleState={saleState}
							onApplied={() => setIsListOpen(false)}
							onApplyGift={(option) => applyGift(coupon, option)}
							pendingGiftItemKey={pendingGift?.couponId === coupon.id ? pendingGift.itemChave : null}
							onGiftAdded={(itemChave) => setPendingGift({ couponId: coupon.id, itemChave })}
						/>
					))}
				</div>
			) : null}
		</div>
	);
}

type AvailableCouponCardProps = {
	coupon: TPosAvailableCoupon;
	saleState: TUseSaleState;
	onApplied: () => void;
	onApplyGift: (option: TCouponGiftOption) => void;
	pendingGiftItemKey: string | null;
	onGiftAdded: (itemChave: string) => void;
};

function AvailableCouponCard({ coupon, saleState, onApplied, onApplyGift, pendingGiftItemKey, onGiftAdded }: AvailableCouponCardProps) {
	const [manualDiscountValue, setManualDiscountValue] = useState<number>(0);

	const isAutomatic = coupon.validacaoModo === "AUTOMATICA";
	const evaluation = coupon.avaliacao;
	const isEligible = isAutomatic ? !!evaluation?.elegivel : evaluation?.elegivel !== false;
	const manualMaxDiscount = saleState.valorAntesCupom;
	const isGift = coupon.beneficioTipo === "BRINDE";

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
		<div className="w-full flex flex-col gap-2 rounded-lg border border-border bg-card px-2.5 py-2">
			<div className="flex items-start justify-between gap-2">
				<div className="flex min-w-0 flex-col">
					<span className="text-sm font-bold leading-tight">{coupon.titulo}</span>
					<span className="text-micro text-muted-foreground uppercase">
						{coupon.codigo} · {formatCouponBenefit(coupon)}
					</span>
				</div>
				{!isGift && isAutomatic && evaluation?.elegivel ? (
					<span className="text-xs font-bold text-primary">-{formatToMoney(evaluation.valorDesconto)}</span>
				) : null}
			</div>
			{!isGift && evaluation && !evaluation.elegivel ? <p className="text-[11px] text-muted-foreground">{evaluation.motivo}</p> : null}
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
			{isGift ? (
				<GiftProductActions
					coupon={coupon}
					saleState={saleState}
					onApplyGift={onApplyGift}
					pendingGiftItemKey={pendingGiftItemKey}
					onGiftAdded={onGiftAdded}
				/>
			) : (
				<Button type="button" size="sm" variant="ghost" className="self-end" disabled={!isEligible} onClick={handleApply}>
					APLICAR CUPOM
				</Button>
			)}
		</div>
	);
}

type TGiftProduct = NonNullable<ReturnType<typeof usePosCouponGiftProducts>["data"]>[number];

/**
 * Uma ação por produto permitido. Se o produto já está no carrinho, a ação aplica o cupom naquela
 * linha; se não está, adiciona e aplica no mesmo toque. O operador nunca precisa montar o carrinho
 * primeiro e voltar aqui depois.
 */
function GiftProductActions({
	coupon,
	saleState,
	onApplyGift,
	pendingGiftItemKey,
	onGiftAdded,
}: {
	coupon: TPosAvailableCoupon;
	saleState: TUseSaleState;
	onApplyGift: (option: TCouponGiftOption) => void;
	pendingGiftItemKey: string | null;
	onGiftAdded: (itemChave: string) => void;
}) {
	const { data: products, isLoading, error } = usePosCouponGiftProducts(coupon.id);
	const [builderProduct, setBuilderProduct] = useState<TGiftProduct | null>(null);
	const pendingProductId = pendingGiftItemKey ? saleState.state.itens.find((item) => item.tempId === pendingGiftItemKey)?.produtoId : null;

	function addAsGift(item: TCartItem) {
		saleState.addItem(item);
		onGiftAdded(item.tempId);
	}

	function handleAdd(product: TGiftProduct) {
		if (product.variantes.length > 0 || product.addOnsReferencias.length > 0) {
			setBuilderProduct(product);
			return;
		}
		const price = product.precoVenda ?? 0;
		addAsGift({
			tempId: crypto.randomUUID(),
			saldoEstoque: null,
			produtoId: product.id,
			produtoVarianteId: null,
			nome: product.nome,
			codigo: product.codigo,
			imagemUrl: product.imagemCapaUrl,
			quantidade: 1,
			valorUnitarioBase: price,
			valorModificadores: 0,
			valorUnitarioFinal: price,
			valorTotalBruto: price,
			valorDesconto: 0,
			valorTotalLiquido: price,
			modificadores: [],
		});
	}

	if (isLoading) return <p className="text-xs text-muted-foreground">Buscando produtos do brinde...</p>;
	if (error)
		return (
			<p role="alert" className="text-xs text-destructive">
				Não foi possível carregar os produtos do brinde.
			</p>
		);
	if (!products?.length) return <p className="text-xs text-muted-foreground">Nenhum produto do brinde está disponível no PDV.</p>;

	return (
		<div className="flex flex-col gap-1.5">
			{products.map((product) => {
				const options = coupon.brindes.filter((option) => option.produtoId === product.id);
				const eligibleOption = options.find((option) => option.avaliacao.elegivel);
				const blockedReason = !eligibleOption ? options.find((option) => !option.avaliacao.elegivel)?.avaliacao : null;
				const isPending = pendingProductId === product.id;
				const price = product.precoVenda;
				return (
					<div key={product.id} className="flex flex-col gap-1">
						<div className="flex items-center justify-between gap-2 rounded-md bg-muted/60 py-1.5 pl-2.5 pr-1.5">
							<div className="flex min-w-0 items-center gap-2">
								<Gift className="size-3.5 shrink-0 text-primary" aria-hidden />
								<div className="flex min-w-0 flex-col">
									<span className="truncate text-xs font-semibold">{product.nome}</span>
									<span className="text-micro text-muted-foreground">
										{price ? <span className="line-through">{formatToMoney(price)}</span> : null}
										{price ? " " : null}
										{eligibleOption ? "já no carrinho, sai grátis" : "sai grátis"}
									</span>
								</div>
							</div>
							<Button
								type="button"
								size="sm"
								className="shrink-0"
								disabled={!!pendingGiftItemKey}
								onClick={() => (eligibleOption ? onApplyGift(eligibleOption) : handleAdd(product))}
							>
								{isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
								{isPending ? "APLICANDO" : eligibleOption ? "APLICAR" : "ADICIONAR GRÁTIS"}
							</Button>
						</div>
						{blockedReason && !blockedReason.elegivel && !isPending ? (
							<p className="px-1 text-micro text-muted-foreground">{blockedReason.motivo}</p>
						) : null}
					</div>
				);
			})}
			{builderProduct ? <ProductBuilderModal product={builderProduct} onAddToCart={addAsGift} onClose={() => setBuilderProduct(null)} /> : null}
		</div>
	);
}
