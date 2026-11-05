import { BrandLogo } from "@/components/Brand/BrandLogo";
// Proposta comercial de uso único — Casa Verde (Saúde a granel), 2 unidades.
// Módulos de CRM da plataforma RecompraCRM por unidade + add-on Gestor de Crescimento
// (a gente opera as campanhas pela loja) em condição promocional.
// Renderizada dentro do shell de impressão em ../page.tsx (A4). Não faz parte do produto.

import { ARTHUR_WHATSAPP_NUMBER, LUCAS_WHATSAPP_NUMBER } from "@/config/internal-coms";
import {
	ArrowRight,
	BarChart3,
	BellRing,
	CalendarCheck,
	Check,
	Crosshair,
	Eye,
	Gift,
	HeartHandshake,
	LayoutDashboard,
	Leaf,
	type LucideIcon,
	Megaphone,
	MessageCircleMore,
	QrCode,
	Radar,
	RefreshCw,
	Repeat,
	ShieldCheck,
	Sparkles,
	Star,
	Store,
	Tablet,
	Target,
	TrendingUp,
	UserPlus,
	Users,
	Wallet,
} from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { FaWhatsapp } from "react-icons/fa6";
import { Sheet, SheetFooter } from "./_shared";

/* -------------------------------------------------------------------------- */
/*  Paleta Casa Verde (extraída da logo) + kraft de granel como acento         */
/* -------------------------------------------------------------------------- */

const BRAND = {
	green: "#347557",
	greenDeep: "#1F4A36",
	leaf: "#BFE0A6",
	// Folha escurecida — legível como texto sobre fundos claros (~5:1)
	leafText: "#3B6E2A",
	kraft: "#D9B97F",
	// Kraft escurecido — legível como texto sobre fundos claros (~6:1)
	kraftText: "#7A5824",
	cream: "#F7F2E7",
	ink: "#171717",
	border: "#E5E5E5",
	surface: "#F5F5F5",
} as const;

function hexToRgba(hex: string, alpha: number) {
	const h = hex.replace("#", "");
	const r = parseInt(h.slice(0, 2), 16);
	const g = parseInt(h.slice(2, 4), 16);
	const b = parseInt(h.slice(4, 6), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const heroGradient = {
	backgroundImage: `linear-gradient(135deg, ${BRAND.green} 0%, ${BRAND.greenDeep} 100%)`,
};

/* -------------------------------------------------------------------------- */
/*  Dados da proposta                                                          */
/* -------------------------------------------------------------------------- */

const UNITS = 2;

const CRM_PRICE_PER_UNIT = 349;
const GROWTH_LIST_PRICE_PER_UNIT = 899.9;
const GROWTH_PROMO_PRICE_PER_UNIT = 599;

const CRM_TOTAL = CRM_PRICE_PER_UNIT * UNITS;
const GROWTH_LIST_TOTAL = GROWTH_LIST_PRICE_PER_UNIT * UNITS;
const GROWTH_PROMO_TOTAL = GROWTH_PROMO_PRICE_PER_UNIT * UNITS;
const GROWTH_MONTHLY_SAVINGS = GROWTH_LIST_TOTAL - GROWTH_PROMO_TOTAL;
const FULL_TOTAL = CRM_TOTAL + GROWTH_PROMO_TOTAL;

function formatBRL(value: number) {
	return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const SUPPORT_CONTACTS = [
	{ name: "Lucas Fernandes", phone: "34 99662-6855", whatsapp: LUCAS_WHATSAPP_NUMBER },
	{ name: "Arthur Carvalho", phone: "34 99948-0791", whatsapp: ARTHUR_WHATSAPP_NUMBER },
] as const;

const WHATSAPP_MESSAGE = "Olá! Quero conversar sobre a proposta da Casa Verde.";

/* -------------------------------------------------------------------------- */
/*  Proposta — Casa Verde                                                      */
/* -------------------------------------------------------------------------- */

export function CasaVerdeProposal() {
	return (
		<>
			<CoverSheet />
			<PotentialSheet />
			<ImpactSheet />
			<PlatformSheet />
			<RepurchaseCycleSheet />
			<GrowthManagerSheet />
			<InvestmentSheet />
		</>
	);
}

const TOTAL_SHEETS = "07";

/* -------------------------------------------------------------------------- */
/*  Primitivos locais                                                          */
/* -------------------------------------------------------------------------- */

function Eyebrow({ children, tone = "green" }: { children: ReactNode; tone?: "green" | "kraft" | "white" }) {
	const color = tone === "kraft" ? BRAND.kraftText : tone === "white" ? "rgba(255,255,255,0.75)" : BRAND.green;
	return (
		<span className="text-[0.68rem] font-extrabold uppercase tracking-[0.28em]" style={{ color }}>
			{children}
		</span>
	);
}

function SectionLabel({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
	return (
		<div className="mb-3 flex items-center gap-2.5">
			<div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: hexToRgba(BRAND.green, 0.1), color: BRAND.green }}>
				<Icon className="h-[18px] w-[18px]" />
			</div>
			<h2 className="text-lg font-black uppercase leading-none tracking-tight text-neutral-900">{text}</h2>
		</div>
	);
}

function SheetHeader({ eyebrow, icon: Icon, title, lead }: { eyebrow: string; icon: LucideIcon; title: ReactNode; lead: string }) {
	return (
		<div className="flex items-start gap-5">
			<div
				className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl text-white shadow-lg"
				style={{ backgroundColor: BRAND.green, boxShadow: `0 12px 28px -10px ${hexToRgba(BRAND.green, 0.5)}` }}
			>
				<Icon className="h-8 w-8" />
			</div>
			<div className="min-w-0">
				<Eyebrow tone="kraft">{eyebrow}</Eyebrow>
				<h2 className="mt-1 text-[2.3rem] font-black leading-[1.02] tracking-tight text-balance">{title}</h2>
				<p className="mt-2.5 max-w-xl text-[0.98rem] leading-relaxed text-neutral-600">{lead}</p>
			</div>
		</div>
	);
}

function BenefitRow({ children }: { children: ReactNode }) {
	return (
		<li className="flex items-start gap-2.5">
			<span
				className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full"
				style={{ backgroundColor: hexToRgba(BRAND.green, 0.1), color: BRAND.green }}
			>
				<Check className="h-3 w-3" strokeWidth={3.5} />
			</span>
			<span className="text-[0.9rem] leading-snug text-neutral-700">{children}</span>
		</li>
	);
}

function TakeawayStrip({ children }: { children: ReactNode }) {
	return (
		<div className="mt-auto mb-10 flex items-center gap-3.5 rounded-2xl px-6 py-4" style={{ backgroundColor: hexToRgba(BRAND.green, 0.07) }}>
			<span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-white" style={{ backgroundColor: BRAND.green }}>
				<ArrowRight className="h-5 w-5" />
			</span>
			<p className="text-[0.95rem] leading-snug text-neutral-700">
				<strong className="font-black text-neutral-900">O resultado:</strong> {children}
			</p>
		</div>
	);
}

function SubHeading({ children }: { children: ReactNode }) {
	return <h3 className="mb-3 text-sm font-black uppercase tracking-wide text-neutral-900">{children}</h3>;
}

function MockCaption({ children }: { children: ReactNode }) {
	return <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-neutral-500">{children}</span>;
}

function DeviceFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
	return (
		<div
			className={`w-full rounded-[26px] p-3 shadow-2xl ${className}`}
			style={{ backgroundColor: "#0f172a", boxShadow: "0 30px 60px -25px rgba(15,23,42,0.6)" }}
		>
			{children}
		</div>
	);
}

function CasaVerdeLogo({ size, rounded = "rounded-2xl", className = "" }: { size: number; rounded?: string; className?: string }) {
	return (
		<div className={`flex-shrink-0 overflow-hidden ${rounded} ${className}`} style={{ width: size, height: size }}>
			<Image src="/logo-casa-verde.jpg" alt="Casa Verde" width={size} height={size} className="h-full w-full object-cover" />
		</div>
	);
}

/* -------------------------------------------------------------------------- */
/*  1 · Capa                                                                   */
/* -------------------------------------------------------------------------- */

function CoverSheet() {
	return (
		<Sheet className="text-white">
			<div className="relative flex h-full flex-1 flex-col justify-between px-14 py-16" style={{ backgroundColor: BRAND.green }}>
				<div
					className="pointer-events-none absolute inset-0 opacity-[0.1]"
					style={{ backgroundImage: "radial-gradient(circle, #fff 1.2px, transparent 1.2px)", backgroundSize: "22px 22px" }}
				/>
				<div
					className="pointer-events-none absolute -right-40 -top-40 h-[560px] w-[560px] rounded-full opacity-35"
					style={{ background: `radial-gradient(circle, ${BRAND.leaf} 0%, transparent 62%)` }}
				/>
				<div
					className="pointer-events-none absolute -bottom-56 -left-36 h-[500px] w-[500px] rounded-full opacity-50"
					style={{ background: `radial-gradient(circle, ${BRAND.greenDeep} 0%, transparent 62%)` }}
				/>

				{/* topo */}
				<div className="relative z-10 flex items-center justify-between">
					<div className="relative h-14 w-40">
						<BrandLogo lockup="stacked" tone="white" alt="RecompraCRM" fill className="object-contain object-left" />
					</div>
					<div className="flex flex-col items-end gap-1">
						<span className="rounded-full bg-white/10 px-4 py-1.5 text-[0.65rem] font-extrabold uppercase tracking-[0.22em] ring-1 ring-white/20">
							Proposta comercial
						</span>
						<span className="text-[0.68rem] font-semibold tracking-wide text-white/60">Novembro de 2026 · válida por 15 dias</span>
					</div>
				</div>

				{/* centro */}
				<div className="relative z-10 max-w-2xl">
					<Eyebrow tone="white">Preparada com exclusividade para</Eyebrow>
					<div className="mt-5">
						<CasaVerdeLogo size={152} rounded="rounded-3xl" className="shadow-2xl ring-1 ring-white/25" />
					</div>
					<h1 className="mt-8 text-[3rem] font-black leading-[0.98] tracking-tight text-balance">
						Clientes que voltam.
						<br />
						<span style={{ color: BRAND.leaf }}>Uma marca que é lembrada.</span>
					</h1>
					<div className="mt-6 flex flex-wrap gap-2">
						<span
							className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-extrabold uppercase tracking-wide"
							style={{ backgroundColor: BRAND.leaf, color: BRAND.greenDeep }}
						>
							<Store className="h-4 w-4" /> CRM para as 2 unidades
						</span>
						<span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-extrabold uppercase tracking-wide ring-1 ring-white/25">
							<HeartHandshake className="h-4 w-4" /> + Gestor de Crescimento
						</span>
					</div>
					<p className="mt-8 max-w-xl text-lg font-medium leading-relaxed text-white/85">
						Uma proposta para transformar o movimento das duas lojas em uma <strong className="font-extrabold text-white">base própria de clientes</strong>{" "}
						— que conhece a Casa Verde, <strong className="font-extrabold text-white">volta com mais frequência</strong> e{" "}
						<strong className="font-extrabold text-white">recomenda</strong>. Com campanhas que mostram o próprio resultado em reais.
					</p>
				</div>

				{/* rodapé */}
				<div className="relative z-10 flex items-end justify-between">
					<div className="flex flex-col gap-1">
						<span className="text-[0.7rem] font-bold uppercase tracking-[0.25em] text-white/50">Nesta proposta</span>
						<div className="flex flex-wrap items-center gap-1.5 text-[0.82rem] font-extrabold">
							{["Potencial", "Impacto", "Plataforma", "Recompra", "Gestor", "Investimento"].map((item, i) => (
								<span key={item} className="flex items-center gap-1.5">
									{i > 0 ? <span className="text-white/40">·</span> : null}
									<span className="rounded-md bg-white/10 px-2.5 py-1.5">{item}</span>
								</span>
							))}
						</div>
					</div>
					<span className="text-[0.7rem] font-semibold tabular-nums text-white/40">recompracrm.com.br</span>
				</div>
			</div>
		</Sheet>
	);
}

/* -------------------------------------------------------------------------- */
/*  2 · O potencial                                                            */
/* -------------------------------------------------------------------------- */

const POTENTIAL_STATS = [
	{
		value: "5–7×",
		label: "mais caro conquistar um cliente novo do que fazer um cliente atual comprar de novo",
		icon: UserPlus,
	},
	{
		value: "+5%",
		label: "de retenção pode elevar o lucro de 25% a 95%, segundo estudo clássico da Bain & Company",
		icon: TrendingUp,
	},
	{
		value: "Semanas",
		label: "é o ciclo de quem compra a granel: a castanha, o chá e a granola acabam — e a compra se repete",
		icon: Repeat,
	},
];

function PotentialSheet() {
	return (
		<Sheet>
			<div className="flex flex-1 flex-col px-14 pt-16">
				<Eyebrow>O potencial que já está na loja</Eyebrow>
				<h2 className="mt-4 max-w-3xl text-[2.8rem] font-black leading-[1.02] tracking-tight text-balance">
					A Casa Verde já atrai o cliente certo.
					<br />
					<span style={{ color: BRAND.green }}>O CRM faz ele voltar mais vezes.</span>
				</h2>
				<p className="mt-5 max-w-2xl text-[1.05rem] leading-relaxed text-neutral-600">
					Quem cuida da saúde compra com constância: o pacote acaba e a reposição vem. A recompra é natural no granel — a questão é{" "}
					<strong className="font-bold text-neutral-900">onde</strong> ela acontece. Sem relacionamento, a próxima compra é decidida por conveniência: o
					mercado do caminho, o aplicativo, a loja nova do bairro.
				</p>

				<div className="mt-10 grid grid-cols-3 gap-5">
					{POTENTIAL_STATS.map((stat) => (
						<div key={stat.value} className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-6">
							<div
								className="flex h-11 w-11 items-center justify-center rounded-xl"
								style={{ backgroundColor: hexToRgba(BRAND.green, 0.1), color: BRAND.green }}
							>
								<stat.icon className="h-5 w-5" />
							</div>
							<span className="text-[2.1rem] font-black leading-none tracking-tight" style={{ color: BRAND.ink }}>
								{stat.value}
							</span>
							<span className="text-sm leading-snug text-neutral-500">{stat.label}</span>
						</div>
					))}
				</div>

				{/* A virada */}
				<div className="mt-11 overflow-hidden rounded-2xl" style={{ backgroundColor: BRAND.surface }}>
					<div className="grid grid-cols-[1.1fr_auto_1.1fr] items-stretch">
						<div className="flex flex-col justify-center gap-2 p-8">
							<span className="text-[0.7rem] font-extrabold uppercase tracking-[0.2em] text-neutral-500">Hoje</span>
							<p className="text-lg font-bold leading-snug text-neutral-500">
								O cliente passa pelo caixa e vai embora anônimo. Sem nome, sem WhatsApp, sem histórico — e sem como ser chamado de volta.
							</p>
						</div>
						<div className="flex items-center justify-center px-2" style={{ backgroundColor: hexToRgba(BRAND.green, 0.06) }}>
							<div className="flex h-11 w-11 items-center justify-center rounded-full text-white" style={{ backgroundColor: BRAND.green }}>
								<ArrowRight className="h-5 w-5" />
							</div>
						</div>
						<div className="flex flex-col justify-center gap-2 p-8" style={{ backgroundColor: hexToRgba(BRAND.leaf, 0.3) }}>
							<span className="text-[0.7rem] font-extrabold uppercase tracking-[0.2em]" style={{ color: BRAND.leafText }}>
								Com o CRM
							</span>
							<p className="text-lg font-extrabold leading-snug text-neutral-900">
								Cada venda vira um cliente identificado, com cashback para voltar e uma conversa no WhatsApp que a Casa Verde controla.
							</p>
						</div>
					</div>
				</div>

				<p className="mt-9 max-w-2xl text-[1.05rem] leading-relaxed text-neutral-600">
					Clientes fiéis compram com mais frequência, gastam mais por visita, aceitam melhor os lançamentos e trazem outros clientes. É esse o ativo que a
					proposta constrói — nas duas unidades, desde o primeiro mês.
				</p>
			</div>
			<SheetFooter index={`02 / ${TOTAL_SHEETS}`} label="O potencial · Casa Verde" />
		</Sheet>
	);
}

/* -------------------------------------------------------------------------- */
/*  3 · Onde o CRM gera impacto comercial                                      */
/* -------------------------------------------------------------------------- */

const IMPACT_LEVERS: { icon: LucideIcon; title: string; kicker: string; body: string; points: string[] }[] = [
	{
		icon: Wallet,
		kicker: "Fidelidade",
		title: "Mais compras por cliente",
		body: "O cashback transforma a próxima compra em uma decisão já tomada: o cliente tem saldo esperando por ele na Casa Verde — e em nenhum outro lugar.",
		points: ["Frequência de visita maior", "Ticket médio maior por cliente fiel"],
	},
	{
		icon: Eye,
		kicker: "Lembrança de marca",
		title: "Presente no dia a dia do cliente",
		body: "A Casa Verde aparece no WhatsApp no momento certo — novidade a granel, reposição, data especial. Quem é lembrado é escolhido.",
		points: ["Canal próprio, sem depender de algoritmo", "Novidades chegam a quem já compra"],
	},
	{
		icon: Radar,
		kicker: "Recuperação",
		title: "Ninguém some em silêncio",
		body: "A plataforma identifica quem passou do ciclo habitual sem voltar e dispara o convite certo, com um motivo real para a nova visita.",
		points: ["Clientes em risco detectados sozinhos", "Receita que hoje se perde, de volta"],
	},
	{
		icon: Crosshair,
		kicker: "Decisão com dados",
		title: "Cada real investido, medido",
		body: "Quem compra, o quê e com que frequência. Cada campanha mostra quanto faturou, e o investimento comercial passa a ter retorno visível.",
		points: ["Faturamento atribuído por campanha", "Segmentação automática da base"],
	},
];

function ImpactSheet() {
	return (
		<Sheet>
			<div className="flex flex-1 flex-col px-14 pt-14">
				<SheetHeader
					eyebrow="Impacto comercial"
					icon={Target}
					title="Quatro alavancas de faturamento, ligadas ao mesmo tempo"
					lead="Um CRM não é um cadastro de clientes. É a ferramenta que muda o comportamento de compra da base — e cada uma dessas frentes soma no caixa das duas lojas."
				/>

				<div className="mt-9 grid grid-cols-2 gap-5">
					{IMPACT_LEVERS.map((lever) => (
						<div key={lever.title} className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-6">
							<div className="flex items-center gap-3">
								<div
									className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl"
									style={{ backgroundColor: hexToRgba(BRAND.leaf, 0.45), color: BRAND.greenDeep }}
								>
									<lever.icon className="h-5 w-5" />
								</div>
								<div className="flex min-w-0 flex-col">
									<span className="text-[0.62rem] font-black uppercase tracking-[0.2em]" style={{ color: BRAND.kraftText }}>
										{lever.kicker}
									</span>
									<h3 className="text-[1.05rem] font-black leading-tight tracking-tight text-neutral-900">{lever.title}</h3>
								</div>
							</div>
							<p className="text-[0.85rem] leading-relaxed text-neutral-600">{lever.body}</p>
							<ul className="mt-auto flex flex-col gap-1.5 border-t border-neutral-100 pt-3">
								{lever.points.map((point) => (
									<li key={point} className="flex items-center gap-2 text-[0.78rem] font-bold text-neutral-800">
										<Check className="h-3.5 w-3.5 flex-shrink-0" style={{ color: BRAND.green }} strokeWidth={3} />
										{point}
									</li>
								))}
							</ul>
						</div>
					))}
				</div>

				{/* Efeito composto */}
				<div className="mt-7 rounded-2xl px-6 py-5" style={{ backgroundColor: BRAND.cream, border: `1px solid ${hexToRgba(BRAND.kraft, 0.6)}` }}>
					<div className="mb-3 flex items-center gap-2">
						<Sparkles className="h-4 w-4" style={{ color: BRAND.kraftText }} />
						<span className="text-[0.72rem] font-black uppercase tracking-wider" style={{ color: BRAND.kraftText }}>
							O efeito é composto
						</span>
					</div>
					<div className="grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] items-center gap-2.5">
						{["Mais clientes identificados", "Mais visitas por cliente", "Mais itens por visita", "Mais faturamento por loja"].map((step, i, arr) => (
							<CompoundStep key={step} label={step} last={i === arr.length - 1} />
						))}
					</div>
					<p className="mt-3 text-[0.8rem] leading-snug text-neutral-600">
						Pequenos ganhos em cada etapa se multiplicam: a base cresce, cada cliente volta mais vezes e compra mais a cada volta.
					</p>
				</div>
			</div>
			<SheetFooter index={`03 / ${TOTAL_SHEETS}`} label="Impacto comercial" />
		</Sheet>
	);
}

function CompoundStep({ label, last }: { label: string; last: boolean }) {
	return (
		<>
			<div
				className="flex h-full items-center justify-center rounded-xl px-3 py-2.5 text-center text-[0.74rem] font-extrabold leading-tight"
				style={last ? { backgroundColor: BRAND.green, color: "#fff" } : { backgroundColor: "#fff", color: BRAND.ink }}
			>
				{label}
			</div>
			{last ? null : <ArrowRight className="h-4 w-4" style={{ color: BRAND.kraftText }} />}
		</>
	);
}

/* -------------------------------------------------------------------------- */
/*  4 · A plataforma — módulos de CRM                                          */
/* -------------------------------------------------------------------------- */

const CRM_MODULES: { icon: LucideIcon; title: string; body: string }[] = [
	{
		icon: Tablet,
		title: "Ponto de Interação",
		body: "Tablet no caixa e QR Code na loja: o cliente se cadastra e pontua em segundos, só com CPF e WhatsApp.",
	},
	{
		icon: Gift,
		title: "Programa de cashback",
		body: "Percentual, validade e regras de resgate definidos pela Casa Verde. Crédito na hora, resgate na próxima compra.",
	},
	{
		icon: MessageCircleMore,
		title: "WhatsApp automático",
		body: "Boas-vindas, aniversário, cashback expirando e cliente sumido — mensagens que rodam sozinhas, todos os dias.",
	},
	{
		icon: Megaphone,
		title: "Campanhas segmentadas",
		body: "Envios para toda a base ou para um público específico: quem compra chás, quem não volta há 45 dias, quem mais gasta.",
	},
	{
		icon: Radar,
		title: "Matriz RFM",
		body: "A base classificada por recência, frequência e valor: campeões, leais, em risco, perdidos — atualizada a cada compra.",
	},
	{
		icon: BarChart3,
		title: "Business Intelligence",
		body: "Vendas, ticket médio, recorrência e faturamento atribuído às campanhas, em um painel para as duas unidades.",
	},
];

function PlatformSheet() {
	return (
		<Sheet>
			<div className="flex flex-1 flex-col px-14 pt-14">
				<SheetHeader
					eyebrow="A plataforma"
					icon={LayoutDashboard}
					title="Os módulos de CRM, nas duas unidades"
					lead="Tudo o que é preciso para conhecer, fidelizar e reativar o cliente da Casa Verde — em uma única plataforma, com a mesma base de clientes para as duas lojas."
				/>

				<div className="mt-7 grid grid-cols-3 gap-4">
					{CRM_MODULES.map((mod) => (
						<div key={mod.title} className="flex flex-col gap-2 rounded-2xl border border-neutral-200 bg-white p-4">
							<div
								className="flex h-10 w-10 items-center justify-center rounded-xl"
								style={{ backgroundColor: hexToRgba(BRAND.green, 0.1), color: BRAND.green }}
							>
								<mod.icon className="h-5 w-5" />
							</div>
							<h3 className="text-[0.86rem] font-black uppercase leading-tight tracking-tight text-neutral-900">{mod.title}</h3>
							<p className="text-[0.78rem] leading-snug text-neutral-600">{mod.body}</p>
						</div>
					))}
				</div>

				<div className="mt-7 grid grid-cols-[1.05fr_0.95fr] items-center gap-10">
					<div className="flex flex-col gap-6">
						<div>
							<SubHeading>Como funciona no caixa</SubHeading>
							<ul className="flex flex-col gap-2.5">
								<BenefitRow>O atendente pede o CPF — hábito que o cliente já tem da nota fiscal.</BenefitRow>
								<BenefitRow>CPF novo abre o cadastro na hora; CPF conhecido mostra o saldo.</BenefitRow>
								<BenefitRow>O cashback é creditado na hora, com consentimento LGPD no mesmo passo.</BenefitRow>
							</ul>
						</div>
						<div
							className="rounded-2xl border border-dashed p-5"
							style={{ borderColor: hexToRgba(BRAND.kraft, 0.9), backgroundColor: hexToRgba(BRAND.cream, 0.9) }}
						>
							<div className="mb-1.5 flex items-center gap-2">
								<QrCode className="h-4 w-4" style={{ color: BRAND.kraftText }} />
								<span className="text-[0.7rem] font-black uppercase tracking-wider" style={{ color: BRAND.kraftText }}>
									A marca fora da loja
								</span>
							</div>
							<p className="text-[0.88rem] leading-relaxed text-neutral-700">
								O mesmo cadastro abre por QR Code nos potes, nas sacolas e no Instagram. Seguidores viram{" "}
								<strong className="font-extrabold">contatos identificados</strong> — prontos para receber a próxima novidade da Casa Verde.
							</p>
						</div>
					</div>

					<div className="flex flex-col items-center gap-3">
						<PointOfInteractionMock />
						<MockCaption>Ponto de Interação · caixa</MockCaption>
					</div>
				</div>
			</div>
			<SheetFooter index={`04 / ${TOTAL_SHEETS}`} label="A plataforma · módulos de CRM" />
		</Sheet>
	);
}

function PointOfInteractionMock() {
	return (
		<DeviceFrame className="max-w-[340px]">
			<div className="overflow-hidden rounded-[18px] bg-white">
				<div className="flex items-center justify-between px-5 py-3.5 text-white" style={heroGradient}>
					<div className="flex items-center gap-2">
						<CasaVerdeLogo size={32} rounded="rounded-lg" className="ring-1 ring-white/25" />
						<div className="flex flex-col leading-none">
							<span className="text-[0.8rem] font-extrabold">Casa Verde</span>
							<span className="text-[0.6rem] font-medium text-white/60">Unidade 1 · Caixa 01</span>
						</div>
					</div>
					<span className="rounded-full bg-white/15 px-2.5 py-1 text-[0.58rem] font-bold uppercase tracking-wide">Pontuar</span>
				</div>

				<div className="flex flex-col gap-4 px-5 py-5">
					<div className="flex items-center gap-3">
						<div
							className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-black"
							style={{ backgroundColor: hexToRgba(BRAND.green, 0.12), color: BRAND.green }}
						>
							AL
						</div>
						<div className="flex flex-col leading-tight">
							<span className="text-[0.92rem] font-extrabold tracking-tight text-neutral-900">Ana Lima</span>
							<span className="text-[0.7rem] text-neutral-500">14 compras · última há 12 dias</span>
						</div>
						<span
							className="ml-auto rounded-full px-2.5 py-1 text-[0.56rem] font-black tracking-wide"
							style={{ backgroundColor: BRAND.leaf, color: BRAND.greenDeep }}
						>
							LEAL
						</span>
					</div>

					<div className="rounded-2xl px-5 py-4 text-center" style={{ backgroundColor: hexToRgba(BRAND.leaf, 0.3) }}>
						<span className="text-[0.62rem] font-black uppercase tracking-[0.2em]" style={{ color: BRAND.leafText }}>
							Cashback disponível
						</span>
						<p className="mt-1 text-3xl font-black tabular-nums" style={{ color: BRAND.ink }}>
							R$ 14,80
						</p>
						<span className="mt-0.5 block text-[0.58rem] font-semibold text-neutral-500">Válido até 20/12</span>
					</div>

					<div className="grid grid-cols-2 gap-2.5">
						<div
							className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-[0.76rem] font-extrabold uppercase text-white"
							style={{ backgroundColor: BRAND.green }}
						>
							<Sparkles className="h-4 w-4" /> Pontuar
						</div>
						<div
							className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-[0.76rem] font-extrabold uppercase"
							style={{ backgroundColor: BRAND.leaf, color: BRAND.greenDeep }}
						>
							<Gift className="h-4 w-4" /> Resgatar
						</div>
					</div>
				</div>
			</div>
		</DeviceFrame>
	);
}

/* -------------------------------------------------------------------------- */
/*  5 · O ciclo de recompra                                                    */
/* -------------------------------------------------------------------------- */

const CYCLE_STEPS: { icon: LucideIcon; title: string; body: string }[] = [
	{ icon: QrCode, title: "Atrai", body: "QR Code na loja, nas sacolas e no Instagram" },
	{ icon: UserPlus, title: "Identifica", body: "Nome, WhatsApp e CPF no primeiro contato" },
	{ icon: Wallet, title: "Recompensa", body: "Cashback creditado a cada compra" },
	{ icon: BellRing, title: "Lembra", body: "WhatsApp na hora certa, com um motivo real" },
	{ icon: RefreshCw, title: "Traz de volta", body: "Nova compra — e o ciclo recomeça" },
];

const RFM_SEGMENTS = [
	{ label: "Campeões", bg: "#fb923c", text: "#0a0a0a" },
	{ label: "Leais", bg: "#4ade80", text: "#0a0a0a" },
	{ label: "Em risco", bg: "#facc15", text: "#0a0a0a" },
	{ label: "Prestes a dormir", bg: "#ca8a04", text: "#fff" },
	{ label: "Hibernando", bg: "#c084fc", text: "#fff" },
	{ label: "Perdidos", bg: "#ef4444", text: "#fff" },
];

function RepurchaseCycleSheet() {
	return (
		<Sheet>
			<div className="flex flex-1 flex-col px-14 pt-14">
				<SheetHeader
					eyebrow="Fidelização na prática"
					icon={Repeat}
					title="O ciclo de recompra, rodando no automático"
					lead="O granel tem um ritmo: o pacote acaba e o cliente precisa repor. A plataforma acompanha esse ritmo e chama o cliente de volta antes que ele compre em outro lugar."
				/>

				{/* ciclo */}
				<div className="mt-8 grid grid-cols-5 gap-2.5">
					{CYCLE_STEPS.map((step, i) => (
						<div key={step.title} className="relative flex flex-col gap-2 rounded-2xl border border-neutral-200 bg-white p-3.5">
							<div className="flex items-center gap-2">
								<span
									className="flex h-6 w-6 items-center justify-center rounded-full text-[0.65rem] font-black text-white"
									style={{ backgroundColor: BRAND.green }}
								>
									{i + 1}
								</span>
								<step.icon className="h-4 w-4" style={{ color: BRAND.leafText }} />
							</div>
							<h4 className="text-[0.8rem] font-black uppercase leading-tight tracking-tight text-neutral-900">{step.title}</h4>
							<p className="text-[0.7rem] leading-snug text-neutral-600">{step.body}</p>
						</div>
					))}
				</div>

				<div className="mt-9 grid grid-cols-[1fr_1fr] items-start gap-10">
					<div className="flex flex-col items-center gap-3">
						<WhatsappCampaignMock />
						<MockCaption>Campanha automática · cliente em risco</MockCaption>
					</div>

					<div className="flex flex-col gap-7 pt-1">
						<div>
							<SubHeading>Dispara sozinho quando</SubHeading>
							<ul className="flex flex-col gap-2.5">
								<BenefitRow>O cliente se cadastra — boas-vindas com o saldo de cashback.</BenefitRow>
								<BenefitRow>Passa do ciclo habitual de compra sem aparecer.</BenefitRow>
								<BenefitRow>O cashback está para vencer — urgência com motivo real.</BenefitRow>
								<BenefitRow>É aniversário dele — mensagem e mimo da Casa Verde.</BenefitRow>
							</ul>
						</div>

						<div>
							<SubHeading>A base, segmentada sozinha</SubHeading>
							<div className="flex flex-wrap gap-1.5">
								{RFM_SEGMENTS.map((seg) => (
									<span
										key={seg.label}
										className="rounded-full px-2.5 py-1 text-[0.62rem] font-black uppercase tracking-wide"
										style={{ backgroundColor: seg.bg, color: seg.text }}
									>
										{seg.label}
									</span>
								))}
							</div>
							<p className="mt-2.5 text-[0.8rem] leading-snug text-neutral-600">
								Cada compra reposiciona o cliente na Matriz RFM. Os campeões recebem novidades primeiro; os que estão esfriando, um convite para voltar.
							</p>
						</div>
					</div>
				</div>

				<TakeawayStrip>a recompra que já é natural no granel passa a acontecer na Casa Verde — com mais frequência e sem esforço da equipe.</TakeawayStrip>
			</div>
			<SheetFooter index={`05 / ${TOTAL_SHEETS}`} label="Ciclo de recompra" />
		</Sheet>
	);
}

function WhatsappCampaignMock() {
	return (
		<DeviceFrame className="max-w-[340px] overflow-hidden">
			<div className="overflow-hidden rounded-[18px]" style={{ backgroundColor: "#e6ddd4" }}>
				<div className="flex items-center gap-3 px-4 py-3 text-white" style={{ backgroundColor: "#075E54" }}>
					<CasaVerdeLogo size={36} rounded="rounded-full" className="ring-1 ring-white/25" />
					<div className="flex flex-col leading-none">
						<span className="text-[0.85rem] font-bold">Casa Verde</span>
						<span className="text-[0.6rem] text-white/70">conta comercial</span>
					</div>
					<FaWhatsapp className="ml-auto h-5 w-5 text-white/80" />
				</div>

				<div
					className="flex flex-col gap-2.5 px-4 py-5"
					style={{ backgroundImage: "radial-gradient(rgba(0,0,0,0.03) 1px, transparent 1px)", backgroundSize: "16px 16px" }}
				>
					<div className="max-w-[88%] self-start rounded-2xl rounded-tl-sm bg-white px-3.5 py-2.5 shadow-sm">
						<p className="text-[0.8rem] leading-snug text-neutral-800">
							Oi, Ana! 🌿 Faz um tempinho que você não passa na <strong>Casa Verde</strong>.
						</p>
						<p className="mt-2 text-[0.8rem] leading-snug text-neutral-800">
							Chegaram castanhas e chás novos — e você tem <strong>R$ 14,80 de cashback</strong> que vence sexta. Bora repor a despensa? 💚
						</p>
						<span className="mt-1.5 block text-right text-[0.58rem] text-neutral-500">10:02 ✓✓</span>
					</div>

					<div className="max-w-[85%] self-end rounded-2xl rounded-tr-sm px-3.5 py-2.5 shadow-sm" style={{ backgroundColor: "#dcf8c6" }}>
						<p className="text-[0.8rem] leading-snug text-neutral-800">Que bom que avisou! Passo aí amanhã, minha granola já acabou 😄</p>
						<span className="mt-1.5 block text-right text-[0.58rem] text-neutral-500">10:17 ✓✓</span>
					</div>

					<div
						className="mt-1 self-center rounded-full px-3 py-1 text-[0.6rem] font-black uppercase tracking-wide text-white shadow"
						style={{ backgroundColor: BRAND.green }}
					>
						Convertido · compra de R$ 126,50
					</div>
				</div>
			</div>
		</DeviceFrame>
	);
}

/* -------------------------------------------------------------------------- */
/*  6 · Add-on — Gestor de Crescimento                                         */
/* -------------------------------------------------------------------------- */

const GROWTH_ROUTINE: { icon: LucideIcon; title: string; body: string }[] = [
	{
		icon: Target,
		title: "Diagnóstico e metas",
		body: "Importamos o histórico de vendas, lemos a base e definimos com vocês as metas comerciais do ciclo.",
	},
	{
		icon: CalendarCheck,
		title: "Calendário do mês",
		body: "Campanhas planejadas em torno das datas, da sazonalidade do natural e dos segmentos prioritários.",
	},
	{
		icon: Megaphone,
		title: "Criação e disparo",
		body: "Escrevemos as mensagens, escolhemos o público e disparamos. A Casa Verde só aprova.",
	},
	{
		icon: BarChart3,
		title: "Resultado e ajuste",
		body: "Relatório mensal com faturamento atribuído. O que converteu vira régua; o que não converteu, troca.",
	},
];

const SEASONAL_CAMPAIGNS = [
	{ when: "Jan", title: "Verão leve", body: "Chás gelados, sementes e snacks para a rotina de treino." },
	{ when: "Mar–Abr", title: "Páscoa natural", body: "Cacau, chocolates sem açúcar e frutas secas para presentear." },
	{ when: "Mai", title: "Dia das Mães", body: "Kits de bem-estar montados a granel, com cashback em dobro." },
	{ when: "Jun–Ago", title: "Inverno aconchego", body: "Chás, especiarias e grãos para sopas — reposição da estação." },
	{ when: "Nov", title: "Black Friday verde", body: "Oferta exclusiva para campeões e leais, antes do público geral." },
	{ when: "Dez", title: "Ceia saudável", body: "Castanhas, damascos e nozes: a maior cesta do ano." },
];

function GrowthManagerSheet() {
	return (
		<Sheet>
			<div className="flex flex-1 flex-col px-14 pt-14">
				<div className="flex items-start gap-5">
					<div
						className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl text-white shadow-lg"
						style={{ backgroundColor: BRAND.kraftText, boxShadow: `0 12px 28px -10px ${hexToRgba(BRAND.kraftText, 0.55)}` }}
					>
						<HeartHandshake className="h-8 w-8" />
					</div>
					<div className="min-w-0">
						<div className="flex items-center gap-2">
							<Eyebrow tone="kraft">Add-on</Eyebrow>
							<span
								className="rounded-full px-2.5 py-0.5 text-[0.58rem] font-black uppercase tracking-wider"
								style={{ backgroundColor: BRAND.kraft, color: BRAND.ink }}
							>
								Condição especial Casa Verde
							</span>
						</div>
						<h2 className="mt-1 text-[2.3rem] font-black leading-[1.02] tracking-tight text-balance">Gestor de Crescimento</h2>
						<p className="mt-2.5 max-w-xl text-[0.98rem] leading-relaxed text-neutral-600">
							A plataforma entrega as ferramentas. O gestor garante que elas virem venda: a gente planeja, cria, dispara e otimiza as campanhas da Casa
							Verde, com uma meta comercial clara — e a equipe das lojas continua focada no atendimento.
						</p>
					</div>
				</div>

				<div className="mt-8">
					<SubHeading>A rotina mensal, feita por nós</SubHeading>
					<div className="grid grid-cols-4 gap-3.5">
						{GROWTH_ROUTINE.map((step, i) => (
							<div key={step.title} className="flex flex-col gap-2 rounded-2xl border border-neutral-200 bg-white p-4">
								<div className="flex items-center gap-2">
									<span
										className="flex h-6 w-6 items-center justify-center rounded-full text-[0.65rem] font-black text-white"
										style={{ backgroundColor: BRAND.green }}
									>
										{i + 1}
									</span>
									<step.icon className="h-4 w-4" style={{ color: BRAND.kraftText }} />
								</div>
								<h4 className="text-[0.78rem] font-black uppercase leading-tight tracking-tight text-neutral-900">{step.title}</h4>
								<p className="text-[0.7rem] leading-snug text-neutral-600">{step.body}</p>
							</div>
						))}
					</div>
				</div>

				<div className="mt-8">
					<SubHeading>Exemplos de calendário para a Casa Verde</SubHeading>
					<div className="grid grid-cols-3 gap-3">
						{SEASONAL_CAMPAIGNS.map((c) => (
							<div key={c.title} className="flex gap-3 rounded-2xl p-4" style={{ backgroundColor: BRAND.cream }}>
								<span
									className="flex h-fit flex-shrink-0 rounded-lg px-2 py-1 text-[0.6rem] font-black uppercase tracking-wide text-white"
									style={{ backgroundColor: BRAND.green }}
								>
									{c.when}
								</span>
								<div className="min-w-0">
									<h4 className="text-[0.8rem] font-black leading-tight text-neutral-900">{c.title}</h4>
									<p className="mt-0.5 text-[0.7rem] leading-snug text-neutral-600">{c.body}</p>
								</div>
							</div>
						))}
					</div>
				</div>

				<div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-2.5">
					<ul className="flex flex-col gap-2.5">
						<BenefitRow>Um gestor de crescimento dedicado à Casa Verde.</BenefitRow>
						<BenefitRow>Importação e integração dos dados de venda.</BenefitRow>
						<BenefitRow>Diagnóstico inicial com metas definidas juntos.</BenefitRow>
					</ul>
					<ul className="flex flex-col gap-2.5">
						<BenefitRow>Criação e gestão das campanhas, ponta a ponta.</BenefitRow>
						<BenefitRow>Relatório de resultado e acompanhamento mensal.</BenefitRow>
						<BenefitRow>Campanhas pensadas para as duas unidades.</BenefitRow>
					</ul>
				</div>

				<TakeawayStrip>um CRM que roda de verdade todo mês — porque tem dono, tem meta e tem alguém medindo o retorno de cada campanha.</TakeawayStrip>
			</div>
			<SheetFooter index={`06 / ${TOTAL_SHEETS}`} label="Add-on · Gestor de Crescimento" />
		</Sheet>
	);
}

/* -------------------------------------------------------------------------- */
/*  7 · Investimento e fechamento                                              */
/* -------------------------------------------------------------------------- */

function InvestmentSheet() {
	return (
		<Sheet>
			<div className="flex flex-1 flex-col gap-6 px-14 py-11">
				<SectionLabel icon={Wallet} text="Investimento · 2 unidades" />

				<div className="grid grid-cols-2 items-stretch gap-5">
					<InvestmentCard
						name="CRM"
						tag="Plataforma · por unidade"
						tagline="Os módulos de CRM completos, em cada loja."
						price={`R$ ${formatBRL(CRM_PRICE_PER_UNIT)}`}
						period="/mês por unidade"
						totalLabel={`${UNITS} unidades · R$ ${formatBRL(CRM_TOTAL)}/mês`}
						features={[
							"Ponto de Interação (tablet + QR Code)",
							"Programa de cashback configurável",
							"WhatsApp automático e campanhas",
							"Matriz RFM e BI de vendas",
							"Suporte humano incluso",
						]}
					/>
					<InvestmentCard
						name="Gestor de Crescimento"
						tag="Add-on · condição especial"
						tagline="A gente opera as campanhas, com foco em impacto comercial."
						listPrice={`R$ ${formatBRL(GROWTH_LIST_PRICE_PER_UNIT)}`}
						price={`R$ ${formatBRL(GROWTH_PROMO_PRICE_PER_UNIT)}`}
						period="/mês por unidade"
						totalLabel={`${UNITS} unidades · R$ ${formatBRL(GROWTH_PROMO_TOTAL)}/mês`}
						highlight
						features={[
							"Gestor dedicado à Casa Verde",
							"Diagnóstico inicial e metas comerciais",
							"Calendário, criação e disparo das campanhas",
							"Relatório mensal de resultado",
						]}
					/>
				</div>

				{/* Resumo */}
				<div className="overflow-hidden rounded-2xl border border-neutral-200">
					<SummaryRow label={`CRM · ${UNITS} unidades × R$ ${formatBRL(CRM_PRICE_PER_UNIT)}`} value={`R$ ${formatBRL(CRM_TOTAL)}`} />
					<SummaryRow
						label={`Gestor de Crescimento · ${UNITS} unidades × R$ ${formatBRL(GROWTH_PROMO_PRICE_PER_UNIT)}`}
						listValue={`R$ ${formatBRL(GROWTH_LIST_TOTAL)}`}
						value={`R$ ${formatBRL(GROWTH_PROMO_TOTAL)}`}
					/>
					<div className="flex items-center justify-between px-5 py-4 text-white" style={heroGradient}>
						<div className="flex flex-col">
							<span className="text-[0.62rem] font-black uppercase tracking-[0.2em] text-white/70">Investimento mensal recomendado</span>
							<span className="text-[0.82rem] font-semibold text-white/85">CRM + Gestor de Crescimento nas duas unidades</span>
						</div>
						<div className="flex items-end gap-1">
							<span className="text-[2rem] font-black leading-none tracking-tight tabular-nums">R$ {formatBRL(FULL_TOTAL)}</span>
							<span className="mb-0.5 text-[0.75rem] font-semibold text-white/70">/mês</span>
						</div>
					</div>
				</div>

				<div className="grid grid-cols-2 gap-4">
					<div
						className="flex items-start gap-3 rounded-xl px-5 py-3.5"
						style={{ backgroundColor: BRAND.cream, border: `1px solid ${hexToRgba(BRAND.kraft, 0.7)}` }}
					>
						<Leaf className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: BRAND.kraftText }} />
						<p className="text-[0.78rem] leading-snug text-neutral-700">
							<strong>Economia de R$ {formatBRL(GROWTH_MONTHLY_SAVINGS)} por mês</strong> no Gestor de Crescimento: de R${" "}
							{formatBRL(GROWTH_LIST_PRICE_PER_UNIT)} por R$ {formatBRL(GROWTH_PROMO_PRICE_PER_UNIT)} por unidade, condição exclusiva desta proposta.
						</p>
					</div>
					<div
						className="flex items-start gap-3 rounded-xl px-5 py-3.5"
						style={{ backgroundColor: hexToRgba(BRAND.green, 0.06), border: `1px dashed ${hexToRgba(BRAND.green, 0.35)}` }}
					>
						<ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: BRAND.green }} />
						<p className="text-[0.78rem] leading-snug text-neutral-700">
							<strong>Sem surpresa.</strong> Sem taxa de setup e sem fidelidade: o CRM fica porque gera resultado, não por contrato. Dados protegidos de acordo
							com a LGPD.
						</p>
					</div>
				</div>

				{/* Fechamento */}
				<div className="relative mt-auto overflow-hidden rounded-3xl px-8 py-7 text-white" style={heroGradient}>
					<div
						className="absolute inset-0 opacity-[0.12]"
						style={{ backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)", backgroundSize: "16px 16px" }}
					/>
					<div className="absolute right-0 top-0 h-full w-2" style={{ backgroundColor: BRAND.leaf }} />
					<div className="relative z-10 flex flex-col gap-4">
						<div className="flex items-center gap-2">
							<Star className="h-5 w-5" fill="currentColor" />
							<h2 className="text-xl font-black uppercase leading-tight tracking-tight">Vamos fazer a Casa Verde crescer pela própria base</h2>
						</div>
						<p className="max-w-xl text-[0.82rem] leading-relaxed opacity-90">
							A Casa Verde já tem o que mais vale no varejo: clientes que cuidam da saúde e voltam para repor. Com o CRM, cada volta é estimulada, lembrada e
							medida — nas duas lojas. Chame a gente no WhatsApp para começar.
						</p>
						<div className="mt-1 flex flex-wrap gap-3">
							{SUPPORT_CONTACTS.map((contact) => (
								<a
									key={contact.name}
									href={`https://wa.me/${contact.whatsapp}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[0.78rem] font-bold text-neutral-900 shadow-sm transition-transform hover:scale-[1.02] print:pointer-events-none"
								>
									<FaWhatsapp className="h-4 w-4 text-green-600" />
									<span>{contact.name}</span>
									<span className="font-medium tabular-nums text-neutral-500">{contact.phone}</span>
								</a>
							))}
						</div>
					</div>
				</div>
			</div>
			<SheetFooter index={`07 / ${TOTAL_SHEETS}`} label="Investimento" />
		</Sheet>
	);
}

function SummaryRow({ label, value, listValue }: { label: string; value: string; listValue?: string }) {
	return (
		<div className="flex items-center justify-between border-b border-neutral-200 bg-white px-5 py-3">
			<span className="text-[0.82rem] font-semibold text-neutral-700">{label}</span>
			<div className="flex items-baseline gap-2">
				{listValue ? <span className="text-[0.74rem] font-semibold tabular-nums text-neutral-400 line-through">{listValue}</span> : null}
				<span className="text-[0.95rem] font-black tabular-nums text-neutral-900">{value}</span>
			</div>
		</div>
	);
}

function InvestmentCard({
	name,
	tag,
	tagline,
	listPrice,
	price,
	period,
	totalLabel,
	features,
	highlight,
}: {
	name: string;
	tag: string;
	tagline: string;
	listPrice?: string;
	price: string;
	period: string;
	totalLabel: string;
	features: string[];
	highlight?: boolean;
}) {
	return (
		<div
			className="relative flex flex-col gap-4 rounded-2xl bg-white p-6"
			style={{
				border: highlight ? `2px solid ${BRAND.kraft}` : "1px solid #e5e5e5",
				boxShadow: highlight ? `0 10px 30px -12px ${hexToRgba(BRAND.kraftText, 0.45)}` : undefined,
			}}
		>
			<span
				className="absolute -top-3 right-5 inline-flex items-center gap-1 rounded-full px-3 py-1 text-[0.6rem] font-black uppercase tracking-wider"
				style={highlight ? { backgroundColor: BRAND.kraft, color: BRAND.ink } : { backgroundColor: BRAND.green, color: "#fff" }}
			>
				{tag}
			</span>

			<div>
				<h3 className="text-base font-black uppercase tracking-tight text-neutral-900">{name}</h3>
				<p className="mt-0.5 text-[0.72rem] leading-snug text-neutral-500">{tagline}</p>
			</div>

			<div className="flex flex-col gap-0.5">
				{listPrice ? (
					<span className="text-[0.78rem] font-semibold text-neutral-400">
						de <span className="tabular-nums line-through">{listPrice}</span> por
					</span>
				) : (
					<span className="text-[0.78rem] font-semibold text-transparent select-none" aria-hidden>
						·
					</span>
				)}
				<div className="flex items-end gap-1">
					<span className="text-3xl font-black tracking-tight tabular-nums" style={{ color: BRAND.green }}>
						{price}
					</span>
					<span className="mb-1 text-[0.75rem] font-semibold text-neutral-400">{period}</span>
				</div>
				<span className="mt-1 w-fit rounded-md px-2 py-0.5 text-[0.68rem] font-bold" style={{ backgroundColor: BRAND.surface, color: BRAND.ink }}>
					<Users className="mr-1 inline h-3 w-3 align-[-2px]" />
					{totalLabel}
				</span>
			</div>

			<div className="h-px w-full bg-neutral-100" />

			<ul className="flex flex-col gap-2">
				{features.map((feature) => (
					<li key={feature} className="flex items-start gap-2">
						<Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" style={{ color: BRAND.leafText }} />
						<span className="text-[0.74rem] leading-snug text-neutral-700">{feature}</span>
					</li>
				))}
			</ul>
		</div>
	);
}
