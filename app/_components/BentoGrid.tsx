"use client";

import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { Crown, MessageCircle, Phone, Send, Target, Trophy, Users, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// ════════════════════════════════════════════
// ─── BOX 1: RFM Matrix ───
// ════════════════════════════════════════════

const RFM_SEGMENTS = [
	{ label: "Campeões", x: 0, y: 0, w: 2, h: 2, color: "bg-green-500", textColor: "text-white", count: 128 },
	{ label: "Leais", x: 2, y: 0, w: 2, h: 1, color: "bg-green-400", textColor: "text-white", count: 245 },
	{ label: "Pot. Leais", x: 2, y: 1, w: 1, h: 1, color: "bg-teal-400", textColor: "text-white", count: 89 },
	{ label: "Novos", x: 3, y: 1, w: 1, h: 1, color: "bg-blue-400", textColor: "text-white", count: 56 },
	{ label: "Precisa Atenção", x: 0, y: 2, w: 1, h: 1, color: "bg-amber-300", textColor: "text-amber-900", count: 78 },
	{ label: "Em Risco", x: 1, y: 2, w: 2, h: 1, color: "bg-orange-400", textColor: "text-white", count: 94 },
	{ label: "Prometedores", x: 3, y: 2, w: 1, h: 1, color: "bg-sky-400", textColor: "text-white", count: 42 },
	{ label: "Hibernando", x: 0, y: 3, w: 2, h: 1, color: "bg-yellow-300", textColor: "text-yellow-900", count: 156 },
	{ label: "Perdidos", x: 2, y: 3, w: 2, h: 1, color: "bg-red-400", textColor: "text-white", count: 67 },
];

function RFMMatrixVisual() {
	const [hoveredSegment, setHoveredSegment] = useState<string | null>("Em Risco");
	const [pulsing, setPulsing] = useState(true);

	// Auto-cycle through at-risk / lost segments
	useEffect(() => {
		const riskSegments = ["Em Risco", "Hibernando", "Perdidos", "Precisa Atenção"];
		let idx = 0;
		const interval = setInterval(() => {
			idx = (idx + 1) % riskSegments.length;
			setHoveredSegment(riskSegments[idx]);
		}, 1800);
		return () => clearInterval(interval);
	}, []);

	const cellH = 52;
	const cellW = "25%";

	return (
		<div className="p-4 h-full flex flex-col">
			{/* Header */}
			<div className="flex items-center justify-between mb-3">
				<div className="flex items-center gap-2">
					<div className="w-7 h-7 rounded-lg bg-[#24549C]/10 flex items-center justify-center">
						<Users className="w-3.5 h-3.5 text-[#24549C]" />
					</div>
					<span className="text-xs font-bold text-slate-700">Matriz RFM</span>
				</div>
				<div className="flex items-center gap-1 bg-green-50 border border-green-100 rounded-full px-2 py-0.5">
					<div className="w-1.5 h-1.5 rounded-full bg-green-500" />
					<span className="text-[10px] font-bold text-green-700">957 clientes</span>
				</div>
			</div>

			{/* Axis labels */}
			<div className="flex items-center gap-1 mb-1">
				<div className="text-[9px] text-slate-400 font-medium w-8 text-right pr-1">Alta F →</div>
				<div className="flex-1 flex items-center justify-between px-1">
					<span className="text-[8px] text-slate-300">Baixo R</span>
					<span className="text-[8px] text-slate-300">Alto R</span>
				</div>
			</div>

			{/* Matrix Grid */}
			<div className="flex-1 relative grid grid-cols-4 gap-0.5">
				{RFM_SEGMENTS.map((seg) => (
					<motion.div
						key={seg.label}
						className={cn(
							"relative flex flex-col items-center justify-center rounded-lg cursor-pointer transition-all duration-300 overflow-hidden",
							seg.color,
							seg.x === 0 && seg.w === 2 ? "col-span-2" : "",
							seg.w === 2 && seg.x !== 0 ? "col-span-2" : "",
							seg.h === 2 ? "row-span-2" : "",
						)}
						style={{
							gridColumn: `${seg.x + 1} / span ${seg.w}`,
							gridRow: `${seg.y + 1} / span ${seg.h}`,
							minHeight: `${cellH * seg.h}px`,
						}}
						animate={{
							scale: hoveredSegment === seg.label ? 1.04 : 1,
							filter: hoveredSegment === seg.label ? "brightness(1.15)" : "brightness(1)",
						}}
						transition={{ duration: 0.3 }}
					>
						{hoveredSegment === seg.label && (
							<motion.div
								className="absolute inset-0 rounded-lg ring-2 ring-white ring-offset-1"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
							/>
						)}
						<span className={cn("text-[9px] font-bold text-center leading-tight px-1", seg.textColor)}>{seg.label}</span>
						<span className={cn("text-[11px] font-black", seg.textColor)}>{seg.count}</span>
						{hoveredSegment === seg.label && (
							<motion.div
								className="absolute top-1 right-1"
								initial={{ scale: 0 }}
								animate={{ scale: 1 }}
								transition={{ type: "spring", stiffness: 400 }}
							>
								<Zap className={cn("w-3 h-3", seg.textColor)} />
							</motion.div>
						)}
					</motion.div>
				))}
			</div>

			{/* Active hint */}
			<AnimatePresence mode="wait">
				{hoveredSegment && (
					<motion.div
						key={hoveredSegment}
						initial={{ opacity: 0, y: 4 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -4 }}
						transition={{ duration: 0.2 }}
						className="mt-2 bg-slate-50 rounded-lg px-3 py-1.5 flex items-center justify-between"
					>
						<span className="text-[10px] font-bold text-slate-600">Segmento ativo: {hoveredSegment}</span>
						<span className="text-[10px] font-bold text-[#24549C]">Campanha sugerida →</span>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

// ════════════════════════════════════════════
// ─── BOX 2: WhatsApp Automation ───
// ════════════════════════════════════════════

const TRIGGER_TYPES = ["PRIMEIRA COMPRA", "CASHBACK EXPIRANDO", "CLIENTE EM RISCO", "ANIVERSÁRIO", "45 DIAS SEM COMPRAR"];

function WhatsAppAutomationVisual() {
	const [triggerIdx, setTriggerIdx] = useState(0);
	const [progress, setProgress] = useState(0);
	const [dispatching, setDispatching] = useState(false);

	useEffect(() => {
		const progressInterval = setInterval(() => {
			setProgress((p) => {
				if (p >= 100) {
					setDispatching(true);
					setTimeout(() => {
						setDispatching(false);
						setProgress(0);
						setTriggerIdx((i) => (i + 1) % TRIGGER_TYPES.length);
					}, 800);
					return 100;
				}
				return p + 4;
			});
		}, 80);
		return () => clearInterval(progressInterval);
	}, []);

	return (
		<div className="p-4 h-full flex flex-col gap-3">
			{/* Header */}
			<div className="flex items-center gap-2">
				<div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center">
					<MessageCircle className="w-3.5 h-3.5 text-green-600" />
				</div>
				<span className="text-xs font-bold text-slate-700">Automação WhatsApp</span>
			</div>

			{/* Trigger selector */}
			<div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
				<p className="text-[9px] text-slate-400 uppercase font-bold mb-2">Tipo de Gatilho</p>
				<AnimatePresence mode="wait">
					<motion.div
						key={triggerIdx}
						initial={{ opacity: 0, y: 6 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -6 }}
						transition={{ duration: 0.2 }}
						className="flex items-center gap-2"
					>
						<div className="w-2 h-2 rounded-full bg-[#24549C]" />
						<span className="text-[11px] font-black text-[#24549C]">{TRIGGER_TYPES[triggerIdx]}</span>
					</motion.div>
				</AnimatePresence>

				{/* Progress */}
				<div className="mt-2.5 h-1.5 bg-slate-200 rounded-full overflow-hidden">
					<motion.div
						className="h-full bg-[#24549C] rounded-full"
						style={{ width: `${progress}%` }}
						transition={{ duration: 0.08 }}
					/>
				</div>
				<p className="text-[8px] text-slate-400 mt-1">Disparando mensagem...</p>
			</div>

			{/* Message preview */}
			<div className="flex-1 bg-[#ece5dd] rounded-xl p-3 relative overflow-hidden">
				<div className="absolute top-2 left-3 text-[8px] text-slate-400 font-medium">SEU NÚMERO DE TELEFONE</div>
				<div className="mt-4 bg-white rounded-xl rounded-tl-sm p-2.5 shadow-sm max-w-[90%]">
					<p className="text-[9px] text-slate-700 leading-relaxed">
						{triggerIdx === 0 && "Bem-vindo! Sua primeira compra gerou R$ 12 de cashback 🎉"}
						{triggerIdx === 1 && "Seu cashback de R$ 25 vence em 3 dias. Use agora! ⏰"}
						{triggerIdx === 2 && "Saudades! Volte e ganhe 20% extra no próximo pedido 💛"}
						{triggerIdx === 3 && "Feliz aniversário! Presente especial esperando por você 🎂"}
						{triggerIdx === 4 && "Já faz 45 dias... Liberamos R$ 15 pra você voltar! 🎁"}
					</p>
					<div className="text-[8px] text-slate-400 text-right mt-1">09:00 ✓✓</div>
				</div>

				{/* Dispatch animation */}
				<AnimatePresence>
					{dispatching && (
						<motion.div
							initial={{ opacity: 0, scale: 0.8 }}
							animate={{ opacity: 1, scale: 1 }}
							exit={{ opacity: 0, scale: 0.8 }}
							className="absolute inset-0 flex items-center justify-center bg-green-500/10 backdrop-blur-sm rounded-xl"
						>
							<div className="flex items-center gap-1.5 bg-white rounded-full px-3 py-1.5 shadow-md">
								<Send className="w-3 h-3 text-green-600" />
								<span className="text-[10px] font-bold text-green-700">Enviado!</span>
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</div>
	);
}

// ════════════════════════════════════════════
// ─── BOX 3: POS Flow ───
// ════════════════════════════════════════════

const POS_STEPS = [
	{ step: "01", action: "CLIENTE INFORMA O TELEFONE", icon: Phone, color: "bg-[#24549C]", activeText: "text-[#24549C]" },
	{ step: "02", action: "OPERADOR LANÇA O VALOR DA VENDA", icon: Target, color: "bg-blue-500", activeText: "text-blue-600" },
	{ step: "03", action: "SISTEMA APLICA O CASHBACK", icon: Zap, color: "bg-[#FFB900]", activeText: "text-amber-600" },
	{ step: "04", action: "OPERADOR CONFIRMA COM SENHA", icon: Trophy, color: "bg-green-500", activeText: "text-green-700" },
];

function POSFlowVisual() {
	const [currentStep, setCurrentStep] = useState(0);

	useEffect(() => {
		const interval = setInterval(() => {
			setCurrentStep((s) => (s + 1) % POS_STEPS.length);
		}, 1600);
		return () => clearInterval(interval);
	}, []);

	return (
		<div className="p-4 h-full flex flex-col gap-3">
			{/* Header */}
			<div className="flex items-center gap-2">
				<div className="w-7 h-7 rounded-lg bg-[#FFB900]/15 flex items-center justify-center">
					<Target className="w-3.5 h-3.5 text-[#FFB900]" />
				</div>
				<span className="text-xs font-bold text-slate-700">Ponto de Interação</span>
			</div>

			{/* Steps */}
			<div className="flex-1 flex flex-col gap-2">
				{POS_STEPS.map((step, idx) => {
					const Icon = step.icon;
					const isActive = currentStep === idx;
					const isPast = currentStep > idx;
					return (
						<motion.div
							key={step.step}
							className={cn(
								"flex items-center gap-3 rounded-xl p-3 border transition-all duration-300",
								isActive ? "bg-[#24549C]/5 border-[#24549C]/20 shadow-sm" : isPast ? "bg-green-50 border-green-100" : "bg-slate-50 border-slate-100",
							)}
							animate={{ scale: isActive ? 1.02 : 1 }}
							transition={{ duration: 0.2 }}
						>
							<div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300", isPast ? step.color : isActive ? step.color : "bg-slate-100")}>
								{isPast ? (
									<motion.span
										initial={{ scale: 0 }}
										animate={{ scale: 1 }}
										transition={{ type: "spring" }}
										className="text-white text-[11px] font-black"
									>
										✓
									</motion.span>
								) : isActive ? (
									<Icon className="w-3.5 h-3.5 text-white" />
								) : (
									<span className="text-[10px] font-black text-slate-400">{step.step}</span>
								)}
							</div>
							<div className="flex-1 min-w-0">
								<div className={cn("text-[10px] font-black leading-tight tracking-tight", isActive ? step.activeText : isPast ? "text-green-700" : "text-slate-400")}>
									{step.action}
								</div>
							</div>
						</motion.div>
					);
				})}
			</div>

			{/* Bottom note */}
			<div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 flex items-center gap-2">
				<div className="w-1.5 h-1.5 rounded-full bg-green-500" />
				<span className="text-[9px] text-slate-500 font-medium">Sem filas. Sem senhas esquecidas.</span>
			</div>
		</div>
	);
}

// ════════════════════════════════════════════
// ─── BOX 4: Rankings ───
// ════════════════════════════════════════════

const SELLERS = [
	{ name: "Ana Costa", sales: 42870, target: 40000, rank: 1 },
	{ name: "Carlos Lima", sales: 38450, target: 40000, rank: 2 },
	{ name: "Maria Souza", sales: 31200, target: 35000, rank: 3 },
	{ name: "João Pereira", sales: 28900, target: 35000, rank: 4 },
];

function RankingVisual() {
	const [animatedSales, setAnimatedSales] = useState(SELLERS.map(() => 0));

	useEffect(() => {
		const timeouts = SELLERS.map((s, i) =>
			setTimeout(() => {
				const start = performance.now();
				const animate = (now: number) => {
					const progress = Math.min((now - start) / 1200, 1);
					const eased = 1 - Math.pow(1 - progress, 3);
					setAnimatedSales((prev) => {
						const next = [...prev];
						next[i] = s.sales * eased;
						return next;
					});
					if (progress < 1) requestAnimationFrame(animate);
				};
				requestAnimationFrame(animate);
			}, i * 150),
		);
		return () => timeouts.forEach(clearTimeout);
	}, []);

	const rankColors = ["text-[#FFB900]", "text-slate-400", "text-amber-600", "text-slate-300"];
	const rankBgs = ["bg-[#FFB900]/10", "bg-slate-50", "bg-amber-50", "bg-slate-50"];
	const crownColors = ["text-[#FFB900]", "text-slate-400", "text-amber-600"];

	return (
		<div className="p-4 h-full flex flex-col gap-3">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<div className="w-7 h-7 rounded-lg bg-[#FFB900]/15 flex items-center justify-center">
						<Trophy className="w-3.5 h-3.5 text-[#FFB900]" />
					</div>
					<span className="text-xs font-bold text-slate-700">Ranking de Vendedores</span>
				</div>
				<span className="text-[9px] text-slate-400 font-medium bg-slate-50 border border-slate-100 rounded-full px-2 py-0.5">Este Mês</span>
			</div>

			{/* Seller list */}
			<div className="flex-1 grid grid-cols-2 gap-2">
				{SELLERS.map((seller, idx) => (
					<motion.div
						key={seller.name}
						initial={{ opacity: 0, x: -10 }}
						whileInView={{ opacity: 1, x: 0 }}
						viewport={{ once: true }}
						transition={{ delay: idx * 0.1, duration: 0.3 }}
						className={cn("rounded-xl border border-slate-100 p-3 flex flex-col gap-2", rankBgs[idx])}
					>
						<div className="flex items-center gap-2">
							{idx < 3 ? (
								<Crown className={cn("w-4 h-4 shrink-0", crownColors[idx])} />
							) : (
								<span className="text-xs font-black text-slate-300 w-4 text-center">{idx + 1}</span>
							)}
							<div className="flex-1 min-w-0">
								<p className="text-[10px] font-bold text-slate-800 truncate">{seller.name}</p>
							</div>
						</div>
						<div>
							<p className={cn("text-sm font-black tabular-nums", rankColors[idx])}>
								R${" "}
								{Math.round(animatedSales[idx])
									.toLocaleString("pt-BR")}
							</p>
							<div className="mt-1 h-1 bg-slate-200 rounded-full overflow-hidden">
								<motion.div
									className={cn("h-full rounded-full", idx === 0 ? "bg-[#FFB900]" : idx === 1 ? "bg-slate-400" : idx === 2 ? "bg-amber-500" : "bg-slate-300")}
									initial={{ width: 0 }}
									whileInView={{ width: `${(seller.sales / seller.target) * 100}%` }}
									viewport={{ once: true }}
									transition={{ duration: 1.2, delay: idx * 0.15, ease: "easeOut" }}
								/>
							</div>
							<p className="text-[8px] text-slate-400 mt-0.5">Meta: R$ {seller.target.toLocaleString("pt-BR")}</p>
						</div>
					</motion.div>
				))}
			</div>
		</div>
	);
}

// ════════════════════════════════════════════
// ─── BENTO GRID SECTION ───
// ════════════════════════════════════════════

export default function BentoGrid() {
	return (
		<section id="funcionalidades" className="py-20 lg:py-28 bg-gradient-to-b from-white to-slate-50/60">
			<div className="container mx-auto max-w-7xl px-6 lg:px-8">
				{/* Section header */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.5 }}
					className="text-center mb-14"
				>
					<p className="text-xs font-bold text-[#24549C] uppercase tracking-widest mb-3">Plataforma Completa</p>
					<h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight mb-4">
						Tudo que você precisa para fidelizar clientes
					</h2>
					<p className="text-lg text-slate-500 max-w-2xl mx-auto">
						Módulos integrados que trabalham juntos para maximizar a retenção e o faturamento do seu varejo.
					</p>
				</motion.div>

				{/* Bento grid: 3 cols */}
				<div className="grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-fr">
					{/* Box 1: RFM Matrix — large, spans 2 cols */}
					<motion.div
						initial={{ opacity: 0, y: 24 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={{ once: true }}
						transition={{ duration: 0.4, delay: 0 }}
						className="md:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden min-h-[340px]"
					>
						<div className="h-full flex flex-col">
							<RFMMatrixVisual />
							<div className="px-4 pb-4 pt-2 border-t border-slate-50">
								<h3 className="text-base font-bold text-slate-900 mb-1">Matriz RFM Dinâmica</h3>
								<p className="text-sm text-slate-500 leading-relaxed">
									Nossa IA segmenta seus clientes do "Campeão" ao "Perdido" e dispara ações automáticas para cada grupo.
								</p>
							</div>
						</div>
					</motion.div>

					{/* Box 2: WhatsApp Automation — 1 col */}
					<motion.div
						initial={{ opacity: 0, y: 24 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={{ once: true }}
						transition={{ duration: 0.4, delay: 0.1 }}
						className="bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden min-h-[340px]"
					>
						<div className="h-full flex flex-col">
							<WhatsAppAutomationVisual />
							<div className="px-4 pb-4 pt-2 border-t border-slate-50">
								<h3 className="text-base font-bold text-slate-900 mb-1">Automação de WhatsApp</h3>
								<p className="text-sm text-slate-500 leading-relaxed">Gatilhos inteligentes. A mensagem certa, para o cliente certo, na hora certa.</p>
							</div>
						</div>
					</motion.div>

					{/* Box 3: POS Flow — 1 col */}
					<motion.div
						initial={{ opacity: 0, y: 24 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={{ once: true }}
						transition={{ duration: 0.4, delay: 0.2 }}
						className="bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden min-h-[320px]"
					>
						<div className="h-full flex flex-col">
							<POSFlowVisual />
							<div className="px-4 pb-4 pt-2 border-t border-slate-50">
								<h3 className="text-base font-bold text-slate-900 mb-1">Operação à Prova de Falhas</h3>
								<p className="text-sm text-slate-500 leading-relaxed">Feito para a correria do balcão. Em 4 passos rápidos, sem senhas esquecidas.</p>
							</div>
						</div>
					</motion.div>

					{/* Box 4: Rankings — spans 2 cols */}
					<motion.div
						initial={{ opacity: 0, y: 24 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={{ once: true }}
						transition={{ duration: 0.4, delay: 0.3 }}
						className="md:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden min-h-[320px]"
					>
						<div className="h-full flex flex-col">
							<RankingVisual />
							<div className="px-4 pb-4 pt-2 border-t border-slate-50">
								<h3 className="text-base font-bold text-slate-900 mb-1">Metas & Comissionamento</h3>
								<p className="text-sm text-slate-500 leading-relaxed">
									Alinhe sua equipe com metas transparentes e rankings em tempo real. Cada vendedor sabe exatamente onde está.
								</p>
							</div>
						</div>
					</motion.div>
				</div>
			</div>
		</section>
	);
}
