"use client";

import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, BarChart3, ChevronDown, Lightbulb, ShoppingBag, ShoppingCart, Sparkles, TrendingUp, UserRound, Users, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types & Constants ───

type HintType = "reactivation" | "performance" | "upsell" | "seller" | "strategy";

interface Hint {
	id: HintType;
	icon: React.ElementType;
	iconBg: string;
	iconColor: string;
	title: string;
	isNew: boolean;
	shortDescription: string;
	fullDescription: string;
	potentialLabel?: string;
	potentialValue?: string;
	primaryAction?: string;
	secondaryAction?: string;
	timestamp: string;
}

const HINTS: Hint[] = [
	{
		id: "reactivation",
		icon: Users,
		iconBg: "bg-[#FFB900]/20",
		iconColor: "text-[#FFB900]",
		title: "Campanha de Reativação Sugerida",
		isNew: true,
		shortDescription: "Identifiquei 847 clientes que não compram há mais de 60 dias. Uma campanha de reativação com 5% de...",
		fullDescription:
			"Identifiquei 847 clientes que não compram há mais de 60 dias. Uma campanha de reativação com 5% de cashback pode recuperar até R$ 42.350 em vendas, baseado no ticket médio desses clientes.",
		potentialLabel: "Potencial de recuperação:",
		potentialValue: "R$ 42.350",
		primaryAction: "Criar Campanha",
		secondaryAction: "Ver Clientes",
		timestamp: "Há 15 minutos",
	},
	{
		id: "performance",
		icon: BarChart3,
		iconBg: "bg-blue-500/20",
		iconColor: "text-blue-500",
		title: "Insight de Performance",
		isNew: true,
		shortDescription: "Suas vendas das quartas-feiras aumentaram 23% nas últimas 4 semanas. Considere criar uma campanha...",
		fullDescription:
			"Suas vendas das quartas-feiras aumentaram 23% nas últimas 4 semanas. Considere criar uma campanha recorrente para esse dia, aproveitando o momento de maior engajamento dos seus clientes.",
		primaryAction: "Analisar Dados",
		timestamp: "Há 2 horas",
	},
	{
		id: "upsell",
		icon: ShoppingCart,
		iconBg: "bg-purple-500/20",
		iconColor: "text-purple-500",
		title: "Oportunidade de Upsell",
		isNew: false,
		shortDescription: "156 clientes compraram apenas 1 vez nos últimos 30 dias com ticket acima de R$ 200. Uma campanha de...",
		fullDescription:
			"156 clientes compraram apenas 1 vez nos últimos 30 dias com ticket acima de R$ 200. Uma campanha de upsell pode aumentar a recorrência desses clientes de alto valor.",
		primaryAction: "Ver Sugestão",
		timestamp: "Há 5 horas",
	},
	{
		id: "seller",
		icon: UserRound,
		iconBg: "bg-red-500/20",
		iconColor: "text-red-500",
		title: "Alerta de Vendedor",
		isNew: false,
		shortDescription: "O vendedor Carlos Silva está com performance 40% abaixo da média esta semana. Pode ser interessante...",
		fullDescription:
			"O vendedor Carlos Silva está com performance 40% abaixo da média esta semana. Pode ser interessante verificar se há algum problema ou oferecer suporte.",
		primaryAction: "Ver Detalhes",
		timestamp: "Há 1 dia",
	},
	{
		id: "strategy",
		icon: Lightbulb,
		iconBg: "bg-green-500/20",
		iconColor: "text-green-500",
		title: "Sugestão Estratégica",
		isNew: false,
		shortDescription: "Com base nos dados de vendas, o produto 'Kit Skincare' tem alta correlação com recompra em 30 dias...",
		fullDescription:
			"Com base nos dados de vendas, o produto 'Kit Skincare' tem alta correlação com recompra em 30 dias. Considere destacá-lo no ponto de venda.",
		primaryAction: "Ver Análise",
		timestamp: "Há 2 dias",
	},
];

const EXPANDED_HINT_SEQUENCE: HintType[] = ["reactivation", "performance", "upsell"];
const HINT_DISPLAY_DURATION = 4500;

// ─── Components ───

function HintCard({
	hint,
	isExpanded,
	isVisible,
}: {
	hint: Hint;
	isExpanded: boolean;
	isVisible: boolean;
}) {
	const Icon = hint.icon;

	if (!isVisible) return null;

	return (
		<motion.div
			initial={{ opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: -10 }}
			transition={{ type: "spring", stiffness: 400, damping: 30 }}
			className={cn(
				"rounded-xl border transition-all duration-300 overflow-hidden",
				isExpanded ? "bg-[#FFB900]/5 border-[#FFB900]/30" : "bg-white/[0.02] border-white/5",
			)}
		>
			{/* Card header */}
			<div className={cn("flex items-start gap-2 p-2", isExpanded && "pb-0")}>
				{/* Icon */}
				<div className={cn("w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5", hint.iconBg)}>
					<Icon className={cn("w-3 h-3", hint.iconColor)} />
				</div>

				{/* Content */}
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-1.5 mb-0.5">
						<span className="text-[0.5rem] font-bold text-white truncate">{hint.title}</span>
						{hint.isNew && <span className="text-[0.35rem] font-bold bg-[#FFB900] text-black px-1 py-0.5 rounded uppercase shrink-0">NOVO</span>}
					</div>

					{/* Description */}
					<p className="text-[0.4rem] text-white/50 leading-relaxed">{isExpanded ? hint.fullDescription : hint.shortDescription}</p>
				</div>
			</div>

			{/* Expanded content */}
			<AnimatePresence>
				{isExpanded && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.3 }}
						className="px-2 pb-2"
					>
						{/* Potential value box */}
						{hint.potentialValue && (
							<motion.div
								initial={{ opacity: 0, scale: 0.95 }}
								animate={{ opacity: 1, scale: 1 }}
								transition={{ delay: 0.2 }}
								className="mt-2 bg-[#FFB900]/10 border border-[#FFB900]/20 rounded-lg p-2 flex items-center justify-between"
							>
								<span className="text-[0.4rem] text-[#FFB900]/80 font-medium">{hint.potentialLabel}</span>
								<span className="text-[0.55rem] font-black text-[#FFB900]">{hint.potentialValue}</span>
							</motion.div>
						)}

						{/* Action buttons */}
						<motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mt-2 flex items-center gap-2">
							{hint.primaryAction && (
								<motion.div
									className="bg-[#FFB900] rounded-lg px-2 py-1.5 flex items-center gap-1"
									animate={{ scale: [1, 1.02, 1] }}
									transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, delay: 0.5 }}
								>
									<span className="text-[0.4rem] font-bold text-black">{hint.primaryAction}</span>
									<ArrowRight className="w-2.5 h-2.5 text-black" />
								</motion.div>
							)}
							{hint.secondaryAction && (
								<div className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 flex items-center gap-1">
									<span className="text-[0.4rem] font-medium text-white/70">{hint.secondaryAction}</span>
									<ArrowRight className="w-2.5 h-2.5 text-white/50" />
								</div>
							)}
						</motion.div>

						{/* Timestamp */}
						<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="mt-2 text-[0.35rem] text-white/30">
							{hint.timestamp}
						</motion.div>
					</motion.div>
				)}
			</AnimatePresence>
		</motion.div>
	);
}

function AIHintsWireframe() {
	const [visibleHints, setVisibleHints] = useState(0);
	const [expandedHint, setExpandedHint] = useState<HintType | null>(null);
	const [expandedIndex, setExpandedIndex] = useState(0);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const resetAndLoop = useCallback(() => {
		setVisibleHints(0);
		setExpandedHint(null);
		setExpandedIndex(0);
	}, []);

	useEffect(() => {
		// Phase 1: Show hints one by one
		if (visibleHints < HINTS.length) {
			timeoutRef.current = setTimeout(() => {
				setVisibleHints((prev) => prev + 1);
			}, 400);
			return () => {
				if (timeoutRef.current) clearTimeout(timeoutRef.current);
			};
		}

		// Phase 2: Start expanding hints after all visible
		if (visibleHints === HINTS.length && expandedHint === null) {
			timeoutRef.current = setTimeout(() => {
				setExpandedHint(EXPANDED_HINT_SEQUENCE[0]);
			}, 800);
			return () => {
				if (timeoutRef.current) clearTimeout(timeoutRef.current);
			};
		}
	}, [visibleHints, expandedHint]);

	useEffect(() => {
		// Phase 3: Cycle through expanded hints
		if (expandedHint !== null) {
			timeoutRef.current = setTimeout(() => {
				const nextIndex = expandedIndex + 1;
				if (nextIndex < EXPANDED_HINT_SEQUENCE.length) {
					setExpandedIndex(nextIndex);
					setExpandedHint(EXPANDED_HINT_SEQUENCE[nextIndex]);
				} else {
					// Loop: reset everything
					resetAndLoop();
				}
			}, HINT_DISPLAY_DURATION);
			return () => {
				if (timeoutRef.current) clearTimeout(timeoutRef.current);
			};
		}
	}, [expandedHint, expandedIndex, resetAndLoop]);

	return (
		<div className="relative w-full max-w-sm mx-auto">
			{/* Glow behind */}
			<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-[#FFB900]/10 blur-3xl rounded-full -z-10" />

			{/* Panel frame */}
			<div className="bg-zinc-950 border border-white/10 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
				{/* Header */}
				<div className="flex items-center gap-3 px-3 py-2.5 border-b border-white/5 bg-white/[0.02]">
					{/* Icon */}
					<div className="w-8 h-8 rounded-xl bg-[#FFB900]/20 flex items-center justify-center">
						<ShoppingBag className="w-4 h-4 text-[#FFB900]" />
					</div>

					{/* Title */}
					<div className="flex-1">
						<div className="flex items-center gap-2">
							<span className="text-[0.6rem] font-black text-white uppercase tracking-wide">AI HINTS</span>
							<span className="text-[0.4rem] font-medium text-[#FFB900]/80 bg-[#FFB900]/10 px-1.5 py-0.5 rounded">2 novos</span>
						</div>
						<div className="text-[0.4rem] text-white/40">Seu assistente de inteligência comercial</div>
					</div>

					{/* Actions */}
					<div className="flex items-center gap-1">
						<ChevronDown className="w-3.5 h-3.5 text-white/30" />
						<X className="w-3.5 h-3.5 text-white/30" />
					</div>
				</div>

				{/* Hints list */}
				<div className="p-2 space-y-2 min-h-[320px] max-h-[320px] overflow-hidden">
					{HINTS.slice(0, visibleHints).map((hint) => (
						<HintCard key={hint.id} hint={hint} isExpanded={expandedHint === hint.id} isVisible={true} />
					))}
				</div>

				{/* Footer */}
				<div className="px-3 py-2 border-t border-white/5 bg-white/[0.01]">
					<div className="flex items-center justify-center gap-1.5">
						<Sparkles className="w-3 h-3 text-[#FFB900]/50" />
						<span className="text-[0.4rem] text-white/30">Dicas geradas com base nos seus dados de vendas</span>
					</div>
				</div>
			</div>
		</div>
	);
}

// ─── Exported Section ───

export default function InsightsSection() {
	return (
		<section id="insights" className="py-24 bg-white border-y border-black/5 relative overflow-hidden">
			<div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-yellow-100/50 via-white to-white" />

			<div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
				<div className="grid lg:grid-cols-2 gap-16 items-center">
					{/* Wireframe */}
					<div className="relative order-2 lg:order-1">
						<AIHintsWireframe />
					</div>

					{/* Content */}
					<div className="order-1 lg:order-2">
						<div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-yellow-50 border border-yellow-100 text-[#d97706] text-sm font-bold mb-6">
							<Lightbulb className="w-4 h-4" />
							Insights Proativos
						</div>
						<h2 className="text-3xl md:text-5xl font-extrabold mb-6 text-slate-900 leading-tight">
							A IA avisa. Você age. <br />
							<span className="text-brand">O caixa sente.</span>
						</h2>
						<p className="text-lg text-slate-600 mb-8 leading-relaxed font-medium">
							Receba alertas práticos baseados nos seus dados. Não perca tempo analisando relatórios: a informação chega pronta para agir.
						</p>

						<div className="grid sm:grid-cols-2 gap-4 mb-8">
							<div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-yellow-400/50 hover:shadow-lg hover:shadow-yellow-900/5 transition-all">
								<h4 className="font-bold text-slate-900 text-lg mb-2 flex items-center gap-2">
									<TrendingUp className="w-5 h-5 text-[#d97706]" /> Análise Automática
								</h4>
								<p className="text-[15px] text-slate-600 font-medium">A IA monitora seus dados 24/7 e identifica padrões importantes.</p>
							</div>
							<div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-yellow-400/50 hover:shadow-lg hover:shadow-yellow-900/5 transition-all">
								<h4 className="font-bold text-slate-900 text-lg mb-2 flex items-center gap-2">
									<Users className="w-5 h-5 text-[#d97706]" /> Ações com 1 Clique
								</h4>
								<p className="text-[15px] text-slate-600 font-medium">Do insight à campanha em segundos. Sem complicação.</p>
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
