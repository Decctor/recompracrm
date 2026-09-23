"use client";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getErrorMessage } from "@/lib/errors";
import { createShopOrder } from "@/lib/mutations/shop";
import { HAPTICS, triggerHaptic } from "@/lib/shop/haptics";
import { buildShopCartLines } from "@/lib/shop/cart";
import {
	SHOP_CHECKOUT_STEPS,
	SHOP_CHECKOUT_STEP_TITLES,
	getNextShopCheckoutStep,
	getPreviousShopCheckoutStep,
	getShopBenefitsTitle,
	getShopCashbackCapabilities,
	getShopCheckoutSteps,
} from "@/lib/shop/checkout";
import { useShopAvailableCoupons } from "@/lib/queries/shop";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import CashbackStep from "./checkout/CashbackStep";
import CustomerIdentityStep from "./checkout/CustomerIdentityStep";
import DeliveryStep from "./checkout/DeliveryStep";
import OrderReviewStep from "./checkout/OrderReviewStep";
import PaymentStep from "./checkout/PaymentStep";
import { useShop } from "./ShopProvider";

const SHOP_ORDER_PUBLIC_TOKEN_CONFLICT_MESSAGE = "Este pedido foi alterado após uma tentativa anterior. Tente enviar novamente.";

export default function CheckoutSheet() {
	const router = useRouter();
	const { orgId, slug, catalog, availability, orderState, isCheckoutOpen, setIsCheckoutOpen, setIsCartOpen } = useShop();
	const { checkoutStep, customer, cart } = orderState.state;
	const isOpen = availability.status === "ABERTA";

	const { mutate: submitOrder, isPending } = useMutation({
		mutationKey: ["create-shop-order", orgId],
		mutationFn: () => createShopOrder({ orgId, input: orderState.orderInput }),
		onSuccess: (data) => {
			triggerHaptic(HAPTICS.success);
			orderState.clearCart();
			setIsCheckoutOpen(false);
			router.replace("/shop/" + slug + "/pedidos/" + data.data.publicAccessToken);
		},
		onError: (error) => {
			triggerHaptic(HAPTICS.warning);
			const message = getErrorMessage(error);
			if (message === SHOP_ORDER_PUBLIC_TOKEN_CONFLICT_MESSAGE) {
				orderState.refreshOrderIdentity();
			}
			toast.error(message);
		},
	});

	const isInCheckout = (SHOP_CHECKOUT_STEPS as readonly string[]).includes(checkoutStep);

	const cartLines = useMemo(() => buildShopCartLines(cart.items, catalog.products), [cart.items, catalog.products]);
	const couponItems = useMemo(
		() =>
			cartLines.map((line) => ({
				produtoId: line.produtoId,
				produtoVarianteId: line.produtoVarianteId,
				quantidade: line.quantidade,
				valorVendaUnitario: line.unitFinal,
			})),
		[cartLines],
	);
	// Fora do checkout a consulta fica dormente: cada mutação de carrinho durante a navegação do
	// catálogo dispararia uma avaliação de cupons no servidor que o cliente talvez nunca veja.
	const { data: availableCoupons, isLoading: isLoadingCoupons } = useShopAvailableCoupons({
		orgId,
		clienteId: customer.id ?? null,
		itens: couponItems,
		entregaModalidade: orderState.state.delivery.modalidade,
		enabled: isCheckoutOpen,
	});
	const program = catalog.cashbackProgram;
	const appliedCoupon = orderState.state.coupon.resgate;
	useEffect(() => {
		if (!appliedCoupon || !availableCoupons) return;
		const freshCoupon = availableCoupons.find((coupon) => coupon.id === appliedCoupon.cupomId);
		if (!freshCoupon?.avaliacao?.elegivel) {
			orderState.updateCoupon(null);
			toast.warning("O cupom deixou de valer para este pedido e foi removido.");
		} else if (Math.abs(freshCoupon.avaliacao.valorDesconto - appliedCoupon.valorDesconto) > 0.01) {
			orderState.updateCoupon({ ...appliedCoupon, valorDesconto: freshCoupon.avaliacao.valorDesconto });
		}
	}, [appliedCoupon, availableCoupons, orderState.updateCoupon]);
	const hasCouponBenefit = !!customer.id && (isLoadingCoupons || (availableCoupons?.length ?? 0) > 0 || !!orderState.state.coupon.resgate);
	const { descontoCashback: supportsCashbackDiscount, recompensas: supportsRewards } = getShopCashbackCapabilities(program);
	const benefitCapabilities = {
		cupons: hasCouponBenefit,
		descontoCashback: !!customer.id && supportsCashbackDiscount,
		recompensas: !!customer.id && supportsRewards,
	};
	const benefitsTitle = getShopBenefitsTitle(benefitCapabilities);

	useEffect(() => {
		if (!supportsCashbackDiscount && orderState.state.cashback.resgateSolicitado > 0) {
			orderState.updateCashback({ resgateSolicitado: 0 });
		}
		// Só descarta as recompensas cuja regra é do programa delas: numa org com mais de um
		// programa, o do catálogo (findFirst ativo) pode não ser o do saldo do cliente — nesse caso
		// quem valida é a revalidação da etapa de benefícios e a admissão no servidor.
		if (!supportsRewards) {
			for (const applied of orderState.state.reward.resgates) {
				if (!program || applied.programaId === program.id) orderState.removeReward(applied.recompensaId);
			}
		}
	}, [
		program,
		supportsCashbackDiscount,
		supportsRewards,
		orderState.state.cashback.resgateSolicitado,
		orderState.state.reward.resgates,
		orderState.updateCashback,
		orderState.removeReward,
	]);
	const visibleSteps = getShopCheckoutSteps(benefitCapabilities);
	// "CARRINHO" nao e um passo do checkout: indexOf devolve -1 e o progresso fica em zero.
	const stepIndex = visibleSteps.indexOf(checkoutStep as (typeof visibleSteps)[number]);
	const stepProgress = stepIndex >= 0 ? ((stepIndex + 1) / visibleSteps.length) * 100 : 0;

	const handleBack = () => {
		if (checkoutStep === "CLIENTE") {
			setIsCheckoutOpen(false);
			orderState.setCheckoutStep("CARRINHO");
			setIsCartOpen(true);
		} else if (checkoutStep !== "CARRINHO") {
			orderState.setCheckoutStep(getPreviousShopCheckoutStep(checkoutStep, visibleSteps));
		}
	};

	const handleClose = () => {
		setIsCheckoutOpen(false);
		orderState.setCheckoutStep("CARRINHO");
	};

	// Single chokepoint for the "advanced a step" tap, so every step's CONTINUAR
	// gets the same confirmation. Back navigation stays silent: it's a correction.
	const advanceStep = () => {
		triggerHaptic(HAPTICS.tap);
		if (checkoutStep === "CARRINHO") return;
		orderState.setCheckoutStep(getNextShopCheckoutStep(checkoutStep, visibleSteps));
	};

	const stepScrollRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		stepScrollRef.current?.scrollTo({ top: 0 });
	}, [checkoutStep]);

	return (
		<Sheet open={isCheckoutOpen && isInCheckout} onOpenChange={(open) => !open && handleClose()}>
			<SheetContent
				side="bottom"
				showCloseButton={false}
				className="flex h-[92dvh] max-h-[92dvh] flex-col gap-0 overflow-hidden rounded-t-2xl p-0 data-[side=bottom]:h-[92dvh]"
			>
				<div className="relative flex min-h-0 flex-1 flex-col">
					<SheetHeader className="flex shrink-0 flex-row items-center gap-3 border-b p-4 text-left">
						<Button variant="ghost" size="icon" className="-ml-2 h-9 w-9 shrink-0" aria-label="Voltar" onClick={handleBack}>
							<ArrowLeft className="h-4 w-4" />
						</Button>
						<div className="min-w-0 flex-1">
							<SheetTitle className="text-lg font-black">
								{checkoutStep === "CASHBACK" ? benefitsTitle : SHOP_CHECKOUT_STEP_TITLES[checkoutStep as keyof typeof SHOP_CHECKOUT_STEP_TITLES]}
							</SheetTitle>
							<SheetDescription>{stepIndex >= 0 ? `Etapa ${stepIndex + 1} de ${visibleSteps.length}` : "Finalizar pedido"}</SheetDescription>
						</div>
					</SheetHeader>

					<div className="h-1 w-full shrink-0 bg-muted" aria-hidden>
						<div className="h-full bg-brand transition-[width] duration-300 ease-out" style={{ width: `${stepProgress}%` }} />
					</div>

					<div
						ref={stepScrollRef}
						className="scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] lg:px-6"
					>
						{!isOpen && (
							<div className="rounded-2xl border border-brand-secondary/30 bg-brand-secondary/10 px-4 py-3">
								<p className="text-sm font-bold">A loja fechou enquanto você finalizava.</p>
								<p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
									Seu pedido está salvo. Volte durante o horário de atendimento para enviar.
								</p>
							</div>
						)}

						{checkoutStep === "CLIENTE" && <CustomerIdentityStep onNext={advanceStep} />}

						{checkoutStep === "ENTREGA" && <DeliveryStep onNext={advanceStep} />}

						{checkoutStep === "CASHBACK" && <CashbackStep onNext={advanceStep} />}

						{checkoutStep === "PAGAMENTO" && <PaymentStep onNext={advanceStep} />}

						{checkoutStep === "REVISAO" && <OrderReviewStep onSubmit={() => submitOrder()} isSubmitting={isPending} />}
					</div>

					{isPending && (
						<div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80">
							<div className="flex flex-col items-center gap-3">
								<Loader2 className="h-8 w-8 animate-spin text-primary" />
								<p className="text-sm font-medium">Enviando pedido...</p>
							</div>
						</div>
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}
