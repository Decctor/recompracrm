"use client";

import { AppSubscriptionPlans } from "@/config";
import { formatToMoney } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type TAppSubscriptionPlanKey = keyof typeof AppSubscriptionPlans;

export default function Pricing() {
	const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">("monthly");

	return (
		<section
			id="planos"
			className="py-20 lg:py-24 bg-gradient-to-b from-slate-50/50 to-white relative overflow-hidden"
		>
			<div className="container mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
				{/* Header */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.5 }}
					className="text-center mb-14"
				>
					<span className="text-[#24549C] font-semibold text-sm tracking-wider uppercase mb-2 block">
						Planos e Preços
					</span>
					<h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight mb-4">
						Simples e transparente.
					</h2>
					<p className="text-lg text-slate-600">
						Sem taxa de setup. Sem surpresas. Cancele quando quiser.
					</p>
				</motion.div>

				{/* Billing Toggle */}
				<div className="flex justify-center mb-12">
					<div className="relative flex items-center bg-slate-100 border border-slate-200 p-1.5 rounded-full">
						<button
							type="button"
							onClick={() => setBillingInterval("monthly")}
							className={cn(
								"relative z-10 w-28 rounded-full py-2.5 text-center text-sm font-bold transition-colors duration-300",
								billingInterval === "monthly"
									? "text-white"
									: "text-slate-500 hover:text-slate-700",
							)}
						>
							MENSAL
						</button>
						<button
							type="button"
							onClick={() => setBillingInterval("yearly")}
							className={cn(
								"relative z-10 w-28 rounded-full py-2.5 text-center text-sm font-bold transition-colors duration-300",
								billingInterval === "yearly"
									? "text-white"
									: "text-slate-500 hover:text-slate-700",
							)}
						>
							ANUAL
						</button>
						<div
							className={cn(
								"absolute top-1.5 bottom-1.5 w-28 rounded-full bg-[#24549C] shadow-lg shadow-blue-500/20 transition-all duration-300 ease-in-out",
								billingInterval === "monthly"
									? "left-1.5"
									: "left-[calc(100%-7.5rem)]",
							)}
						/>
					</div>
				</div>

				{/* Plans Grid */}
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 items-start max-w-7xl mx-auto">
					{(
						Object.keys(AppSubscriptionPlans) as Array<TAppSubscriptionPlanKey>
					).map((planKey, idx) => {
						const plan = AppSubscriptionPlans[planKey];
						const pricing = plan.pricing[billingInterval];
						const isPopular = planKey === "CRESCIMENTO";

						const monthlyPrice = plan.pricing.monthly.price;
						const yearlyPrice = plan.pricing.yearly.price;
						const discountPercentage = Math.round(
							((monthlyPrice * 12 - yearlyPrice) / (monthlyPrice * 12)) * 100,
						);

						return (
							<motion.div
								key={planKey}
								initial={{ opacity: 0, y: 30 }}
								whileInView={{ opacity: 1, y: 0 }}
								viewport={{ once: true }}
								transition={{ duration: 0.4, delay: idx * 0.1 }}
								className={cn(
									"relative flex flex-col rounded-2xl p-8 transition-all duration-300 border bg-white",
									isPopular
										? "border-[#24549C] shadow-xl scale-105 z-10"
										: "border-slate-200 shadow-sm hover:shadow-md",
								)}
							>
								{isPopular && (
									<div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#24549C] text-white px-4 py-1 rounded-full text-xs font-bold tracking-wide uppercase shadow-lg">
										Mais Popular
									</div>
								)}

								{billingInterval === "yearly" && (
									<div className="absolute top-4 right-4 bg-green-50 border border-green-200 text-green-700 px-2 py-1 rounded-md text-xs font-bold tracking-wide">
										-{discountPercentage}% OFF
									</div>
								)}

								{/* Header */}
								<div className="mb-6">
									<h3 className="font-bold text-2xl text-slate-900 mb-2">
										{plan.name}
									</h3>
									<p className="text-slate-500 text-sm leading-relaxed min-h-[40px]">
										{plan.description}
									</p>
								</div>

								{/* Pricing */}
								<div className="mb-8 pb-8 border-b border-slate-100">
									<div className="flex items-baseline gap-1">
										<span className="text-sm text-slate-400 font-medium">
											R$
										</span>
										<span className="font-bold text-4xl text-slate-900 tracking-tight">
											{formatToMoney(pricing.price)
												.split(",")[0]
												.replace("R$", "")}
										</span>
										<span className="text-2xl font-bold text-slate-900">
											,{formatToMoney(pricing.price).split(",")[1]}
										</span>
										<span className="text-slate-400 font-medium ml-2 text-sm">
											{billingInterval === "monthly" ? "/mês" : "/ano"}
										</span>
									</div>
									{billingInterval === "yearly" && (
										<div className="mt-2 text-xs text-green-600 font-medium">
											Economize{" "}
											{formatToMoney(monthlyPrice * 12 - yearlyPrice)} por ano
										</div>
									)}
								</div>

								{/* Features */}
								<ul className="space-y-4 mb-8 flex-1">
									{plan.pricingTableFeatures.map((feature, fidx) => (
										<li
											key={fidx.toString()}
											className="flex items-start gap-3"
										>
											<div
												className={cn(
													"mt-0.5 rounded-full p-0.5",
													feature.checked
														? "bg-green-100 text-green-600"
														: "bg-slate-100 text-slate-300",
												)}
											>
												<CheckCircle2 className="h-3.5 w-3.5" />
											</div>
											<span
												className={cn(
													"text-sm leading-snug",
													feature.checked
														? "text-slate-700"
														: "text-slate-400 line-through",
												)}
											>
												{feature.label}
											</span>
										</li>
									))}
								</ul>

								{/* CTA */}
								<Link href="/auth/signup" className="mt-auto">
									<button
										type="button"
										className={cn(
											"w-full rounded-xl py-4 text-base font-bold transition-all duration-300",
											isPopular
												? "bg-[#24549C] hover:bg-[#1e4682] text-white shadow-lg shadow-blue-600/20"
												: "bg-slate-100 hover:bg-slate-200 text-slate-800",
										)}
									>
										Testar 15 dias grátis
									</button>
								</Link>
							</motion.div>
						);
					})}
				</div>

				{/* Guarantee */}
				<div className="mt-12 text-center">
					<p className="text-slate-500 text-base font-medium">
						15 dias grátis para testar. Sem cartão de crédito.
					</p>
				</div>

				<div className="mt-6 text-center">
					<p className="text-slate-400 text-sm">
						Precisa de um plano customizado para grandes redes?{" "}
						<a
							href="https://wa.me/553499480791"
							target="_blank"
							rel="noopener noreferrer"
							className="text-[#24549C] hover:text-blue-600 font-medium border-b border-[#24549C]/30 hover:border-blue-500 transition-colors"
						>
							Fale com nossos especialistas
						</a>
					</p>
				</div>
			</div>
		</section>
	);
}
