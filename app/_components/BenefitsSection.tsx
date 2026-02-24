"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { BarChart3, Brain, CheckCircle2, MessageCircle, Shield, Smartphone, Sparkles, Zap } from "lucide-react";
import { useEffect, useState } from "react";

// ─── Animated Visual Components ───

function AnimatedSpeedometer() {
	const [progress, setProgress] = useState(0);

	useEffect(() => {
		const timer = setTimeout(() => setProgress(85), 500);
		return () => clearTimeout(timer);
	}, []);

	return (
		<div className="relative w-20 h-20">
			{/* Background circle */}
			<svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
				<circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8" className="text-white/5" />
				<motion.circle
					cx="50"
					cy="50"
					r="40"
					fill="none"
					stroke="url(#gradient)"
					strokeWidth="8"
					strokeLinecap="round"
					strokeDasharray={251.2}
					initial={{ strokeDashoffset: 251.2 }}
					animate={{ strokeDashoffset: 251.2 - (251.2 * progress) / 100 }}
					transition={{ duration: 1.5, ease: "easeOut", delay: 0.3 }}
				/>
				<defs>
					<linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
						<stop offset="0%" stopColor="#24549C" />
						<stop offset="100%" stopColor="#60a5fa" />
					</linearGradient>
				</defs>
			</svg>
			{/* Center icon */}
			<div className="absolute inset-0 flex items-center justify-center">
				<Zap className="w-6 h-6 text-[#24549C]" />
			</div>
		</div>
	);
}

function AnimatedChat() {
	const [visibleMessages, setVisibleMessages] = useState(0);

	useEffect(() => {
		const interval = setInterval(() => {
			setVisibleMessages((prev) => (prev >= 3 ? 0 : prev + 1));
		}, 1200);
		return () => clearInterval(interval);
	}, []);

	return (
		<div className="flex flex-col gap-1.5 w-full max-w-[140px]">
			<motion.div
				initial={{ opacity: 0, x: -10 }}
				animate={{ opacity: visibleMessages >= 1 ? 1 : 0.3, x: 0 }}
				className="bg-green-500/20 rounded-lg rounded-tl-sm px-2.5 py-1.5 self-start"
			>
				<div className="text-[0.5rem] text-green-400">Oi! Você tem R$ 25 de cashback</div>
			</motion.div>
			<motion.div
				initial={{ opacity: 0, x: 10 }}
				animate={{ opacity: visibleMessages >= 2 ? 1 : 0.3, x: 0 }}
				className="bg-white/10 rounded-lg rounded-tr-sm px-2.5 py-1.5 self-end"
			>
				<div className="text-[0.5rem] text-white/70">Vou passar na loja!</div>
			</motion.div>
			<motion.div
				initial={{ opacity: 0, x: -10 }}
				animate={{ opacity: visibleMessages >= 3 ? 1 : 0.3, x: 0 }}
				className="flex items-center gap-1 self-start"
			>
				<CheckCircle2 className="w-3 h-3 text-green-400" />
				<span className="text-[0.45rem] text-green-400/70">Reativado automaticamente</span>
			</motion.div>
		</div>
	);
}

function AnimatedBrain() {
	return (
		<div className="relative">
			<motion.div
				className="absolute inset-0 bg-purple-500/20 blur-xl rounded-full"
				animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
				transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
			/>
			<div className="relative bg-purple-500/10 border border-purple-500/20 rounded-2xl p-4">
				<Brain className="w-8 h-8 text-purple-400" />
			</div>
			{/* Floating sparkles */}
			<motion.div
				className="absolute -top-1 -right-1"
				animate={{ y: [-2, 2, -2], rotate: [0, 10, 0] }}
				transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
			>
				<Sparkles className="w-4 h-4 text-yellow-400" />
			</motion.div>
		</div>
	);
}

function MiniDashboard() {
	return (
		<div className="bg-white border border-slate-200 shadow-sm rounded-lg p-3 w-full max-w-[160px]">
			{/* Mini header */}
			<div className="flex items-center gap-1.5 mb-3">
				<div className="w-2 h-2 rounded-full bg-red-400" />
				<div className="w-2 h-2 rounded-full bg-yellow-400" />
				<div className="w-2 h-2 rounded-full bg-green-400" />
			</div>
			{/* Mini bars */}
			<div className="flex items-end gap-1.5 h-12 mb-2">
				{[40, 65, 45, 80, 55, 70, 90].map((height, i) => (
					<motion.div
						key={i}
						className="flex-1 bg-gradient-to-t from-blue-600 to-blue-300 rounded-sm"
						initial={{ height: 0 }}
						animate={{ height: `${height}%` }}
						transition={{ delay: i * 0.1, duration: 0.5 }}
					/>
				))}
			</div>
			{/* Mini stats */}
			<div className="flex justify-between text-[0.5rem] font-medium text-slate-400">
				<span>Seg</span>
				<span>Dom</span>
			</div>
		</div>
	);
}

// ─── Bento Card Components ───

interface BentoCardProps {
	className?: string;
	children: React.ReactNode;
	title: string;
	description: string;
	size: "large" | "medium" | "small";
}

function BentoCard({ className, children, title, description, size }: BentoCardProps) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-50px" }}
			transition={{ duration: 0.5 }}
			className={cn(
				"group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:border-[#24549C]/30 hover:shadow-lg hover:shadow-blue-900/5",
				size === "large" && "md:col-span-2 md:row-span-2",
				size === "medium" && "md:col-span-1 md:row-span-2",
				className,
			)}
		>
			{/* Content */}
			<div className={cn("flex h-full relative z-10", size === "large" ? "flex-col md:flex-row md:items-center gap-6" : "flex-col gap-4")}>
				{/* Visual */}
				<div className={cn("flex items-center justify-center shrink-0", size === "large" && "md:w-1/2", size === "small" && "mb-2")}>{children}</div>

				{/* Text */}
				<div className={cn(size === "large" && "md:w-1/2")}>
					<h3 className={cn("font-bold text-slate-900 mb-2", size === "large" ? "text-xl md:text-2xl" : size === "medium" ? "text-lg" : "text-base")}>
						{title}
					</h3>
					<p className={cn("text-slate-600 font-medium leading-relaxed", size === "large" ? "text-base" : "text-sm")}>{description}</p>
				</div>
			</div>

			{/* Subtle gradient overlay on hover */}
			<div className="absolute inset-0 bg-gradient-to-br from-slate-50/0 to-slate-50/0 group-hover:from-blue-50/50 group-hover:to-transparent transition-all duration-500 pointer-events-none" />
		</motion.div>
	);
}

function SmallBentoCard({
	icon: Icon,
	title,
	description,
	accentColor = "#24549C",
}: {
	icon: React.ElementType;
	title: string;
	description: string;
	accentColor?: string;
}) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-50px" }}
			transition={{ duration: 0.5 }}
			className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:border-[#24549C]/30 hover:shadow-lg hover:shadow-blue-900/5"
		>
			<div className="flex items-start gap-4 relative z-10">
				<div
					className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110"
					style={{ backgroundColor: `${accentColor}15` }}
				>
					<Icon className="w-5 h-5" style={{ color: accentColor }} />
				</div>
				<div>
					<h3 className="font-bold text-slate-900 mb-1">{title}</h3>
					<p className="text-sm font-medium text-slate-600 leading-relaxed">{description}</p>
				</div>
			</div>
			{/* Subtle gradient overlay on hover */}
			<div className="absolute inset-0 bg-gradient-to-br from-slate-50/0 to-slate-50/0 group-hover:from-blue-50/50 group-hover:to-transparent transition-all duration-500 pointer-events-none" />
		</motion.div>
	);
}

// ─── Exported Section ───

export default function BenefitsSection() {
	return (
		<section className="py-24 bg-slate-50 border-y border-black/5 overflow-hidden">
			<div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
				{/* Header */}
				<motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
					<div className="inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-[#24549C] text-sm font-bold mb-6">
						<Sparkles className="w-4 h-4" />A Plataforma Completa
					</div>
					<h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 mb-6 leading-tight">Por que escolher o RecompraCRM?</h2>
					<p className="text-lg text-slate-600 font-medium max-w-2xl mx-auto">
						Tudo que você precisa para aumentar recompra. Em uma só plataforma fácil de usar.
					</p>
				</motion.div>

				{/* Bento Grid */}
				<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
					{/* Row 1: Large + Medium */}
					<BentoCard
						size="large"
						title="Comece em minutos"
						description="Sem integração obrigatória. Cadastre sua primeira venda hoje e veja o sistema funcionando. Nada de semanas de implantação."
					>
						<AnimatedSpeedometer />
					</BentoCard>

					<BentoCard
						size="medium"
						title="IA que sugere ações"
						description="Receba dicas práticas baseadas nos seus dados reais. Não em achismo ou intuição."
					>
						<AnimatedBrain />
					</BentoCard>

					{/* Row 2: Small cards */}
					<SmallBentoCard
						icon={Smartphone}
						title="Tablet no balcão"
						description="Interface POI inclusa. Cliente vê o saldo na hora."
						accentColor="#22c55e"
					/>

					<SmallBentoCard icon={Shield} title="Sem surpresas" description="Preço fixo mensal. Cancele quando quiser." accentColor="#f59e0b" />

					{/* Row 3: Medium + Large */}
					<BentoCard
						size="medium"
						title="WhatsApp automático"
						description="Campanhas de reativação que rodam sozinhas. Você configura uma vez, o sistema trabalha 24/7."
					>
						<AnimatedChat />
					</BentoCard>

					<BentoCard
						size="large"
						title="Dashboard completo"
						description="Vendas, produtos, vendedores, clientes. Tudo em uma tela. Visualize a saúde do seu negócio em tempo real."
					>
						<MiniDashboard />
					</BentoCard>
				</div>
			</div>
		</section>
	);
}
