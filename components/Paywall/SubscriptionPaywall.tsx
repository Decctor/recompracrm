"use client";

import type { TGenerateCheckoutOutput } from "@/app/api/integrations/stripe/generate-checkout/route";
import { Button } from "@/components/ui/button";
import { AppSubscriptionPlans, type TAppSubscriptionPlanKey } from "@/config";
import { formatToMoney } from "@/lib/formatting";
import { useOrganizationSubscriptionStatus } from "@/lib/queries/organizations";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { useState } from "react";

export default function SubscriptionPaywall() {
	const { data, isLoading } = useOrganizationSubscriptionStatus();

	if (isLoading || !data || data.modo !== "fail") return null;

	return (
		<div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm">
			<div className="w-full max-w-3xl mx-4 bg-background rounded-xl shadow-2xl border overflow-hidden">
				<PaywallContent mensagem={data.mensagem} status={data.status} />
			</div>
		</div>
	);
}

function PaywallContent({ mensagem, status }: { mensagem: string; status: string }) {
	const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">("monthly");
	const [selectedPlan, setSelectedPlan] = useState<TAppSubscriptionPlanKey | null>(null);

	const checkoutMutation = useMutation({
		mutationFn: async (subscription: string) => {
			const response = await fetch("/api/integrations/stripe/generate-checkout", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ subscription }),
			});
			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.message || "Erro ao gerar checkout");
			}
			return response.json() as Promise<TGenerateCheckoutOutput>;
		},
		onSuccess: (data) => {
			window.location.href = data.data.checkoutUrl;
		},
	});

	const handlePlanSelect = (planKey: TAppSubscriptionPlanKey) => {
		setSelectedPlan(planKey);
		const subscriptionKey = `${planKey}-${billingInterval.toUpperCase()}`;
		checkoutMutation.mutate(subscriptionKey);
	};

	return (
		<div className="flex flex-col">
			{/* Header */}
			<div className="flex flex-col items-center gap-3 p-6 pb-4 border-b bg-muted/30">
				<div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
					<ShieldAlert className="w-6 h-6 text-red-600 dark:text-red-400" />
				</div>
				<div className="text-center">
					<h2 className="text-xl font-bold tracking-tight">{status.toUpperCase()}</h2>
					<p className="text-sm text-muted-foreground mt-1 max-w-md">{mensagem}</p>
				</div>
			</div>

			{/* Plan selection */}
			<div className="p-6 flex flex-col gap-4">
				{/* Billing toggle */}
				<div className="flex justify-center">
					<div className="relative flex items-center bg-gray-200/50 dark:bg-gray-800/50 p-1.5 rounded-full">
						<button
							type="button"
							onClick={() => setBillingInterval("monthly")}
							disabled={checkoutMutation.isPending}
							className={cn(
								"relative z-10 box-border w-28 rounded-full py-2 text-center text-sm font-bold transition-colors duration-300",
								billingInterval === "monthly" ? "text-gray-900 dark:text-white" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300",
								checkoutMutation.isPending && "opacity-50 cursor-not-allowed",
							)}
						>
							MENSAL
						</button>
						<button
							type="button"
							onClick={() => setBillingInterval("yearly")}
							disabled={checkoutMutation.isPending}
							className={cn(
								"relative z-10 box-border w-28 rounded-full py-2 text-center text-sm font-bold transition-colors duration-300",
								billingInterval === "yearly" ? "text-gray-900 dark:text-white" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300",
								checkoutMutation.isPending && "opacity-50 cursor-not-allowed",
							)}
						>
							ANUAL
						</button>
						<div
							className={cn(
								"absolute top-1.5 bottom-1.5 w-28 rounded-full bg-[#FFD600] shadow-sm transition-all duration-300 ease-in-out",
								billingInterval === "monthly" ? "left-1.5" : "left-[calc(100%-7.35rem)]",
							)}
						/>
					</div>
				</div>

				{/* Plans grid */}
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
					{(["ESSENCIAL", "CRESCIMENTO", "ESCALA"] as const).map((planKey) => {
						const plan = AppSubscriptionPlans[planKey];
						const pricing = plan.pricing[billingInterval];
						const isSelected = selectedPlan === planKey;

						const monthlyEquivalent = plan.pricing.monthly.price * 12;
						const yearlyPrice = plan.pricing.yearly.price;
						const discountPercentage = Math.round(((monthlyEquivalent - yearlyPrice) / monthlyEquivalent) * 100);

						return (
							<button
								key={planKey}
								type="button"
								disabled={checkoutMutation.isPending}
								className={cn(
									"group relative flex flex-col rounded-xl p-4 transition-all duration-300 border-2 cursor-pointer text-left focus:outline-none focus:ring-4 focus:ring-yellow-400/30",
									"bg-transparent border-gray-200 dark:border-gray-700 hover:bg-muted/50 hover:shadow-lg hover:scale-[1.01]",
									isSelected ? "bg-muted/50 shadow-lg scale-[1.01] ring-2 ring-[#FFD600] ring-offset-2 border-transparent" : "",
									checkoutMutation.isPending && "opacity-50 cursor-not-allowed hover:scale-100",
								)}
								onClick={() => handlePlanSelect(planKey)}
							>
								{billingInterval === "yearly" && (
									<div className="absolute -top-2 -right-2 bg-linear-to-r from-emerald-500 to-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md">
										-{discountPercentage}%
									</div>
								)}

								<div className="mb-2">
									<h3 className="font-bold text-base mb-0.5">{plan.name}</h3>
									<p className="text-muted-foreground text-[10px] leading-relaxed line-clamp-2">{plan.description}</p>
								</div>

								<ul className="mb-3 space-y-1 flex-1">
									{plan.pricingTableFeatures.slice(0, 3).map((feature, idx) => (
										<li key={idx.toString()} className="flex items-start gap-1.5">
											<div className="mt-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 p-0.5">
												<CheckCircle2 className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-400" />
											</div>
											<span className="text-[10px] font-medium leading-tight line-clamp-1">{feature.label}</span>
										</li>
									))}
									{plan.pricingTableFeatures.length > 3 && (
										<li className="text-[10px] text-muted-foreground ml-4">+{plan.pricingTableFeatures.length - 3} mais...</li>
									)}
								</ul>

								<div className="space-y-2 pt-3 border-t border-border mt-auto">
									<div className="flex items-baseline gap-1">
										<span className="font-bold text-xl tracking-tight">{formatToMoney(pricing.price).split(",")[0]}</span>
										<span className="text-sm font-bold">,{formatToMoney(pricing.price).split(",")[1]}</span>
										<span className="text-muted-foreground font-medium text-[10px] ml-1">{billingInterval === "monthly" ? "/mês" : "/ano"}</span>
									</div>

									<div
										className={cn(
											"w-full h-8 rounded-4xl text-xs font-bold transition-all duration-300 flex items-center justify-center",
											"bg-[#FFD600] text-gray-900",
											isSelected && "ring-2 ring-gray-900 ring-offset-1",
										)}
									>
										{checkoutMutation.isPending && isSelected ? (
											<>
												<Loader2 className="h-3 w-3 animate-spin mr-1.5" />
												PROCESSANDO...
											</>
										) : (
											"ESCOLHER"
										)}
									</div>
								</div>
							</button>
						);
					})}
				</div>

				{checkoutMutation.isError && (
					<p className="text-red-500 text-sm text-center">{checkoutMutation.error?.message || "Erro ao processar. Tente novamente."}</p>
				)}
			</div>
		</div>
	);
}
