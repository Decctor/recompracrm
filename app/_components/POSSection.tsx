"use client";

import { captureClientEvent } from "@/lib/analytics/posthog-client";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { BadgePercent, Check, CheckCircle2, Coins, CreditCard, Lock, PartyPopper, ShoppingCart, Tag, Trophy, UserRound } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

// ─── Reuse the POI flow from CashbackSection ───
type FlowStep = "home" | "client" | "saleValue" | "cashback" | "confirmation" | "success";
const FLOW_STEPS: FlowStep[] = ["home", "client", "saleValue", "cashback", "confirmation", "success"];
const STEP_DURATIONS: Record<FlowStep, number> = {
	home: 2800,
	client: 3200,
	saleValue: 2800,
	cashback: 3000,
	confirmation: 2500,
	success: 3200,
};

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
			} else clearInterval(interval);
		}, speed);
		return () => clearInterval(interval);
	}, [text, speed, active]);
	return displayed;
}

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
			const progress = Math.min((now - start) / duration, 1);
			const eased = 1 - Math.pow(1 - progress, 2);
			setValue(eased * target);
			if (progress < 1) rafRef.current = requestAnimationFrame(animate);
		};
		rafRef.current = requestAnimationFrame(animate);
		return () => {
			if (rafRef.current) cancelAnimationFrame(rafRef.current);
		};
	}, [target, duration, active]);
	return value;
}

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
						currentStep === step.id ? "border-[#FFB900] text-[#FFB900]" : "border-transparent text-white/25",
					)}
				>
					<step.Icon className="w-2.5 h-2.5" />
					<span className="text-[0.35rem] font-black tracking-wider hidden sm:inline">{step.label}</span>
				</div>
			))}
		</div>
	);
}

function HomeStep() {
	return (
		<div className="flex flex-col h-full gap-2">
			<div className="flex items-center justify-between bg-white/[0.04] rounded-xl px-3 py-2 border border-white/5">
				<div className="flex items-center gap-2">
					<div className="w-6 h-6 rounded-full bg-[#FFB900] flex items-center justify-center">
						<span className="text-[8px] font-black text-white">R</span>
					</div>
					<span className="text-[9px] font-black text-white/80 uppercase">Loja Exemplo</span>
				</div>
				<div className="flex items-center gap-1 bg-[#FFB900]/10 border border-[#FFB900]/20 rounded-full px-1.5 py-0.5">
					<Coins className="w-2.5 h-2.5 text-[#FFB900]" />
					<span className="text-[7px] font-bold text-[#FFB900]">5% cashback</span>
				</div>
			</div>
			<div className="flex-1 flex gap-2">
				<motion.div
					className="flex-1 flex flex-col items-center justify-center gap-2 bg-[#24549C] rounded-2xl cursor-default"
					animate={{ scale: [1, 1.025, 1] }}
					transition={{ duration: 2.2, repeat: Number.POSITIVE_INFINITY }}
				>
					<div className="bg-white/20 p-2 rounded-xl">
						<ShoppingCart className="w-5 h-5 text-white" />
					</div>
					<span className="text-[9px] font-black text-white uppercase">Nova Venda</span>
				</motion.div>
				<div className="flex flex-col gap-2 w-[45%]">
					<div className="flex-1 flex flex-col items-center justify-center gap-1 bg-white/[0.04] border border-white/10 rounded-xl p-2">
						<Coins className="w-3.5 h-3.5 text-white/60" />
						<span className="text-[8px] font-bold text-white/60 uppercase">Saldo</span>
					</div>
					<div className="flex-1 flex flex-col items-center justify-center gap-1 bg-white/[0.04] border border-white/10 rounded-xl p-2">
						<Trophy className="w-3.5 h-3.5 text-white/60" />
						<span className="text-[8px] font-bold text-white/60 uppercase">Ranking</span>
					</div>
				</div>
			</div>
		</div>
	);
}

function ClientStep({ active }: { active: boolean }) {
	const phone = useTypewriter("(34) 99876-5432", 80, active);
	const [found, setFound] = useState(false);
	useEffect(() => {
		if (!active) {
			setFound(false);
			return;
		}
		const t = setTimeout(() => setFound(true), 1800);
		return () => clearTimeout(t);
	}, [active]);

	return (
		<div className="flex flex-col h-full">
			<StepIndicator currentStep={1} />
			<div className="flex-1 flex flex-col items-center justify-center gap-2 px-2">
				<span className="text-[9px] font-black text-white/70 uppercase tracking-tight">Quem é o cliente?</span>
				<AnimatePresence mode="wait">
					{!found ? (
						<motion.div key="inp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full max-w-[180px]">
							<div className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[0.55rem] text-white/70 font-mono">
								{phone}
								<span className="animate-pulse text-[#FFB900]">|</span>
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
							<span className="text-[8px] font-bold text-green-400 uppercase tracking-widest">Perfil Encontrado</span>
							<span className="text-[10px] font-black text-white uppercase">Maria Silva</span>
							<span className="text-[8px] text-green-400">(34) 99876-5432</span>
							<div className="w-full bg-green-600 rounded-lg p-1.5 text-center">
								<div className="text-[8px] font-black text-white">Saldo: R$ 25,00</div>
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
				<span className="text-[9px] font-black text-white/70 uppercase tracking-tight">Valor da compra</span>
				<div className="bg-white/5 border-2 border-[#24549C]/30 rounded-2xl px-6 py-3 text-center">
					<span className="text-[10px] text-white/40 font-bold mr-1">R$</span>
					<span className="text-2xl font-black text-white tabular-nums">{Math.round(animatedValue)}</span>
					<span className="text-sm font-black text-white/50">,00</span>
				</div>
				<div className="flex gap-1.5">
					{[10, 25, 50, 100].map((v) => (
						<div
							key={v}
							className={cn(
								"px-2 py-1 rounded-md text-[8px] font-bold border",
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
	const [on, setOn] = useState(false);
	useEffect(() => {
		if (!active) {
			setOn(false);
			return;
		}
		const t = setTimeout(() => setOn(true), 800);
		return () => clearTimeout(t);
	}, [active]);

	return (
		<div className="flex flex-col h-full">
			<StepIndicator currentStep={3} />
			<div className="flex-1 flex flex-col gap-2 px-2 py-1">
				<div className="flex items-center justify-between bg-white/[0.03] rounded-lg px-2 py-1.5 border border-white/5">
					<div className="flex items-center gap-1.5">
						<CreditCard className="w-3 h-3 text-green-400" />
						<span className="text-[8px] font-black text-white/80 uppercase">Usar Cashback?</span>
					</div>
					<div className={cn("w-7 h-4 rounded-full relative transition-colors duration-300", on ? "bg-green-500" : "bg-white/20")}>
						<motion.div
							className="absolute top-0.5 w-3 h-3 rounded-full bg-white shadow"
							animate={{ left: on ? 14 : 2 }}
							transition={{ type: "spring", stiffness: 500, damping: 30 }}
						/>
					</div>
				</div>
				<div className="grid grid-cols-2 gap-1.5">
					<div className="bg-white/[0.03] rounded-lg p-1.5 border border-white/5 text-center">
						<div className="text-[8px] text-white/40 uppercase font-bold">Saldo</div>
						<div className="text-[10px] font-black text-green-400">R$ 25,00</div>
					</div>
					<div className="bg-white/[0.03] rounded-lg p-1.5 border border-white/5 text-center">
						<div className="text-[8px] text-white/40 uppercase font-bold">Limite</div>
						<div className="text-[10px] font-black text-[#24549C]">R$ 25,00</div>
					</div>
				</div>
				<AnimatePresence>
					{on && (
						<motion.div
							initial={{ opacity: 0, height: 0 }}
							animate={{ opacity: 1, height: "auto" }}
							exit={{ opacity: 0, height: 0 }}
							className="overflow-hidden"
						>
							<div className="bg-[#24549C] rounded-xl p-2 text-white">
								<div className="flex justify-between text-[8px] opacity-70 mb-0.5">
									<span>Subtotal</span>
									<span>R$ 150,00</span>
								</div>
								<div className="flex justify-between text-[8px] text-green-300 mb-1">
									<span>Cashback</span>
									<span>- R$ 25,00</span>
								</div>
								<div className="h-px bg-white/20 mb-1" />
								<div className="flex justify-between items-end">
									<span className="text-[8px] font-bold uppercase">Total</span>
									<span className="text-base font-black">R$ 125,00</span>
								</div>
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</div>
	);
}

function ConfirmationStep({ active }: { active: boolean }) {
	const dots = useTypewriter("*****", 250, active);
	return (
		<div className="flex flex-col h-full">
			<StepIndicator currentStep={4} />
			<div className="flex-1 flex flex-col items-center justify-center gap-2 px-2">
				<span className="text-[9px] font-black text-white/70 uppercase tracking-tight">Confirmar Operação</span>
				<div className="w-full max-w-[180px] bg-white/[0.03] rounded-xl p-2 border border-white/5 space-y-1">
					<div className="flex justify-between text-[8px]">
						<span className="text-white/40 font-bold uppercase">Cliente</span>
						<span className="text-[#24549C] font-black">Maria Silva</span>
					</div>
					<div className="flex justify-between text-[8px]">
						<span className="text-white/40 font-bold uppercase">Valor Final</span>
						<span className="text-[#24549C] font-black">R$ 125,00</span>
					</div>
				</div>
				<div className="w-full max-w-[140px]">
					<div className="text-[8px] text-white/40 uppercase font-bold text-center mb-1">Senha do Operador</div>
					<div className="bg-white/5 border-2 border-white/10 rounded-lg px-2 py-1.5 text-center text-sm font-black text-white/80 tracking-[0.3em]">
						{dots}
						{dots.length < 5 && <span className="animate-pulse text-[#FFB900]">|</span>}
					</div>
				</div>
				<AnimatePresence>
					{dots.length >= 5 && (
						<motion.div
							initial={{ opacity: 0, scale: 0.9 }}
							animate={{ opacity: 1, scale: 1 }}
							className="w-full max-w-[180px] bg-green-600 rounded-lg py-1.5 text-center"
						>
							<span className="text-[8px] font-black text-white uppercase flex items-center justify-center gap-1">
								Finalizar <Check className="w-2.5 h-2.5" />
							</span>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</div>
	);
}

function SuccessStep({ active }: { active: boolean }) {
	const earned = useAnimatedCounter(7.5, 800, active);
	const newBalance = useAnimatedCounter(32.5, 800, active);
	return (
		<div className="flex flex-col h-full items-center justify-center gap-2 px-2">
			<motion.div
				initial={{ scale: 0 }}
				animate={{ scale: 1 }}
				transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 }}
				className="relative"
			>
				<div className="absolute inset-0 bg-green-500/30 blur-xl rounded-full scale-150" />
				<div className="relative bg-green-600 p-3 rounded-full text-white shadow-lg">
					<CheckCircle2 className="w-6 h-6" />
				</div>
				<motion.div
					initial={{ scale: 0, rotate: -30 }}
					animate={{ scale: 1, rotate: 0 }}
					transition={{ delay: 0.3, type: "spring" }}
					className="absolute -top-2 -right-2 bg-yellow-400 p-1 rounded-lg"
				>
					<PartyPopper className="w-2.5 h-2.5 text-yellow-900" />
				</motion.div>
			</motion.div>
			<motion.div
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ delay: 0.2 }}
				className="text-[10px] font-black text-green-400 uppercase"
			>
				Venda Realizada!
			</motion.div>
			<motion.div
				initial={{ opacity: 0, y: 10 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ delay: 0.3 }}
				className="grid grid-cols-2 gap-1.5 w-full max-w-[200px]"
			>
				<div className="bg-green-500/10 border border-green-500/20 rounded-xl p-2 text-center">
					<div className="text-[8px] text-green-400 uppercase font-bold">Cashback Gerado</div>
					<div className="text-[11px] font-black text-green-400">R$ {earned.toFixed(2).replace(".", ",")}</div>
				</div>
				<div className="bg-[#24549C]/10 border border-[#24549C]/20 rounded-xl p-2 text-center">
					<div className="text-[8px] text-[#24549C] uppercase font-bold">Novo Saldo</div>
					<div className="text-[11px] font-black text-[#24549C]">R$ {newBalance.toFixed(2).replace(".", ",")}</div>
				</div>
			</motion.div>
		</div>
	);
}

function POIFlowDevice() {
	const [currentStep, setCurrentStep] = useState<FlowStep>("home");
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const advance = useCallback(() => {
		setCurrentStep((prev) => {
			const idx = FLOW_STEPS.indexOf(prev);
			return FLOW_STEPS[(idx + 1) % FLOW_STEPS.length];
		});
	}, []);

	useEffect(() => {
		timeoutRef.current = setTimeout(advance, STEP_DURATIONS[currentStep]);
		return () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
		};
	}, [currentStep, advance]);

	return (
		<div className="relative w-full max-w-md mx-auto">
			<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[110%] h-[110%] bg-[#24549C]/12 blur-3xl rounded-full -z-10" />
			<div className="bg-zinc-950 border border-white/10 rounded-[1.5rem] shadow-2xl shadow-black/40 overflow-hidden">
				{/* Title bar */}
				<div className="flex items-center px-3 py-2 bg-zinc-900/80 border-b border-white/5 gap-1.5">
					<div className="w-2 h-2 rounded-full bg-red-500/60" />
					<div className="w-2 h-2 rounded-full bg-yellow-500/60" />
					<div className="w-2 h-2 rounded-full bg-green-500/60" />
					<div className="ml-2 flex-1 h-3 bg-white/5 rounded-full max-w-[120px]" />
					<div className="ml-auto text-[8px] text-white/30 font-medium">app.recompracrm.com.br/poi</div>
				</div>

				{/* Content */}
				<div className="p-3 min-h-[300px]">
					<AnimatePresence mode="wait">
						<motion.div
							key={currentStep}
							initial={{ opacity: 0, x: 20 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0, x: -20 }}
							transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
							className="h-[280px]"
						>
							{currentStep === "home" && <HomeStep />}
							{currentStep === "client" && <ClientStep active={currentStep === "client"} />}
							{currentStep === "saleValue" && <SaleValueStep active={currentStep === "saleValue"} />}
							{currentStep === "cashback" && <CashbackApplyStep active={currentStep === "cashback"} />}
							{currentStep === "confirmation" && <ConfirmationStep active={currentStep === "confirmation"} />}
							{currentStep === "success" && <SuccessStep active={currentStep === "success"} />}
						</motion.div>
					</AnimatePresence>
				</div>

				{/* Progress dots */}
				<div className="flex items-center justify-center gap-1.5 pb-3">
					{FLOW_STEPS.map((step) => (
						<div key={step} className={cn("h-1 rounded-full transition-all duration-500", currentStep === step ? "w-4 bg-[#FFB900]" : "w-1 bg-white/15")} />
					))}
				</div>
			</div>
		</div>
	);
}

const FEATURES = [
	{ icon: ShoppingCart, title: "Tablet no balcão", description: "Cliente vê o saldo na hora da compra. Interface Kiosk inclusa e sempre disponível." },
	{ icon: Coins, title: "Sem download de app", description: "Só o WhatsApp é necessário. Zero fricção para o consumidor." },
	{ icon: Trophy, title: "Resgate instantâneo", description: "Em segundos, o cashback é descontado no total da venda." },
];

export default function POSSection() {
	return (
		<section id="plataforma" className="py-20 lg:py-28 bg-white relative overflow-hidden">
			<div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

			<div className="container mx-auto max-w-7xl px-6 lg:px-8">
				<div className="grid lg:grid-cols-2 gap-16 items-center">
					{/* Left: Copy */}
					<motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
						<div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#FFB900]/10 border border-[#FFB900]/20 text-[#FFB900] text-sm font-bold mb-6">
							<ShoppingCart className="w-4 h-4" />
							Ponto de Interação
						</div>
						<h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 leading-tight mb-6 tracking-tight">
							Uma experiência <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#24549C] to-blue-500">premium</span> no seu caixa.
						</h2>
						<p className="text-lg text-slate-600 leading-relaxed mb-8">
							Não exija downloads de aplicativos ou preenchimento de formulários longos. Seu cliente só precisa informar o{" "}
							<span className="font-semibold text-slate-800">WhatsApp para pontuar</span>,{" "}
							<span className="font-semibold text-slate-800">resgatar descontos</span> ou{" "}
							<span className="font-semibold text-slate-800">trocar por prêmios físicos</span>.
						</p>

						<div className="flex flex-col gap-4 mb-8">
							{FEATURES.map((feature, idx) => {
								const Icon = feature.icon;
								return (
									<motion.div
										key={feature.title}
										initial={{ opacity: 0, x: -20 }}
										whileInView={{ opacity: 1, x: 0 }}
										viewport={{ once: true }}
										transition={{ delay: idx * 0.1, duration: 0.4 }}
										className="flex items-start gap-4"
									>
										<div className="w-10 h-10 rounded-xl bg-[#24549C]/8 flex items-center justify-center shrink-0">
											<Icon className="w-5 h-5 text-[#24549C]" />
										</div>
										<div>
											<h4 className="font-bold text-slate-900 mb-0.5">{feature.title}</h4>
											<p className="text-sm text-slate-500">{feature.description}</p>
										</div>
									</motion.div>
								);
							})}
						</div>

						<motion.button
							whileHover={{ scale: 1.02 }}
							whileTap={{ scale: 0.98 }}
							type="button"
							onClick={() =>
								captureClientEvent({
									event: "landing_cta_clicked",
									properties: {
										cta_id: "pos_simular_resgate",
										location: "pos_section",
									},
								})
							}
							className="bg-[#24549C] text-white px-8 py-4 rounded-2xl font-bold text-base shadow-xl shadow-blue-900/20 hover:bg-[#1e4682] transition-colors"
						>
							Simular Resgate agora
						</motion.button>
					</motion.div>

					{/* Right: Interactive Device */}
					<motion.div
						initial={{ opacity: 0, x: 30 }}
						whileInView={{ opacity: 1, x: 0 }}
						viewport={{ once: true }}
						transition={{ duration: 0.6, delay: 0.2 }}
					>
						<POIFlowDevice />
					</motion.div>
				</div>
			</div>
		</section>
	);
}
