import { cn } from "@/lib/utils";
import {
	ArrowRight,
	Cake,
	CalendarClock,
	CircleCheck,
	Eye,
	Hourglass,
	ListChecks,
	type LucideIcon,
	MessageCircle,
	Receipt,
	Send,
	ShoppingCart,
	Sprout,
	TrendingDown,
	UserPlus,
	Zap,
} from "lucide-react";
import { MUTED, MockCard, RFM_SEGMENTS, formatCount } from "./mock-parts";

// Telas do construtor de campanhas (growth/campaigns/_module/builder/*, CampaignFunnelStages).

const SELECTED_RING = "border-[#24549c] shadow-[0_0_0_3px_rgba(36,84,156,0.25)]";
const IDLE_BORDER = "border-[rgba(36,84,156,0.1)]";

const BUILDER_STEPS = ["GATILHO", "PÚBLICO", "MENSAGEM", "EFEITOS", "REVISÃO"];

const TRIGGERS: { icon: LucideIcon; label: string; description: string }[] = [
	{ icon: ShoppingCart, label: "Nova compra", description: "Disparada quando o cliente realiza uma nova compra (com valor mínimo opcional)." },
	{ icon: UserPlus, label: "Primeira compra", description: "Disparada quando o cliente realiza a primeira compra na sua loja." },
	{ icon: Hourglass, label: "Cashback expirando", description: "Avisa o cliente com antecedência quando seu cashback estiver prestes a expirar." },
	{ icon: Cake, label: "Aniversário do cliente", description: "Disparada no aniversário do cliente — pode ser configurada antes ou depois da data." },
	{
		icon: Receipt,
		label: "Quantidade total de compras",
		description: "Disparada quando o cliente atinge uma quantidade total de compras (ex: 2ª compra, 3ª compra).",
	},
	{
		icon: TrendingDown,
		label: "Pior dia de vendas",
		description: "Calculado pelas últimas 8 semanas: dispara automaticamente no dia mais fraco da sua loja.",
	},
];
const SELECTED_TRIGGER = 2;

/** Herói das campanhas: o passo "Gatilho" do construtor, com o gatilho de cashback expirando escolhido. */
export function TriggerGridMock() {
	return (
		<MockCard className="gap-4 p-5">
			<div className="flex items-center justify-between gap-3">
				<p className="m-0 text-[18px] font-black tracking-[-0.025em]">Nova campanha</p>
				<span className={cn("text-[12px]", MUTED)}>Rascunho</span>
			</div>
			<div className="flex items-center gap-1.5 overflow-hidden">
				{BUILDER_STEPS.map((step, i) => (
					<span
						key={step}
						className={cn(
							"inline-flex h-7 flex-none items-center gap-1.5 rounded-full pr-2.5 pl-1 text-[11px] font-bold",
							i === 0 ? "bg-[#0e1214] text-white" : MUTED,
						)}
					>
						<span
							className={cn("flex size-5 items-center justify-center rounded-full text-[10px]", i === 0 ? "bg-[#ffb900] text-[#0e1214]" : "bg-[#f2f4f4]")}
						>
							{i + 1}
						</span>
						{step}
					</span>
				))}
			</div>
			<div>
				<p className="m-0 text-[14px] font-semibold tracking-[-0.01em]">EVENTOS — escolha o gatilho</p>
				<p className={cn("m-0 mt-0.5 text-[12px]", MUTED)}>
					Campanhas disparadas quando um cliente realiza uma ação (compra, atinge cashback, faz aniversário, etc).
				</p>
			</div>
			<div className="grid grid-cols-2 gap-2.5">
				{TRIGGERS.map(({ icon: Icon, label, description }, i) => {
					const selected = i === SELECTED_TRIGGER;
					return (
						<div key={label} className={cn("flex flex-col gap-2 rounded-xl border bg-white p-3.5", selected ? SELECTED_RING : IDLE_BORDER)}>
							<span
								className={cn(
									"flex size-9 items-center justify-center rounded-lg",
									selected ? "bg-[#24549c] text-white" : "bg-[rgba(36,84,156,0.1)] text-[#24549c]",
								)}
							>
								<Icon className="size-[15px]" aria-hidden />
							</span>
							<p className="m-0 text-[14px] font-semibold tracking-[-0.01em]">{label}</p>
							<p className={cn("m-0 line-clamp-2 text-[12px] leading-[1.4]", MUTED)}>{description}</p>
						</div>
					);
				})}
			</div>
		</MockCard>
	);
}

const CATEGORIES: { icon: LucideIcon; label: string; tagline: string; description: string; triggers: number }[] = [
	{
		icon: Zap,
		label: "Eventos",
		tagline: "Reaja a algo que o cliente fez",
		description: "Campanhas disparadas quando um cliente realiza uma ação (compra, atinge cashback, faz aniversário, etc).",
		triggers: 8,
	},
	{
		icon: CalendarClock,
		label: "Agendamentos",
		tagline: "Dispare numa data ou em uma cadência fixa",
		description: "Campanhas que rodam em horários ou datas pré-definidas — recorrentes (diário/semanal/mensal) ou disparo único.",
		triggers: 3,
	},
	{
		icon: Sprout,
		label: "Segmentações (RFM)",
		tagline: "Atue conforme o cliente entra/permanece em segmentos",
		description: "As segmentações são o gatilho: a campanha dispara quando um cliente entra ou permanece em uma das segmentações escolhidas.",
		triggers: 2,
	},
	{
		icon: ListChecks,
		label: "Pesquisas",
		tagline: "Pergunte e segmente pela resposta",
		description: "Envia uma pergunta com botões de resposta. Cada toque do cliente vira um campo personalizado, pronto para filtrar públicos depois.",
		triggers: 1,
	},
];

/** Primeiro passo do construtor: as quatro famílias de gatilho. */
export function CampaignCategoriesMock() {
	return (
		<div className="grid grid-cols-2 gap-2.5">
			{CATEGORIES.map(({ icon: Icon, label, tagline, description, triggers }, i) => {
				const selected = i === 0;
				return (
					<div
						key={label}
						className={cn(
							"flex flex-col gap-3 rounded-2xl border bg-white p-[18px]",
							selected ? "border-[#24549c] shadow-[0_0_0_3px_rgba(36,84,156,0.25),0_4px_6px_-1px_rgba(0,0,0,0.08)]" : IDLE_BORDER,
						)}
					>
						<div className="flex items-start justify-between gap-2">
							<span
								className={cn(
									"flex size-12 flex-none items-center justify-center rounded-xl",
									selected ? "bg-[#24549c] text-white" : "bg-[rgba(36,84,156,0.1)] text-[#0e1214]",
								)}
							>
								<Icon className="size-5" aria-hidden />
							</span>
							<span className="rounded-full bg-[rgba(36,84,156,0.1)] px-2 py-0.5 text-[10px] font-semibold tracking-[0.04em] text-[rgba(14,18,20,0.8)]">
								{triggers} {triggers === 1 ? "GATILHO" : "GATILHOS"}
							</span>
						</div>
						<div className="flex flex-col gap-1">
							<p className="m-0 text-[16px] font-semibold tracking-[-0.01em]">{label}</p>
							<p className="m-0 text-[11px] font-medium tracking-[0.03em] text-[rgba(14,18,20,0.6)] uppercase">{tagline}</p>
							<p className={cn("m-0 line-clamp-3 text-[12px] leading-[1.45]", MUTED)}>{description}</p>
						</div>
						<span className="mt-auto flex items-center gap-1.5 text-[12px] font-semibold tracking-[0.03em] text-[rgba(14,18,20,0.7)]">
							SELECIONAR
							<ArrowRight className="size-3.5 flex-none" aria-hidden />
						</span>
					</div>
				);
			})}
		</div>
	);
}

const PICKED_SEGMENTS = new Set(["EM RISCO", "PRECISAM DE ATENÇÃO", "NÃO PODE PERDÊ-LOS"]);

/** Passo "Público": as segmentações RFM, três delas escolhidas para uma campanha de reativação. */
export function RfmSegmentsPickerMock() {
	return (
		<MockCard className="gap-2 p-4">
			<div>
				<p className="m-0 text-[14px] font-semibold tracking-[-0.01em] text-[rgba(14,18,20,0.8)]">Segmentações RFM</p>
				<p className={cn("m-0 mt-0.5 text-[12px]", MUTED)}>Selecione as segmentações que serão consideradas para esta campanha.</p>
			</div>
			<div className="grid grid-cols-2 gap-1.5">
				{RFM_SEGMENTS.map((segment) => {
					const picked = PICKED_SEGMENTS.has(segment.label);
					return (
						<span
							key={segment.label}
							className={cn(
								"inline-flex min-w-0 items-center justify-between gap-2.5 rounded-lg border p-2.5 text-[11px] font-medium",
								picked ? "border-transparent" : "border-[#e3e8ea] text-[#0e1214]",
							)}
							style={picked ? { background: segment.color, color: segment.foreground } : undefined}
						>
							<span className="min-w-0 truncate">{segment.label}</span>
							<span
								className={cn("flex-none rounded-md px-1.5 py-0.5 text-[10px] font-semibold", picked ? "bg-[rgba(0,0,0,0.15)]" : cn("bg-[#f2f4f4]", MUTED))}
							>
								{formatCount(segment.count)}
							</span>
						</span>
					);
				})}
			</div>
		</MockCard>
	);
}

const FUNNEL_TOTAL = 4820;
const FUNNEL: { label: string; sub: string; value: number; color: string; surface: string; icon: LucideIcon; rate: string | null }[] = [
	{ label: "Enviadas", sub: "mensagens disparadas", value: 4820, color: "#24549c", surface: "rgba(36,84,156,0.1)", icon: Send, rate: "97,3% avançam" },
	{
		label: "Entregues",
		sub: "chegaram ao cliente",
		value: 4690,
		color: "#0ea5e9",
		surface: "rgba(14,165,233,0.1)",
		icon: MessageCircle,
		rate: "71,8% avançam",
	},
	{ label: "Lidas", sub: "abertas pelo cliente", value: 3368, color: "#ffb900", surface: "rgba(255,185,0,0.1)", icon: Eye, rate: "12,3% avançam" },
	{ label: "Convertidas", sub: "viraram compra", value: 414, color: "#16a34a", surface: "rgba(22,163,74,0.1)", icon: CircleCheck, rate: null },
];

/** Funil de engajamento de uma campanha: enviadas → entregues → lidas → convertidas. */
export function CampaignFunnelMock() {
	return (
		<MockCard className="gap-4 p-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<p className="m-0 text-[12px] font-bold tracking-[0.02em]">FUNIL DE ENGAJAMENTO</p>
				<span className="rounded-full bg-[rgba(36,84,156,0.1)] px-3 py-1 text-[12px] font-bold">8,6% conversão geral</span>
			</div>
			{FUNNEL.map(({ label, sub, value, color, surface, icon: Icon, rate }) => {
				const pct = (value / FUNNEL_TOTAL) * 100;
				return (
					<div key={label} className="flex flex-col gap-1.5">
						<div className="flex items-center gap-3">
							<span className="flex flex-none rounded-lg p-2" style={{ background: surface, color }}>
								<Icon className="size-4" aria-hidden />
							</span>
							<div className="flex min-w-0 flex-1 flex-col gap-1">
								<div className="flex items-center justify-between gap-2">
									<span className="min-w-0">
										<span className="text-[12px] font-bold tracking-[-0.01em]">{label}</span>
										<span className={cn("ml-1.5 text-[10.4px]", MUTED)}>{sub}</span>
									</span>
									<span className="text-[14px] font-bold">{formatCount(value)}</span>
								</div>
								<div className="h-6 overflow-hidden rounded-lg bg-[rgba(242,244,244,0.6)]">
									<div className="flex h-full items-center justify-end rounded-lg pr-2" style={{ width: `${pct}%`, background: color }}>
										<span className="text-[9.6px] font-bold text-white">{pct > 12 ? `${Math.round(pct)}%` : ""}</span>
									</div>
								</div>
							</div>
						</div>
						{rate ? (
							<div className="flex items-center gap-1.5 pl-12">
								<span className="h-px flex-1 bg-[#e3e8ea]" />
								<span className={cn("px-2 text-[10.4px]", MUTED)}>{rate}</span>
								<span className="h-px flex-1 bg-[#e3e8ea]" />
							</div>
						) : null}
					</div>
				);
			})}
		</MockCard>
	);
}
