"use client";

import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import {
	AlertTriangle,
	ArrowLeft,
	ArrowRight,
	BadgePercent,
	CheckCircle2,
	ChevronRight,
	Clock,
	Grid3X3,
	MessageCircle,
	Send,
	Sparkles,
	UserRound,
	Wallet,
	Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types & Constants ───

type RFMView = "overview" | "segment" | "action";

const VIEW_DURATIONS: Record<RFMView, number> = {
	overview: 5000,
	segment: 5500,
	action: 6000,
};

const VIEWS: RFMView[] = ["overview", "segment", "action"];

const RFM_SEGMENTS = [
	{ id: "campeoes", label: "CAMPEÕES", value: 128, color: "green", description: "Compram frequente, gastam muito" },
	{ id: "leais", label: "LEAIS", value: 450, color: "blue", description: "Bom histórico, compra regular" },
	{ id: "em_risco", label: "EM RISCO", value: 89, color: "yellow", description: "Podem estar abandonando" },
	{ id: "novos", label: "NOVOS", value: 312, color: "purple", description: "Compraram recentemente" },
];

const AT_RISK_CLIENTS = [
	{ name: "Maria Silva", phone: "(34) 99876-5432", days: 45, lastValue: 287 },
	{ name: "João Santos", phone: "(34) 98765-4321", days: 38, lastValue: 156 },
	{ name: "Ana Costa", phone: "(34) 97654-3210", days: 52, lastValue: 423 },
	{ name: "Pedro Lima", phone: "(34) 96543-2109", days: 41, lastValue: 198 },
	{ name: "Carla Dias", phone: "(34) 95432-1098", days: 35, lastValue: 312 },
];

// ─── Hooks ───

function useAnimatedCounter(target: number, duration: number, active: boolean, delay = 0) {
	const [value, setValue] = useState(0);
	const rafRef = useRef<number | null>(null);

	useEffect(() => {
		if (!active) {
			setValue(0);
			return;
		}

		const timeout = setTimeout(() => {
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
		}, delay);

		return () => {
			clearTimeout(timeout);
			if (rafRef.current) cancelAnimationFrame(rafRef.current);
		};
	}, [target, duration, active, delay]);

	return value;
}

// ─── Overview View: RFM Grid ───

function OverviewView({ active }: { active: boolean }) {
	const [highlightedSegment, setHighlightedSegment] = useState<string | null>(null);
	const [showHint, setShowHint] = useState(false);

	// Animated counters for each segment
	const campeoes = useAnimatedCounter(128, 1200, active, 200);
	const leais = useAnimatedCounter(450, 1200, active, 400);
	const emRisco = useAnimatedCounter(89, 1200, active, 600);
	const novos = useAnimatedCounter(312, 1200, active, 800);

	const values: Record<string, number> = { campeoes, leais, em_risco: emRisco, novos };

	useEffect(() => {
		if (!active) {
			setHighlightedSegment(null);
			setShowHint(false);
			return;
		}
		// Highlight "Em Risco" after counters finish
		const highlightTimer = setTimeout(() => setHighlightedSegment("em_risco"), 2500);
		const hintTimer = setTimeout(() => setShowHint(true), 3500);
		return () => {
			clearTimeout(highlightTimer);
			clearTimeout(hintTimer);
		};
	}, [active]);

	const getColorClasses = (color: string, isHighlighted: boolean) => {
		const base = {
			green: {
				text: "text-green-400",
				bg: "bg-green-400/10",
				border: isHighlighted ? "border-green-400/50 bg-green-400/5" : "border-white/5",
			},
			blue: {
				text: "text-blue-400",
				bg: "bg-blue-400/10",
				border: isHighlighted ? "border-blue-400/50 bg-blue-400/5" : "border-white/5",
			},
			yellow: {
				text: "text-yellow-400",
				bg: "bg-yellow-400/10",
				border: isHighlighted ? "border-yellow-400/50 bg-yellow-400/5" : "border-white/5",
			},
			purple: {
				text: "text-purple-400",
				bg: "bg-purple-400/10",
				border: isHighlighted ? "border-purple-400/50 bg-purple-400/5" : "border-white/5",
			},
		};
		return base[color as keyof typeof base] || base.green;
	};

	return (
		<div className="flex flex-col h-full">
			{/* Header */}
			<div className="flex items-center gap-2 px-2 py-1.5 bg-white/[0.02] border-b border-white/5 rounded-t-lg mb-2">
				<Grid3X3 className="w-3 h-3 text-[#FFB900]" />
				<span className="text-[0.5rem] font-bold text-white/70 uppercase tracking-wider">Matriz RFM</span>
				<span className="ml-auto text-[0.35rem] text-white/40 bg-white/5 px-1.5 py-0.5 rounded">979 clientes</span>
			</div>

			{/* RFM Grid */}
			<div className="grid grid-cols-2 gap-2 px-1 flex-1">
				{RFM_SEGMENTS.map((segment, idx) => {
					const isHighlighted = highlightedSegment === segment.id;
					const colors = getColorClasses(segment.color, isHighlighted);

					return (
						<motion.div
							key={segment.id}
							initial={{ opacity: 0, scale: 0.9 }}
							animate={{ opacity: 1, scale: isHighlighted ? 1.03 : 1 }}
							transition={{ delay: idx * 0.1, duration: 0.4 }}
							className={cn(
								"bg-zinc-800/50 p-2.5 rounded-xl border text-center transition-all duration-300 relative",
								colors.border,
								segment.id === "em_risco" && isHighlighted && "ring-1 ring-yellow-400/30",
							)}
						>
							{/* Pulse indicator for highlighted */}
							{isHighlighted && segment.id === "em_risco" && (
								<motion.div
									className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-yellow-400 rounded-full"
									animate={{ scale: [1, 1.3, 1] }}
									transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY }}
								/>
							)}

							<div className={cn("text-lg font-black text-white mb-0.5 tabular-nums", isHighlighted && "text-[#FFB900]")}>{values[segment.id]}</div>
							<div className={cn("text-[0.45rem] font-bold py-0.5 px-1.5 rounded-full inline-block", colors.text, colors.bg)}>{segment.label}</div>
						</motion.div>
					);
				})}
			</div>

			{/* Hint to click */}
			<AnimatePresence>
				{showHint && (
					<motion.div
						initial={{ opacity: 0, y: 5 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0 }}
						className="mt-2 mx-1 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2 flex items-center gap-2"
					>
						<AlertTriangle className="w-3 h-3 text-yellow-400 shrink-0" />
						<div className="flex-1 min-w-0">
							<div className="text-[0.45rem] font-bold text-yellow-400">89 clientes em risco</div>
							<div className="text-[0.35rem] text-yellow-400/60">Clique para ver detalhes</div>
						</div>
						<ChevronRight className="w-3 h-3 text-yellow-400/50" />
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

// ─── Segment Detail View: Client List ───

function SegmentDetailView({ active }: { active: boolean }) {
	const [visibleClients, setVisibleClients] = useState(0);
	const [showActionButton, setShowActionButton] = useState(false);

	useEffect(() => {
		if (!active) {
			setVisibleClients(0);
			setShowActionButton(false);
			return;
		}

		// Show clients one by one
		let i = 0;
		const interval = setInterval(() => {
			if (i < AT_RISK_CLIENTS.length) {
				setVisibleClients(i + 1);
				i++;
			} else {
				clearInterval(interval);
			}
		}, 350);

		// Show action button after clients are visible
		const actionTimer = setTimeout(() => {
			setShowActionButton(true);
		}, 2500);

		return () => {
			clearInterval(interval);
			clearTimeout(actionTimer);
		};
	}, [active]);

	return (
		<div className="flex flex-col h-full">
			{/* Header with back button */}
			<div className="flex items-center gap-2 px-2 py-1.5 bg-yellow-500/5 border-b border-yellow-500/20 rounded-t-lg mb-2">
				<ArrowLeft className="w-3 h-3 text-yellow-400/60" />
				<div className="w-4 h-4 rounded-full bg-yellow-400/20 flex items-center justify-center">
					<AlertTriangle className="w-2.5 h-2.5 text-yellow-400" />
				</div>
				<span className="text-[0.5rem] font-bold text-yellow-400 uppercase tracking-wider">Em Risco</span>
				<span className="ml-auto text-[0.4rem] text-yellow-400/60 font-bold">89 clientes</span>
			</div>

			{/* Client list */}
			<div className="flex-1 flex flex-col gap-1 px-1 overflow-hidden">
				{AT_RISK_CLIENTS.slice(0, visibleClients).map((client) => (
					<motion.div
						key={client.name}
						initial={{ opacity: 0, x: -10 }}
						animate={{ opacity: 1, x: 0 }}
						transition={{ type: "spring", stiffness: 400, damping: 30 }}
						className="flex items-center gap-2 p-1.5 rounded-lg border bg-white/[0.02] border-white/5"
					>
						{/* Avatar */}
						<div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center shrink-0">
							<UserRound className="w-2.5 h-2.5 text-white/50" />
						</div>

						{/* Info */}
						<div className="flex-1 min-w-0">
							<div className="text-[0.45rem] text-white/80 font-medium truncate">{client.name}</div>
							<div className="text-[0.35rem] text-white/40 flex items-center gap-1">
								<Clock className="w-2 h-2" />
								{client.days}d sem comprar
							</div>
						</div>

						{/* Last value */}
						<div className="text-right shrink-0">
							<div className="text-[0.4rem] text-white/50">Última</div>
							<div className="text-[0.45rem] font-bold text-white/70">R$ {client.lastValue}</div>
						</div>
					</motion.div>
				))}
			</div>

			{/* Action button */}
			<AnimatePresence>
				{showActionButton && (
					<motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-2 mx-1">
						<motion.div
							className="bg-[#FFB900] rounded-lg py-2 px-3 flex items-center justify-center gap-1.5 cursor-pointer"
							animate={{ scale: [1, 1.02, 1] }}
							transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY }}
						>
							<Zap className="w-3 h-3 text-black" />
							<span className="text-[0.5rem] font-black text-black uppercase tracking-wide">Criar Campanha (89)</span>
						</motion.div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

// ─── Action View: Campaign Creation ───

function ActionView({ active }: { active: boolean }) {
	const [step, setStep] = useState(0);
	const [cashbackValue, setCashbackValue] = useState(0);
	const [showMessage, setShowMessage] = useState(false);
	const [showSuccess, setShowSuccess] = useState(false);

	const animatedCashback = useAnimatedCounter(25, 800, step >= 1, 0);

	useEffect(() => {
		if (!active) {
			setStep(0);
			setCashbackValue(0);
			setShowMessage(false);
			setShowSuccess(false);
			return;
		}

		// Step 1: Show cashback input
		const step1 = setTimeout(() => setStep(1), 500);
		// Step 2: Show message preview
		const step2 = setTimeout(() => {
			setShowMessage(true);
			setStep(2);
		}, 2000);
		// Step 3: Show success
		const step3 = setTimeout(() => {
			setShowSuccess(true);
			setStep(3);
		}, 4500);

		return () => {
			clearTimeout(step1);
			clearTimeout(step2);
			clearTimeout(step3);
		};
	}, [active]);

	useEffect(() => {
		setCashbackValue(animatedCashback);
	}, [animatedCashback]);

	if (showSuccess) {
		return (
			<div className="flex flex-col h-full items-center justify-center gap-3 px-2">
				<motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 20 }} className="relative">
					<div className="absolute inset-0 bg-green-500/30 blur-xl rounded-full scale-150" />
					<div className="relative bg-green-600 p-4 rounded-full text-white shadow-lg">
						<CheckCircle2 className="w-8 h-8" />
					</div>
				</motion.div>

				<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="text-center">
					<div className="text-[0.6rem] font-black text-green-400 uppercase tracking-tight">Campanha Criada!</div>
					<div className="text-[0.4rem] text-white/50 mt-0.5">89 clientes serão notificados</div>
				</motion.div>

				<motion.div
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.4 }}
					className="grid grid-cols-2 gap-2 w-full max-w-[180px]"
				>
					<div className="bg-green-500/10 border border-green-500/20 rounded-lg p-2 text-center">
						<div className="text-[0.35rem] text-green-400/60 uppercase font-bold">Cashback</div>
						<div className="text-[0.6rem] font-black text-green-400">R$ 2.225</div>
					</div>
					<div className="bg-[#FFB900]/10 border border-[#FFB900]/20 rounded-lg p-2 text-center">
						<div className="text-[0.35rem] text-[#FFB900]/60 uppercase font-bold">Clientes</div>
						<div className="text-[0.6rem] font-black text-[#FFB900]">89</div>
					</div>
				</motion.div>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full">
			{/* Header */}
			<div className="flex items-center gap-2 px-2 py-1.5 bg-[#FFB900]/5 border-b border-[#FFB900]/20 rounded-t-lg mb-2">
				<ArrowLeft className="w-3 h-3 text-[#FFB900]/60" />
				<Sparkles className="w-3 h-3 text-[#FFB900]" />
				<span className="text-[0.5rem] font-bold text-[#FFB900] uppercase tracking-wider">Nova Campanha</span>
			</div>

			<div className="flex-1 flex flex-col gap-2 px-1">
				{/* Segment summary */}
				<div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-2 flex items-center gap-2">
					<div className="w-7 h-7 rounded-full bg-yellow-400/20 flex items-center justify-center shrink-0">
						<AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
					</div>
					<div className="flex-1">
						<div className="text-[0.45rem] font-bold text-yellow-400">Segmento: Em Risco</div>
						<div className="text-[0.35rem] text-white/50">89 clientes receberão a campanha</div>
					</div>
				</div>

				{/* Cashback input */}
				<AnimatePresence>
					{step >= 1 && (
						<motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white/[0.02] border border-white/5 rounded-lg p-2">
							<div className="text-[0.4rem] text-white/50 uppercase font-bold mb-1.5">Valor do Cashback</div>
							<div className="flex items-center gap-2">
								<div className="flex-1 bg-zinc-800 rounded-lg px-2 py-1.5 flex items-center">
									<span className="text-[0.4rem] text-white/40 mr-1">R$</span>
									<span className="text-[0.7rem] font-black text-[#FFB900] tabular-nums">{cashbackValue},00</span>
								</div>
								<div className="flex gap-1">
									{[10, 25, 50].map((v) => (
										<div
											key={v}
											className={cn(
												"px-1.5 py-1 rounded text-[0.4rem] font-bold border transition-all",
												v === 25 ? "bg-[#FFB900]/20 border-[#FFB900]/30 text-[#FFB900]" : "bg-white/5 border-white/10 text-white/30",
											)}
										>
											{v}
										</div>
									))}
								</div>
							</div>
						</motion.div>
					)}
				</AnimatePresence>

				{/* Message preview */}
				<AnimatePresence>
					{showMessage && (
						<motion.div
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							className="bg-white/[0.02] border border-white/5 rounded-lg p-2 flex-1"
						>
							<div className="flex items-center gap-1.5 mb-1.5">
								<MessageCircle className="w-3 h-3 text-green-400" />
								<span className="text-[0.4rem] text-white/50 uppercase font-bold">Mensagem WhatsApp</span>
							</div>
							<div className="bg-zinc-800/50 rounded-lg p-2 text-[0.4rem] text-white/70 leading-relaxed">
								Oi! Sentimos sua falta na loja. Liberamos <span className="text-[#FFB900] font-bold">R$ 25 de cashback</span> especial pra você voltar! Válido
								por 15 dias.
							</div>
						</motion.div>
					)}
				</AnimatePresence>

				{/* Send button */}
				<AnimatePresence>
					{step >= 2 && !showSuccess && (
						<motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-auto">
							<motion.div
								className="bg-green-600 rounded-lg py-2 px-3 flex items-center justify-center gap-1.5"
								animate={{ scale: [1, 1.02, 1] }}
								transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY }}
							>
								<Send className="w-3 h-3 text-white" />
								<span className="text-[0.5rem] font-black text-white uppercase tracking-wide">Enviar Campanha</span>
							</motion.div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</div>
	);
}

// ─── Main wireframe component ───

function RFMDashboardWireframe() {
	const [currentView, setCurrentView] = useState<RFMView>("overview");
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const advanceView = useCallback(() => {
		setCurrentView((prev) => {
			const idx = VIEWS.indexOf(prev);
			return VIEWS[(idx + 1) % VIEWS.length];
		});
	}, []);

	useEffect(() => {
		const duration = VIEW_DURATIONS[currentView];
		timeoutRef.current = setTimeout(advanceView, duration);
		return () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
		};
	}, [currentView, advanceView]);

	return (
		<div className="relative w-full max-w-md mx-auto">
			{/* Glow behind */}
			<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[110%] h-[110%] bg-[#FFB900]/10 blur-3xl rounded-full -z-10" />

			{/* Device frame */}
			<div className="bg-zinc-950 border border-white/10 rounded-[1.25rem] shadow-2xl shadow-black/50 overflow-hidden">
				{/* Header bar */}
				<div className="flex items-center px-3 py-2 bg-zinc-900/80 border-b border-white/5 gap-1.5">
					<div className="w-1.5 h-1.5 rounded-full bg-red-500/60" />
					<div className="w-1.5 h-1.5 rounded-full bg-yellow-500/60" />
					<div className="w-1.5 h-1.5 rounded-full bg-green-500/60" />
					<div className="ml-2 flex items-center gap-1.5">
						<Grid3X3 className="w-3 h-3 text-[#FFB900]" />
						<span className="text-[0.5rem] font-bold text-white/60">Business Intelligence</span>
					</div>
				</div>

				{/* Content area */}
				<div className="p-2 min-h-[300px] sm:min-h-[320px]">
					<AnimatePresence mode="wait">
						<motion.div
							key={currentView}
							initial={{ opacity: 0, x: 20 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0, x: -20 }}
							transition={{ duration: 0.3 }}
							className="h-[280px] sm:h-[300px]"
						>
							{currentView === "overview" && <OverviewView active={currentView === "overview"} />}
							{currentView === "segment" && <SegmentDetailView active={currentView === "segment"} />}
							{currentView === "action" && <ActionView active={currentView === "action"} />}
						</motion.div>
					</AnimatePresence>
				</div>

				{/* Bottom progress dots */}
				<div className="flex items-center justify-center gap-1.5 pb-3">
					{VIEWS.map((view) => (
						<div key={view} className={cn("h-1 rounded-full transition-all duration-500", currentView === view ? "w-5 bg-[#FFB900]" : "w-1 bg-white/15")} />
					))}
				</div>
			</div>
		</div>
	);
}

// ─── Exported Section ───

export default function RFMSection() {
	return (
		<section id="bi" className="py-24 bg-slate-50 border-y border-black/5 relative overflow-hidden">
			<div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
				<div className="grid lg:grid-cols-2 gap-16 items-center">
					<div className="relative">
						<RFMDashboardWireframe />
					</div>

					<div>
						<div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-yellow-100 border border-yellow-200 text-[#d97706] text-sm font-bold mb-6">
							<BadgePercent className="w-4 h-4" />
							Business Intelligence
						</div>
						<h2 className="text-3xl md:text-5xl font-extrabold mb-6 text-slate-900 leading-tight">
							Saiba exatamente quem <br />
							<span className="text-brand">merece seu tempo.</span>
						</h2>
						<p className="text-lg text-slate-600 mb-8 leading-relaxed font-medium">
							A Matriz RFM classifica sua base automaticamente. Você vê quem são seus campeões (cuide bem deles), quem está em risco (hora de reativar) e
							quem é novo (crie relacionamento).
						</p>
						<div className="grid sm:grid-cols-2 gap-4 mb-8">
							<div className="p-5 rounded-2xl bg-white border border-slate-200 hover:border-yellow-400/50 hover:shadow-lg hover:shadow-yellow-900/5 transition-all">
								<h4 className="font-bold text-slate-900 text-lg mb-2 flex items-center gap-2">
									<Grid3X3 className="w-5 h-5 text-[#d97706]" /> Segmentação Automática
								</h4>
								<p className="text-[15px] text-slate-600 font-medium">Sem fórmulas. Sem planilhas. A análise roda sozinha.</p>
							</div>
							<div className="p-5 rounded-2xl bg-white border border-slate-200 hover:border-yellow-400/50 hover:shadow-lg hover:shadow-yellow-900/5 transition-all">
								<h4 className="font-bold text-slate-900 text-lg mb-2 flex items-center gap-2">
									<Wallet className="w-5 h-5 text-[#d97706]" /> Ação com 1 Clique
								</h4>
								<p className="text-[15px] text-slate-600 font-medium">Viu 89 clientes em risco? Crie uma campanha direto da tela.</p>
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
