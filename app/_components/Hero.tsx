"use client";

import { captureClientEvent } from "@/lib/analytics/posthog-client";
import { motion } from "framer-motion";
import { ArrowRight, Calendar, CheckCircle2, MessageCircle, TrendingUp } from "lucide-react";
import Link from "next/link";

// ─── Mini Dashboard Chart (blue wave) ───
function MiniDashboard() {
	const points = [40, 55, 45, 70, 60, 80, 72, 90, 85, 95, 88, 100];
	const max = Math.max(...points);
	const min = Math.min(...points);
	const h = 80;
	const w = 240;

	const toY = (v: number) => h - ((v - min) / (max - min)) * h;
	const toX = (i: number) => (i / (points.length - 1)) * w;

	const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${toX(i)},${toY(p)}`).join(" ");
	const fillD = `${pathD} L${w},${h} L0,${h} Z`;

	return (
		<div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-4 w-[280px]">
			{/* Header */}
			<div className="flex items-center justify-between mb-3">
				<div>
					<p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">Faturamento</p>
					<p className="text-lg font-black text-slate-900">R$ 84.320</p>
				</div>
				<div className="flex items-center gap-1 bg-green-50 border border-green-100 rounded-full px-2 py-1">
					<TrendingUp className="w-3 h-3 text-green-600" />
					<span className="text-[10px] font-bold text-green-600">+23%</span>
				</div>
			</div>

			{/* Chart */}
			<div className="relative overflow-hidden">
				<svg width={w} height={h + 4} viewBox={`0 0 ${w} ${h + 4}`} className="w-full">
					<defs>
						<linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor="#24549C" stopOpacity="0.25" />
							<stop offset="100%" stopColor="#24549C" stopOpacity="0.01" />
						</linearGradient>
					</defs>
					<motion.path d={fillD} fill="url(#chartGrad)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.5 }} />
					<title>Gráfico de faturamento</title>
					<motion.path
						d={pathD}
						fill="none"
						stroke="#24549C"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						initial={{ pathLength: 0 }}
						animate={{ pathLength: 1 }}
						transition={{ duration: 1.5, delay: 0.2, ease: "easeOut" }}
					/>
					{/* Last dot */}
					<motion.circle
						cx={toX(points.length - 1)}
						cy={toY(points[points.length - 1])}
						r="4"
						fill="#24549C"
						initial={{ scale: 0 }}
						animate={{ scale: 1 }}
						transition={{ delay: 1.6 }}
					/>
				</svg>
			</div>

			{/* Mini stats */}
			<div className="flex gap-3 mt-3 pt-3 border-t border-slate-50">
				{[
					{ label: "Clientes", value: "1.2k" },
					{ label: "Ticket Médio", value: "R$ 287" },
					{ label: "LTV", value: "R$ 1.4k" },
				].map((s) => (
					<div key={s.label} className="flex-1 text-center">
						<p className="text-[9px] text-slate-400 uppercase font-medium">{s.label}</p>
						<p className="text-xs font-bold text-slate-700">{s.value}</p>
					</div>
				))}
			</div>
		</div>
	);
}

// ─── Mini POI Tablet ───
function MiniPOITablet() {
	return (
		<div className="bg-[#1a2f5a] rounded-2xl shadow-2xl border border-white/10 p-3 w-[200px]">
			{/* Header */}
			<div className="flex items-center gap-1.5 mb-3">
				<div className="w-5 h-5 rounded-full bg-[#FFB900] flex items-center justify-center">
					<span className="text-[7px] font-black text-white">R</span>
				</div>
				<span className="text-[9px] font-bold text-white/80">Loja Exemplo</span>
			</div>

			{/* Main CTA */}
			<motion.div
				className="bg-[#FFB900] rounded-xl p-3 mb-2 flex flex-col items-center gap-1"
				animate={{ scale: [1, 1.02, 1] }}
				transition={{ duration: 2.5, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
			>
				<span className="text-[8px] font-black text-[#1a2f5a] uppercase tracking-tight">Resgate seu Cashback</span>
				<span className="text-lg font-black text-[#1a2f5a]">R$ 25,00</span>
				<div className="bg-[#1a2f5a]/20 rounded-full px-2 py-0.5">
					<span className="text-[7px] font-bold text-[#1a2f5a]">Disponível para uso</span>
				</div>
			</motion.div>

			{/* Client info */}
			<div className="bg-white/5 border border-white/10 rounded-xl p-2 flex items-center gap-2">
				<div className="w-6 h-6 rounded-full bg-[#FFB900]/20 flex items-center justify-center">
					<span className="text-[7px] font-bold text-[#FFB900]">JS</span>
				</div>
				<div>
					<p className="text-[8px] font-bold text-white">João Santos</p>
					<p className="text-[7px] text-white/50">12 compras • Cliente Fiel</p>
				</div>
			</div>
		</div>
	);
}

// ─── WhatsApp Floating Bubble ───
function WhatsAppBubble() {
	return (
		<motion.div
			initial={{ opacity: 0, y: 20, scale: 0.9 }}
			animate={{ opacity: 1, y: 0, scale: 1 }}
			transition={{ delay: 1.2, type: "spring", stiffness: 300, damping: 25 }}
			className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-3 w-[240px]"
		>
			<div className="flex items-center gap-2 mb-2">
				<div className="w-7 h-7 rounded-full bg-[#25D366] flex items-center justify-center">
					<MessageCircle className="w-4 h-4 text-white" />
				</div>
				<div>
					<p className="text-[10px] font-bold text-slate-800">SEU NÚMERO DE TELEFONE</p>
					<p className="text-[9px] text-slate-400">Mensagem automática</p>
				</div>
				<motion.div
					className="ml-auto w-2 h-2 rounded-full bg-[#25D366]"
					animate={{ opacity: [1, 0.3, 1] }}
					transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY }}
				/>
			</div>
			<div className="bg-[#DCF8C6] rounded-xl rounded-tl-sm p-2.5">
				<p className="text-[10px] text-slate-700 leading-relaxed">
					Olá João! Você tem <span className="font-bold text-green-700">R$ 15,00</span> de cashback expirando em{" "}
					<span className="font-bold text-orange-600">3 dias</span>. Não perca! 🎁
				</p>
				<div className="flex items-center justify-end gap-1 mt-1">
					<span className="text-[9px] text-slate-400">09:00</span>
					<CheckCircle2 className="w-3 h-3 text-blue-500" />
				</div>
			</div>
		</motion.div>
	);
}

// ─── Floating Calendar Badge ───
function CalendarBadge() {
	return (
		<motion.div
			initial={{ opacity: 0, x: -20 }}
			animate={{ opacity: 1, x: 0 }}
			transition={{ delay: 1.8, type: "spring" }}
			className="bg-white rounded-xl shadow-lg border border-slate-100 px-3 py-2 flex items-center gap-2"
		>
			<div className="w-8 h-8 rounded-lg bg-[#24549C] flex items-center justify-center">
				<Calendar className="w-4 h-4 text-white" />
			</div>
			<div>
				<p className="text-[10px] font-bold text-slate-800">Demo agendada</p>
				<p className="text-[9px] text-slate-400">Amanhã às 10h</p>
			</div>
		</motion.div>
	);
}

// ─── Staggered Hero Visual ───
function HeroVisual() {
	return (
		<div className="relative w-full h-[520px] flex items-center justify-center">
			{/* Glow */}
			<div className="absolute inset-0 bg-gradient-to-br from-[#24549C]/10 via-transparent to-[#FFB900]/10 blur-3xl rounded-full" />

			{/* Base layer: Dashboard */}
			<motion.div
				initial={{ opacity: 0, y: 30, scale: 0.95 }}
				animate={{ opacity: 1, y: 0, scale: 1 }}
				transition={{ duration: 0.7, delay: 0.1 }}
				className="absolute bottom-8 left-0"
			>
				<MiniDashboard />
			</motion.div>

			{/* Middle layer: POI Tablet */}
			<motion.div
				initial={{ opacity: 0, y: 30, scale: 0.95 }}
				animate={{ opacity: 1, y: 0, scale: 1 }}
				transition={{ duration: 0.7, delay: 0.4 }}
				className="absolute top-1/2 right-0 -translate-y-1/2"
			>
				<MiniPOITablet />
			</motion.div>

			{/* Top floating: WhatsApp bubble */}
			<div className="absolute top-0 left-1/2 -translate-x-1/4">
				<WhatsAppBubble />
			</div>

			{/* Small calendar badge */}
			<div className="absolute bottom-4 right-4">
				<CalendarBadge />
			</div>

			{/* Connecting lines (decorative) */}
			<svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: "visible" }}>
				<title>Linha de conexão entre o dashboard e o tablet</title>
				<motion.line
					x1="50%"
					y1="25%"
					x2="80%"
					y2="50%"
					stroke="#24549C"
					strokeWidth="1"
					strokeDasharray="4 4"
					strokeOpacity="0.2"
					initial={{ pathLength: 0 }}
					animate={{ pathLength: 1 }}
					transition={{ delay: 1.5, duration: 0.8 }}
				/>
			</svg>
		</div>
	);
}

// ─── Hero Section ───
export default function Hero() {
	return (
		<section className="relative min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/40 overflow-hidden">
			{/* Background decorative elements */}
			<div className="absolute inset-0 overflow-hidden pointer-events-none">
				<motion.div
					className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full border-[48px] border-[#FFB900]/8"
					animate={{ rotate: 360 }}
					transition={{ duration: 150, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
				/>
				<motion.div
					className="absolute top-1/2 -left-32 w-[350px] h-[350px] rounded-full bg-[#24549C]/4"
					animate={{ y: [-24, 24, -24] }}
					transition={{ duration: 10, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
				/>
				<div className="absolute top-1/3 left-1/3 w-3 h-3 rounded-full bg-[#FFB900] opacity-50" />
				<div className="absolute bottom-1/3 right-1/4 w-5 h-5 bg-[#24549C] rotate-45 opacity-15" />
				<div
					className="absolute inset-0 opacity-[0.012]"
					style={{
						backgroundImage: "linear-gradient(#24549C 1px, transparent 1px), linear-gradient(90deg, #24549C 1px, transparent 1px)",
						backgroundSize: "60px 60px",
					}}
				/>
			</div>

			<div className="container mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
				<div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center min-h-screen py-24">
					{/* Left: Copy */}
					<div className="max-w-xl">
						{/* Badge */}
						<motion.div
							initial={{ opacity: 0, scale: 0.9 }}
							animate={{ opacity: 1, scale: 1 }}
							transition={{ duration: 0.5 }}
							className="inline-flex items-center gap-2 bg-gradient-to-r from-[#FFB900]/20 to-[#FFB900]/5 border border-[#FFB900]/30 rounded-full px-5 py-2 mb-8"
						>
							<span className="text-sm font-bold text-[#24549C]">CRM DE RETENÇÃO PARA VAREJO</span>
							<div className="w-1.5 h-1.5 rounded-full bg-[#FFB900]" />
						</motion.div>

						{/* Headline */}
						<motion.h1
							initial={{ opacity: 0, y: 40 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.6, delay: 0.1 }}
							className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 mb-6 leading-[1.05] tracking-tight"
						>
							Transforme compradores casuais em{" "}
							<span className="relative inline-block">
								<span className="relative z-10 text-transparent bg-clip-text bg-gradient-to-r from-[#24549C] to-blue-500">clientes leais</span>
								<motion.span
									className="absolute -bottom-1 left-0 right-0 h-3 bg-[#FFB900]/35 z-0 rounded-sm"
									initial={{ scaleX: 0 }}
									animate={{ scaleX: 1 }}
									transition={{ duration: 0.6, delay: 0.6 }}
									style={{ originX: 0 }}
								/>
							</span>{" "}
							no piloto automático.
						</motion.h1>

						{/* Sub-headline */}
						<motion.p
							initial={{ opacity: 0, y: 30 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.6, delay: 0.2 }}
							className="text-lg text-slate-600 leading-relaxed mb-10"
						>
							O CRM de varejo focado em retenção. Aumente seu LTV com um <span className="font-semibold text-slate-800">programa de cashback de balcão</span>{" "}
							e <span className="font-semibold text-slate-800">campanhas automatizadas de WhatsApp</span> que vendem por você.
						</motion.p>

						{/* CTAs */}
						<motion.div
							initial={{ opacity: 0, y: 30 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.6, delay: 0.3 }}
							className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4"
						>
							<Link
								className="group relative overflow-hidden bg-[#24549C] text-white px-8 py-4 rounded-2xl font-bold text-base shadow-2xl shadow-blue-900/25 hover:shadow-blue-900/35 hover:-translate-y-1 transition-all duration-300"
								href="/auth/signup"
								onClick={() =>
									captureClientEvent({
										event: "landing_cta_clicked",
										properties: {
											cta_id: "hero_testar_agora",
											location: "hero",
										},
									})
								}
							>
								<span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
								<span className="relative flex items-center justify-center gap-2">
									TESTAR AGORA
									<ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
								</span>
							</Link>
							<a
								href="#planos"
								onClick={() =>
									captureClientEvent({
										event: "landing_cta_clicked",
										properties: {
											cta_id: "hero_ver_planos",
											location: "hero",
										},
									})
								}
								className="group flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-800 px-8 py-4 rounded-2xl font-bold border-2 border-slate-200 hover:border-[#24549C]/30 transition-all duration-300 shadow-sm hover:shadow-md"
							>
								VER PLANOS
							</a>
						</motion.div>

						{/* Trust indicators */}
						<motion.div
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.6, delay: 0.5 }}
							className="mt-10 flex flex-wrap items-center gap-6"
						>
							{[
								{ icon: "✨", label: "15 dias grátis" },
								{ icon: "📱", label: "Sem app necessário" },
								{ icon: "⚡", label: "Ativo em 24h" },
							].map((item) => (
								<div key={item.label} className="flex items-center gap-2 text-sm text-slate-500 font-medium">
									<span>{item.icon}</span>
									<span>{item.label}</span>
								</div>
							))}
						</motion.div>
					</div>

					{/* Right: Visual */}
					<motion.div
						initial={{ opacity: 0, scale: 0.9 }}
						animate={{ opacity: 1, scale: 1 }}
						transition={{ duration: 0.7, delay: 0.2 }}
						className="relative"
					>
						<HeroVisual />
					</motion.div>
				</div>
			</div>
		</section>
	);
}
