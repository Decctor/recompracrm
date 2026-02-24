"use client";

import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import {
	ArrowRight,
	BadgePercent,
	Building2,
	Check,
	CheckCircle2,
	Coins,
	CreditCard,
	Gift,
	Lock,
	PartyPopper,
	ShoppingCart,
	Tag,
	Trophy,
	UserRound,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

// ─── Timing constants ───
const STEP_DURATIONS = {
	home: 3000,
	client: 3500,
	saleValue: 3000,
	cashback: 3500,
	confirmation: 2500,
	success: 3500,
};

type FlowStep = "home" | "client" | "saleValue" | "cashback" | "confirmation" | "success";
const FLOW_STEPS: FlowStep[] = ["home", "client", "saleValue", "cashback", "confirmation", "success"];

// ─── Animated counter hook ───
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
			// Ease out quad
			const eased = 1 - (1 - progress) * (1 - progress);
			setValue(eased * target);
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

// ─── Typewriter hook ───
function useTypewriter(text: string, speed: number, active: boolean) {
	const [displayed, setDisplayed] = useState("");

	useEffect(() => {
		if (!active) {
			setDisplayed("");
			return;
		}
		let i = 0;
		const interval = setInterval(() => {
			if (i < text.length) {
				setDisplayed(text.slice(0, i + 1));
				i++;
			} else {
				clearInterval(interval);
			}
		}, speed);
		return () => clearInterval(interval);
	}, [text, speed, active]);

	return displayed;
}

// ─── Shared animation variants ───
const fadeSlide = {
	initial: { opacity: 0, y: 12 },
	animate: { opacity: 1, y: 0 },
	exit: { opacity: 0, y: -12 },
};

// ─── Step sub-components ───

function POIHomeStep() {
	return (
		<div className="flex flex-col h-full">
			{/* Mini header */}
			<div className="flex items-center gap-2 px-3 py-2 bg-white/[0.03] rounded-xl border border-white/5 mb-3">
				<div className="w-7 h-7 rounded-full bg-[#24549C]/20 flex items-center justify-center shrink-0">
					<Building2 className="w-3.5 h-3.5 text-[#24549C]" />
				</div>
				<div className="flex-1 min-w-0">
					<div className="text-[0.55rem] font-black text-white/90 uppercase tracking-tight truncate">Loja Exemplo</div>
					<div className="text-[0.45rem] text-white/40">Programa de fidelidade</div>
				</div>
				<CashbackRuleBadgeMini />
			</div>

			{/* Main actions */}
			<div className="flex-1 flex flex-col sm:flex-row gap-2">
				{/* Primary action */}
				<motion.div
					className="flex-1 flex flex-col items-center justify-center gap-1.5 bg-[#24549C] rounded-2xl p-3 cursor-default"
					animate={{ scale: [1, 1.02, 1] }}
					transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
				>
					<div className="bg-white/20 p-2 rounded-xl">
						<ShoppingCart className="w-5 h-5 text-white" />
					</div>
					<span className="text-[0.6rem] font-black text-white uppercase tracking-tight">Registrar Compra</span>
					<span className="text-[0.4rem] text-white/60">Ganhe cashback</span>
				</motion.div>

				{/* Secondary actions */}
				<div className="flex sm:flex-col gap-2 sm:w-[45%]">
					<div className="flex-1 flex flex-col items-center justify-center gap-1 bg-white/[0.03] border border-white/10 rounded-xl p-2">
						<Coins className="w-4 h-4 text-white/70" />
						<span className="text-[0.5rem] font-bold text-white/70 uppercase">Meu Saldo</span>
					</div>
					<div className="flex-1 flex flex-col items-center justify-center gap-1 bg-white/[0.03] border border-white/10 rounded-xl p-2">
						<Trophy className="w-4 h-4 text-white/70" />
						<span className="text-[0.5rem] font-bold text-white/70 uppercase">Ranking</span>
					</div>
				</div>
			</div>
		</div>
	);
}

function CashbackRuleBadgeMini() {
	const [showPromo, setShowPromo] = useState(false);

	useEffect(() => {
		const interval = setInterval(() => setShowPromo((p) => !p), 2500);
		return () => clearInterval(interval);
	}, []);

	return (
		<AnimatePresence mode="wait">
			{!showPromo ? (
				<motion.div
					key="rules"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					className="flex items-center gap-1 bg-[#24549C]/10 px-1.5 py-0.5 rounded-md border border-[#24549C]/20"
				>
					<Coins className="w-2.5 h-2.5 text-[#24549C]" />
					<span className="text-[0.4rem] font-bold text-[#24549C]">5% | 60d</span>
				</motion.div>
			) : (
				<motion.div
					key="promo"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					className="flex items-center gap-1 bg-[#24549C]/10 px-1.5 py-0.5 rounded-md border border-[#24549C]/20"
				>
					<Gift className="w-2.5 h-2.5 text-[#24549C]" />
					<span className="text-[0.4rem] font-bold text-[#24549C]">R$ 20 boas-vindas</span>
				</motion.div>
			)}
		</AnimatePresence>
	);
}

function ClientStep({ active }: { active: boolean }) {
	const phone = useTypewriter("(34) 99876-5432", 80, active);
	const [clientFound, setClientFound] = useState(false);

	useEffect(() => {
		if (!active) {
			setClientFound(false);
			return;
		}
		const timer = setTimeout(() => setClientFound(true), 1800);
		return () => clearTimeout(timer);
	}, [active]);

	return (
		<div className="flex flex-col h-full">
			<StepIndicator currentStep={1} />
			<div className="flex-1 flex flex-col items-center justify-center gap-2 px-2">
				<div className="text-[0.6rem] font-black text-white/80 uppercase tracking-tight">Quem é o cliente?</div>

				<AnimatePresence mode="wait">
					{!clientFound ? (
						<motion.div key="input" {...fadeSlide} className="w-full max-w-[180px]">
							<div className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[0.55rem] text-white/70 font-mono">
								{phone}
								<span className="animate-pulse text-[#24549C]">|</span>
							</div>
						</motion.div>
					) : (
						<motion.div
							key="found"
							initial={{ opacity: 0, scale: 0.9 }}
							animate={{ opacity: 1, scale: 1 }}
							transition={{ type: "spring", stiffness: 400, damping: 25 }}
							className="w-full max-w-[200px] bg-green-500/10 border border-green-500/30 rounded-xl p-2 flex flex-col items-center gap-1.5"
						>
							<span className="text-[0.4rem] font-bold text-green-400 uppercase tracking-widest">Perfil Encontrado</span>
							<span className="text-[0.6rem] font-black text-white uppercase">Maria Silva</span>
							<span className="text-[0.45rem] text-green-400">(34) 99876-5432</span>
							<div className="w-full bg-green-600 rounded-lg p-1.5 text-center">
								<div className="text-[0.35rem] text-white/70 uppercase font-bold">Saldo</div>
								<div className="text-[0.7rem] font-black text-white">R$ 25,00</div>
							</div>
							{/* Mini progress bar */}
							<div className="w-full h-0.5 bg-green-500/20 rounded-full overflow-hidden">
								<motion.div
									className="h-full bg-green-500"
									initial={{ width: "100%" }}
									animate={{ width: "0%" }}
									transition={{ duration: 1.5, ease: "linear" }}
								/>
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</div>
	);
}

function SaleValueStep({ active }: { active: boolean }) {
	const animatedValue = useAnimatedCounter(150, 1200, active);

	return (
		<div className="flex flex-col h-full">
			<StepIndicator currentStep={2} />
			<div className="flex-1 flex flex-col items-center justify-center gap-3 px-2">
				<div className="text-[0.6rem] font-black text-white/80 uppercase tracking-tight">Valor da compra</div>

				{/* Big value display */}
				<div className="relative bg-white/5 border-2 border-[#24549C]/30 rounded-2xl px-4 py-3 min-w-[140px] text-center">
					<span className="text-[0.5rem] text-white/40 font-bold absolute left-3 top-1/2 -translate-y-1/2">R$</span>
					<span className="text-xl font-black text-white tabular-nums">{Math.round(animatedValue)}</span>
					<span className="text-sm font-black text-white/60">,00</span>
				</div>

				{/* Quick add buttons */}
				<div className="flex gap-1.5">
					{[10, 25, 50, 100].map((v) => (
						<div
							key={v}
							className={cn(
								"px-2 py-1 rounded-md text-[0.5rem] font-bold border transition-all",
								v <= Math.round(animatedValue) ? "bg-[#24549C]/20 border-[#24549C]/30 text-[#24549C]" : "bg-white/5 border-white/10 text-white/30",
							)}
						>
							+{v}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

function CashbackApplyStep({ active }: { active: boolean }) {
	const [toggleOn, setToggleOn] = useState(false);

	useEffect(() => {
		if (!active) {
			setToggleOn(false);
			return;
		}
		const timer = setTimeout(() => setToggleOn(true), 800);
		return () => clearTimeout(timer);
	}, [active]);

	return (
		<div className="flex flex-col h-full">
			<StepIndicator currentStep={3} />
			<div className="flex-1 flex flex-col gap-2 px-2 py-1">
				{/* Toggle area */}
				<div className="flex items-center justify-between bg-white/[0.03] rounded-lg px-2 py-1.5 border border-white/5">
					<div className="flex items-center gap-1.5">
						<CreditCard className="w-3 h-3 text-green-400" />
						<span className="text-[0.5rem] font-black text-white/80 uppercase">Usar Cashback?</span>
					</div>
					<div className={cn("w-6 h-3.5 rounded-full relative transition-colors duration-300", toggleOn ? "bg-green-500" : "bg-white/20")}>
						<motion.div
							className="absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow-sm"
							animate={{ left: toggleOn ? 12 : 2 }}
							transition={{ type: "spring", stiffness: 500, damping: 30 }}
						/>
					</div>
				</div>

				{/* Balance cards */}
				<div className="grid grid-cols-2 gap-1.5">
					<div className="bg-white/[0.03] rounded-lg p-1.5 border border-white/5 text-center">
						<div className="text-[0.35rem] text-white/40 uppercase font-bold">Saldo</div>
						<div className="text-[0.6rem] font-black text-green-400">R$ 25,00</div>
					</div>
					<div className="bg-white/[0.03] rounded-lg p-1.5 border border-white/5 text-center">
						<div className="text-[0.35rem] text-white/40 uppercase font-bold">Limite</div>
						<div className="text-[0.6rem] font-black text-[#24549C]">R$ 25,00</div>
					</div>
				</div>

				{/* Summary card */}
				<AnimatePresence>
					{toggleOn && (
						<motion.div
							initial={{ opacity: 0, height: 0 }}
							animate={{ opacity: 1, height: "auto" }}
							exit={{ opacity: 0, height: 0 }}
							className="overflow-hidden"
						>
							<div className="bg-[#24549C] rounded-xl p-2 text-white">
								<div className="flex justify-between text-[0.4rem] opacity-70 mb-0.5">
									<span>Subtotal</span>
									<span>R$ 150,00</span>
								</div>
								<div className="flex justify-between text-[0.4rem] text-green-300 mb-1">
									<span>Cashback</span>
									<span>- R$ 25,00</span>
								</div>
								<div className="h-px bg-white/20 mb-1" />
								<div className="flex justify-between items-end">
									<span className="text-[0.45rem] font-bold uppercase">Total</span>
									<span className="text-[0.75rem] font-black">R$ 125,00</span>
								</div>
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</div>
	);
}

function ConfirmationStepWireframe({ active }: { active: boolean }) {
	const dots = useTypewriter("*****", 250, active);

	return (
		<div className="flex flex-col h-full">
			<StepIndicator currentStep={4} />
			<div className="flex-1 flex flex-col items-center justify-center gap-2 px-2">
				<div className="text-[0.6rem] font-black text-white/80 uppercase tracking-tight">Confirmar Operação</div>

				{/* Summary */}
				<div className="w-full max-w-[180px] bg-white/[0.03] rounded-xl p-2 border border-white/5 space-y-1">
					<div className="flex justify-between text-[0.45rem]">
						<span className="text-white/40 font-bold uppercase">Cliente</span>
						<span className="text-[#24549C] font-black">Maria Silva</span>
					</div>
					<div className="flex justify-between text-[0.45rem]">
						<span className="text-white/40 font-bold uppercase">Valor Final</span>
						<span className="text-[#24549C] font-black text-[0.6rem]">R$ 125,00</span>
					</div>
				</div>

				{/* Operator password */}
				<div className="w-full max-w-[140px]">
					<div className="text-[0.4rem] text-white/40 uppercase font-bold text-center mb-1">Senha do Operador</div>
					<div className="bg-white/5 border-2 border-white/10 rounded-lg px-2 py-1.5 text-center text-sm font-black text-white/80 tracking-[0.3em]">
						{dots}
						{dots.length < 5 && <span className="animate-pulse text-[#24549C]">|</span>}
					</div>
				</div>

				{/* Submit button simulation */}
				<AnimatePresence>
					{dots.length >= 5 && (
						<motion.div
							initial={{ opacity: 0, scale: 0.9 }}
							animate={{ opacity: 1, scale: 1 }}
							className="w-full max-w-[180px] bg-green-600 rounded-lg py-1.5 text-center"
						>
							<span className="text-[0.5rem] font-black text-white uppercase tracking-wider flex items-center justify-center gap-1">
								Finalizar <Check className="w-2.5 h-2.5" />
							</span>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</div>
	);
}

function SuccessStepWireframe({ active }: { active: boolean }) {
	const cashbackEarned = useAnimatedCounter(7.5, 800, active);
	const newBalance = useAnimatedCounter(32.5, 800, active);

	return (
		<div className="flex flex-col h-full items-center justify-center gap-2 px-2">
			{/* Big check */}
			<motion.div
				initial={{ scale: 0 }}
				animate={{ scale: 1 }}
				transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 }}
				className="relative"
			>
				<div className="absolute inset-0 bg-green-500/30 blur-xl rounded-full scale-150" />
				<div className="relative bg-green-600 p-3 rounded-full text-white shadow-lg shadow-green-600/30">
					<CheckCircle2 className="w-6 h-6" />
				</div>
				<motion.div
					initial={{ scale: 0, rotate: -30 }}
					animate={{ scale: 1, rotate: 0 }}
					transition={{ delay: 0.3, type: "spring" }}
					className="absolute -top-2 -right-2 bg-yellow-400 p-1 rounded-lg text-yellow-900"
				>
					<PartyPopper className="w-2.5 h-2.5" />
				</motion.div>
			</motion.div>

			<motion.div
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ delay: 0.2 }}
				className="text-[0.65rem] font-black text-green-400 uppercase tracking-tight"
			>
				Venda Realizada!
			</motion.div>

			{/* Stats */}
			<motion.div
				initial={{ opacity: 0, y: 10 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ delay: 0.3 }}
				className="grid grid-cols-2 gap-1.5 w-full max-w-[200px]"
			>
				<div className="bg-green-500/10 border border-green-500/20 rounded-xl p-2 text-center">
					<div className="text-[0.35rem] text-green-400 uppercase font-bold">Cashback Gerado</div>
					<div className="text-[0.7rem] font-black text-green-400 tabular-nums">R$ {cashbackEarned.toFixed(2).replace(".", ",")}</div>
				</div>
				<div className="bg-[#24549C]/10 border border-[#24549C]/20 rounded-xl p-2 text-center">
					<div className="text-[0.35rem] text-[#24549C] uppercase font-bold">Novo Saldo</div>
					<div className="text-[0.7rem] font-black text-[#24549C] tabular-nums">R$ {newBalance.toFixed(2).replace(".", ",")}</div>
				</div>
			</motion.div>

			{/* Action buttons */}
			<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="flex gap-1.5 w-full max-w-[200px]">
				<div className="flex-1 bg-[#24549C] rounded-lg py-1.5 text-center">
					<span className="text-[0.45rem] font-black text-white uppercase">Nova Venda</span>
				</div>
				<div className="flex-1 bg-white/5 border border-white/10 rounded-lg py-1.5 text-center">
					<span className="text-[0.45rem] font-bold text-white/60 uppercase">Início</span>
				</div>
			</motion.div>
		</div>
	);
}

// ─── Step indicator (progress bar at top of card) ───
const STEPS_META = [
	{ id: 1, label: "CLIENTE", Icon: UserRound },
	{ id: 2, label: "VENDA", Icon: Tag },
	{ id: 3, label: "CASHBACK", Icon: BadgePercent },
	{ id: 4, label: "CONFIRMAÇÃO", Icon: Lock },
];

function StepIndicator({ currentStep }: { currentStep: number }) {
	return (
		<div className="flex border-b border-white/5 mb-2">
			{STEPS_META.map((step) => (
				<div
					key={step.id}
					className={cn(
						"flex-1 flex items-center justify-center gap-0.5 py-1.5 border-b-2 transition-all",
						currentStep === step.id ? "border-[#24549C] text-[#24549C]" : "border-transparent text-white/25",
					)}
				>
					<step.Icon className="w-2.5 h-2.5" />
					<span className="text-[0.35rem] font-black tracking-wider hidden sm:inline">{step.label}</span>
				</div>
			))}
		</div>
	);
}

// ─── Main wireframe component ───
function POIFlowWireframe() {
	const [currentStep, setCurrentStep] = useState<FlowStep>("home");
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const advanceStep = useCallback(() => {
		setCurrentStep((prev) => {
			const idx = FLOW_STEPS.indexOf(prev);
			return FLOW_STEPS[(idx + 1) % FLOW_STEPS.length];
		});
	}, []);

	useEffect(() => {
		const duration = STEP_DURATIONS[currentStep];
		timeoutRef.current = setTimeout(advanceStep, duration);
		return () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
		};
	}, [currentStep, advanceStep]);

	return (
		<div className="relative w-full max-w-md mx-auto">
			{/* Glow behind */}
			<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[110%] h-[110%] bg-[#24549C]/15 blur-3xl rounded-full -z-10" />

			{/* Device frame */}
			<div className="bg-zinc-950 border border-white/10 rounded-[1.25rem] shadow-2xl shadow-black/50 overflow-hidden">
				{/* Title bar */}
				<div className="flex items-center px-3 py-2 bg-zinc-900/80 border-b border-white/5 gap-1.5">
					<div className="w-1.5 h-1.5 rounded-full bg-red-500/60" />
					<div className="w-1.5 h-1.5 rounded-full bg-yellow-500/60" />
					<div className="w-1.5 h-1.5 rounded-full bg-green-500/60" />
					<div className="ml-2 flex-1 h-3 bg-white/5 rounded-full max-w-[120px]" />
				</div>

				{/* Content area */}
				<div className="p-3 min-h-[280px] sm:min-h-[300px]">
					<AnimatePresence mode="wait">
						<motion.div
							key={currentStep}
							initial={{ opacity: 0, x: 30 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0, x: -30 }}
							transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
							className="h-[260px] sm:h-[280px]"
						>
							{currentStep === "home" && <POIHomeStep />}
							{currentStep === "client" && <ClientStep active={currentStep === "client"} />}
							{currentStep === "saleValue" && <SaleValueStep active={currentStep === "saleValue"} />}
							{currentStep === "cashback" && <CashbackApplyStep active={currentStep === "cashback"} />}
							{currentStep === "confirmation" && <ConfirmationStepWireframe active={currentStep === "confirmation"} />}
							{currentStep === "success" && <SuccessStepWireframe active={currentStep === "success"} />}
						</motion.div>
					</AnimatePresence>
				</div>

				{/* Bottom progress dots */}
				<div className="flex items-center justify-center gap-1.5 pb-3">
					{FLOW_STEPS.map((step) => (
						<div key={step} className={cn("h-1 rounded-full transition-all duration-500", currentStep === step ? "w-4 bg-[#24549C]" : "w-1 bg-white/15")} />
					))}
				</div>
			</div>
		</div>
	);
}

// ─── Exported Section ───
export default function CashbackSection() {
	return (
		<section id="cashback" className="py-24 bg-white relative overflow-hidden">
			<div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-blue-200 to-transparent" />
			<div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
				<div className="grid lg:grid-cols-2 gap-16 items-center">
					<div>
						<div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-[#24549C] text-sm font-bold mb-6">
							<ShoppingCart className="w-4 h-4" />
							Programa de Cashback
						</div>
						<h2 className="text-3xl md:text-5xl font-extrabold mb-6 text-slate-900 leading-tight">
							Cashback que você controla. <br />
							<span className="text-brand">Até o centavo.</span>
						</h2>
						<p className="text-lg text-slate-600 mb-8 leading-relaxed font-medium">
							Configure quanto devolver (2%, 5%, 10%), defina validade (30, 60, 90 dias) e acompanhe em tempo real quem resgatou. Tudo em uma interface
							simples.
						</p>

						<div className="grid sm:grid-cols-2 gap-4 mb-8">
							<div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-[#24549C]/30 hover:shadow-lg hover:shadow-blue-900/5 transition-all">
								<ShoppingCart className="w-6 h-6 text-[#24549C] mb-3" />
								<h4 className="font-bold text-slate-900 text-lg mb-1">Tablet no balcão</h4>
								<p className="text-sm text-slate-600 font-medium">Cliente vê o saldo na hora da compra. Interface Kiosk inclusa.</p>
							</div>
							<div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-[#24549C]/30 hover:shadow-lg hover:shadow-blue-900/5 transition-all">
								<ArrowRight className="w-6 h-6 text-[#24549C] mb-3" />
								<h4 className="font-bold text-slate-900 text-lg mb-1">Resgate instantâneo</h4>
								<p className="text-sm text-slate-600 font-medium">Entrada de venda em poucos cliques. Resgate com CPF na hora.</p>
							</div>
						</div>
					</div>

					<POIFlowWireframe />
				</div>
			</div>
		</section>
	);
}
