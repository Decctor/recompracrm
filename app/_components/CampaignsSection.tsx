"use client";

import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ChevronDown, Clock, MessageCircle, Send, X, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// ════════════════════════════════════════════
// ─── CAMPAIGN RULE BUILDER ANIMATION ───
// ════════════════════════════════════════════

type AnimStep = "empty" | "trigger" | "filter" | "action" | "bonus" | "success";

const ANIM_STEPS: AnimStep[] = ["empty", "trigger", "filter", "action", "bonus", "success"];

const STEP_DURATIONS: Record<AnimStep, number> = {
	empty: 1000,
	trigger: 2200,
	filter: 2000,
	action: 2600,
	bonus: 2200,
	success: 3200,
};

const TRIGGER_TEXT = "Primeira Compra";
const DELAYS = ["Imediatamente", "Aguardar 1 dia", "Aguardar 2 dias", "Aguardar 3 dias"];
const FILTER_TAGS = ["Novos Clientes", "Promissores", "Leais"];

function CampaignRuleBuilder() {
	const [step, setStep] = useState<AnimStep>("empty");
	const [triggerTyped, setTriggerTyped] = useState("");
	const [delayIdx, setDelayIdx] = useState(0);
	const [toggleOn, setToggleOn] = useState(false);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Advance through animation states
	useEffect(() => {
		timeoutRef.current = setTimeout(() => {
			setStep((prev) => {
				const idx = ANIM_STEPS.indexOf(prev);
				const next = ANIM_STEPS[(idx + 1) % ANIM_STEPS.length];
				if (next === "empty") {
					setTriggerTyped("");
					setDelayIdx(0);
					setToggleOn(false);
				}
				return next;
			});
		}, STEP_DURATIONS[step]);
		return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
	}, [step]);

	// Typewriter for trigger
	useEffect(() => {
		if (step !== "trigger") return;
		setTriggerTyped("");
		let i = 0;
		const iv = setInterval(() => {
			i++;
			setTriggerTyped(TRIGGER_TEXT.slice(0, i));
			if (i >= TRIGGER_TEXT.length) clearInterval(iv);
		}, 65);
		return () => clearInterval(iv);
	}, [step]);

	// Delay spinner for action
	useEffect(() => {
		if (step !== "action") return;
		setDelayIdx(0);
		let i = 0;
		const iv = setInterval(() => {
			i++;
			if (i < DELAYS.length) setDelayIdx(i);
			else clearInterval(iv);
		}, 420);
		return () => clearInterval(iv);
	}, [step]);

	// Toggle for bonus
	useEffect(() => {
		if (step === "bonus") {
			const t = setTimeout(() => setToggleOn(true), 700);
			return () => clearTimeout(t);
		}
		if (step === "empty") setToggleOn(false);
	}, [step]);

	const hasTrigger = step !== "empty";
	const hasFilter = ["filter", "action", "bonus", "success"].includes(step);
	const hasAction = ["action", "bonus", "success"].includes(step);
	const hasBonus = ["bonus", "success"].includes(step);
	const isSuccess = step === "success";

	return (
		<div className="bg-white border border-slate-200 rounded-2xl shadow-lg overflow-hidden">
			{/* Success banner — slides in from top */}
			<AnimatePresence>
				{isSuccess && (
					<motion.div
						key="success-banner"
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.3 }}
						className="overflow-hidden"
					>
						<div className="bg-green-500 flex items-center gap-2 px-4 py-2.5">
							<motion.div
								animate={{ scale: [1, 1.25, 1] }}
								transition={{ duration: 0.7, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
							>
								<CheckCircle2 className="w-4 h-4 text-white" />
							</motion.div>
							<span className="text-sm font-bold text-white">Campanha Ativada com sucesso!</span>
						</div>
					</motion.div>
				)}
			</AnimatePresence>

			{/* Card header */}
			<div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/40">
				<div className="flex items-center gap-2">
					<div className="w-7 h-7 rounded-lg bg-[#24549C]/10 flex items-center justify-center">
						<Zap className="w-3.5 h-3.5 text-[#24549C]" />
					</div>
					<span className="text-sm font-bold text-slate-700">Campanha Automática</span>
				</div>
				<motion.div
					animate={{
						backgroundColor: isSuccess ? "rgb(240,253,244)" : "rgb(248,250,252)",
						borderColor: isSuccess ? "rgb(187,247,208)" : "rgb(226,232,240)",
						color: isSuccess ? "rgb(21,128,61)" : "rgb(148,163,184)",
					}}
					transition={{ duration: 0.4 }}
					className="flex items-center gap-1.5 rounded-full px-2.5 py-1 border text-[10px] font-bold"
				>
					<motion.div
						className="w-1.5 h-1.5 rounded-full"
						animate={{ backgroundColor: isSuccess ? "rgb(34,197,94)" : "rgb(203,213,225)" }}
						transition={{ duration: 0.4 }}
					/>
					{isSuccess ? "Ativa" : "Rascunho"}
				</motion.div>
			</div>

			{/* Body — 4 rows */}
			<div className="p-4 space-y-4">

				{/* ── ROW 1: QUANDO ACONTECER ── */}
				<div>
					<p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Quando Acontecer</p>
					<div className="relative h-10">
						<AnimatePresence>
							{!hasTrigger && (
								<motion.div
									key="trigger-empty"
									exit={{ opacity: 0 }}
									className="absolute inset-0 bg-slate-50 border border-dashed border-slate-200 rounded-xl"
								/>
							)}
							{hasTrigger && (
								<motion.div
									key="trigger-filled"
									initial={{ opacity: 0, y: 6 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ duration: 0.25 }}
									className="absolute inset-0 flex items-center gap-2 bg-[#24549C]/5 border border-[#24549C]/20 rounded-xl px-3"
								>
									<div className="w-2 h-2 rounded-full bg-[#24549C] shrink-0" />
									<span className="text-xs font-bold text-[#24549C] flex-1">
										{triggerTyped}
										{step === "trigger" && triggerTyped.length < TRIGGER_TEXT.length && (
											<span className="animate-pulse text-[#24549C]/40">|</span>
										)}
									</span>
									<ChevronDown className="w-3.5 h-3.5 text-[#24549C]/50 shrink-0" />
								</motion.div>
							)}
						</AnimatePresence>
					</div>
				</div>

				{/* ── ROW 2: PARA OS CLIENTES ── */}
				<div>
					<p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Para os Clientes</p>
					<div className="relative min-h-[36px]">
						{!hasFilter && (
							<div className="absolute inset-0 bg-slate-50 border border-dashed border-slate-200 rounded-xl" />
						)}
						<div className="flex flex-wrap gap-1.5 items-center">
							<AnimatePresence>
								{hasFilter &&
									FILTER_TAGS.map((tag, idx) => (
										<motion.div
											key={tag}
											initial={{ opacity: 0, scale: 0.7 }}
											animate={{ opacity: 1, scale: 1 }}
											transition={{ delay: idx * 0.12, type: "spring", stiffness: 380, damping: 22 }}
											className="flex items-center gap-1.5 bg-slate-800 text-white rounded-lg px-2.5 py-1.5"
										>
											<span className="text-[9px] font-bold">{tag}</span>
											<X className="w-2.5 h-2.5 text-white/50" />
										</motion.div>
									))}
							</AnimatePresence>
						</div>
					</div>
				</div>

				{/* ── ROW 3: AÇÃO IMEDIATA ── */}
				<div>
					<p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Ação Imediata</p>
					<div className="relative" style={{ minHeight: 84 }}>
						<AnimatePresence>
							{!hasAction && (
								<motion.div
									key="action-empty"
									exit={{ opacity: 0 }}
									className="absolute inset-0 bg-slate-50 border border-dashed border-slate-200 rounded-xl"
								/>
							)}
							{hasAction && (
								<motion.div
									key="action-filled"
									initial={{ opacity: 0, y: 6 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ duration: 0.25 }}
									className="bg-green-50 border border-green-100 rounded-xl p-3 space-y-2.5"
								>
									{/* Channel */}
									<div className="flex items-center gap-2">
										<div className="w-5 h-5 rounded-full bg-[#25D366] flex items-center justify-center shrink-0">
											<MessageCircle className="w-3 h-3 text-white" />
										</div>
										<span className="text-[9px] text-slate-500 font-medium">WhatsApp Business</span>
									</div>
									{/* Delay */}
									<div className="flex items-center gap-2">
										<Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
										<AnimatePresence mode="wait">
											<motion.span
												key={delayIdx}
												initial={{ opacity: 0, y: 4 }}
												animate={{ opacity: 1, y: 0 }}
												exit={{ opacity: 0, y: -4 }}
												transition={{ duration: 0.15 }}
												className="text-[10px] font-bold text-[#24549C]"
											>
												{DELAYS[delayIdx]}
											</motion.span>
										</AnimatePresence>
									</div>
									{/* Template */}
									<div className="flex items-center gap-2">
										<Send className="w-3.5 h-3.5 text-green-600 shrink-0" />
										<span className="text-[10px] text-slate-600">
											Enviar Template:{" "}
											<span className="font-black text-green-700">Boas Vindas</span>
										</span>
									</div>
								</motion.div>
							)}
						</AnimatePresence>
					</div>
				</div>

				{/* ── ROW 4: BÔNUS DE RETENÇÃO ── */}
				<div>
					<div className="flex items-center justify-between mb-1.5">
						<p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Bônus de Retenção</p>
						<AnimatePresence>
							{hasBonus && (
								<motion.div
									initial={{ opacity: 0, scale: 0.8 }}
									animate={{ opacity: 1, scale: 1 }}
									className={cn(
										"w-9 h-5 rounded-full relative shrink-0 transition-colors duration-400",
										toggleOn ? "bg-green-500" : "bg-slate-200",
									)}
								>
									<motion.div
										className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm"
										animate={{ left: toggleOn ? 18 : 2 }}
										transition={{ type: "spring", stiffness: 500, damping: 30 }}
									/>
								</motion.div>
							)}
						</AnimatePresence>
					</div>
					<div className="relative h-10">
						<AnimatePresence>
							{(!hasBonus || !toggleOn) && (
								<motion.div
									key="bonus-empty"
									exit={{ opacity: 0 }}
									className="absolute inset-0 bg-slate-50 border border-dashed border-slate-200 rounded-xl"
								/>
							)}
							{hasBonus && toggleOn && (
								<motion.div
									key="bonus-filled"
									initial={{ opacity: 0, scale: 0.95 }}
									animate={{ opacity: 1, scale: 1 }}
									transition={{ type: "spring", stiffness: 320, damping: 24 }}
									className="absolute inset-0 flex items-center gap-2 bg-[#FFB900]/10 border border-[#FFB900]/30 rounded-xl px-3"
								>
									<span className="text-sm font-black text-[#FFB900]">✓</span>
									<span className="text-[10px] font-bold text-slate-700">
										Gerar Cashback:{" "}
										<span className="font-black text-[#FFB900]">25%</span>
									</span>
									<span className="text-[9px] text-slate-400 ml-auto whitespace-nowrap">Expira em 15 dias</span>
								</motion.div>
							)}
						</AnimatePresence>
					</div>
				</div>
			</div>
		</div>
	);
}

// ════════════════════════════════════════════
// ─── CONVERSION FUNNEL ───
// ════════════════════════════════════════════

const FUNNEL_STAGES = [
	{ label: "Enviados", value: 312, color: "bg-[#24549C]", textColor: "text-[#24549C]", icon: Send, pct: 100 },
	{ label: "Entregues", value: 298, color: "bg-blue-400", textColor: "text-blue-500", icon: MessageCircle, pct: 95 },
	{ label: "Lidos", value: 241, color: "bg-[#FFB900]", textColor: "text-[#FFB900]", icon: Zap, pct: 77 },
	{ label: "Convertidos", value: 67, color: "bg-green-500", textColor: "text-green-600", icon: CheckCircle2, pct: 21 },
];

function ConversionFunnelPanel() {
	return (
		<div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/50">
				<div className="flex items-center gap-2">
					<div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center">
						<Zap className="w-3.5 h-3.5 text-green-600" />
					</div>
					<span className="text-sm font-bold text-slate-700">Funil de Conversão</span>
				</div>
				<span className="text-[10px] text-slate-400 font-medium bg-slate-50 border border-slate-100 rounded-full px-2 py-0.5">Últimos 30 dias</span>
			</div>

			{/* Funnel stages */}
			<div className="p-4 space-y-2.5">
				{FUNNEL_STAGES.map((stage, idx) => {
					const Icon = stage.icon;
					return (
						<motion.div
							key={stage.label}
							initial={{ opacity: 0, x: 10 }}
							whileInView={{ opacity: 1, x: 0 }}
							viewport={{ once: true }}
							transition={{ delay: idx * 0.1, duration: 0.3 }}
						>
							<div className="flex items-center gap-2 mb-1">
								<Icon className={cn("w-3.5 h-3.5 shrink-0", stage.textColor)} />
								<span className="text-xs font-bold text-slate-600 flex-1">{stage.label}</span>
								<span className={cn("text-sm font-black", stage.textColor)}>{stage.value}</span>
								<span className="text-[10px] text-slate-400 font-medium w-9 text-right">{stage.pct}%</span>
							</div>
							<div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
								<motion.div
									className={cn("h-full rounded-full", stage.color)}
									initial={{ width: 0 }}
									whileInView={{ width: `${stage.pct}%` }}
									viewport={{ once: true }}
									transition={{ duration: 0.9, delay: idx * 0.13, ease: "easeOut" }}
								/>
							</div>
						</motion.div>
					);
				})}
			</div>

			{/* Conversion summary */}
			<div className="mx-4 mb-4 bg-green-50 border border-green-100 rounded-xl p-3">
				<p className="text-[9px] font-black text-green-700 uppercase tracking-wide mb-2">Resultado da Campanha</p>
				<div className="grid grid-cols-3 gap-2">
					<div className="text-center">
						<p className="text-sm font-black text-green-700">21,5%</p>
						<p className="text-[9px] text-green-600">Conversão</p>
					</div>
					<div className="text-center">
						<p className="text-sm font-black text-[#24549C]">R$ 8.4k</p>
						<p className="text-[9px] text-slate-500">Receita gerada</p>
					</div>
					<div className="text-center">
						<p className="text-sm font-black text-[#FFB900]">126x</p>
						<p className="text-[9px] text-slate-500">ROI</p>
					</div>
				</div>
			</div>
		</div>
	);
}

// ════════════════════════════════════════════
// ─── SECTION ───
// ════════════════════════════════════════════

export default function CampaignsSection() {
	return (
		<section id="campanhas" className="py-20 lg:py-28 bg-slate-50/60 relative overflow-hidden">
			<div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
			<div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

			<div className="container mx-auto max-w-7xl px-6 lg:px-8">
				<div className="grid lg:grid-cols-2 gap-16 items-start">
					{/* Left: Copy */}
					<motion.div
						initial={{ opacity: 0, x: -30 }}
						whileInView={{ opacity: 1, x: 0 }}
						viewport={{ once: true }}
						transition={{ duration: 0.6 }}
						className="lg:sticky lg:top-24"
					>
						<div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#24549C]/10 border border-[#24549C]/20 text-[#24549C] text-sm font-bold mb-6">
							<Send className="w-4 h-4" />
							Marketing de Precisão
						</div>
						<h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 leading-tight mb-6 tracking-tight">
							Recuperação de vendas{" "}
							<span className="text-transparent bg-clip-text bg-gradient-to-r from-[#24549C] to-blue-500">sem esforço manual.</span>
						</h2>
						<p className="text-lg text-slate-600 leading-relaxed mb-8">
							Crie campanhas baseadas em eventos reais do cliente. Ofereça um{" "}
							<span className="font-semibold text-slate-800">"giftback" automático de 25%</span> com validade curta para quem acabou de fazer a primeira compra
							e garanta o retorno imediato.
						</p>

						<div className="space-y-3 mb-8">
							{[
								{ title: "Gatilho por evento", desc: "Disparos baseados em ações reais: primeira compra, inatividade, aniversário." },
								{ title: "Sem intervenção humana", desc: "Configure a regra uma vez. O sistema executa 24/7 no piloto automático." },
								{ title: "ROI rastreável", desc: "Veja exatamente quais campanhas geraram retorno e quanto de receita." },
							].map((benefit, idx) => (
								<motion.div
									key={benefit.title}
									initial={{ opacity: 0, x: -16 }}
									whileInView={{ opacity: 1, x: 0 }}
									viewport={{ once: true }}
									transition={{ delay: idx * 0.1, duration: 0.4 }}
									className="flex items-start gap-3"
								>
									<div className="w-5 h-5 rounded-full bg-[#24549C] flex items-center justify-center shrink-0 mt-0.5">
										<Zap className="w-2.5 h-2.5 text-white" />
									</div>
									<div>
										<span className="text-sm font-bold text-slate-800">{benefit.title}: </span>
										<span className="text-sm text-slate-500">{benefit.desc}</span>
									</div>
								</motion.div>
							))}
						</div>

						<motion.button
							whileHover={{ scale: 1.02 }}
							whileTap={{ scale: 0.98 }}
							type="button"
							className="bg-[#24549C] text-white px-8 py-4 rounded-2xl font-bold text-base shadow-xl shadow-blue-900/20 hover:bg-[#1e4682] transition-colors"
						>
							Ver Demonstração Completa
						</motion.button>
					</motion.div>

					{/* Right: Rule builder + funnel */}
					<motion.div
						initial={{ opacity: 0, x: 30 }}
						whileInView={{ opacity: 1, x: 0 }}
						viewport={{ once: true }}
						transition={{ duration: 0.6, delay: 0.2 }}
						className="flex flex-col gap-4"
					>
						<CampaignRuleBuilder />
						<ConversionFunnelPanel />
					</motion.div>
				</div>
			</div>
		</section>
	);
}
