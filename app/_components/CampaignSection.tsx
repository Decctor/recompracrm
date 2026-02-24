"use client";

import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import {
	ArrowLeft,
	Bell,
	Camera,
	Check,
	CheckCheck,
	ChevronRight,
	Clock,
	Crown,
	Gift,
	MessageSquare,
	Mic,
	Paperclip,
	Phone,
	Send,
	Smile,
	UserRound,
	Video,
	Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types & Constants ───

type AnimationPhase = "dashboard" | "sending" | "whatsapp";

const PHASE_DURATIONS: Record<AnimationPhase, number> = {
	dashboard: 6000,
	sending: 2000,
	whatsapp: 7500,
};

const PHASES: AnimationPhase[] = ["dashboard", "sending", "whatsapp"];

// ─── Hooks ───

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

function useTypewriter(text: string, speed: number, active: boolean, delay = 0) {
	const [displayed, setDisplayed] = useState("");

	useEffect(() => {
		if (!active) {
			setDisplayed("");
			return;
		}
		let i = 0;
		let interval: ReturnType<typeof setInterval>;
		const timeout = setTimeout(() => {
			interval = setInterval(() => {
				if (i < text.length) {
					setDisplayed(text.slice(0, i + 1));
					i++;
				} else {
					clearInterval(interval);
				}
			}, speed);
		}, delay);
		return () => {
			clearTimeout(timeout);
			clearInterval(interval);
		};
	}, [text, speed, active, delay]);

	return displayed;
}

// ─── Dashboard Phase: Backend detecting inactive client ───

function DashboardPhase({ active }: { active: boolean }) {
	const dayCount = useAnimatedCounter(30, 2500, active);
	const [ruleTriggered, setRuleTriggered] = useState(false);
	const [showNotification, setShowNotification] = useState(false);

	useEffect(() => {
		if (!active) {
			setRuleTriggered(false);
			setShowNotification(false);
			return;
		}
		const triggerTimer = setTimeout(() => setRuleTriggered(true), 3000);
		const notifTimer = setTimeout(() => setShowNotification(true), 4000);
		return () => {
			clearTimeout(triggerTimer);
			clearTimeout(notifTimer);
		};
	}, [active]);

	const isWarning = dayCount >= 25;
	const isTriggered = dayCount >= 30;

	return (
		<div className="flex flex-col h-full">
			{/* Mini dashboard header */}
			<div className="flex items-center gap-2 px-3 py-2 bg-white/[0.03] border-b border-white/5 rounded-t-lg mb-2">
				<Bell className="w-3 h-3 text-white/40" />
				<span className="text-[0.5rem] font-bold text-white/50 uppercase tracking-wider">Automação de Campanhas</span>
				<div className="ml-auto flex items-center gap-1">
					<div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
					<span className="text-[0.4rem] text-green-400 font-medium">Ativo</span>
				</div>
			</div>

			{/* Rule card */}
			<div className="mx-1 mb-2 bg-white/[0.02] border border-white/5 rounded-lg p-2">
				<div className="flex items-center gap-1.5 mb-1.5">
					<Zap className="w-2.5 h-2.5 text-blue-400" />
					<span className="text-[0.45rem] font-bold text-blue-400 uppercase tracking-wider">Regra: Reativação Automática</span>
				</div>
				<div className="flex items-center gap-1 text-[0.4rem] text-white/40">
					<Clock className="w-2 h-2" />
					<span>Inativo &gt; 30 dias → R$ 25 cashback + WhatsApp</span>
				</div>
			</div>

			{/* Client card being monitored */}
			<div className="mx-1 flex-1 flex flex-col gap-2">
				<div className="text-[0.4rem] text-white/30 uppercase font-bold tracking-wider px-1">Clientes monitorados</div>

				{/* Faded background clients */}
				<div className="opacity-30 bg-white/[0.02] border border-white/5 rounded-lg p-1.5 flex items-center gap-2">
					<div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center">
						<UserRound className="w-2.5 h-2.5 text-white/40" />
					</div>
					<div className="flex-1">
						<div className="text-[0.4rem] text-white/50 font-bold">Carlos Souza</div>
						<div className="text-[0.35rem] text-white/30">Última compra: 12 dias</div>
					</div>
					<div className="text-[0.4rem] text-green-400/50 font-bold">OK</div>
				</div>

				{/* The TARGET client card */}
				<motion.div
					className={cn(
						"bg-white/[0.03] border rounded-lg p-2 flex items-center gap-2 transition-colors duration-500 relative overflow-hidden",
						isTriggered ? "border-red-500/50 bg-red-500/5" : isWarning ? "border-yellow-500/30 bg-yellow-500/5" : "border-white/5",
					)}
					animate={isTriggered ? { scale: [1, 1.02, 1] } : {}}
					transition={{ duration: 0.4 }}
				>
					<div
						className={cn(
							"w-6 h-6 rounded-full flex items-center justify-center transition-colors duration-500",
							isTriggered ? "bg-red-500/20" : isWarning ? "bg-yellow-500/10" : "bg-white/10",
						)}
					>
						<UserRound className={cn("w-3 h-3 transition-colors", isTriggered ? "text-red-400" : isWarning ? "text-yellow-400" : "text-white/40")} />
					</div>
					<div className="flex-1 min-w-0">
						<div className="text-[0.5rem] text-white/80 font-bold">Maria Silva</div>
						<div className="text-[0.35rem] text-white/40">(34) 99876-5432</div>
					</div>
					<div className="text-right">
						<div
							className={cn(
								"text-[0.6rem] font-black tabular-nums transition-colors duration-300",
								isTriggered ? "text-red-400" : isWarning ? "text-yellow-400" : "text-white/60",
							)}
						>
							{dayCount}d
						</div>
						<div className="text-[0.3rem] text-white/30 uppercase">sem compra</div>
					</div>

					{/* Pulse ring when triggered */}
					{isTriggered && (
						<motion.div
							className="absolute inset-0 border-2 border-red-500/40 rounded-lg"
							initial={{ opacity: 1 }}
							animate={{ opacity: 0, scale: 1.05 }}
							transition={{ duration: 1, repeat: 2 }}
						/>
					)}
				</motion.div>

				{/* Another faded client */}
				<div className="opacity-30 bg-white/[0.02] border border-white/5 rounded-lg p-1.5 flex items-center gap-2">
					<div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center">
						<UserRound className="w-2.5 h-2.5 text-white/40" />
					</div>
					<div className="flex-1">
						<div className="text-[0.4rem] text-white/50 font-bold">Ana Costa</div>
						<div className="text-[0.35rem] text-white/30">Última compra: 5 dias</div>
					</div>
					<div className="text-[0.4rem] text-green-400/50 font-bold">OK</div>
				</div>
			</div>

			{/* Triggered notification */}
			<AnimatePresence>
				{showNotification && (
					<motion.div
						initial={{ opacity: 0, y: 10, scale: 0.95 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0 }}
						transition={{ type: "spring", stiffness: 400, damping: 25 }}
						className="mx-1 mt-2 bg-blue-500/10 border border-blue-500/30 rounded-lg p-2 flex items-center gap-2"
					>
						<div className="bg-blue-500/20 p-1 rounded-md">
							<Zap className="w-3 h-3 text-blue-400" />
						</div>
						<div className="flex-1 min-w-0">
							<div className="text-[0.45rem] font-bold text-blue-400">Campanha disparada!</div>
							<div className="text-[0.35rem] text-blue-300/60">Enviando R$ 25 cashback + WhatsApp para Maria</div>
						</div>
						<ChevronRight className="w-3 h-3 text-blue-400/40" />
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

// ─── Sending Phase: Visual transition ───

function SendingPhase() {
	return (
		<div className="flex flex-col h-full items-center justify-center gap-3">
			{/* Animated sending visual */}
			<motion.div className="relative" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.4 }}>
				{/* Pulse rings */}
				{[0, 1, 2].map((i) => (
					<motion.div
						key={i}
						className="absolute inset-0 border border-blue-500/30 rounded-full"
						initial={{ scale: 1, opacity: 0.6 }}
						animate={{ scale: 2.5 + i * 0.5, opacity: 0 }}
						transition={{
							duration: 1.5,
							repeat: Number.POSITIVE_INFINITY,
							delay: i * 0.4,
							ease: "easeOut",
						}}
					/>
				))}
				<div className="relative bg-blue-500/20 p-4 rounded-full border border-blue-500/30">
					<Send className="w-6 h-6 text-blue-400" />
				</div>
			</motion.div>

			<motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="text-center">
				<div className="text-[0.6rem] font-black text-white/80 uppercase tracking-tight">Enviando via WhatsApp</div>
				<div className="text-[0.45rem] text-white/40 mt-0.5">Maria Silva • (34) 99876-5432</div>
			</motion.div>

			{/* Cashback deposit animation */}
			<motion.div
				initial={{ opacity: 0, y: 10 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ delay: 0.6 }}
				className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-1.5"
			>
				<Gift className="w-3 h-3 text-green-400" />
				<span className="text-[0.5rem] font-bold text-green-400">+R$ 25,00 cashback creditado</span>
			</motion.div>
		</div>
	);
}

// ─── WhatsApp Phase: Client receiving the message ───

function WhatsAppPhase({ active }: { active: boolean }) {
	const [showBubble, setShowBubble] = useState(false);
	const [showTicks, setShowTicks] = useState(false);
	const [showBlueTicks, setShowBlueTicks] = useState(false);

	const message = useTypewriter(
		"Oi Maria! \u{1F31F} Sentimos sua falta! Liberamos R$ 25,00 de cashback especial pra você. Válido por 15 dias. Passa aqui pra aproveitar!",
		25,
		showBubble,
	);

	useEffect(() => {
		if (!active) {
			setShowBubble(false);
			setShowTicks(false);
			setShowBlueTicks(false);
			return;
		}
		const bubbleTimer = setTimeout(() => setShowBubble(true), 600);
		const ticksTimer = setTimeout(() => setShowTicks(true), 4500);
		const blueTicksTimer = setTimeout(() => setShowBlueTicks(true), 5800);
		return () => {
			clearTimeout(bubbleTimer);
			clearTimeout(ticksTimer);
			clearTimeout(blueTicksTimer);
		};
	}, [active]);

	return (
		<div className="flex flex-col h-full rounded-xl overflow-hidden">
			{/* WhatsApp header */}
			<div className="bg-[#075E54] px-2.5 py-2 flex items-center gap-2">
				<ArrowLeft className="w-3.5 h-3.5 text-white/80" />
				<div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center shrink-0">
					<span className="text-[0.5rem] font-bold text-white">LE</span>
				</div>
				<div className="flex-1 min-w-0">
					<div className="text-[0.55rem] font-bold text-white truncate">Loja Exemplo</div>
					<div className="text-[0.35rem] text-white/60">online</div>
				</div>
				<div className="flex items-center gap-2">
					<Video className="w-3.5 h-3.5 text-white/70" />
					<Phone className="w-3 h-3 text-white/70" />
				</div>
			</div>

			{/* Chat area with WhatsApp-style background */}
			<div className="flex-1 bg-[#0B141A] relative px-2 py-2 flex flex-col justify-end gap-1.5">
				{/* Subtle wallpaper pattern */}
				<div
					className="absolute inset-0 opacity-[0.03]"
					style={{
						backgroundImage:
							"url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
					}}
				/>

				{/* Date separator */}
				<div className="flex justify-center mb-1">
					<span className="text-[0.35rem] text-white/40 bg-[#1D2A33] px-2 py-0.5 rounded-md">HOJE</span>
				</div>

				{/* Previous context message (from user, old) */}
				<div className="flex justify-end">
					<div className="bg-[#005C4B] rounded-lg rounded-tr-sm px-2 py-1 max-w-[75%]">
						<p className="text-[0.45rem] text-white/90 leading-relaxed">Obrigada! Volto sim 😊</p>
						<div className="flex items-center justify-end gap-0.5 mt-0.5">
							<span className="text-[0.3rem] text-white/40">14:22</span>
							<CheckCheck className="w-2.5 h-2.5 text-[#53BDEB]" />
						</div>
					</div>
				</div>

				{/* Date gap indicator */}
				<div className="flex justify-center my-0.5">
					<span className="text-[0.3rem] text-white/30 bg-[#1D2A33] px-2 py-0.5 rounded-md">30 DIAS DEPOIS</span>
				</div>

				{/* The reactivation message */}
				<AnimatePresence>
					{showBubble && (
						<motion.div
							initial={{ opacity: 0, y: 10, scale: 0.95 }}
							animate={{ opacity: 1, y: 0, scale: 1 }}
							transition={{ type: "spring", stiffness: 400, damping: 30 }}
							className="flex justify-start"
						>
							<div className="bg-[#1D2A33] rounded-lg rounded-tl-sm px-2 py-1.5 max-w-[85%] border border-white/5">
								{/* Cashback card preview */}
								<div className="bg-gradient-to-r from-[#24549C]/30 to-[#24549C]/10 border border-[#24549C]/20 rounded-md p-1.5 mb-1.5 flex items-center gap-1.5">
									<div className="bg-[#24549C]/30 p-1 rounded-md shrink-0">
										<Gift className="w-3 h-3 text-[#24549C]" />
									</div>
									<div>
										<div className="text-[0.35rem] text-[#24549C] font-bold uppercase">Cashback Especial</div>
										<div className="text-[0.55rem] font-black text-white">R$ 25,00</div>
									</div>
								</div>

								<p className="text-[0.45rem] text-white/90 leading-relaxed min-h-[2rem]">
									{message}
									{showBubble && message.length < 117 && <span className="animate-pulse text-white/40">|</span>}
								</p>

								<div className="flex items-center justify-end gap-0.5 mt-1">
									<span className="text-[0.3rem] text-white/40">09:00</span>
									{showTicks && (
										<motion.div initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring" }}>
											<CheckCheck className={cn("w-2.5 h-2.5 transition-colors duration-500", showBlueTicks ? "text-[#53BDEB]" : "text-white/40")} />
										</motion.div>
									)}
								</div>
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>

			{/* WhatsApp input bar */}
			<div className="bg-[#1D2A33] px-2 py-1.5 flex items-center gap-1.5 border-t border-white/5">
				<Smile className="w-3.5 h-3.5 text-white/40" />
				<div className="flex-1 bg-[#2A3942] rounded-full px-2 py-1 flex items-center gap-1">
					<span className="text-[0.4rem] text-white/30">Mensagem</span>
					<div className="ml-auto flex items-center gap-1">
						<Paperclip className="w-2.5 h-2.5 text-white/30" />
						<Camera className="w-2.5 h-2.5 text-white/30" />
					</div>
				</div>
				<div className="w-5 h-5 rounded-full bg-[#00A884] flex items-center justify-center">
					<Mic className="w-2.5 h-2.5 text-white" />
				</div>
			</div>
		</div>
	);
}

// ─── Main wireframe component ───

function CampaignFlowWireframe() {
	const [currentPhase, setCurrentPhase] = useState<AnimationPhase>("dashboard");
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const advancePhase = useCallback(() => {
		setCurrentPhase((prev) => {
			const idx = PHASES.indexOf(prev);
			return PHASES[(idx + 1) % PHASES.length];
		});
	}, []);

	useEffect(() => {
		const duration = PHASE_DURATIONS[currentPhase];
		timeoutRef.current = setTimeout(advancePhase, duration);
		return () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
		};
	}, [currentPhase, advancePhase]);

	return (
		<div className="relative w-full max-w-md mx-auto">
			{/* Glow behind */}
			<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[110%] h-[110%] bg-blue-500/10 blur-3xl rounded-full -z-10" />

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
				<div className="p-2 min-h-[300px] sm:min-h-[320px]">
					<AnimatePresence mode="wait">
						<motion.div
							key={currentPhase}
							initial={{ opacity: 0, x: 30 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0, x: -30 }}
							transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
							className="h-[280px] sm:h-[300px]"
						>
							{currentPhase === "dashboard" && <DashboardPhase active={currentPhase === "dashboard"} />}
							{currentPhase === "sending" && <SendingPhase />}
							{currentPhase === "whatsapp" && <WhatsAppPhase active={currentPhase === "whatsapp"} />}
						</motion.div>
					</AnimatePresence>
				</div>

				{/* Bottom progress dots */}
				<div className="flex items-center justify-center gap-1.5 pb-3">
					{PHASES.map((phase) => (
						<div
							key={phase}
							className={cn("h-1 rounded-full transition-all duration-500", currentPhase === phase ? "w-5 bg-blue-500" : "w-1 bg-white/15")}
						/>
					))}
				</div>
			</div>
		</div>
	);
}

// ─── Exported Section ───

export default function CampaignSection() {
	return (
		<section id="campanhas" className="py-24 bg-slate-50 border-y border-black/5 relative overflow-hidden">
			<div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
				<div className="grid lg:grid-cols-2 gap-16 items-center">
					<div className="relative order-1">
						<CampaignFlowWireframe />
					</div>

					<div className="order-2">
						<div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-[#24549C] text-sm font-bold mb-6">
							<Zap className="w-4 h-4" />
							Campanhas de Reativação
						</div>
						<h2 className="text-3xl md:text-5xl font-extrabold mb-6 text-slate-900 leading-tight">
							Cliente sumiu? <br />
							<span className="text-brand">O sistema traz de volta.</span>
						</h2>
						<p className="text-lg text-slate-600 mb-8 leading-relaxed font-medium">
							Defina: &quot;cliente inativo há 30 dias recebe R$ 15 de cashback + mensagem no WhatsApp&quot;. O resto é automático. Você configura uma vez e
							funciona para sempre.
						</p>

						<div className="grid gap-4 mb-8">
							<div className="p-5 rounded-2xl bg-white border border-slate-200 hover:border-[#24549C]/30 hover:shadow-lg hover:shadow-blue-900/5 transition-all">
								<h4 className="font-bold text-slate-900 text-lg mb-2 flex items-center gap-2">
									<MessageSquare className="w-5 h-5 text-[#24549C]" /> Reativação Automática
								</h4>
								<p className="text-[15px] text-slate-600 font-medium">
									O sistema identifica quem parou de comprar e dispara cashback + mensagem. Sem você precisar lembrar.
								</p>
							</div>
							<div className="p-5 rounded-2xl bg-white border border-slate-200 hover:border-[#24549C]/30 hover:shadow-lg hover:shadow-blue-900/5 transition-all">
								<h4 className="font-bold text-slate-900 text-lg mb-2 flex items-center gap-2">
									<Crown className="w-5 h-5 text-[#24549C]" /> Datas Comemorativas
								</h4>
								<p className="text-[15px] text-slate-600 font-medium">
									Aniversário do cliente, Black Friday, datas especiais. Configure uma vez, roda todo ano.
								</p>
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
