"use client";

import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import {
	AlertTriangle,
	ArrowRight,
	CheckCircle2,
	Clock,
	Gift,
	MessageCircle,
	RefreshCw,
	Send,
	Sparkles,
	TrendingUp,
	UserCheck,
	Users,
	Zap,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

// ════════════════════════════════════════════════════════════════════════════
// ─── BRAND COLORS ───
// Primary: #24549C (Azul)
// Secondary: #FFB900 (Dourado/Amarelo)
// ════════════════════════════════════════════════════════════════════════════

// ─── HIGH-FIDELITY DASHBOARD ANIMATION ───

type DashboardPhase = "risk" | "sending" | "loyal";

const PHASE_DURATIONS: Record<DashboardPhase, number> = {
	risk: 4000,
	sending: 2800,
	loyal: 4500,
};

const PHASES: DashboardPhase[] = ["risk", "sending", "loyal"];

function useAnimatedCounter(target: number, duration: number, active: boolean) {
	const [value, setValue] = useState(0);
	const rafRef = useRef<number | null>(null);

	useEffect(() => {
		if (!active) {
			setValue(0);
			return;
		}
		const start = performance.now();
		const animate = (now: number) => {
			const elapsed = now - start;
			const progress = Math.min(elapsed / duration, 1);
			const eased = 1 - (1 - progress) * (1 - progress);
			setValue(Math.round(eased * target));
			if (progress < 1) {
				rafRef.current = requestAnimationFrame(animate);
			}
		};
		rafRef.current = requestAnimationFrame(animate);
		return () => {
			if (rafRef.current) cancelAnimationFrame(rafRef.current);
		};
	}, [target, duration, active]);

	return value;
}

function HighFidelityDashboard() {
	const [phase, setPhase] = useState<DashboardPhase>("risk");
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const advance = useCallback(() => {
		setPhase((prev) => {
			const idx = PHASES.indexOf(prev);
			return PHASES[(idx + 1) % PHASES.length];
		});
	}, []);

	useEffect(() => {
		timeoutRef.current = setTimeout(advance, PHASE_DURATIONS[phase]);
		return () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
		};
	}, [phase, advance]);

	const recovered = useAnimatedCounter(2847, 1500, phase === "loyal");

	return (
		<div className="relative w-full max-w-md mx-auto">
			{/* Browser Frame - Light Mode Style */}
			<div className="bg-white rounded-2xl shadow-2xl shadow-slate-900/15 border border-slate-200 overflow-hidden">
				{/* Browser Chrome */}
				<div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center gap-3">
					<div className="flex gap-1.5">
						<div className="w-3 h-3 rounded-full bg-red-400 hover:bg-red-500 transition-colors" />
						<div className="w-3 h-3 rounded-full bg-amber-400 hover:bg-amber-500 transition-colors" />
						<div className="w-3 h-3 rounded-full bg-green-400 hover:bg-green-500 transition-colors" />
					</div>
					<div className="flex-1 flex justify-center">
						<div className="bg-white rounded-lg px-4 py-1.5 text-xs font-medium text-slate-500 border border-slate-200 shadow-sm flex items-center gap-2">
							<div className="w-3 h-3 rounded-full bg-green-500" />
							app.recompracrm.com.br
						</div>
					</div>
					<div className="w-16" />
				</div>

				{/* App Header */}
				<div className="bg-white px-4 py-3 border-b border-slate-100 flex items-center justify-between">
					<div className="flex items-center gap-2">
						<div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#24549C] to-blue-600 flex items-center justify-center">
							<span className="text-xs font-black text-white">R</span>
						</div>
						<div>
							<div className="text-sm font-bold text-slate-800">RecompraCRM</div>
							<div className="text-[10px] text-slate-400">Loja Exemplo</div>
						</div>
					</div>
					<div className="flex items-center gap-2">
						<div className="text-xs text-slate-500 font-medium bg-slate-100 px-2.5 py-1 rounded-full">Matriz RFM</div>
					</div>
				</div>

				{/* Dashboard Content */}
				<div className="p-4 min-h-[320px] bg-gradient-to-b from-slate-50/50 to-white">
					<AnimatePresence mode="wait">
						{phase === "risk" && (
							<motion.div
								key="risk"
								initial={{ opacity: 0, y: 20 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -20 }}
								transition={{ duration: 0.4 }}
								className="space-y-4"
							>
								{/* RFM Segment Header */}
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2">
										<div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">
											<AlertTriangle className="w-5 h-5 text-amber-500" />
										</div>
										<div>
											<div className="text-sm font-bold text-slate-800">Em Risco de Perda</div>
											<div className="text-xs text-slate-500">89 clientes neste segmento</div>
										</div>
									</div>
									<motion.div
										className="px-3 py-1.5 rounded-full bg-amber-100 border border-amber-200"
										animate={{ scale: [1, 1.05, 1] }}
										transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
									>
										<span className="text-xs font-bold text-amber-700">Ação Recomendada</span>
									</motion.div>
								</div>

								{/* Client Card */}
								<div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
									<div className="p-4">
										<div className="flex items-center gap-3 mb-4">
											<div className="w-12 h-12 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center shadow-inner">
												<span className="text-sm font-bold text-slate-600">MS</span>
											</div>
											<div className="flex-1">
												<div className="text-sm font-bold text-slate-800">Maria Silva</div>
												<div className="text-xs text-slate-500">(34) 99876-5432</div>
											</div>
											<div className="text-right">
												<div className="flex items-center gap-1 text-amber-600">
													<Clock className="w-3.5 h-3.5" />
													<span className="text-lg font-black">45d</span>
												</div>
												<div className="text-[10px] text-slate-400 uppercase font-medium">sem comprar</div>
											</div>
										</div>

										{/* Client Stats */}
										<div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded-lg">
											<div className="text-center">
												<div className="text-[10px] text-slate-400 uppercase font-medium mb-0.5">Ticket Médio</div>
												<div className="text-sm font-bold text-slate-700">R$ 287</div>
											</div>
											<div className="text-center border-x border-slate-200">
												<div className="text-[10px] text-slate-400 uppercase font-medium mb-0.5">Compras</div>
												<div className="text-sm font-bold text-slate-700">12</div>
											</div>
											<div className="text-center">
												<div className="text-[10px] text-slate-400 uppercase font-medium mb-0.5">Lifetime</div>
												<div className="text-sm font-bold text-slate-700">R$ 3.4k</div>
											</div>
										</div>
									</div>

									{/* Action Bar */}
									<div className="px-4 py-3 bg-gradient-to-r from-[#24549C] to-blue-600 flex items-center justify-between">
										<div className="flex items-center gap-2 text-white/90">
											<Zap className="w-4 h-4" />
											<span className="text-xs font-medium">Campanha de Reativação</span>
										</div>
										<motion.div
											className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full"
											animate={{ x: [0, 3, 0] }}
											transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY }}
										>
											<span className="text-xs font-bold text-white">Enviar</span>
											<ArrowRight className="w-3.5 h-3.5 text-white" />
										</motion.div>
									</div>
								</div>
							</motion.div>
						)}

						{phase === "sending" && (
							<motion.div
								key="sending"
								initial={{ opacity: 0, scale: 0.95 }}
								animate={{ opacity: 1, scale: 1 }}
								exit={{ opacity: 0, scale: 0.95 }}
								transition={{ duration: 0.4 }}
								className="h-full flex flex-col items-center justify-center py-8 gap-5"
							>
								{/* Sending Animation */}
								<motion.div className="relative">
									{[0, 1, 2].map((i) => (
										<motion.div
											key={i}
											className="absolute inset-0 border-2 border-[#24549C]/40 rounded-full"
											initial={{ scale: 1, opacity: 0.8 }}
											animate={{ scale: 2.5, opacity: 0 }}
											transition={{
												duration: 1.8,
												repeat: Number.POSITIVE_INFINITY,
												delay: i * 0.5,
												ease: "easeOut",
											}}
										/>
									))}
									<div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-[#24549C] to-blue-600 flex items-center justify-center shadow-xl shadow-blue-500/30">
										<Send className="w-8 h-8 text-white" />
									</div>
								</motion.div>

								<div className="text-center">
									<div className="text-base font-black text-slate-800">Enviando WhatsApp...</div>
									<div className="text-sm text-slate-500 mt-1">Maria Silva • Campanha de Reativação</div>
								</div>

								{/* WhatsApp Preview */}
								<motion.div
									initial={{ opacity: 0, y: 10 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ delay: 0.4 }}
									className="bg-[#DCF8C6] rounded-lg p-3 max-w-[240px] shadow-sm border border-green-200"
								>
									<p className="text-xs text-slate-700 leading-relaxed">
										Oi Maria! ✨ Sentimos sua falta! Liberamos <span className="font-bold">R$ 25</span> de cashback especial. Válido por 15 dias!
									</p>
									<div className="flex items-center justify-end gap-1 mt-1">
										<span className="text-[10px] text-slate-500">09:00</span>
										<CheckCircle2 className="w-3 h-3 text-blue-500" />
									</div>
								</motion.div>

								{/* Cashback Badge */}
								<motion.div
									initial={{ opacity: 0, y: 10 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ delay: 0.7 }}
									className="flex items-center gap-2 bg-[#FFB900]/10 border border-[#FFB900]/30 rounded-full px-4 py-2"
								>
									<Gift className="w-4 h-4 text-[#FFB900]" />
									<span className="text-sm font-bold text-[#FFB900]">+R$ 25,00 creditado</span>
								</motion.div>
							</motion.div>
						)}

						{phase === "loyal" && (
							<motion.div
								key="loyal"
								initial={{ opacity: 0, y: 20 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -20 }}
								transition={{ duration: 0.4 }}
								className="space-y-4"
							>
								{/* Success Header */}
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2">
										<div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
											<UserCheck className="w-5 h-5 text-emerald-600" />
										</div>
										<div>
											<div className="text-sm font-bold text-slate-800">Cliente Fiel</div>
											<div className="text-xs text-emerald-600 font-medium">Reativado com sucesso!</div>
										</div>
									</div>
									<div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-100 border border-emerald-200">
										<CheckCircle2 className="w-4 h-4 text-emerald-600" />
										<span className="text-xs font-bold text-emerald-700">Convertido</span>
									</div>
								</div>

								{/* Updated Client Card */}
								<div className="bg-white rounded-xl border-2 border-emerald-200 shadow-sm overflow-hidden relative">
									<div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full -translate-y-1/2 translate-x-1/2" />
									<div className="p-4 relative">
										<div className="flex items-center gap-3 mb-4">
											<div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
												<span className="text-sm font-bold text-white">MS</span>
											</div>
											<div className="flex-1">
												<div className="text-sm font-bold text-slate-800">Maria Silva</div>
												<div className="text-xs text-emerald-600 font-medium">Voltou a comprar!</div>
											</div>
											<div className="text-right">
												<div className="text-lg font-black text-emerald-600">3d</div>
												<div className="text-[10px] text-slate-400 uppercase font-medium">atrás</div>
											</div>
										</div>

										{/* Success Stats */}
										<div className="bg-gradient-to-r from-emerald-50 to-green-50 rounded-lg p-3 border border-emerald-100">
											<div className="flex items-center justify-between">
												<div className="flex items-center gap-2">
													<TrendingUp className="w-5 h-5 text-emerald-600" />
													<span className="text-xs font-bold text-emerald-700">Receita Recuperada</span>
												</div>
												<div className="text-xl font-black text-emerald-600">R$ {recovered.toLocaleString("pt-BR")}</div>
											</div>
										</div>
									</div>
								</div>

								{/* ROI Stats */}
								<div className="grid grid-cols-2 gap-3">
									<div className="bg-[#FFB900]/5 border border-[#FFB900]/20 rounded-xl p-3 text-center">
										<div className="text-[10px] text-[#FFB900]/80 uppercase font-bold mb-1">Cashback Investido</div>
										<div className="text-lg font-black text-[#FFB900]">R$ 25</div>
									</div>
									<div className="bg-[#24549C]/5 border border-[#24549C]/20 rounded-xl p-3 text-center">
										<div className="text-[10px] text-[#24549C]/80 uppercase font-bold mb-1">ROI da Campanha</div>
										<div className="text-lg font-black text-[#24549C]">114x</div>
									</div>
								</div>
							</motion.div>
						)}
					</AnimatePresence>
				</div>

				{/* Bottom Progress */}
				<div className="bg-slate-50 border-t border-slate-100 px-4 py-3 flex items-center justify-center gap-2">
					{PHASES.map((p) => (
						<div key={p} className={cn("h-1.5 rounded-full transition-all duration-500", phase === p ? "w-8 bg-[#24549C]" : "w-1.5 bg-slate-200")} />
					))}
				</div>
			</div>
		</div>
	);
}

// ════════════════════════════════════════════════════════════════════════════
// ─── HERO SECTION ───
// ════════════════════════════════════════════════════════════════════════════

export default function HeroSection() {
	return (
		<section className="relative min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/50 overflow-hidden">
			{/* Geometric Background Elements */}
			<div className="absolute inset-0 overflow-hidden">
				{/* Large decorative circle */}
				<motion.div
					className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full border-[40px] border-[#FFB900]/10"
					animate={{ rotate: 360 }}
					transition={{ duration: 120, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
				/>
				{/* Medium circle */}
				<motion.div
					className="absolute top-1/2 -left-24 w-[300px] h-[300px] rounded-full bg-[#24549C]/5"
					animate={{ y: [-20, 20, -20] }}
					transition={{ duration: 8, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
				/>
				{/* Small accent shapes */}
				<div className="absolute top-1/4 left-1/4 w-4 h-4 bg-[#FFB900] rounded-full opacity-60" />
				<div className="absolute bottom-1/3 right-1/3 w-6 h-6 bg-[#24549C] rotate-45 opacity-20" />
				<div className="absolute top-2/3 left-[20%] w-3 h-3 bg-[#FFB900] rounded-full opacity-40" />
				{/* Grid overlay */}
				<div
					className="absolute inset-0 opacity-[0.015]"
					style={{
						backgroundImage: "linear-gradient(#24549C 1px, transparent 1px), linear-gradient(90deg, #24549C 1px, transparent 1px)",
						backgroundSize: "60px 60px",
					}}
				/>
			</div>

			<div className="container mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
				<div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center min-h-screen py-20">
					{/* Left: Copy */}
					<div className="max-w-xl">
						{/* Animated Badge */}
						<motion.div
							initial={{ opacity: 0, scale: 0.9 }}
							animate={{ opacity: 1, scale: 1 }}
							transition={{ duration: 0.5 }}
							className="inline-flex items-center gap-2 bg-gradient-to-r from-[#FFB900]/20 to-[#FFB900]/5 border border-[#FFB900]/30 rounded-full px-5 py-2 mb-8"
						>
							<motion.span animate={{ rotate: [0, 10, -10, 0] }} transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }} className="text-xl">
								🚀
							</motion.span>
							<span className="text-sm font-bold text-[#24549C]">Venda mais para quem já te conhece.</span>
							<Sparkles className="w-4 h-4 text-[#FFB900]" />
						</motion.div>

						{/* Title - Bold Modern */}
						<motion.h1
							initial={{ opacity: 0, y: 40 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.6, delay: 0.1 }}
							className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 mb-8 leading-[1.05] tracking-tight"
						>
							Transforme clientes{" "}
							<span className="relative inline-block">
								<span className="relative z-10 text-transparent bg-clip-text bg-gradient-to-r from-[#24549C] to-blue-600">inativos</span>
								<motion.span
									className="absolute -bottom-1 left-0 right-0 h-4 bg-[#FFB900]/40 z-0 rounded-sm"
									initial={{ scaleX: 0 }}
									animate={{ scaleX: 1 }}
									transition={{ duration: 0.6, delay: 0.5 }}
									style={{ originX: 0 }}
								/>
							</span>{" "}
							em vendas recorrentes no{" "}
							<span className="relative">
								piloto automático
								<RefreshCw className="inline-block w-8 h-8 ml-2 text-[#FFB900] -mt-2" />
							</span>
						</motion.h1>

						{/* Subtitle */}
						<motion.p
							initial={{ opacity: 0, y: 30 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.6, delay: 0.2 }}
							className="text-lg text-slate-600 leading-relaxed mb-10"
						>
							O RecompraCRM usa <span className="font-bold text-[#24549C]">inteligência de dados</span>,{" "}
							<span className="font-bold text-[#24549C]">segmentação RFM</span> e <span className="font-bold text-[#24549C]">campanhas de WhatsApp</span>{" "}
							para fazer o seu cliente voltar a comprar.{" "}
							<span className="block mt-2 font-semibold text-slate-800">Pare de perder dinheiro com clientes que te esqueceram.</span>
						</motion.p>

						{/* CTAs */}
						<motion.div
							initial={{ opacity: 0, y: 30 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.6, delay: 0.3 }}
							className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4"
						>
							<Link
								href="/auth/signup"
								className="group relative overflow-hidden bg-[#24549C] text-white px-8 py-4 rounded-2xl font-bold shadow-2xl shadow-blue-900/20 transition-all duration-300 hover:shadow-blue-900/30 hover:-translate-y-1"
							>
								<span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
								<span className="relative flex items-center justify-center gap-3">
									Quero Experimentar
									<ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
								</span>
							</Link>
							<button
								type="button"
								className="group flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-800 px-8 py-4 rounded-2xl font-bold border-2 border-slate-200 hover:border-[#24549C]/30 transition-all duration-300 shadow-sm hover:shadow-md"
							>
								<MessageCircle className="w-5 h-5 text-slate-500 group-hover:text-[#24549C] transition-colors" />
								Falar com Consultor
							</button>
						</motion.div>

						{/* Trust Indicators */}
						<motion.div
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.6, delay: 0.5 }}
							className="mt-12 flex flex-wrap items-center gap-6"
						>
							{[
								{ icon: "✨", label: "15 dias grátis" },
								{ icon: "💳", label: "Sem cartão" },
								{ icon: "⚡", label: "Setup em 5min" },
							].map((item) => (
								<div key={item.label} className="flex items-center gap-2 text-sm text-slate-600 font-medium">
									<span className="text-lg">{item.icon}</span>
									<span>{item.label}</span>
								</div>
							))}
						</motion.div>
					</div>

					{/* Right: Visual */}
					<motion.div
						initial={{ opacity: 0, scale: 0.9 }}
						animate={{ opacity: 1, scale: 1 }}
						transition={{ duration: 0.7, delay: 0.3 }}
						className="relative"
					>
						{/* Decorative glow behind */}
						<div className="absolute -inset-10 bg-gradient-to-br from-[#24549C]/10 via-transparent to-[#FFB900]/10 blur-3xl opacity-60 rounded-full" />
						<HighFidelityDashboard />
					</motion.div>
				</div>
			</div>
		</section>
	);
}
