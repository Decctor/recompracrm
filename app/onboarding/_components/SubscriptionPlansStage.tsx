import { Button } from "@/components/ui/button";
import { AppSubscriptionPlans } from "@/config";
import { formatToMoney } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import type { TUseOrganizationOnboardingState } from "@/state-hooks/use-organization-onboarding-state";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useState } from "react";

type SubscriptionPlansStageProps = {
	state: TUseOrganizationOnboardingState["state"];
	isMutationPending: boolean;
	handleSelectPlan: (plan: TUseOrganizationOnboardingState["state"]["subscription"]) => void;
	goToPreviousStage: () => void;
};

export function SubscriptionPlansStage({ state, isMutationPending, handleSelectPlan, goToPreviousStage }: SubscriptionPlansStageProps) {
	const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">("monthly");

	const handlePlanSelect = (plan: "ESSENCIAL" | "CRESCIMENTO") => {
		const subscriptionKey = `${plan}-${billingInterval.toUpperCase()}` as TUseOrganizationOnboardingState["state"]["subscription"];
		// Update state with selected plan
		// Trigger submission
		handleSelectPlan(subscriptionKey);
	};

	const handleFreeTrialSelect = () => {
		// Update state with FREE-TRIAL
		handleSelectPlan("FREE-TRIAL");
		// Trigger submission
	};

	return (
		<div className="flex flex-col gap-5">
			{/* Billing Toggle */}
			<div className="flex justify-center mb-4">
				<div className="relative flex items-center bg-gray-200/50 p-1.5 rounded-full">
					<button
						type="button"
						onClick={() => setBillingInterval("monthly")}
						disabled={isMutationPending}
						className={cn(
							"relative z-10 box-border w-32 rounded-full py-2.5 text-center text-sm font-bold transition-colors duration-300",
							billingInterval === "monthly" ? "text-gray-900" : "text-gray-500 hover:text-gray-700",
							isMutationPending && "opacity-50 cursor-not-allowed",
						)}
					>
						MENSAL
					</button>
					<button
						type="button"
						onClick={() => setBillingInterval("yearly")}
						disabled={isMutationPending}
						className={cn(
							"relative z-10 box-border w-32 rounded-full py-2.5 text-center text-sm font-bold transition-colors duration-300",
							billingInterval === "yearly" ? "text-gray-900" : "text-gray-500 hover:text-gray-700",
							isMutationPending && "opacity-50 cursor-not-allowed",
						)}
					>
						ANUAL
					</button>
					<div
						className={cn(
							"absolute top-1.5 bottom-1.5 w-32 rounded-full bg-[#FFD600] shadow-sm transition-all duration-300 ease-in-out",
							billingInterval === "monthly" ? "left-1.5" : "left-[calc(100%-8.35rem)]",
						)}
					/>
				</div>
			</div>

			{/* Plans Grid */}
			<div className="grid grid-cols-1 gap-4 lg:grid-cols-2 items-stretch max-w-4xl mx-auto w-full">
				{(["ESSENCIAL", "CRESCIMENTO"] as const).map((planKey) => {
					const plan = AppSubscriptionPlans[planKey];
					const pricing = plan.pricing[billingInterval];
					const isSelected = state.subscription?.startsWith(planKey);

					// Calculate discount percentage for annual plans
					const monthlyEquivalent = plan.pricing.monthly.price * 12;
					const yearlyPrice = plan.pricing.yearly.price;
					const discountPercentage = Math.round(((monthlyEquivalent - yearlyPrice) / monthlyEquivalent) * 100);

					return (
						<button
							key={planKey}
							type="button"
							disabled={isMutationPending}
							className={cn(
								"group relative flex flex-col rounded-2xl p-5 transition-all duration-300 border-2 cursor-pointer text-left focus:outline-none focus:ring-4 focus:ring-yellow-400/30",
								// Base styles (idle)
								"bg-transparent border-transparent hover:bg-[#F5F5F0] hover:shadow-lg hover:scale-[1.01]",
								// Selected styles
								isSelected ? "bg-[#F5F5F0] shadow-lg scale-[1.01] ring-2 ring-[#FFD600] ring-offset-2 border-transparent" : "",
								// Disabled styles
								isMutationPending && "opacity-50 cursor-not-allowed hover:scale-100",
							)}
							onClick={() => handlePlanSelect(planKey)}
						>
							{/* Discount Badge */}
							{billingInterval === "yearly" && (
								<div className="absolute -top-2 -right-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-md">
									ECONOMIZE {discountPercentage}%
								</div>
							)}

							{/* Header */}
							<div className="mb-3">
								<h3 className="font-bold text-xl text-gray-900 mb-1">{plan.name}</h3>
								<p className="text-gray-500 text-xs leading-relaxed">{plan.description}</p>
							</div>

							{/* Features */}
							<ul className="mb-4 space-y-1.5 flex-1">
								{plan.pricingTableFeatures.map((feature, idx) => (
									<li key={idx.toString()} className="flex items-start gap-2">
										<div className="mt-0.5 rounded-full bg-emerald-100 p-0.5">
											<CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
										</div>
										<span className="text-xs text-gray-700 font-medium leading-tight">{feature.label}</span>
									</li>
								))}
							</ul>

							{/* Footer: Pricing & Action */}
							<div className="space-y-3 pt-4 border-t border-gray-100 mt-auto">
								<div className="flex items-baseline gap-1">
									<span className="font-bold text-3xl text-gray-900 tracking-tight">{formatToMoney(pricing.price).split(",")[0]}</span>
									<span className="text-lg font-bold text-gray-900">,{formatToMoney(pricing.price).split(",")[1]}</span>
									<span className="text-gray-500 font-medium text-sm ml-1">{billingInterval === "monthly" ? "por mês" : "por ano"}</span>
								</div>

								<Button
									disabled={isMutationPending}
									className={cn(
										"w-full h-9 rounded-lg text-sm font-bold transition-all duration-300",
										"bg-[#FFD600] text-gray-900 hover:bg-[#E5C000] hover:shadow-md hover:-translate-y-0.5",
										isSelected && "ring-2 ring-gray-900 ring-offset-2",
									)}
								>
									{isMutationPending ? (
										<>
											<Loader2 className="h-4 w-4 animate-spin mr-2" />
											PROCESSANDO...
										</>
									) : (
										"COMEÇAR AGORA"
									)}
								</Button>
							</div>
						</button>
					);
				})}
			</div>

			{/* Free Trial / Link secundário */}
			<div className="flex justify-center pt-8">
				<Button
					variant="ghost"
					disabled={isMutationPending}
					className="text-gray-500 hover:text-gray-900 text-sm font-medium underline-offset-4 hover:underline disabled:opacity-50"
					onClick={handleFreeTrialSelect}
				>
					{isMutationPending ? (
						<>
							<Loader2 className="h-4 w-4 animate-spin mr-2" />
							Processando...
						</>
					) : (
						"Ou comece com um teste grátis de 15 dias"
					)}
				</Button>
			</div>
			<div className="flex justify-center pt-8">
				<Button variant="ghost" onClick={goToPreviousStage}>
					VOLTAR AO ESTÁGIO ANTERIOR
				</Button>
			</div>
		</div>
	);
}
