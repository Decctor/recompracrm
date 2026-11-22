"use client";

import type { TSubscriptionStatusAction } from "@/app/api/organizations/subscription-status/route";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
	AppSubscriptionPlans,
	SUBSCRIPTION_ADDONS,
	SUBSCRIPTION_ADDON_KEYS,
	SUBSCRIPTION_BASE_PLAN_KEYS,
	type TSubscriptionAddonKey,
	type TSubscriptionBasePlanKey,
} from "@/config";
import { getErrorMessage } from "@/lib/errors";
import { formatToMoney } from "@/lib/formatting";
import { generateSubscriptionCheckout, openBillingPortal } from "@/lib/mutations/subscriptions";
import { useSubscriptionAddons } from "@/lib/queries/subscriptions";
import { getSubscriptionCycleTotal, isAddonAvailableInCycle } from "@/lib/subscriptions/entitlements";
import { cn } from "@/lib/utils";
import type { TSubscriptionCycleEnum } from "@/schemas/enums";
import { useMutation } from "@tanstack/react-query";
import { Check, CreditCard, LayoutGrid, Loader2, Store } from "lucide-react";
import { useId, useState } from "react";

/**
 * Fonte única das opções comerciais — o paywall (`/subscription`) e o modal de upsell
 * (`PlanSelectionMenu`) renderizam este mesmo componente.
 *
 * O que se vende é um plano-base (CRM ou CRM + ERP) e adicionais sobre ele (Hub de Atendimentos,
 * Gestor de Crescimento), tudo a preço fixo e sem limite de uso. Por isso a tela é "monte e
 * confirme", com um único botão e o total à vista: clicar numa coluna para ir ao checkout, como
 * antes, não deixaria escolher adicional nenhum.
 *
 * Os planos-base vivem numa moldura única dividida ao meio, não em dois cards soltos: o pai já é
 * um wrapper claro, e card dentro de card duplica borda e padding.
 */

const MONTHS_IN_YEAR = 12;
const BASE_PLAN_ICONS: Record<TSubscriptionBasePlanKey, typeof LayoutGrid> = { CRM: LayoutGrid, CRM_ERP: Store };

type PlanPickerProps = {
	/** Vindo de `useOrganizationSubscriptionStatus`. Em `ATUALIZAR_PAGAMENTO` a ação principal é o portal do Stripe. */
	acao?: TSubscriptionStatusAction;
	className?: string;
};

function toMonthlyEquivalent(value: number, cycle: TSubscriptionCycleEnum) {
	return cycle === "ANUAL" ? value / MONTHS_IN_YEAR : value;
}

export default function PlanPicker({ acao = "ASSINAR", className }: PlanPickerProps) {
	const [cycle, setCycle] = useState<TSubscriptionCycleEnum>("MENSAL");
	const [chosenBasePlan, setChosenBasePlan] = useState<TSubscriptionBasePlanKey | null>(null);
	const [chosenAddons, setChosenAddons] = useState<TSubscriptionAddonKey[] | null>(null);

	// O checkout chega marcado com o que a loja usou no teste: CRM + ERP para quem vendeu pelo ERP, o
	// Hub para quem respondeu conversas nele. É só o ponto de partida: enquanto a pessoa não mexer,
	// vale a sugestão; depois que ela mexe, vale a escolha dela — a sugestão nunca a sobrescreve.
	const { data: currentSubscription } = useSubscriptionAddons();
	const basePlan = chosenBasePlan ?? currentSubscription?.planoSugerido ?? "CRM";
	const selectedAddons = chosenAddons ?? currentSubscription?.adicionaisSugeridos ?? [];
	// Um adicional sem preço no ciclo escolhido (a consultoria, no anual) sai da conta sem ser
	// desmarcado: voltar para o mensal devolve a escolha.
	const addons = selectedAddons.filter((addon) => isAddonAvailableInCycle(addon, cycle));

	const checkoutMutation = useMutation({
		mutationFn: generateSubscriptionCheckout,
		onSuccess: (data) => {
			window.location.href = data.data.checkoutUrl;
		},
	});
	const portalMutation = useMutation({
		mutationFn: openBillingPortal,
		onSuccess: (data) => {
			window.location.href = data.data.portalUrl;
		},
	});

	const isRedirecting = checkoutMutation.isPending || checkoutMutation.isSuccess || portalMutation.isPending || portalMutation.isSuccess;
	const mutationError = checkoutMutation.error ?? portalMutation.error;
	const errorMessage = mutationError ? getErrorMessage(mutationError) : null;

	const isPaymentUpdate = acao === "ATUALIZAR_PAGAMENTO";
	const referencePlan = AppSubscriptionPlans[basePlan];
	const yearlySavings = Math.round((1 - referencePlan.pricing.yearly.price / (referencePlan.pricing.monthly.price * MONTHS_IN_YEAR)) * 100);
	const total = getSubscriptionCycleTotal({ basePlan, addons, cycle });

	function toggleAddon(addon: TSubscriptionAddonKey, checked: boolean) {
		const previous = selectedAddons.filter((key) => key !== addon);
		setChosenAddons(checked ? [...previous, addon] : previous);
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
					<Button
						type="button"
						variant="brand"
						disabled={isRedirecting}
						onClick={() => portalMutation.mutate()}
						className="w-full shrink-0 font-bold sm:w-auto"
					>
						{portalMutation.isPending || portalMutation.isSuccess ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
						Atualizar pagamento
					</Button>
				</div>
			)}

			<div className="flex items-center gap-3">
				<h3 className="text-sm font-bold tracking-tight text-muted-foreground">{isPaymentUpdate ? "Ou monte outro plano" : "1. Escolha o plano"}</h3>
				<BillingCycleToggle cycle={cycle} onChange={setCycle} disabled={isRedirecting} yearlySavings={yearlySavings} />
			</div>

			<div
				role="radiogroup"
				aria-label="Plano-base"
				className="grid divide-y divide-border overflow-hidden rounded-2xl border border-border md:grid-cols-2 md:divide-x md:divide-y-0"
			>
				{SUBSCRIPTION_BASE_PLAN_KEYS.map((key) => (
					<BasePlanColumn
						key={key}
						planKey={key}
						cycle={cycle}
						selected={basePlan === key}
						suggestionReason={key === currentSubscription?.planoSugerido ? (currentSubscription.planoSugeridoMotivo ?? null) : null}
						disabled={isRedirecting}
						onSelect={() => setChosenBasePlan(key)}
					/>
				))}
			</div>

			<h3 className="text-sm font-bold tracking-tight text-muted-foreground">2. Adicionais, se quiser</h3>
			<ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border">
				{SUBSCRIPTION_ADDON_KEYS.map((key) => (
					<AddonRow
						key={key}
						addonKey={key}
						cycle={cycle}
						checked={addons.includes(key)}
						suggestionReason={currentSubscription?.adicionais.find((addon) => addon.chave === key)?.motivoSugestao ?? null}
						disabled={isRedirecting}
						onCheckedChange={(checked) => toggleAddon(key, checked)}
					/>
				))}
			</ul>

			<div className="flex flex-col gap-3 rounded-2xl bg-muted/70 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
				<div className="flex flex-col">
					<div className="flex items-baseline gap-1.5">
						<span className="text-2xl font-extrabold tracking-tight tabular-nums">{formatToMoney(toMonthlyEquivalent(total, cycle))}</span>
						<span className="text-[13px] font-medium text-muted-foreground">/mês</span>
					</div>
					<p className="text-xs font-medium text-muted-foreground">
						{cycle === "ANUAL" ? `${formatToMoney(total)} cobrados uma vez por ano.` : "Cobrado mensalmente. Cancele quando quiser."} Sem limite de
						campanhas, clientes ou usuários.
					</p>
				</div>
				<Button
					type="button"
					variant="brand"
					disabled={isRedirecting}
					onClick={() => checkoutMutation.mutate({ basePlan, cycle, addons })}
					className="w-full shrink-0 font-bold sm:w-auto"
				>
					{checkoutMutation.isPending || checkoutMutation.isSuccess ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
					Assinar agora
				</Button>
			</div>

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
	cycle: TSubscriptionCycleEnum;
	onChange: (cycle: TSubscriptionCycleEnum) => void;
	disabled: boolean;
	yearlySavings: number;
}) {
	const options: { value: TSubscriptionCycleEnum; label: string }[] = [
		{ value: "MENSAL", label: "Mensal" },
		{ value: "ANUAL", label: `Anual · -${yearlySavings}%` },
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

function BasePlanColumn({
	planKey,
	cycle,
	selected,
	suggestionReason,
	disabled,
	onSelect,
}: {
	planKey: TSubscriptionBasePlanKey;
	cycle: TSubscriptionCycleEnum;
	selected: boolean;
	/** Por que este plano veio marcado, pelo uso no teste. Só no plano sugerido. */
	suggestionReason: string | null;
	disabled: boolean;
	onSelect: () => void;
}) {
	const plan = AppSubscriptionPlans[planKey];
	const Icon = BASE_PLAN_ICONS[planKey];
	const price = plan.pricing[cycle === "ANUAL" ? "yearly" : "monthly"].price;

	return (
		// A coluna inteira é o alvo: é um radio, e a marca de seleção sozinha seria um alvo de 20px.
		<button
			type="button"
			role="radio"
			aria-checked={selected}
			disabled={disabled}
			onClick={onSelect}
			className={cn(
				"flex flex-col gap-3.5 p-5 text-left transition-colors duration-150 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-60",
				selected ? "bg-brand-secondary/[0.06]" : "hover:bg-muted/50",
			)}
		>
			{/* Só spans: dentro de <button> o HTML não aceita título, parágrafo nem lista. */}
			<span className="flex w-full items-center justify-between gap-3">
				<span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand-secondary/10 text-brand-secondary">
					<Icon className="size-4" aria-hidden />
				</span>
				<span
					aria-hidden
					className={cn(
						"flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-150",
						selected ? "border-brand-secondary bg-brand-secondary text-brand-secondary-foreground" : "border-border",
					)}
				>
					{selected ? <Check className="size-3" strokeWidth={3} /> : null}
				</span>
			</span>

			<span className="flex flex-col gap-1">
				<span className="text-base leading-tight font-extrabold tracking-tight text-balance">{plan.name}</span>
				<span className="text-[13px] leading-snug text-muted-foreground">{plan.description}</span>
				{suggestionReason ? (
					<span className="text-xs leading-snug font-semibold text-brand-secondary dark:text-foreground">{suggestionReason}</span>
				) : null}
			</span>

			<span className="flex items-baseline gap-1.5">
				<span className="text-2xl font-extrabold tracking-tight tabular-nums">{formatToMoney(toMonthlyEquivalent(price, cycle))}</span>
				<span className="text-[13px] font-medium text-muted-foreground">/mês</span>
			</span>

			<span className="flex flex-col gap-2">
				{plan.pricingTableFeatures.map((feature) => (
					<span key={feature.label} className="flex items-start gap-2 text-[13px] leading-snug text-foreground">
						<Check className="mt-0.5 size-3.5 shrink-0 text-brand-secondary" aria-hidden />
						<span>{feature.label}</span>
					</span>
				))}
			</span>
		</button>
	);
}

function AddonRow({
	addonKey,
	cycle,
	checked,
	suggestionReason,
	disabled,
	onCheckedChange,
}: {
	addonKey: TSubscriptionAddonKey;
	cycle: TSubscriptionCycleEnum;
	checked: boolean;
	/** Por que o adicional veio marcado: o uso dele no teste. */
	suggestionReason: string | null;
	disabled: boolean;
	onCheckedChange: (checked: boolean) => void;
}) {
	const switchId = useId();
	const addon = SUBSCRIPTION_ADDONS[addonKey];
	const available = isAddonAvailableInCycle(addonKey, cycle);
	const pricing = addon.pricing[cycle === "ANUAL" ? "yearly" : "monthly"];

	return (
		<li className={cn("flex items-start gap-3 p-4", checked && "bg-brand-secondary/[0.06]")}>
			<Switch id={switchId} checked={checked} disabled={disabled || !available} onCheckedChange={onCheckedChange} className="mt-0.5" />
			{/* O preço fica na linha do nome, dentro do rótulo: numa coluna própria ele espremia a
			    descrição em quatro linhas num celular. */}
			<label htmlFor={switchId} className={cn("flex min-w-0 flex-1 flex-col gap-0.5", available && !disabled && "cursor-pointer")}>
				<span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
					<span className="text-sm leading-tight font-bold tracking-tight">{addon.name}</span>
					{pricing ? (
						<span className="text-sm font-extrabold tracking-tight tabular-nums">
							+ {formatToMoney(toMonthlyEquivalent(pricing.price, cycle))}
							<span className="text-[13px] font-medium text-muted-foreground">/mês</span>
						</span>
					) : null}
				</span>
				<span className="text-[13px] leading-snug text-muted-foreground">
					{available ? addon.description : `${addon.name} é cobrado mês a mês e não entra no plano anual. Para contratar, escolha o ciclo mensal.`}
				</span>
				{suggestionReason && available ? (
					<span className="text-xs leading-snug font-semibold text-brand-secondary dark:text-foreground">{suggestionReason}</span>
				) : null}
			</label>
		</li>
	);
}
