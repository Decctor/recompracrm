"use client";

import { cn } from "@/lib/utils";
import { Check, History, Pause, Play } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MockCard } from "./primitives";

// Demonstração do resgate no Ponto de Interação: cinco telas do tablet que se alternam
// sozinhas. Só toca com o tablet na tela (IntersectionObserver), pausa ao clicar num passo
// ou no botão, e começa parada para quem pediu menos movimento no sistema.

const STEP_MS = 3200;
const KEYS = ["7", "8", "9", "4", "5", "6", "1", "2", "3"];
const TABLET_TABS = ["Cliente", "Resgate", "Senha", "Caixa", "Registro"];

const STEPS = [
	{ title: "O cliente se identifica pelo telefone", text: "O Ponto de Interação mostra o saldo disponível e o limite para aquela compra." },
	{ title: "Escolhe como usar", text: "Desconto direto no valor da compra ou troca por uma recompensa da loja." },
	{ title: "O atendente confirma com a senha", text: "Sem a senha do operador, nenhum saldo sai da conta do cliente." },
	{ title: "O desconto é aplicado no caixa", text: "O atendente lança no ERP o valor autorizado. O total a pagar já aparece na tela." },
	{ title: "Tudo fica no histórico", text: "Quanto foi resgatado, para quem, quando e quem aprovou." },
];

const HISTORY = [
	{ type: "Resgate", client: "Maria Silva", when: "Hoje, 14:32 · Ponto de Interação", by: "Ana", value: "− R$ 20,00", credit: false },
	{ type: "Acúmulo", client: "Maria Silva", when: "Hoje, 14:32 · Ponto de Interação", by: "Ana", value: "+ R$ 5,00", credit: true },
	{ type: "Acúmulo", client: "João Pereira", when: "Hoje, 11:08 · Integração Bling", by: "sistema", value: "+ R$ 3,40", credit: true },
];

const TINY_LABEL = "text-[9px] font-bold tracking-[0.08em] text-[#687a80] uppercase";
const MICRO_LABEL = "text-[8px] font-bold text-[#687a80] uppercase";

function Frame({ active, children }: { active: boolean; children: ReactNode }) {
	return (
		<div
			aria-hidden={!active}
			className={cn(
				"[grid-area:1/1] min-w-0 px-2.5 pt-[52px] pb-2.5 sm:px-3.5 sm:pb-3.5 transition-[opacity,transform] duration-[450ms] ease-out motion-reduce:transition-none",
				active ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none translate-y-1.5 opacity-0",
			)}
		>
			{children}
		</div>
	);
}

function Keypad() {
	return (
		<div className="grid grid-cols-3 gap-1.5">
			{KEYS.map((key) => (
				<span key={key} className="flex h-7 items-center justify-center rounded-lg bg-[#24549c] text-[13px] font-bold text-white">
					{key}
				</span>
			))}
		</div>
	);
}

function LookupScreen() {
	return (
		<div className="flex gap-3">
			<div className="flex min-w-0 flex-1 flex-col gap-2">
				<div className="rounded-[10px] border border-[#e3e8ea] p-2 text-center">
					<p className={TINY_LABEL}>Número de telefone</p>
					<p className="mt-0.5 text-[13px] font-bold whitespace-nowrap sm:text-[18px] sm:tracking-[0.03em]">(34) 98888-7777</p>
				</div>
				<Keypad />
			</div>
			<div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1.5 rounded-[10px] border border-[#bbf7d0] bg-[#f0fdf4] p-3 text-center">
				<p className="text-[9px] font-bold tracking-[0.1em] text-[#15803d] uppercase">Perfil encontrado</p>
				<p className="text-[16px] font-bold text-[#14532d]">Maria Silva</p>
				<div className="w-full rounded-lg bg-[#16a34a] p-2 text-white">
					<p className="text-[8px] font-bold tracking-[0.1em] uppercase opacity-85">Saldo disponível</p>
					<p className="mt-0.5 text-[20px] font-bold">R$ 42,00</p>
				</div>
			</div>
		</div>
	);
}

function AmountScreen() {
	return (
		<div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2.5">
			<div className="flex flex-col gap-2.5 rounded-[10px] border border-[#e3e8ea] p-3">
				<div className="flex items-center justify-between gap-1.5">
					<p className="text-[12px] font-bold">Usar cashback?</p>
					<span className="inline-flex rounded-full border border-[rgba(36,84,156,0.2)] p-0.5">
						<span className="rounded-full bg-[#24549c] px-2 py-[3px] text-[9px] font-bold text-white">SIM</span>
						<span className="px-2 py-[3px] text-[9px] font-bold text-[#24549c]">NÃO</span>
					</span>
				</div>
				<div className="grid grid-cols-2 gap-1.5">
					<div className="rounded-lg border border-[#eef1f2] p-2">
						<p className={MICRO_LABEL}>Seu saldo</p>
						<p className="mt-0.5 text-[14px] font-bold text-[#7a5117]">R$ 42,00</p>
					</div>
					<div className="rounded-lg border border-[#eef1f2] p-2">
						<p className={MICRO_LABEL}>Limite</p>
						<p className="mt-0.5 text-[14px] font-bold text-[#24549c]">R$ 24,00</p>
					</div>
				</div>
				<div className="rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] p-2 text-center">
					<p className={MICRO_LABEL}>Valor a resgatar</p>
					<p className="mt-0.5 text-[18px] font-bold">R$ 20,00</p>
				</div>
			</div>
			<div className="flex flex-col rounded-[10px] bg-[#24549c] p-3 text-white">
				<p className="text-[12px] font-bold">Resumo da venda</p>
				<div className="mt-auto flex flex-col gap-1.5 pt-4">
					<div className="flex justify-between text-[11px] opacity-80">
						<span>Subtotal</span>
						<span>R$ 120,00</span>
					</div>
					<div className="flex justify-between text-[11px] font-bold">
						<span>Desconto cashback</span>
						<span>− R$ 20,00</span>
					</div>
				</div>
				<div className="my-2.5 h-px bg-white/20" />
				<p className="text-[9px] font-bold tracking-[0.08em] uppercase opacity-80">Total a pagar</p>
				<p className="mt-0.5 text-[24px] font-bold">R$ 100,00</p>
			</div>
		</div>
	);
}

function PasswordScreen({ active }: { active: boolean }) {
	return (
		<div className="mx-auto flex max-w-[300px] flex-col gap-2.5">
			<div className="rounded-[10px] bg-[rgba(36,84,156,0.08)] p-2.5 text-center">
				<p className={TINY_LABEL}>Cliente</p>
				<p className="mt-0.5 text-[14px] font-bold">Maria Silva</p>
				<p className={cn(TINY_LABEL, "mt-1.5")}>Total a pagar</p>
				<p className="mt-0.5 text-[20px] font-bold text-[#24549c]">R$ 100,00</p>
			</div>
			<div className="flex flex-col items-center gap-2 rounded-[10px] border border-[#e3e8ea] p-2.5">
				<p className={TINY_LABEL}>Senha do operador (5 dígitos)</p>
				<div className="flex gap-1.5">
					{[0, 1, 2, 3, 4].map((i) => (
						<span
							key={i}
							className={cn(
								"flex h-8 w-[26px] items-center justify-center rounded-md border-2 text-[18px] font-bold transition-[border-color] duration-300",
								active ? "border-[#24549c] bg-[rgba(36,84,156,0.05)]" : "border-[#e3e8ea] bg-white",
							)}
							style={{ transitionDelay: `${i * 0.12}s` }}
						>
							•
						</span>
					))}
				</div>
			</div>
			<div className="flex items-center justify-center gap-1.5 rounded-lg bg-[#16a34a] p-2 text-[11px] font-bold tracking-[0.06em] text-white uppercase">
				Finalizar
				<Check className="h-[13px] w-[13px] shrink-0" strokeWidth={2.5} aria-hidden />
			</div>
		</div>
	);
}

function CashierScreen() {
	return (
		<div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-stretch gap-2.5">
			<div className="flex flex-col items-center justify-center gap-2 p-2 text-center">
				<span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#dcfce7] text-[#16a34a]">
					<Check className="h-[22px] w-[22px]" strokeWidth={2.5} aria-hidden />
				</span>
				<p className="text-[14px] font-bold">Resgate autorizado</p>
				<p className="text-[11px] text-[#687a80]">Aprovado por Ana · 14:32</p>
			</div>
			<div className="flex flex-col gap-2 rounded-[10px] border border-dashed border-[#24549c] bg-[rgba(36,84,156,0.04)] p-3">
				<p className="text-[9px] font-bold tracking-[0.08em] text-[#24549c] uppercase">Lançar no caixa</p>
				<div className="flex justify-between text-[12px]">
					<span className="text-[#5b6a70]">Desconto</span>
					<span className="font-bold">R$ 20,00</span>
				</div>
				<div className="flex justify-between text-[12px]">
					<span className="text-[#5b6a70]">Total a pagar</span>
					<span className="font-bold">R$ 100,00</span>
				</div>
				<p className="mt-auto text-[10px] leading-[1.4] text-[#687a80]">O atendente aplica este desconto na venda do ERP.</p>
			</div>
		</div>
	);
}

function RecordScreen() {
	return (
		<div className="flex min-h-[150px] flex-col items-center justify-center gap-2 text-center">
			<span className="flex h-11 w-11 items-center justify-center rounded-full bg-[rgba(36,84,156,0.1)] text-[#24549c]">
				<History className="h-[22px] w-[22px]" aria-hidden />
			</span>
			<p className="text-[14px] font-bold">Operação registrada</p>
			<div className="grid w-full max-w-[300px] grid-cols-2 gap-2">
				<div className="rounded-lg bg-[#f0fdf4] p-2">
					<p className="text-[8px] font-bold text-[#15803d] uppercase">Cashback gerado</p>
					<p className="mt-0.5 text-[14px] font-bold text-[#15803d]">R$ 5,00</p>
				</div>
				<div className="rounded-lg bg-[rgba(36,84,156,0.08)] p-2">
					<p className={MICRO_LABEL}>Novo saldo</p>
					<p className="mt-0.5 text-[14px] font-bold text-[#24549c]">R$ 27,00</p>
				</div>
			</div>
		</div>
	);
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
	const query = window.matchMedia(REDUCED_MOTION_QUERY);
	query.addEventListener("change", onChange);
	return () => query.removeEventListener("change", onChange);
}

function usePrefersReducedMotion() {
	return useSyncExternalStore(
		subscribeReducedMotion,
		() => window.matchMedia(REDUCED_MOTION_QUERY).matches,
		() => false,
	);
}

export function RedemptionFlow() {
	const [step, setStep] = useState(0);
	// null = o visitante ainda não mexeu: toca, a menos que o sistema peça menos movimento.
	const [userPlaying, setUserPlaying] = useState<boolean | null>(null);
	const [inView, setInView] = useState(false);
	const stageRef = useRef<HTMLDivElement>(null);
	const reducedMotion = usePrefersReducedMotion();
	const playing = userPlaying ?? !reducedMotion;

	useEffect(() => {
		const stage = stageRef.current;
		if (!stage) return;
		const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.35 });
		observer.observe(stage);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		if (!playing || !inView) return;
		const timer = setInterval(() => {
			if (!document.hidden) setStep((s) => (s + 1) % STEPS.length);
		}, STEP_MS);
		return () => clearInterval(timer);
	}, [playing, inView]);

	const goTo = (index: number) => {
		setStep(index);
		setUserPlaying(false);
	};

	return (
		<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] items-start gap-12 rounded-[28px] bg-[#eef2f6] p-6 sm:p-14">
			<div>
				<ol className="flex flex-col">
					{STEPS.map((s, i) => {
						const on = i === step;
						return (
							<li key={s.title} className="border-t border-[#eef1f2]">
								<button
									type="button"
									onClick={() => goTo(i)}
									aria-current={on ? "step" : undefined}
									className={cn(
										"-mx-3 grid w-[calc(100%+24px)] cursor-pointer grid-cols-[32px_1fr] gap-4 rounded-[10px] border-0 px-3 py-4 text-left transition-[background-color] duration-300",
										on ? "bg-[#f7f8fa]" : "bg-transparent hover:bg-[#f7f8fa]/60",
									)}
								>
									<span
										className={cn(
											"inline-flex h-8 w-8 items-center justify-center rounded-lg border text-[13px] font-bold transition-all duration-300",
											on ? "border-[#24549c] bg-[#24549c] text-white" : "border-[#e3e8ea] bg-white text-[#24549c]",
										)}
									>
										{i + 1}
									</span>
									<span className="block">
										<span className="block text-[16px] font-semibold text-[#0e1214]">{s.title}</span>
										<span className="mt-1 block text-[14px] leading-[1.55] text-[#5b6a70]">{s.text}</span>
									</span>
								</button>
							</li>
						);
					})}
				</ol>
				<div className="mt-5 rounded-[10px] border border-[#eef0f3] bg-[#f7f8fa] px-[18px] py-4 text-[14px] leading-[1.55] text-[#2b3538]">
					<strong className="font-semibold text-[#0e1214]">Seu ERP precisa aceitar desconto na venda.</strong> O Ponto de Interação calcula e autoriza o
					valor; o atendente lança esse desconto no caixa. Usando o ERP do RecompraCRM, o desconto entra direto na venda.
				</div>
			</div>

			<div className="flex min-w-0 flex-col gap-4">
				<div ref={stageRef} className="flex flex-col gap-2.5">
					<div className="rounded-[20px] border-8 border-[#262626] bg-[#262626]">
						<div className="grid overflow-hidden rounded-xl bg-white">
							<div className="z-[2] flex items-center justify-center gap-0.5 self-start sm:gap-1.5 border-b border-[#eef1f2] bg-[#fafafa] px-3 py-2 [grid-area:1/1]">
								{TABLET_TABS.map((label, i) => (
									<span
										key={label}
										className={cn(
											"rounded-[5px] px-1 py-[3px] text-[8px] font-bold tracking-[0.04em] uppercase transition-all duration-300 sm:px-[7px] sm:text-[9px] sm:tracking-[0.06em]",
											i === step ? "bg-[#24549c] text-white" : i < step ? "text-[#24549c]" : "text-[#8a979c]",
										)}
									>
										{label}
									</span>
								))}
							</div>
							<Frame active={step === 0}>
								<LookupScreen />
							</Frame>
							<Frame active={step === 1}>
								<AmountScreen />
							</Frame>
							<Frame active={step === 2}>
								<PasswordScreen active={step === 2} />
							</Frame>
							<Frame active={step === 3}>
								<CashierScreen />
							</Frame>
							<Frame active={step === 4}>
								<RecordScreen />
							</Frame>
						</div>
					</div>
					<div className="flex items-center gap-2.5">
						<button
							type="button"
							onClick={() => setUserPlaying(!playing)}
							aria-label={playing ? "Pausar demonstração" : "Reproduzir demonstração"}
							className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-[#e3e8ea] bg-white p-0 text-[#2b3538] hover:bg-[#f7f8fa]"
						>
							{playing ? <Pause className="h-3 w-3 fill-current" aria-hidden /> : <Play className="h-3 w-3 fill-current" aria-hidden />}
						</button>
						<div className="grid flex-1 grid-cols-5 gap-1" aria-hidden>
							{STEPS.map((s, i) => (
								<span
									key={s.title}
									className={cn("block h-1 rounded-sm transition-[background-color] duration-300", i <= step ? "bg-[#24549c]" : "bg-[#e3e8ea]")}
								/>
							))}
						</div>
						<span className="text-[11px] font-semibold tracking-[0.06em] whitespace-nowrap text-[#8a979c] uppercase">Ponto de Interação</span>
					</div>
				</div>

				<MockCard>
					<div className="flex items-center justify-between border-b border-[#e3e8ea] bg-[#fafafa] px-4 py-3">
						<p className="text-[13px] font-semibold">Histórico de transações</p>
						<span className="text-[11px] text-[#8a979c]">Painel da loja</span>
					</div>
					{HISTORY.map((row, i) => (
						<div
							key={`${row.type}-${row.client}-${row.value}`}
							className={cn(
								"grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto] items-center gap-3 border-b border-[#eef1f2] px-4 py-2.5 text-[12px] transition-[background-color] duration-300",
								step === 4 && i < 2 ? "bg-[rgba(36,84,156,0.06)]" : "bg-white",
							)}
						>
							<div className="min-w-0">
								<p className="font-semibold">
									{row.type} · {row.client}
								</p>
								<p className="mt-0.5 text-[#8a979c]">{row.when}</p>
							</div>
							<span className="text-[#5b6a70]">Aprovado por {row.by}</span>
							<span className={cn("font-semibold whitespace-nowrap", row.credit ? "text-[#15803d]" : "text-[#2b3538]")}>{row.value}</span>
						</div>
					))}
				</MockCard>
			</div>
		</div>
	);
}
