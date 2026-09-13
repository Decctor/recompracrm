"use client";

import { getShopCashbackCapabilities } from "@/lib/shop/checkout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { formatCashbackValue, formatToMoney } from "@/lib/formatting";
import { type TShopAvailableCoupon, useShopAvailableCoupons, useShopAvailableRewards, useShopClientLookup } from "@/lib/queries/shop";
import { buildShopCartLines } from "@/lib/shop/cart";
import { HAPTICS, triggerHaptic } from "@/lib/shop/haptics";
import { ArrowRight, BadgePercent, Gift, Info, Loader2, Ticket, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useShop } from "../ShopProvider";

type CashbackStepProps = {
	onNext: () => void;
};

function formatCouponBenefit(coupon: TShopAvailableCoupon) {
	if (coupon.beneficioTipo === "DESCONTO_FIXO") return `${formatToMoney(coupon.beneficioValor ?? 0)} de desconto`;
	if (coupon.beneficioTipo === "DESCONTO_PERCENTUAL")
		return `${coupon.beneficioValor ?? 0}% de desconto${coupon.beneficioDescontoMaximo ? `, máximo ${formatToMoney(coupon.beneficioDescontoMaximo)}` : ""}`;
	if (coupon.beneficioTipo === "PRECO_FIXO") return `Preço fixo de ${formatToMoney(coupon.beneficioValor ?? 0)}`;
	if (coupon.beneficioTipo === "COMPRE_X_LEVE_Y") return `Leve ${coupon.beneficioLeveQuantidade ?? 0}, pague ${coupon.beneficioCompreQuantidade ?? 0}`;
	return "Brinde";
}

export default function CashbackStep({ onNext }: CashbackStepProps) {
	const { orgId, catalog, orderState } = useShop();
	const { customer, cashback, cart, coupon, reward, delivery } = orderState.state;

	const { data: lookupData } = useShopClientLookup({
		orgId,
		telefone: customer.telefone,
	});

	const cartLines = useMemo(() => buildShopCartLines(cart.items, catalog.products), [cart.items, catalog.products]);

	const subtotal = useMemo(() => cartLines.reduce((sum, line) => sum + line.lineTotal, 0), [cartLines]);
	const cartItemsForCoupon = useMemo(
		() =>
			cartLines.map((line) => ({
				produtoId: line.produtoId,
				produtoVarianteId: line.produtoVarianteId,
				quantidade: line.quantidade,
				valorVendaUnitario: line.unitFinal,
			})),
		[cartLines],
	);

	const { data: availableCoupons, isLoading: isLoadingCoupons } = useShopAvailableCoupons({
		orgId,
		clienteId: customer.id ?? null,
		itens: cartItemsForCoupon,
		entregaModalidade: delivery.modalidade,
	});
	const program = catalog.cashbackProgram;
	const { descontoCashback: supportsCashbackDiscount, recompensas: supportsRewards } = getShopCashbackCapabilities(program);
	// Sem a modalidade não há o que listar — a rota faria 4 queries para devolver lista vazia.
	const { data: rewardsData, isLoading: isLoadingRewards } = useShopAvailableRewards({
		orgId,
		clienteId: customer.id ?? null,
		enabled: supportsRewards,
	});
	const balance = lookupData?.client?.saldos?.[0]?.saldoValorDisponivel ?? 0;
	const appliedCoupon = coupon.resgate;
	const couponDiscount = appliedCoupon?.valorDesconto ?? 0;
	const valueBeforeCashback = Math.max(0, subtotal - couponDiscount);

	const maxRedemption = useMemo(() => {
		if (!program || !supportsCashbackDiscount) return 0;

		let limit = balance;

		if (program.resgateLimiteTipo === "FIXO" && program.resgateLimiteValor) {
			limit = Math.min(limit, program.resgateLimiteValor);
		} else if (program.resgateLimiteTipo === "PERCENTUAL" && program.resgateLimiteValor) {
			limit = Math.min(limit, (valueBeforeCashback * program.resgateLimiteValor) / 100);
		}

		return Math.min(limit, valueBeforeCashback);
	}, [program, supportsCashbackDiscount, balance, valueBeforeCashback]);

	useEffect(() => {
		const appliedReward = reward.resgate;
		if (!appliedReward || !rewardsData) return;
		const freshReward = rewardsData.rewards.find((item) => item.id === appliedReward.recompensaId);
		if (!freshReward?.elegivel) {
			orderState.updateReward(null);
			toast.warning("A recompensa selecionada deixou de estar disponível e foi removida.");
			return;
		}
		// Tolerância de centavo (mesma régua do PDV): !== estrito em float re-dispararia o
		// updateReward — que rotaciona a identidade do pedido — a cada refetch.
		if (Math.abs(freshReward.valor - appliedReward.valor) > 0.01 || Math.abs(freshReward.valorVenda - appliedReward.valorVenda) > 0.01) {
			orderState.updateReward({ ...appliedReward, valor: freshReward.valor, valorVenda: freshReward.valorVenda });
		}
	}, [reward.resgate, rewardsData, orderState.updateReward]);

	useEffect(() => {
		if (cashback.resgateSolicitado > maxRedemption) {
			orderState.updateCashback({ resgateSolicitado: maxRedemption });
		}
	}, [cashback.resgateSolicitado, maxRedemption, orderState.updateCashback]);

	useEffect(() => {
		if (!appliedCoupon || !availableCoupons) return;
		const freshCoupon = availableCoupons.find((item) => item.id === appliedCoupon.cupomId);
		if (!freshCoupon || freshCoupon.validacaoModo !== "AUTOMATICA" || !freshCoupon.avaliacao?.elegivel) {
			orderState.updateCoupon(null);
			toast.warning("O cupom aplicado deixou de valer para o carrinho atual e foi removido.");
			return;
		}
		if (Math.abs(freshCoupon.avaliacao.valorDesconto - appliedCoupon.valorDesconto) > 0.01) {
			orderState.updateCoupon({ ...appliedCoupon, valorDesconto: freshCoupon.avaliacao.valorDesconto });
		}
	}, [appliedCoupon, availableCoupons, orderState.updateCoupon]);

	// Benefícios são mutuamente exclusivos (o estado limpa os irmãos ao aplicar um) — sem o aviso,
	// o cliente perderia uma recompensa de R$ 60 ao tocar num cupom de R$ 5 sem entender por quê.
	const notifyRewardReplaced = () => {
		if (reward.resgate) toast.info("O resgate de recompensa foi removido: ele não pode ser combinado com outros benefícios.");
	};

	const handleSliderChange = (value: number[]) => {
		const resgateSolicitado = Math.min(value[0], maxRedemption);
		if (resgateSolicitado > 0) notifyRewardReplaced();
		orderState.updateCashback({ resgateSolicitado });
	};

	const handleInputChange = (value: string) => {
		const numValue = Number.parseFloat(value.replace(/[^\d.,]/g, "").replace(",", ".")) || 0;
		const resgateSolicitado = Math.min(Math.max(0, numValue), maxRedemption);
		if (resgateSolicitado > 0) notifyRewardReplaced();
		orderState.updateCashback({ resgateSolicitado });
	};

	const couponsCount = availableCoupons?.length ?? 0;
	const hasCashback = supportsCashbackDiscount && balance > 0 && maxRedemption > 0;
	const hasAnyBenefit = couponsCount > 0 || hasCashback || !!appliedCoupon || !!reward.resgate;

	return (
		<div className="flex flex-col gap-5">
			<div className="rounded-2xl border border-brand/25 bg-brand/5 p-4">
				<div className="flex items-start gap-3">
					<span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-foreground">
						<BadgePercent className="size-5" />
					</span>
					<div className="min-w-0 flex-1">
						<p className="text-sm font-black uppercase tracking-wide text-brand">
							{supportsRewards ? "Recompensas do clube" : supportsCashbackDiscount ? "Cashback do pedido" : "Cupons do pedido"}
						</p>
						<p className="mt-1 text-sm leading-relaxed text-muted-foreground">
							{supportsRewards
								? "Escolha uma recompensa e troque seus pontos por um produto grátis antes do pagamento."
								: supportsCashbackDiscount
									? "Use seu saldo disponível antes de escolher o pagamento."
									: "Aplique um cupom disponível antes de escolher o pagamento."}
						</p>
					</div>
				</div>
			</div>

			{supportsRewards ? (
				<section className="flex flex-col gap-3">
					<div className="flex items-center justify-between gap-3">
						<Label className="text-sm font-black uppercase tracking-wide">Recompensas</Label>
						<span className="text-xs font-bold text-brand">
							Saldo: {formatCashbackValue(rewardsData?.saldoValorDisponivel ?? 0, rewardsData?.program?.terminologia ?? "DINHEIRO")}
						</span>
					</div>
					{isLoadingRewards ? (
						<div className="flex items-center gap-2 rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
							<Loader2 className="size-4 animate-spin" /> Buscando recompensas...
						</div>
					) : rewardsData?.rewards.length ? (
						<div className="grid gap-2 sm:grid-cols-2">
							{rewardsData.rewards.map((item) => {
								const selected = reward.resgate?.recompensaId === item.id;
								return (
									<div key={item.id} className={`flex flex-col gap-3 rounded-2xl border bg-card p-3 ${selected ? "border-brand ring-1 ring-brand" : ""}`}>
										<div className="flex gap-3">
											{item.imagemCapaUrl ? (
												<div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-muted">
													<Image src={item.imagemCapaUrl} alt={item.titulo} fill className="object-cover" sizes="56px" />
												</div>
											) : (
												<div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-brand/10">
													<Gift className="size-5 text-brand" />
												</div>
											)}
											<div className="min-w-0">
												<p className="text-sm font-bold leading-snug">{item.titulo}</p>
												<p className="mt-1 text-xs font-bold text-brand">{formatCashbackValue(item.valor, rewardsData.program?.terminologia ?? "DINHEIRO")}</p>
												<p className="text-xs text-muted-foreground">Valor: {formatToMoney(item.valorVenda)}</p>
											</div>
										</div>
										{!item.elegivel && item.motivo ? <p className="text-xs text-muted-foreground">{item.motivo}</p> : null}
										<Button
											type="button"
											size="sm"
											variant={selected ? "outline" : "brand"}
											disabled={!item.elegivel}
											onClick={() => {
												if (!selected && (coupon.resgate || cashback.resgateSolicitado > 0)) {
													toast.info("Cupom e cashback foram removidos: a recompensa não pode ser combinada com outros benefícios.");
												}
												orderState.updateReward(
													selected
														? null
														: {
																recompensaId: item.id,
																programaId: rewardsData.program!.id,
																titulo: item.titulo,
																valor: item.valor,
																valorVenda: item.valorVenda,
																imagemCapaUrl: item.imagemCapaUrl,
															},
												);
											}}
										>
											{selected ? "REMOVER" : "RESGATAR"}
										</Button>
									</div>
								);
							})}
						</div>
					) : (
						<div className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">Nenhuma recompensa disponível.</div>
					)}
				</section>
			) : null}

			{couponsCount > 0 || !!appliedCoupon || isLoadingCoupons ? (
				<section className="flex flex-col gap-3">
					<div className="flex items-center justify-between gap-3">
						<Label className="text-sm font-black uppercase tracking-wide">Cupons</Label>
						{isLoadingCoupons ? (
							<span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
								<Loader2 className="size-3 animate-spin" />
								Buscando
							</span>
						) : couponsCount > 0 ? (
							<span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
								{couponsCount} {couponsCount === 1 ? "disponível" : "disponíveis"}
							</span>
						) : null}
					</div>

					{appliedCoupon ? (
						<div className="rounded-2xl border border-primary/25 bg-primary/5 p-3.5">
							<div className="flex items-start justify-between gap-3">
								<div className="flex min-w-0 items-start gap-3">
									<span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
										<Ticket className="size-4" />
									</span>
									<div className="min-w-0">
										<p className="text-sm font-black uppercase text-primary">{appliedCoupon.codigo ?? "Cupom aplicado"}</p>
										<p className="mt-0.5 text-sm font-semibold">{appliedCoupon.titulo ?? "Desconto aplicado"}</p>
									</div>
								</div>
								<p className="shrink-0 text-sm font-black tabular-nums text-primary">-{formatToMoney(appliedCoupon.valorDesconto)}</p>
							</div>
							<Button type="button" variant="ghost" size="sm" className="mt-2 h-8 w-full gap-1.5 rounded-xl" onClick={() => orderState.updateCoupon(null)}>
								<X className="size-3.5" />
								Remover cupom
							</Button>
						</div>
					) : availableCoupons && availableCoupons.length > 0 ? (
						<div className="flex flex-col gap-2">
							{availableCoupons.map((availableCoupon) => (
								<AvailableCouponCard
									key={availableCoupon.id}
									coupon={availableCoupon}
									onApply={() => {
										triggerHaptic(HAPTICS.tap);
										notifyRewardReplaced();
										orderState.updateCoupon({
											cupomId: availableCoupon.id,
											valorDesconto: availableCoupon.avaliacao?.elegivel ? availableCoupon.avaliacao.valorDesconto : 0,
											codigo: availableCoupon.codigo,
											titulo: availableCoupon.titulo,
										});
									}}
								/>
							))}
						</div>
					) : isLoadingCoupons ? (
						<div className="flex items-center gap-2 rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
							<Loader2 className="size-4 animate-spin" /> Buscando cupons...
						</div>
					) : (
						// Cliente sempre identificado aqui: a etapa de benefícios só existe com customer.id.
						<div className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">Nenhum cupom disponível para este carrinho.</div>
					)}
				</section>
			) : null}

			{supportsCashbackDiscount ? (
				<section className="flex flex-col gap-3">
					<Label className="text-sm font-black uppercase tracking-wide">Cashback</Label>

					{hasCashback ? (
						<div className="flex flex-col gap-4 rounded-2xl border bg-card p-4">
							<div className="flex items-center justify-between gap-3">
								<div>
									<p className="text-sm text-muted-foreground">Saldo disponível</p>
									<p className="text-lg font-black text-primary">{formatToMoney(balance)}</p>
								</div>
								<span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">até {formatToMoney(maxRedemption)}</span>
							</div>

							<Slider value={[cashback.resgateSolicitado]} min={0} max={maxRedemption} step={0.01} onValueChange={handleSliderChange} className="w-full" />

							<div className="flex items-center justify-between gap-4">
								<span className="text-sm text-muted-foreground">R$ 0,00</span>
								<div className="max-w-[150px] flex-1">
									<Input
										type="text"
										inputMode="decimal"
										value={formatToMoney(cashback.resgateSolicitado).replace("R$", "").trim()}
										onChange={(event) => handleInputChange(event.target.value)}
										className="h-10 text-center font-bold"
									/>
								</div>
								<span className="text-sm text-muted-foreground">{formatToMoney(maxRedemption)}</span>
							</div>
						</div>
					) : (
						<div className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">Você não possui cashback disponível para este pedido.</div>
					)}
				</section>
			) : null}

			{hasAnyBenefit ? (
				<div className="rounded-2xl border border-primary/15 bg-primary/5 p-4">
					<div className="flex flex-col gap-2">
						<div className="flex items-center justify-between gap-3">
							<span className="text-sm text-muted-foreground">Subtotal</span>
							<span className="text-sm font-semibold tabular-nums">{formatToMoney(subtotal)}</span>
						</div>
						{couponDiscount > 0 ? (
							<div className="flex items-center justify-between gap-3 text-primary">
								<span className="text-sm">Cupom</span>
								<span className="text-sm font-semibold tabular-nums">-{formatToMoney(couponDiscount)}</span>
							</div>
						) : null}
						{cashback.resgateSolicitado > 0 ? (
							<div className="flex items-center justify-between gap-3 text-primary">
								<span className="text-sm">Cashback</span>
								<span className="text-sm font-semibold tabular-nums">-{formatToMoney(cashback.resgateSolicitado)}</span>
							</div>
						) : null}
						{reward.resgate ? (
							// A recompensa não abate o total a pagar: é um item grátis somado ao pedido.
							<div className="flex items-center justify-between gap-3 text-primary">
								<span className="min-w-0 truncate text-sm">Recompensa: {reward.resgate.titulo}</span>
								<span className="shrink-0 text-sm font-semibold">Grátis</span>
							</div>
						) : null}
						<div className="flex items-end justify-between gap-3 border-t border-primary/15 pt-3">
							<span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Total após descontos</span>
							<span className="text-2xl font-black tabular-nums text-primary">
								{formatToMoney(Math.max(0, subtotal - couponDiscount - cashback.resgateSolicitado))}
							</span>
						</div>
					</div>
				</div>
			) : null}

			<div className="flex items-start gap-2 rounded-xl border border-primary/15 bg-primary/5 p-3">
				<Info className="mt-0.5 size-4 shrink-0 text-primary" />
				<p className="text-xs leading-relaxed text-muted-foreground">Os benefícios serão conferidos novamente antes do pedido ser confirmado.</p>
			</div>

			<div className="sticky bottom-0 z-10 -mx-4 mt-auto border-t bg-background px-4 py-3 lg:-mx-6 lg:px-6">
				<Button variant="brand" className="flex h-12 w-full items-center gap-1.5 rounded-2xl font-black" onClick={onNext}>
					CONTINUAR PARA PAGAMENTO
					<ArrowRight className="h-4 w-4" />
				</Button>
			</div>
		</div>
	);
}

function AvailableCouponCard({ coupon, onApply }: { coupon: TShopAvailableCoupon; onApply: () => void }) {
	const isManual = coupon.validacaoModo === "MANUAL";
	const evaluation = coupon.avaliacao;
	const isEligible = !isManual && !!evaluation?.elegivel;

	return (
		<div className="flex flex-col gap-3 rounded-2xl border bg-card p-3.5">
			<div className="flex items-start justify-between gap-3">
				<div className="flex min-w-0 items-start gap-3">
					<span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
						<Ticket className="size-4" />
					</span>
					<div className="min-w-0">
						<p className="text-sm font-black uppercase">{coupon.codigo}</p>
						<p className="text-pretty mt-0.5 text-sm font-semibold">{coupon.titulo}</p>
						<p className="mt-1 text-xs font-medium text-muted-foreground">{formatCouponBenefit(coupon)}</p>
					</div>
				</div>
				{evaluation?.elegivel ? (
					<span className="shrink-0 text-sm font-black tabular-nums text-primary">-{formatToMoney(evaluation.valorDesconto)}</span>
				) : null}
			</div>

			{coupon.descricao ? <p className="text-pretty text-xs leading-relaxed text-muted-foreground">{coupon.descricao}</p> : null}
			{isManual ? <p className="text-xs leading-relaxed text-muted-foreground">Este cupom precisa de validação no atendimento da loja.</p> : null}
			{!isManual && evaluation && !evaluation.elegivel ? <p className="text-xs leading-relaxed text-muted-foreground">{evaluation.motivo}</p> : null}

			<Button
				type="button"
				size="sm"
				variant={isEligible ? "default" : "outline"}
				className="h-9 rounded-xl font-bold"
				disabled={!isEligible}
				onClick={onApply}
			>
				Aplicar cupom
			</Button>
		</div>
	);
}
