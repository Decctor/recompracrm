"use client";

import { cn } from "@/lib/utils";
import { ArrowDownRight, Banknote, CircleCheck, Coins, Layers, type LucideIcon, ShoppingBag } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const STEP_INTERVAL_MS = 1800;

const CHAIN: { title: string; text: string; detail: string; icon: LucideIcon; tone: "neutral" | "green" | "amber" }[] = [
	{
		title: "Venda confirmada",
		text: "No PDV, na mesa ou no pedido da loja digital.",
		detail: "Pedido #1284 · R$ 91,90",
		icon: ShoppingBag,
		tone: "neutral",
	},
	{
		title: "Lançamento contábil",
		text: "Débito na conta da forma de pagamento, crédito em receitas.",
		detail: "D Caixa · C Receita",
		icon: Layers,
		tone: "neutral",
	},
	{
		title: "Transações",
		text: "Uma por forma de pagamento, com previsão de recebimento.",
		detail: "PIX R$ 50,00 · Crédito R$ 41,90",
		icon: Banknote,
		tone: "neutral",
	},
	{ title: "Nota fiscal", text: "NFC-e ou NF-e emitida e guardada com XML e DANFE.", detail: "AUTORIZADO", icon: CircleCheck, tone: "green" },
	{ title: "Baixa no estoque", text: "Uma saída por item, com saldo antes e depois.", detail: "9 → 8 un", icon: ArrowDownRight, tone: "neutral" },
	{ title: "Cashback creditado", text: "Pelas regras do seu programa, com aviso no WhatsApp.", detail: "+ R$ 4,60", icon: Coins, tone: "amber" },
];

const CHIP_TONE = {
	neutral: "rounded-lg bg-white/8 px-2.5 py-1.5 text-white/85",
	green: "rounded-[14px] bg-[#22c55e] px-3 py-1.5 text-white",
	amber: "rounded-full bg-[#ffb900] px-3 py-1.5 text-[#171717]",
} as const;

// Os seis passos acendem em sequência enquanto a grade está visível. Com `prefers-reduced-motion`
// o primeiro passo fica destacado e nada se move.
export function SaleChainGrid() {
	const ref = useRef<HTMLOListElement>(null);
	const [step, setStep] = useState(0);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
		let inView = false;
		let timer: ReturnType<typeof setInterval> | undefined;

		const sync = () => {
			const shouldRun = inView && !motion.matches;
			if (shouldRun && !timer) {
				timer = setInterval(() => {
					if (!document.hidden) setStep((s) => (s + 1) % CHAIN.length);
				}, STEP_INTERVAL_MS);
			} else if (!shouldRun && timer) {
				clearInterval(timer);
				timer = undefined;
			}
		};

		const observer = new IntersectionObserver(
			([entry]) => {
				inView = entry.isIntersecting;
				sync();
			},
			{ threshold: 0.3 },
		);
		observer.observe(el);
		motion.addEventListener("change", sync);

		return () => {
			observer.disconnect();
			motion.removeEventListener("change", sync);
			if (timer) clearInterval(timer);
		};
	}, []);

	return (
		<ol
			ref={ref}
			className="mt-16 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))] gap-px overflow-hidden rounded-[20px] border border-white/8 bg-white/8 p-0"
		>
			{CHAIN.map((item, index) => {
				const on = index === step;
				const Icon = item.icon;
				return (
					<li
						key={item.title}
						aria-current={on ? "step" : undefined}
						className={cn(
							"flex min-h-[300px] flex-col p-6 transition-[background-color] duration-[400ms] max-md:min-h-0",
							on ? "bg-[#13223b]" : "bg-[#0b1628]",
						)}
					>
						<div className="flex items-center justify-between">
							<span className="text-[12px] font-semibold text-white/45">{String(index + 1).padStart(2, "0")}</span>
							<span
								className={cn(
									"block size-2 rounded-[4px] transition-[background-color,box-shadow] duration-[400ms]",
									on ? "bg-[#ffb900] shadow-[0_0_0_4px_rgba(255,185,0,0.18)]" : "bg-white/15",
								)}
							/>
						</div>
						<p className="mt-10 text-[17px] font-semibold tracking-[-0.01em] max-md:mt-6">{item.title}</p>
						<p className="mt-2 text-[14px] leading-[1.5] text-white/60">{item.text}</p>
						<div className="mt-auto pt-6">
							<span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-medium leading-[1.25]", CHIP_TONE[item.tone])}>
								<Icon className="size-3.5 flex-none" aria-hidden />
								{item.detail}
							</span>
						</div>
					</li>
				);
			})}
		</ol>
	);
}
