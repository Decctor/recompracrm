"use client";

import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import {
	ArrowRight,
	Bell,
	Calendar,
	CheckCircle2,
	Clock,
	Gift,
	MessageCircle,
	RefreshCw,
	Send,
	ShoppingBag,
	Sparkles,
	Timer,
	TrendingUp,
	User,
	Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

// ════════════════════════════════════════════════════════════════════════════
// ─── BRAND COLORS ───
// Primary: #24549C (Azul)
// Secondary: #FFB900 (Dourado/Amarelo)
// ════════════════════════════════════════════════════════════════════════════

// ─── HIGH-FIDELITY DASHBOARD ANIMATION ───

type AnimationPhase = "detection" | "sending" | "conversion";

const PHASE_DURATIONS: Record<AnimationPhase, number> = {
	detection: 7500,
	sending: 4500,
	conversion: 5500,
};

const PHASES: AnimationPhase[] = ["detection", "sending", "conversion"];

// Calendar component that animates through days
function AnimatedCalendar({
	onDayChange,
	active,
}: {
	onDayChange: (day: number) => void;
	active: boolean;
}) {
	const [currentDay, setCurrentDay] = useState(0);
	const days = [
		{ label: "S", date: 15 },
		{ label: "M", date: 16 },
		{ label: "T", date: 17 },
		{ label: "W", date: 18 },
		{ label: "T", date: 19 },
		{ label: "F", date: 20 },
		{ label: "S", date: 21 },
	];

	useEffect(() => {
		if (!active) {
			setCurrentDay(0);
			return;
		}

		const interval = setInterval(() => {
			setCurrentDay((prev) => {
				const next = prev + 1;
				onDayChange(next);
				if (next >= 6) {
					clearInterval(interval);
					return 6;
				}
				return next;
			});
		}, 700);

		return () => clearInterval(interval);
	}, [active, onDayChange]);

	return (
		<div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
			{/* Calendar Header */}
			<div className="bg-[#24549C]/5 px-4 py-2 border-b border-slate-100 flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Calendar className="w-4 h-4 text-primary" />
					<span className="text-xs font-medium tracking-tight uppercase text-primary">Monitoramento Contínuo</span>
				</div>
				<span className="text-[10px] text-slate-500 font-medium">Março 2024</span>
			</div>

			{/* Days Grid */}
			<div className="flex items-center justify-between px-3 py-3">
				{days.map((day, idx) => (
					<div
						key={day.date}
						className={cn(
							"flex flex-col items-center justify-center w-10 h-14 rounded-xl transition-all duration-300",
							currentDay === idx ? "bg-[#24549C] text-primary-foreground shadow-lg scale-110" : idx < currentDay ? "text-slate-500" : "text-foreground",
						)}
					>
						<span className="text-[10px] font-medium uppercase">{day.label}</span>
						<span className="text-base font-bold">{day.date}</span>
					</div>
				))}
			</div>
		</div>
	);
}

// Client card with RFM status and dynamic KPIs
function ClientCard({
	status,
	showPulse,
	daysSinceLastPurchase,
}: {
	status: "loyal" | "at-risk";
	showPulse: boolean;
	daysSinceLastPurchase: number;
}) {
	return (
		<div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
			{/* Client Header */}
			<div className="p-4 flex items-center gap-4">
				<div className="w-14 h-14 rounded-full bg-secondary/10 border-2 border-secondary/30 flex items-center justify-center">
					<User className="w-7 h-7 text-secondary" />
				</div>
				<div className="flex-1 min-w-0">
					<div className="text-base font-bold text-foreground tracking-tight">Maria Silva</div>
					<div className="text-sm text-slate-500">(34) 99876-5432</div>
				</div>

				{/* RFM Status Badge */}
				<AnimatePresence mode="wait">
					<motion.div
						key={status}
						initial={{ scale: 0.8, opacity: 0, y: 10 }}
						animate={{ scale: 1, opacity: 1, y: 0 }}
						exit={{ scale: 0.8, opacity: 0, y: -10 }}
						className={cn(
							"px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 border",
							status === "loyal" ? "bg-green-100 text-green-700 border-green-200" : "bg-amber-100 text-amber-700 border-amber-200",
						)}
					>
						{showPulse && status === "at-risk" && (
							<motion.span
								className="w-2 h-2 rounded-full bg-amber-500"
								animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
								transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY }}
							/>
						)}
						{status === "loyal" ? "Cliente Fiel" : "Em Risco"}
					</motion.div>
				</AnimatePresence>
			</div>

			{/* Client KPIs */}
			<div className="grid grid-cols-4 border-t border-slate-100">
				{[
					{ label: "Última Compra", value: `${daysSinceLastPurchase} dias`, highlight: daysSinceLastPurchase >= 45 },
					{ label: "Ticket Médio", value: "R$ 287", highlight: false },
					{ label: "Compras", value: "12", highlight: false },
					{ label: "Lifetime", value: "R$ 3.4k", highlight: false },
				].map((kpi, idx) => (
					<div key={kpi.label} className={cn("p-3 text-center border-r border-slate-100 last:border-r-0", kpi.highlight && "bg-amber-50")}>
						<div className="text-[10px] text-slate-500 uppercase font-medium tracking-tight mb-1">{kpi.label}</div>
						<div className={cn("text-sm font-bold", kpi.highlight ? "text-amber-600" : "text-foreground")}>{kpi.value}</div>
					</div>
				))}
			</div>
		</div>
	);
}

// Campaign toast notification
function CampaignToast({ visible }: { visible: boolean }) {
	const tags = [
		{ icon: Zap, text: "Entrada em 'Em Risco'", color: "bg-amber-50 text-amber-700 border-amber-200" },
		{ icon: Gift, text: "R$ 25 Cashback", color: "bg-green-50 text-green-700 border-green-200" },
		{ icon: Timer, text: "Expira em 15 dias", color: "bg-blue-50 text-blue-700 border-blue-200" },
		{ icon: Clock, text: "Envio às 9:00", color: "bg-purple-50 text-purple-700 border-purple-200" },
	];

	return (
		<AnimatePresence>
			{visible && (
				<motion.div
					initial={{ opacity: 0, y: 30, scale: 0.95 }}
					animate={{ opacity: 1, y: 0, scale: 1 }}
					exit={{ opacity: 0, y: 20 }}
					transition={{ type: "spring", stiffness: 400, damping: 25 }}
					className="bg-white border border-slate-200 rounded-xl shadow-lg p-4"
				>
					{/* Toast Header */}
					<div className="flex items-center gap-3 mb-4">
						<div className="w-10 h-10 rounded-xl bg-[#24549C]/10 flex items-center justify-center">
							<Bell className="w-5 h-5 text-primary" />
						</div>
						<div className="flex-1">
							<div className="text-sm font-bold text-foreground tracking-tight">Campanha de Reativação Ativada</div>
							<div className="text-xs text-slate-500">Automação configurada com sucesso</div>
						</div>
						<div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
							<CheckCircle2 className="w-5 h-5 text-green-600" />
						</div>
					</div>

					{/* Tags Grid */}
					<div className="grid grid-cols-2 gap-2">
						{tags.map((tag, idx) => (
							<motion.div
								key={tag.text}
								initial={{ opacity: 0, x: -10 }}
								animate={{ opacity: 1, x: 0 }}
								transition={{ delay: 0.1 + idx * 0.1 }}
								className={cn("flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border", tag.color)}
							>
								<tag.icon className="w-3.5 h-3.5" />
								<span>{tag.text}</span>
							</motion.div>
						))}
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}

// Phase 1: Detection
function DetectionPhase({ active }: { active: boolean }) {
	const [daysPassed, setDaysPassed] = useState(0);
	const [status, setStatus] = useState<"loyal" | "at-risk">("loyal");
	const [showToast, setShowToast] = useState(false);

	const baseDays = 39;
	const currentDaysSinceLastPurchase = baseDays + daysPassed;

	const handleDayChange = useCallback((day: number) => {
		setDaysPassed(day);
		if (day >= 5) {
			setStatus("at-risk");
		}
		if (day >= 6) {
			setTimeout(() => setShowToast(true), 500);
		}
	}, []);

	useEffect(() => {
		if (!active) {
			setDaysPassed(0);
			setStatus("loyal");
			setShowToast(false);
		}
	}, [active]);

	return (
		<div className="flex flex-col gap-4 h-full">
			{/* Calendar */}
			<AnimatedCalendar onDayChange={handleDayChange} active={active} />

			{/* Client Card */}
			<ClientCard status={status} showPulse={status === "at-risk"} daysSinceLastPurchase={currentDaysSinceLastPurchase} />

			{/* Campaign Toast */}
			<div className="flex-1 flex flex-col justify-end min-h-[120px]">
				<CampaignToast visible={showToast} />
			</div>
		</div>
	);
}

// Phase 2: Sending
function SendingPhase({ active }: { active: boolean }) {
	const [showMessage, setShowMessage] = useState(false);

	useEffect(() => {
		if (!active) {
			setShowMessage(false);
			return;
		}
		const timer = setTimeout(() => setShowMessage(true), 1400);
		return () => clearTimeout(timer);
	}, [active]);

	return (
		<div className="flex flex-col items-center justify-center gap-6 h-full py-6">
			{/* Sending Animation */}
			<motion.div className="relative">
				{[0, 1, 2].map((i) => (
					<motion.div
						key={i}
						className="absolute inset-0 border-2 border-primary/30 rounded-full"
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
				<div className="relative w-20 h-20 rounded-full bg-[#24549C] flex items-center justify-center shadow-xl">
					<Send className="w-9 h-9 text-primary-foreground" />
				</div>
			</motion.div>

			<div className="text-center">
				<div className="text-lg font-bold text-foreground tracking-tight">Enviando WhatsApp</div>
				<div className="text-sm text-slate-500 mt-1">Maria Silva • Campanha de Reativação</div>
			</div>

			{/* WhatsApp Message Preview */}
			<AnimatePresence>
				{showMessage && (
					<motion.div
						initial={{ opacity: 0, y: 30, scale: 0.95 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						transition={{ type: "spring", stiffness: 300, damping: 25 }}
						className="w-full max-w-[320px]"
					>
						{/* WhatsApp bubble */}
						<div className="bg-[#DCF8C6] rounded-xl rounded-tl-sm p-4 shadow-sm border border-green-200 relative">
							<div className="absolute -left-2 top-0 w-4 h-4 bg-[#DCF8C6] border-l border-t border-green-200 transform -rotate-45" />
							<p className="text-sm text-slate-700 leading-relaxed">
								Oi Maria! ✨ Sentimos sua falta por aqui! Liberamos <span className="font-bold text-emerald-700">R$ 25 de cashback</span> especial pra você
								voltar. Válido por 15 dias! 🎁
							</p>
							<div className="flex items-center justify-end gap-1.5 mt-2">
								<span className="text-xs text-slate-500">09:00</span>
								<CheckCircle2 className="w-4 h-4 text-blue-500" />
							</div>
						</div>

						{/* Cashback credited */}
						<motion.div
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: 0.5 }}
							className="mt-4 flex items-center justify-center gap-2 bg-secondary/10 border border-secondary/30 rounded-xl px-4 py-3"
						>
							<Gift className="w-5 h-5 text-secondary" />
							<span className="text-sm font-bold text-secondary">R$ 25,00 creditado na conta</span>
						</motion.div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

// Conversion card component
function ConversionCard({
	isMain,
	client,
	value,
	time,
	delay,
}: {
	isMain: boolean;
	client: string;
	value: string;
	time: string;
	delay: number;
}) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ delay, type: "spring", stiffness: 300, damping: 25 }}
			className={cn(
				"bg-white rounded-xl border shadow-xs overflow-hidden",
				isMain ? "border-green-300 ring-2 ring-green-100" : "border-slate-100 opacity-50 scale-[0.97]",
			)}
		>
			{isMain && (
				<div className="bg-green-500 px-4 py-2 flex items-center justify-between">
					<span className="text-xs font-bold text-white uppercase tracking-wide">Conversão da Campanha de Reativação</span>
					<CheckCircle2 className="w-4 h-4 text-white" />
				</div>
			)}

			<div className="p-4">
				<div className="flex items-center gap-4 mb-4">
					<div
						className={cn(
							"w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold",
							isMain ? "bg-green-500 text-white shadow-lg" : "bg-muted text-slate-500",
						)}
					>
						{client
							.split(" ")
							.map((n) => n[0])
							.join("")}
					</div>
					<div className="flex-1">
						<div className="text-base font-bold text-foreground">{client}</div>
						<div className="text-xs text-slate-500 flex items-center gap-1">
							<Clock className="w-3 h-3" />
							{time}
						</div>
					</div>
					<div className="text-right">
						<div className={cn("text-xl font-black", isMain ? "text-green-600" : "text-foreground")}>{value}</div>
					</div>
				</div>

				{isMain && (
					<div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-100">
						<div className="text-center bg-secondary/5 rounded-lg py-2">
							<div className="text-[10px] text-slate-500 uppercase font-medium">Cashback</div>
							<div className="text-sm font-bold text-secondary">R$ 25</div>
						</div>
						<div className="text-center bg-[#24549C]/5 rounded-lg py-2">
							<div className="text-[10px] text-slate-500 uppercase font-medium">ROI</div>
							<div className="text-sm font-bold text-primary">114x</div>
						</div>
						<div className="text-center bg-green-50 rounded-lg py-2">
							<div className="text-[10px] text-slate-500 uppercase font-medium">Tempo</div>
							<div className="text-sm font-bold text-green-600">3 dias</div>
						</div>
					</div>
				)}
			</div>
		</motion.div>
	);
}

// Phase 3: Conversion
function ConversionPhase({ active }: { active: boolean }) {
	const [showCards, setShowCards] = useState(false);

	useEffect(() => {
		if (!active) {
			setShowCards(false);
			return;
		}
		const timer = setTimeout(() => setShowCards(true), 400);
		return () => clearTimeout(timer);
	}, [active]);

	return (
		<div className="flex flex-col h-full gap-4">
			{/* Header */}
			<div className="bg-white border border-slate-200 rounded-xl shadow-xs p-4 flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
						<TrendingUp className="w-5 h-5 text-green-600" />
					</div>
					<div>
						<div className="text-sm font-bold text-foreground tracking-tight">Conversões Recentes</div>
						<div className="text-xs text-slate-500">Campanha de Reativação</div>
					</div>
				</div>
				<div className="text-right">
					<div className="text-xl font-black text-green-600">R$ 8.4k</div>
					<div className="text-xs text-slate-500">Esta semana</div>
				</div>
			</div>

			{/* Stacked Conversion Cards */}
			<div className="relative flex-1 overflow-hidden">
				{showCards && (
					<div className="flex flex-col gap-3">
						<ConversionCard isMain={true} client="Maria Silva" value="R$ 2.847" time="Hoje às 14:32" delay={0} />
						<ConversionCard isMain={false} client="João Santos" value="R$ 1.523" time="Ontem às 16:45" delay={0.15} />
						<ConversionCard isMain={false} client="Ana Costa" value="R$ 892" time="Há 2 dias" delay={0.25} />
					</div>
				)}
				<div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-muted/30 to-transparent" />
			</div>
		</div>
	);
}

// Main Dashboard Animation
function HighFidelityDashboard() {
	const [phase, setPhase] = useState<AnimationPhase>("detection");
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

	return (
		<div className="relative w-full max-w-lg mx-auto">
			{/* Browser Frame */}
			<div className="bg-background rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
				{/* Browser Chrome */}
				<div className="bg-muted/50 px-4 py-3 border-b border-slate-100 flex items-center gap-3">
					<div className="flex gap-2">
						<div className="w-3 h-3 rounded-full bg-red-400" />
						<div className="w-3 h-3 rounded-full bg-amber-400" />
						<div className="w-3 h-3 rounded-full bg-green-400" />
					</div>
					<div className="flex-1 flex justify-center">
						<div className="bg-background rounded-lg px-4 py-1.5 text-xs font-medium text-slate-500 border border-slate-100 shadow-sm flex items-center gap-2">
							<div className="w-2.5 h-2.5 rounded-full bg-green-500" />
							app.recompracrm.com.br
						</div>
					</div>
					<div className="w-16" />
				</div>

				{/* App Header */}
				<div className="bg-background px-4 py-3 border-b border-slate-100 flex items-center justify-between">
					<div className="flex items-center gap-3">
						<div className="w-9 h-9 rounded-xl bg-[#24549C] flex items-center justify-center">
							<span className="text-sm font-black text-primary-foreground">R</span>
						</div>
						<div>
							<div className="text-sm font-bold text-foreground tracking-tight">RecompraCRM</div>
							<div className="text-xs text-slate-500">Loja Exemplo</div>
						</div>
					</div>
					<div className="flex items-center gap-2 text-xs text-slate-500 font-medium bg-muted/50 px-3 py-1.5 rounded-lg border border-slate-100">
						<ShoppingBag className="w-3.5 h-3.5" />
						Automações RFM
					</div>
				</div>

				{/* Dashboard Content - FIXED HEIGHT */}
				<div className="p-4 h-[480px] bg-muted/30">
					<AnimatePresence mode="wait">
						<motion.div
							key={phase}
							initial={{ opacity: 0, x: 20 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0, x: -20 }}
							transition={{ duration: 0.3 }}
							className="h-full"
						>
							{phase === "detection" && <DetectionPhase active={phase === "detection"} />}
							{phase === "sending" && <SendingPhase active={phase === "sending"} />}
							{phase === "conversion" && <ConversionPhase active={phase === "conversion"} />}
						</motion.div>
					</AnimatePresence>
				</div>

				{/* Bottom Progress */}
				<div className="bg-muted/50 border-t border-slate-100 px-4 py-3 flex items-center justify-center gap-3">
					{PHASES.map((p, idx) => (
						<div key={p} className="flex items-center gap-3">
							<div className={cn("h-2 rounded-full transition-all duration-500", phase === p ? "w-10 bg-[#24549C]" : "w-2 bg-[#24549C]/20")} />
							{idx < PHASES.length - 1 && <div className="w-6 h-px bg-[#24549C]/20" />}
						</div>
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
				<div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center min-h-screen py-20">
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
							<button
								type="button"
								className="group relative overflow-hidden bg-[#24549C] text-white px-8 py-4 rounded-2xl font-bold shadow-2xl shadow-blue-900/20 transition-all duration-300 hover:shadow-blue-900/30 hover:-translate-y-1"
							>
								<span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
								<span className="relative flex items-center justify-center gap-3">
									Ver uma Demonstração
									<ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
								</span>
							</button>
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
