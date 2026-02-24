"use client";

import { AppSubscriptionPlans } from "@/config";
import { formatToMoney } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Crown, MessageCircle, Sparkles, XCircle, Zap } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type BillingInterval = "monthly" | "yearly";

// Icon map for plan names
const PLAN_META: Record<string, { icon: React.ElementType; accentColor: string; ringColor: string; badgeText?: string }> = {
	ESSENCIAL: {
		icon: Zap,
		accentColor: "text-slate-600",
		ringColor: "ring-slate-200",
	},
	CRESCIMENTO: {
		icon: Sparkles,
		accentColor: "text-[#24549C]",
		ringColor: "ring-[#24549C]",
		badgeText: "Mais Popular",
	},
	ESCALA: {
		icon: Crown,
		accentColor: "text-[#FFB900]",
		ringColor: "ring-[#FFB900]/60",
	},
};

function BillingToggle({ value, onChange }: { value: BillingInterval; onChange: (v: BillingInterval) => void }) {
	return (
		<div className="relative flex items-center bg-slate-100 border border-slate-200 p-1.5 rounded-full shadow-inner">
			<button
				type="button"
				onClick={() => onChange("monthly")}
				className={cn(
					"relative z-10 w-28 rounded-full py-2 text-center text-sm font-bold transition-colors duration-300",
					value === "monthly" ? "text-white" : "text-slate-500 hover:text-slate-700",
				)}
			>
				MENSAL
			</button>
			<button
				type="button"
				onClick={() => onChange("yearly")}
				className={cn(
					"relative z-10 w-28 rounded-full py-2 text-center text-sm font-bold transition-colors duration-300 flex items-center justify-center gap-1.5",
					value === "yearly" ? "text-white" : "text-slate-500 hover:text-slate-700",
				)}
			>
				ANUAL
				<span
					className={cn(
						"text-[9px] font-black rounded-full px-1.5 py-0.5 transition-colors",
						value === "yearly" ? "bg-[#FFB900]/30 text-[#FFB900]" : "bg-green-100 text-green-700",
					)}
				>
					-20%
				</span>
			</button>
			<motion.div
				className="absolute top-1.5 bottom-1.5 w-28 rounded-full bg-[#24549C] shadow-md shadow-blue-900/20"
				animate={{ left: value === "monthly" ? 6 : "calc(100% - 7rem - 6px)" }}
				transition={{ type: "spring", stiffness: 400, damping: 35 }}
			/>
		</div>
	);
}

function PlanCard({
	planKey,
	billing,
	idx,
}: {
	planKey: keyof typeof AppSubscriptionPlans;
	billing: BillingInterval;
	idx: number;
}) {
	const plan = AppSubscriptionPlans[planKey];
	const pricing = plan.pricing[billing];
	const meta = PLAN_META[planKey] ?? PLAN_META.ESSENCIAL;
	const Icon = meta.icon;
	const isPopular = planKey === "CRESCIMENTO";

	const monthlyPrice = plan.pricing.monthly.price;
	const yearlyPrice = plan.pricing.yearly.price;
	const discountPct = Math.round(((monthlyPrice * 12 - yearlyPrice) / (monthlyPrice * 12)) * 100);
	const yearlySaving = monthlyPrice * 12 - yearlyPrice;

	// Format price display
	const [intPart, decPart] = formatToMoney(pricing.price).replace("R$\u00a0", "").replace("R$ ", "").split(",");

	return (
		<motion.div
			initial={{ opacity: 0, y: 24 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true }}
			transition={{ duration: 0.4, delay: idx * 0.1 }}
			className={cn(
				"relative flex flex-col rounded-3xl border bg-white transition-all duration-300",
				isPopular
					? "border-[#24549C] shadow-2xl shadow-blue-900/12 scale-[1.03] z-10 ring-2 ring-[#24549C]/20"
					: "border-slate-200 hover:border-slate-300 hover:shadow-xl hover:shadow-slate-200/40",
			)}
		>
			{/* Popular badge */}
			{isPopular && (
				<div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#24549C] text-white px-5 py-1.5 rounded-full text-xs font-bold tracking-wide uppercase shadow-lg shadow-blue-900/20 whitespace-nowrap">
					Mais Popular
				</div>
			)}

			{/* Yearly discount badge */}
			<AnimatePresence>
				{billing === "yearly" && (
					<motion.div
						initial={{ opacity: 0, scale: 0.8, y: -4 }}
						animate={{ opacity: 1, scale: 1, y: 0 }}
						exit={{ opacity: 0, scale: 0.8 }}
						className="absolute top-4 right-4 bg-green-100 border border-green-200 text-green-700 px-2.5 py-1 rounded-full text-[10px] font-black tracking-wide"
					>
						-{discountPct}% OFF
					</motion.div>
				)}
			</AnimatePresence>

			<div className="p-8 flex flex-col flex-1">
				{/* Plan header */}
				<div className="flex items-center gap-3 mb-4">
					<div
						className={cn(
							"w-10 h-10 rounded-2xl flex items-center justify-center",
							isPopular ? "bg-[#24549C]/10" : planKey === "ESCALA" ? "bg-[#FFB900]/10" : "bg-slate-100",
						)}
					>
						<Icon className={cn("w-5 h-5", meta.accentColor)} />
					</div>
					<div>
						<h3 className="font-black text-xl text-slate-900 tracking-tight">{plan.name}</h3>
					</div>
				</div>

				<p className="text-sm text-slate-500 leading-relaxed mb-6 min-h-[40px] font-medium">{plan.description}</p>

				{/* Pricing */}
				<div className="mb-6 pb-6 border-b border-slate-100">
					<div className="flex items-baseline gap-1">
						<span className="text-sm font-bold text-slate-400">R$</span>
						<AnimatePresence mode="wait">
							<motion.span
								key={`${planKey}-${billing}-int`}
								initial={{ opacity: 0, y: 8 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -8 }}
								transition={{ duration: 0.2 }}
								className="font-black text-5xl text-slate-900 tracking-tighter tabular-nums"
							>
								{intPart}
							</motion.span>
						</AnimatePresence>
						<AnimatePresence mode="wait">
							<motion.span
								key={`${planKey}-${billing}-dec`}
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								className="text-2xl font-bold text-slate-900"
							>
								,{decPart}
							</motion.span>
						</AnimatePresence>
						<span className="text-slate-400 text-sm font-medium ml-1">{billing === "monthly" ? "/mês" : "/ano"}</span>
					</div>

					<AnimatePresence>
						{billing === "yearly" && (
							<motion.div
								initial={{ opacity: 0, height: 0 }}
								animate={{ opacity: 1, height: "auto" }}
								exit={{ opacity: 0, height: 0 }}
								className="overflow-hidden"
							>
								<div className="mt-2 text-[12px] text-green-700 font-bold bg-green-50 inline-flex items-center gap-1 px-2 py-1 rounded-md border border-green-100">
									<Sparkles className="w-3 h-3" />
									Economize {formatToMoney(yearlySaving)} por ano
								</div>
							</motion.div>
						)}
					</AnimatePresence>
				</div>

				{/* Features */}
				<ul className="space-y-3 mb-8 flex-1">
					{plan.pricingTableFeatures.map((feature, fidx) => (
						<li key={fidx.toString()} className="flex items-start gap-3">
							<div
								className={cn(
									"mt-0.5 shrink-0",
									feature.checked ? (isPopular ? "text-[#24549C]" : "text-green-500") : "text-slate-300",
								)}
							>
								{feature.checked ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
							</div>
							<span
								className={cn(
									"text-sm leading-snug font-medium",
									feature.checked ? "text-slate-700" : "text-slate-300 line-through",
								)}
							>
								{feature.label}
							</span>
						</li>
					))}
				</ul>

				{/* CTA */}
				<Link href="/auth/signup" className="mt-auto">
					<motion.div
						whileHover={{ scale: 1.02 }}
						whileTap={{ scale: 0.97 }}
						className={cn(
							"w-full rounded-2xl py-4 text-sm font-bold text-center transition-colors duration-200 cursor-pointer",
							isPopular
								? "bg-[#24549C] hover:bg-[#1e4682] text-white shadow-xl shadow-blue-900/20"
								: planKey === "ESCALA"
								? "bg-slate-900 hover:bg-slate-800 text-white"
								: "bg-slate-50 hover:bg-slate-100 text-slate-900 border border-slate-200",
						)}
					>
						Testar 15 dias grátis
					</motion.div>
				</Link>
			</div>
		</motion.div>
	);
}

export default function Pricing() {
	const [billing, setBilling] = useState<BillingInterval>("monthly");

	const planKeys = Object.keys(AppSubscriptionPlans) as Array<keyof typeof AppSubscriptionPlans>;

	return (
		<section id="planos" className="py-20 lg:py-28 bg-white relative overflow-hidden border-t border-slate-100">
			{/* Subtle background gradient */}
			<div className="absolute inset-0 pointer-events-none">
				<div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-b from-blue-50/60 to-transparent rounded-full blur-3xl" />
			</div>

			<div className="container mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
				{/* Header */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.5 }}
					className="text-center mb-12"
				>
					<p className="text-xs font-bold text-[#24549C] uppercase tracking-widest mb-3">Planos e Preços</p>
					<h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight mb-4">
						Simples e{" "}
						<span className="text-transparent bg-clip-text bg-gradient-to-r from-[#24549C] to-blue-400">transparente.</span>
					</h2>
					<p className="text-lg text-slate-500 max-w-xl mx-auto">Sem taxa de setup. Sem surpresas. Cancele quando quiser.</p>
				</motion.div>

				{/* Billing toggle */}
				<motion.div
					initial={{ opacity: 0, y: 12 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.4, delay: 0.1 }}
					className="flex justify-center mb-14"
				>
					<BillingToggle value={billing} onChange={setBilling} />
				</motion.div>

				{/* Plans grid */}
				<div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start max-w-5xl mx-auto">
					{planKeys.map((planKey, idx) => (
						<PlanCard key={planKey} planKey={planKey} billing={billing} idx={idx} />
					))}
				</div>

				{/* Guarantees */}
				<motion.div
					initial={{ opacity: 0, y: 12 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.4, delay: 0.3 }}
					className="mt-12 flex flex-wrap items-center justify-center gap-6 text-sm text-slate-400 font-medium"
				>
					{["15 dias grátis", "Sem cartão de crédito", "Cancele online a qualquer momento", "Suporte incluso"].map((item) => (
						<div key={item} className="flex items-center gap-2">
							<CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
							<span>{item}</span>
						</div>
					))}
				</motion.div>

				{/* Enterprise callout */}
				<motion.div
					initial={{ opacity: 0 }}
					whileInView={{ opacity: 1 }}
					viewport={{ once: true }}
					transition={{ duration: 0.4, delay: 0.4 }}
					className="mt-8 text-center"
				>
					<p className="text-sm text-slate-500">
						Precisa de um plano customizado para grandes redes?{" "}
						<a
							href="https://wa.me/553499480791"
							target="_blank"
							rel="noopener noreferrer"
							className="text-[#24549C] hover:text-[#1e4682] font-bold border-b border-[#24549C]/30 hover:border-[#24549C] transition-colors"
						>
							<MessageCircle className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
							Fale com nossos especialistas
						</a>
					</p>
				</motion.div>
			</div>
		</section>
	);
}
