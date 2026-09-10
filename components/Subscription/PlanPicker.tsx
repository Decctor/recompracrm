"use client";

import type { TBillingPortalOutput } from "@/app/api/integrations/stripe/billing-portal/route";
import type { TGenerateCheckoutOutput } from "@/app/api/integrations/stripe/generate-checkout/route";
import type { TSubscriptionStatusAction } from "@/app/api/organizations/subscription-status/route";
import { Button } from "@/components/ui/button";
import { AppSubscriptionPlans, CONSULTORIA_ADDON } from "@/config";
import { formatToMoney } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { Check, CreditCard, LayoutGrid, Loader2, Rocket } from "lucide-react";
import { useState } from "react";

/**
 * Fonte única das opções comerciais — o paywall (`/subscription`) e o modal de upsell
 * (`PlanSelectionMenu`) renderizam este mesmo componente. Antes eram dois arquivos com o mesmo
 * card copiado, que já tinham divergido (um tratava dark mode, o outro não).
 *
 * Hoje vendemos uma configuração só: a plataforma (internamente o plano CRESCIMENTO) com ou sem o
 * Gestor de Crescimento. Os outros planos existem em `AppSubscriptionPlans` mas não são ofertados.
 *
 * As duas opções vivem numa moldura única dividida ao meio, não em dois cards soltos: o pai já é
 * um wrapper claro, e card dentro de card duplica borda e padding — altura que fazia o preço cair
 * abaixo da dobra num notebook.
 */

const PLATFORM_PLAN = AppSubscriptionPlans.CRESCIMENTO;
const MONTHS_IN_YEAR = 12;

type TBillingCycle = "monthly" | "yearly";

type TPlanOption = {
	id: "PLATAFORMA_COM_GESTOR" | "PLATAFORMA";
	nome: string;
	descricao: string;
	/** Valor cobrado no ciclo escolhido. */
	preco: number;
	/** Equivalente mensal — igual a `preco` no mensal, o duodécimo no anual. */
	precoMensalEquivalente: number;
	recursos: { checked: boolean; label: string }[];
	recomendado: boolean;
	textoBotao: string;
	icone: typeof Rocket;
	checkout: { subscription: string; consultoria?: boolean };
};

function buildPlanOptions(cycle: TBillingCycle): TPlanOption[] {
	const platformPrice = PLATFORM_PLAN.pricing[cycle].price;
	const platformMonthlyEquivalent = cycle === "yearly" ? platformPrice / MONTHS_IN_YEAR : platformPrice;

	const platformOption: TPlanOption = {
		id: "PLATAFORMA",
		nome: "Plataforma",
		descricao: "A plataforma completa, operada por você e pela sua equipe.",
		preco: platformPrice,
		precoMensalEquivalente: platformMonthlyEquivalent,
		recursos: PLATFORM_PLAN.pricingTableFeatures,
		recomendado: false,
		textoBotao: "Escolher plataforma",
		icone: LayoutGrid,
		checkout: { subscription: `CRESCIMENTO-${cycle === "yearly" ? "YEARLY" : "MONTHLY"}` },
	};

	// O add-on só existe no ciclo mensal: o Stripe não aceita intervalos diferentes na mesma
	// assinatura, e a rota de checkout recusa a combinação. Por isso a oferta some no anual em vez
	// de aparecer desabilitada.
	if (cycle === "yearly") return [platformOption];

	const bundlePrice = platformPrice + CONSULTORIA_ADDON.monthlyPrice;
	const bundleOption: TPlanOption = {
		id: "PLATAFORMA_COM_GESTOR",
		nome: `Plataforma + ${CONSULTORIA_ADDON.name}`,
		descricao: "A gente opera o CRM por você. O entregável é crescimento em receita.",
		preco: bundlePrice,
		precoMensalEquivalente: bundlePrice,
		recursos: [{ checked: true, label: "Tudo que está no plano Plataforma" }, ...CONSULTORIA_ADDON.pricingTableFeatures],
		recomendado: true,
		textoBotao: "Contratar com gestor",
		icone: Rocket,
		checkout: { subscription: "CRESCIMENTO-MONTHLY", consultoria: true },
	};

	return [bundleOption, platformOption];
}

type PlanPickerProps = {
	/** Vindo de `useOrganizationSubscriptionStatus`. Em `ATUALIZAR_PAGAMENTO` a ação principal é o portal do Stripe. */
	acao?: TSubscriptionStatusAction;
	className?: string;
};

export default function PlanPicker({ acao = "ASSINAR", className }: PlanPickerProps) {
	const [cycle, setCycle] = useState<TBillingCycle>("monthly");
	const [pendingOptionId, setPendingOptionId] = useState<TPlanOption["id"] | null>(null);

	const checkoutMutation = useMutation({
		mutationFn: async (vars: { subscription: string; consultoria?: boolean }) => {
			const response = await fetch("/api/integrations/stripe/generate-checkout", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(vars),
			});
			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.message || "Não conseguimos abrir o checkout. Tente novamente.");
			}
			return response.json() as Promise<TGenerateCheckoutOutput>;
		},
		onSuccess: (data) => {
			window.location.href = data.data.checkoutUrl;
		},
		onError: () => setPendingOptionId(null),
	});

	const portalMutation = useMutation({
		mutationFn: async () => {
			const response = await fetch("/api/integrations/stripe/billing-portal", { method: "POST" });
			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.message || "Não conseguimos abrir o portal de cobrança. Tente novamente.");
			}
			return response.json() as Promise<TBillingPortalOutput>;
		},
		onSuccess: (data) => {
			window.location.href = data.data.portalUrl;
		},
	});

	const isRedirecting = checkoutMutation.isPending || checkoutMutation.isSuccess || portalMutation.isPending || portalMutation.isSuccess;
	const errorMessage = checkoutMutation.error?.message ?? portalMutation.error?.message ?? null;

	const options = buildPlanOptions(cycle);
	const isPaymentUpdate = acao === "ATUALIZAR_PAGAMENTO";
	const yearlySavings = Math.round((1 - PLATFORM_PLAN.pricing.yearly.price / (PLATFORM_PLAN.pricing.monthly.price * MONTHS_IN_YEAR)) * 100);

	function handleSelect(option: TPlanOption) {
		if (isRedirecting) return;
		setPendingOptionId(option.id);
		checkoutMutation.mutate(option.checkout);
	}

	return (
		<div className={cn("brand-recompracrm flex flex-col gap-4", className)}>
			{isPaymentUpdate && (
				<div className="flex flex-col gap-3 rounded-2xl bg-muted/70 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
					<div className="flex items-start gap-3">
						<CreditCard className="mt-0.5 size-5 shrink-0 text-brand-secondary" aria-hidden />
						<div className="flex flex-col gap-0.5">
							<h3 className="text-sm font-bold tracking-tight">Sua assinatura já existe — falta o pagamento</h3>
							<p className="text-[13px] leading-snug text-muted-foreground">
								Atualize a forma de pagamento e o acesso volta na confirmação da cobrança. Não precisa escolher um plano de novo.
							</p>
						</div>
					</div>
					<Button type="button" variant="brand" disabled={isRedirecting} onClick={() => portalMutation.mutate()} className="w-full shrink-0 font-bold sm:w-auto">
						{portalMutation.isPending || portalMutation.isSuccess ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
						Atualizar pagamento
					</Button>
				</div>
			)}

			<div className="flex items-center gap-3">
				{isPaymentUpdate && <h3 className="text-sm font-bold tracking-tight text-muted-foreground">Ou escolha outro plano</h3>}
				<BillingCycleToggle cycle={cycle} onChange={setCycle} disabled={isRedirecting} yearlySavings={yearlySavings} />
			</div>

			<div
				className={cn(
					"grid divide-y divide-border overflow-hidden rounded-2xl border border-border",
					options.length > 1 && "md:grid-cols-2 md:divide-x md:divide-y-0",
				)}
			>
				{options.map((option) => (
					<PlanColumn
						key={option.id}
						option={option}
						cycle={cycle}
						onSelect={() => handleSelect(option)}
						isRedirecting={isRedirecting}
						isPending={pendingOptionId === option.id && (checkoutMutation.isPending || checkoutMutation.isSuccess)}
						demoted={isPaymentUpdate}
					/>
				))}
			</div>

			{cycle === "yearly" && (
				<p className="text-[13px] leading-snug text-muted-foreground">
					O {CONSULTORIA_ADDON.name} é cobrado mensalmente e não entra no plano anual. Para contratá-lo, escolha o ciclo mensal.
				</p>
			)}

			{errorMessage && (
				<div role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive">
					{errorMessage}
				</div>
			)}
		</div>
	);
}

function BillingCycleToggle({
	cycle,
	onChange,
	disabled,
	yearlySavings,
}: {
	cycle: TBillingCycle;
	onChange: (cycle: TBillingCycle) => void;
	disabled: boolean;
	yearlySavings: number;
}) {
	const options: { value: TBillingCycle; label: string }[] = [
		{ value: "monthly", label: "Mensal" },
		{ value: "yearly", label: `Anual · -${yearlySavings}%` },
	];

	return (
		<div role="group" aria-label="Ciclo de cobrança" className="ml-auto inline-flex w-fit items-center gap-1 rounded-full bg-muted p-1">
			{options.map((option) => {
				const isSelected = cycle === option.value;
				return (
					<button
						key={option.value}
						type="button"
						disabled={disabled}
						aria-pressed={isSelected}
						onClick={() => onChange(option.value)}
						className={cn(
							"rounded-full px-3 py-1.5 text-xs font-bold transition-colors duration-150 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
							isSelected ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
						)}
					>
						{option.label}
					</button>
				);
			})}
		</div>
	);
}

function PlanColumn({
	option,
	cycle,
	onSelect,
	isRedirecting,
	isPending,
	demoted,
}: {
	option: TPlanOption;
	cycle: TBillingCycle;
	onSelect: () => void;
	isRedirecting: boolean;
	isPending: boolean;
	demoted: boolean;
}) {
	const Icon = option.icone;
	// A hierarquia vem do banho de cor, do selo e da ordem — nunca de um bloco saturado. Quando o
	// pagamento pendente é a ação principal, nenhuma coluna se destaca: o destaque já está acima.
	const highlighted = option.recomendado && !demoted;

	return (
		<section className={cn("flex flex-col gap-3.5 p-5", highlighted && "bg-brand-secondary/[0.05]")}>
			<div className="flex items-center justify-between gap-3">
				<div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand-secondary/10 text-brand-secondary">
					<Icon className="size-4" aria-hidden />
				</div>
				{option.recomendado && (
					<span className="rounded-full bg-brand-secondary/12 px-2.5 py-1 text-[10px] font-extrabold tracking-[0.08em] text-brand-secondary uppercase">
						Recomendado
					</span>
				)}
			</div>

			<div className="flex flex-col gap-1">
				<h4 className="text-base leading-tight font-extrabold tracking-tight text-balance">{option.nome}</h4>
				<p className="text-[13px] leading-snug text-muted-foreground">{option.descricao}</p>
			</div>

			<div className="flex flex-col">
				<div className="flex items-baseline gap-1.5">
					<span className="text-2xl font-extrabold tracking-tight tabular-nums">{formatToMoney(option.precoMensalEquivalente)}</span>
					<span className="text-[13px] font-medium text-muted-foreground">/mês</span>
				</div>
				<p className="text-xs font-medium text-muted-foreground">
					{cycle === "yearly" ? `${formatToMoney(option.preco)} cobrados uma vez por ano` : "Cobrado mensalmente. Cancele quando quiser."}
				</p>
			</div>

			<ul className="flex flex-col gap-2">
				{option.recursos.map((recurso) => (
					<li key={recurso.label} className="flex items-start gap-2 text-[13px] leading-snug text-foreground">
						<Check className="mt-0.5 size-3.5 shrink-0 text-brand-secondary" aria-hidden />
						<span>{recurso.label}</span>
					</li>
				))}
			</ul>

			<Button
				type="button"
				variant={highlighted ? "brand" : "outline"}
				disabled={isRedirecting}
				onClick={onSelect}
				className="mt-auto w-full font-bold"
			>
				{isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
				{option.textoBotao}
			</Button>
		</section>
	);
}
