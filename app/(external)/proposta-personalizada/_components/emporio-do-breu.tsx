import { BrandLogo } from "@/components/Brand/BrandLogo";
// Proposta comercial de uso único — BREU Empório & Frutaria (Ituiutaba/MG), 1 unidade.
// ERP RecompraCRM (com os recursos de CRM inclusos, exceto Chat Hub e Agente de IA)
// + implantação única + add-on Gestor de Crescimento com desconto.
// Renderizada dentro do shell de impressão em ../page.tsx (A4). Não faz parte do produto.

import { ARTHUR_WHATSAPP_NUMBER, LUCAS_WHATSAPP_NUMBER } from "@/config/internal-coms";
import {
	AlarmClock,
	ArrowRight,
	BadgeCheck,
	BarChart3,
	Boxes,
	CalendarCheck,
	Check,
	Cherry,
	ClipboardCheck,
	FileCheck2,
	FileText,
	Gift,
	GraduationCap,
	HeartHandshake,
	Landmark,
	LayoutDashboard,
	type LucideIcon,
	Megaphone,
	MessageCircleMore,
	Minus,
	PackageCheck,
	Radar,
	Receipt,
	RefreshCw,
	Rocket,
	Scale,
	ScanBarcode,
	ShieldCheck,
	ShoppingBasket,
	Smartphone,
	Sparkles,
	Star,
	Store,
	Target,
	Truck,
	Users,
	Wallet,
} from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { FaWhatsapp } from "react-icons/fa6";
import { Sheet, SheetFooter } from "./_shared";

/* -------------------------------------------------------------------------- */
/*  Paleta BREU — madeira do barril, cobre da gravura e creme (extraída da logo) */
/* -------------------------------------------------------------------------- */

const BRAND = {
	wood: "#5A3722",
	woodDeep: "#2E1C12",
	wheat: "#F0DFC2",
	// Marrom-cobre legível como texto sobre fundos claros (~7:1)
	wheatText: "#7A4E28",
	copper: "#C8915A",
	// Cobre escurecido — legível como texto sobre fundos claros (~5.7:1)
	copperText: "#8A5A2B",
	cream: "#FBF5EC",
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
	backgroundImage: `linear-gradient(135deg, ${BRAND.wood} 0%, ${BRAND.woodDeep} 100%)`,
};

/* -------------------------------------------------------------------------- */
/*  Dados da proposta                                                          */
/* -------------------------------------------------------------------------- */

const ERP_MONTHLY = 599.9;
const GROWTH_LIST_MONTHLY = 500;
const GROWTH_DISCOUNT = 200;
const GROWTH_MONTHLY = GROWTH_LIST_MONTHLY - GROWTH_DISCOUNT;
const FULL_MONTHLY = ERP_MONTHLY + GROWTH_MONTHLY;
const IMPLEMENTATION_FEE = 1000;

function formatBRL(value: number) {
	return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const SUPPORT_CONTACTS = [
	{ name: "Lucas Fernandes", phone: "34 99662-6855", whatsapp: LUCAS_WHATSAPP_NUMBER },
	{ name: "Arthur Carvalho", phone: "34 99948-0791", whatsapp: ARTHUR_WHATSAPP_NUMBER },
] as const;

const WHATSAPP_MESSAGE = "Olá! Quero conversar sobre a proposta do BREU Empório & Frutaria.";

const TOTAL_SHEETS = "08";

/* -------------------------------------------------------------------------- */
/*  Proposta — BREU Empório & Frutaria                                         */
/* -------------------------------------------------------------------------- */

export function EmporioDoBreuProposal() {
	return (
		<>
			<CoverSheet />
			<StartingPointSheet />
			<CheckoutSheet />
			<BackOfficeSheet />
			<CrmSheet />
			<GrowthManagerSheet />
			<ImplementationSheet />
			<InvestmentSheet />
		</>
	);
}

/* -------------------------------------------------------------------------- */
/*  Primitivos locais                                                          */
/* -------------------------------------------------------------------------- */

function Eyebrow({ children, tone = "wood" }: { children: ReactNode; tone?: "wood" | "copper" | "white" }) {
	const color = tone === "copper" ? BRAND.copperText : tone === "white" ? "rgba(255,255,255,0.75)" : BRAND.wood;
	return (
		<span className="text-[0.68rem] font-extrabold uppercase tracking-[0.28em]" style={{ color }}>
			{children}
		</span>
	);
}

function SectionLabel({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
	return (
		<div className="mb-3 flex items-center gap-2.5">
			<div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: hexToRgba(BRAND.wood, 0.1), color: BRAND.wood }}>
				<Icon className="h-[18px] w-[18px]" />
			</div>
			<h2 className="text-lg font-black uppercase leading-none tracking-tight text-neutral-900">{text}</h2>
		</div>
	);
}

function SheetHeader({
	eyebrow,
	icon: Icon,
	title,
	lead,
	iconColor = BRAND.wood,
}: {
	eyebrow: ReactNode;
	icon: LucideIcon;
	title: ReactNode;
	lead: string;
	iconColor?: string;
}) {
	return (
		<div className="flex items-start gap-5">
			<div
				className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl text-white shadow-lg"
				style={{ backgroundColor: iconColor, boxShadow: `0 12px 28px -10px ${hexToRgba(iconColor, 0.5)}` }}
			>
				<Icon className="h-8 w-8" />
			</div>
			<div className="min-w-0">
				{typeof eyebrow === "string" ? <Eyebrow tone="copper">{eyebrow}</Eyebrow> : eyebrow}
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
				style={{ backgroundColor: hexToRgba(BRAND.wood, 0.1), color: BRAND.wood }}
			>
				<Check className="h-3 w-3" strokeWidth={3.5} />
			</span>
			<span className="text-[0.9rem] leading-snug text-neutral-700">{children}</span>
		</li>
	);
}

function TakeawayStrip({ children }: { children: ReactNode }) {
	return (
		<div className="mt-auto mb-10 flex items-center gap-3.5 rounded-2xl px-6 py-4" style={{ backgroundColor: hexToRgba(BRAND.wood, 0.07) }}>
			<span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-white" style={{ backgroundColor: BRAND.wood }}>
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

function BreuLogo({ px, className = "" }: { px: number; className?: string }) {
	return (
		<div className={`relative flex-shrink-0 ${className}`} style={{ width: px, height: px }}>
			<Image src="/logo-emporio-do-breu.webp" alt="BREU Empório e Frutaria" fill sizes={`${px}px`} className="object-contain" />
		</div>
	);
}

/* -------------------------------------------------------------------------- */
/*  1 · Capa                                                                   */
/* -------------------------------------------------------------------------- */

function CoverSheet() {
	return (
		<Sheet className="text-white">
			<div className="relative flex h-full flex-1 flex-col justify-between px-14 py-16" style={{ backgroundColor: BRAND.wood }}>
				<div
					className="pointer-events-none absolute inset-0 opacity-[0.1]"
					style={{ backgroundImage: "radial-gradient(circle, #fff 1.2px, transparent 1.2px)", backgroundSize: "22px 22px" }}
				/>
				<div
					className="pointer-events-none absolute -right-44 -top-44 h-[560px] w-[560px] rounded-full opacity-45"
					style={{ background: `radial-gradient(circle, ${BRAND.copper} 0%, transparent 62%)` }}
				/>
				<div
					className="pointer-events-none absolute -bottom-56 -left-36 h-[500px] w-[500px] rounded-full opacity-50"
					style={{ background: `radial-gradient(circle, ${BRAND.woodDeep} 0%, transparent 62%)` }}
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
					<div className="mt-6 flex items-center gap-6">
						<BreuLogo px={210} className="drop-shadow-[0_24px_40px_rgba(0,0,0,0.55)]" />
						<div className="flex flex-col gap-1.5">
							<span className="text-[0.72rem] font-extrabold uppercase tracking-[0.25em] text-white/55">Há mais de 40 anos</span>
							<span className="text-[1.05rem] font-bold text-white/85">Av. 17 · Ituiutaba/MG</span>
						</div>
					</div>
					<h1 className="mt-9 text-[2.9rem] font-black leading-[0.98] tracking-tight text-balance">
						Do caixa à fidelização,
						<br />
						<span style={{ color: BRAND.wheat }}>tudo no mesmo sistema.</span>
					</h1>
					<div className="mt-6 flex flex-wrap gap-2">
						<span
							className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-extrabold uppercase tracking-wide"
							style={{ backgroundColor: BRAND.wheat, color: BRAND.woodDeep }}
						>
							<Store className="h-4 w-4" /> ERP com CRM incluso
						</span>
						<span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-extrabold uppercase tracking-wide ring-1 ring-white/25">
							<HeartHandshake className="h-4 w-4" /> + Gestor de Crescimento
						</span>
					</div>
					<p className="mt-8 max-w-xl text-lg font-medium leading-relaxed text-white/85">
						PDV com balança, nota fiscal, estoque com validade e financeiro — e, na mesma venda, o cliente identificado, o{" "}
						<strong className="font-extrabold text-white">cashback creditado</strong> e a próxima{" "}
						<strong className="font-extrabold text-white">campanha de WhatsApp</strong> pronta para trazê-lo de volta.
					</p>
				</div>

				{/* rodapé */}
				<div className="relative z-10 flex items-end justify-between">
					<div className="flex flex-col gap-1">
						<span className="text-[0.7rem] font-bold uppercase tracking-[0.25em] text-white/50">Nesta proposta</span>
						<div className="flex flex-wrap items-center gap-1.5 text-[0.8rem] font-extrabold">
							{["Caixa", "Gestão", "CRM", "Gestor", "Implantação", "Investimento"].map((item, i) => (
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
/*  2 · O ponto de partida                                                     */
/* -------------------------------------------------------------------------- */

const STRENGTHS: { icon: LucideIcon; value: string; label: string }[] = [
	{ icon: CalendarCheck, value: "Desde 1983", label: "mais de 40 anos de confiança na Av. 17 — a frutaria que a cidade conhece" },
	{ icon: Users, value: "5,6 mil", label: "seguidores no Instagram acompanhando ofertas, saladas e novidades" },
	{ icon: MessageCircleMore, value: "Grupo VIP", label: "com oferta diária no WhatsApp — o hábito de comunicar já existe" },
];

const ALREADY_DOING = [
	{ icon: ShoppingBasket, title: "Clube Todo Dia", body: "Kits para a rotina da semana — recorrência por natureza." },
	{ icon: Cherry, title: "Saladas e bowls", body: "Montados do jeito do cliente, na loja ou pelo link da bio." },
	{ icon: Sparkles, title: "Eventos", body: "Saladas de frutas e coffee breaks para empresas e eventos." },
	{ icon: Gift, title: "Dia do Cliente", body: "Sorteios e ações de carinho que geram engajamento." },
];

function StartingPointSheet() {
	return (
		<Sheet>
			<div className="flex flex-1 flex-col px-14 pt-16">
				<Eyebrow>O ponto de partida</Eyebrow>
				<h2 className="mt-4 max-w-3xl text-[2.7rem] font-black leading-[1.02] tracking-tight text-balance">
					O BREU já tem clientes fiéis e uma marca querida.
					<br />
					<span style={{ color: BRAND.wood }}>Falta um sistema à altura.</span>
				</h2>
				<p className="mt-5 max-w-2xl text-[1.02rem] leading-relaxed text-neutral-600">
					Frescor diário, preço competitivo e um relacionamento que vai além do balcão. O que hoje acontece no grupo VIP, no Instagram e na memória da
					equipe pode virar <strong className="font-bold text-neutral-900">dado, rotina e venda medida</strong> — sem perder o jeito BREU de atender.
				</p>

				<div className="mt-9 grid grid-cols-3 gap-5">
					{STRENGTHS.map((stat) => (
						<div key={stat.value} className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-6">
							<div
								className="flex h-11 w-11 items-center justify-center rounded-xl"
								style={{ backgroundColor: hexToRgba(BRAND.wood, 0.1), color: BRAND.wood }}
							>
								<stat.icon className="h-5 w-5" />
							</div>
							<span className="text-[1.9rem] font-black leading-none tracking-tight" style={{ color: BRAND.ink }}>
								{stat.value}
							</span>
							<span className="text-sm leading-snug text-neutral-500">{stat.label}</span>
						</div>
					))}
				</div>

				<div className="mt-8">
					<SubHeading>O que o BREU já faz — e o sistema potencializa</SubHeading>
					<div className="grid grid-cols-4 gap-3">
						{ALREADY_DOING.map((item) => (
							<div key={item.title} className="flex flex-col gap-2 rounded-2xl p-4" style={{ backgroundColor: BRAND.cream }}>
								<item.icon className="h-5 w-5" style={{ color: BRAND.copperText }} />
								<h4 className="text-[0.82rem] font-black leading-tight text-neutral-900">{item.title}</h4>
								<p className="text-[0.72rem] leading-snug text-neutral-600">{item.body}</p>
							</div>
						))}
					</div>
				</div>

				{/* A virada */}
				<div className="mt-8 overflow-hidden rounded-2xl" style={{ backgroundColor: BRAND.surface }}>
					<div className="grid grid-cols-[1.1fr_auto_1.1fr] items-stretch">
						<div className="flex flex-col justify-center gap-2 p-7">
							<span className="text-[0.7rem] font-extrabold uppercase tracking-[0.2em] text-neutral-500">Hoje</span>
							<p className="text-[1.05rem] font-bold leading-snug text-neutral-500">
								A oferta vai para o grupo, a venda vai para o caixa — e não dá para saber quem comprou, o quê, nem quem parou de vir.
							</p>
						</div>
						<div className="flex items-center justify-center px-2" style={{ backgroundColor: hexToRgba(BRAND.wood, 0.06) }}>
							<div className="flex h-11 w-11 items-center justify-center rounded-full text-white" style={{ backgroundColor: BRAND.wood }}>
								<ArrowRight className="h-5 w-5" />
							</div>
						</div>
						<div className="flex flex-col justify-center gap-2 p-7" style={{ backgroundColor: hexToRgba(BRAND.wheat, 0.45) }}>
							<span className="text-[0.7rem] font-extrabold uppercase tracking-[0.2em]" style={{ color: BRAND.wheatText }}>
								Com o ERP RecompraCRM
							</span>
							<p className="text-[1.05rem] font-extrabold leading-snug text-neutral-900">
								Cada venda emite a nota, baixa o estoque, lança o financeiro e credita o cashback do cliente — tudo de uma vez.
							</p>
						</div>
					</div>
				</div>
			</div>
			<SheetFooter index={`02 / ${TOTAL_SHEETS}`} label="O ponto de partida · BREU" />
		</Sheet>
	);
}

/* -------------------------------------------------------------------------- */
/*  3 · Frente de caixa, balança e loja digital                                */
/* -------------------------------------------------------------------------- */

const CHANNELS: { icon: LucideIcon; title: string; body: string }[] = [
	{
		icon: Scale,
		title: "Balcão com balança",
		body: "A etiqueta da balança é lida no PDV com o PLU e o valor da pesagem. Banana, morango e salada entram no carrinho sem digitar nada.",
	},
	{
		icon: Smartphone,
		title: "Loja digital",
		body: "Catálogo próprio para os pedidos que hoje chegam pelo link da bio — com retirada, entrega e pagamento.",
	},
	{
		icon: Truck,
		title: "iFood integrado",
		body: "Pedidos do iFood entram na base de clientes e no cashback, sem nota, lançamento ou baixa de estoque em duplicidade.",
	},
];

function CheckoutSheet() {
	return (
		<Sheet>
			<div className="flex flex-1 flex-col px-14 pt-14">
				<SheetHeader
					eyebrow="ERP · Frente de caixa"
					icon={ScanBarcode}
					title="Um caixa feito para o hortifruti"
					lead="Venda rápida no balcão, com balança etiquetadora, leitor de código de barras e o cliente identificado no mesmo fluxo — e os mesmos produtos e preços na loja digital."
				/>

				<div className="mt-8 grid grid-cols-3 gap-4">
					{CHANNELS.map((c) => (
						<div key={c.title} className="flex flex-col gap-2 rounded-2xl border border-neutral-200 bg-white p-4">
							<div
								className="flex h-10 w-10 items-center justify-center rounded-xl"
								style={{ backgroundColor: hexToRgba(BRAND.wood, 0.1), color: BRAND.wood }}
							>
								<c.icon className="h-5 w-5" />
							</div>
							<h3 className="text-[0.86rem] font-black uppercase leading-tight tracking-tight text-neutral-900">{c.title}</h3>
							<p className="text-[0.76rem] leading-snug text-neutral-600">{c.body}</p>
						</div>
					))}
				</div>

				<div className="mt-8 grid grid-cols-[1.1fr_0.9fr] items-start gap-9">
					<div className="flex flex-col items-center gap-3">
						<PosMock />
						<MockCaption>PDV · nova venda com itens pesados</MockCaption>
					</div>
					<div className="flex flex-col gap-6 pt-1">
						<div>
							<SubHeading>No balcão</SubHeading>
							<ul className="flex flex-col gap-2.5">
								<BenefitRow>Etiquetas de Toledo, Filizola e Urano lidas direto no PDV.</BenefitRow>
								<BenefitRow>Passar o mesmo item três vezes soma a quantidade, não três linhas.</BenefitRow>
								<BenefitRow>CPF do cliente na venda: o cashback aparece e pode ser usado na hora.</BenefitRow>
								<BenefitRow>NFC-e emitida ao finalizar, sem trocar de tela.</BenefitRow>
							</ul>
						</div>
						<div
							className="rounded-2xl border border-dashed p-5"
							style={{ borderColor: hexToRgba(BRAND.copper, 0.7), backgroundColor: BRAND.cream }}
						>
							<div className="mb-1.5 flex items-center gap-2">
								<Receipt className="h-4 w-4" style={{ color: BRAND.copperText }} />
								<span className="text-[0.7rem] font-black uppercase tracking-wider" style={{ color: BRAND.copperText }}>
									Orçamento para eventos
								</span>
							</div>
							<p className="text-[0.86rem] leading-relaxed text-neutral-700">
								Coffee break e salada de frutas para eventos começam como <strong className="font-extrabold">orçamento</strong> — sem mexer no estoque
								nem no caixa — e viram venda faturada, com NF-e para a empresa, quando o cliente confirma.
							</p>
						</div>
					</div>
				</div>

				<TakeawayStrip>fila andando no balcão, nota emitida sem retrabalho e cada cliente identificado — o primeiro passo para ele voltar.</TakeawayStrip>
			</div>
			<SheetFooter index={`03 / ${TOTAL_SHEETS}`} label="ERP · Frente de caixa" />
		</Sheet>
	);
}

const POS_ITEMS = [
	{ name: "Banana prata", detail: "1,235 kg · etiqueta da balança", value: "R$ 8,03", scale: true },
	{ name: "Morango bandeja 250 g", detail: "2 un × R$ 9,90", value: "R$ 19,80", scale: false },
	{ name: "Salada montada", detail: "0,480 kg · etiqueta da balança", value: "R$ 21,12", scale: true },
	{ name: "Abacate manteiga", detail: "0,910 kg · etiqueta da balança", value: "R$ 10,92", scale: true },
];

function PosMock() {
	return (
		<DeviceFrame>
			<div className="overflow-hidden rounded-[18px] bg-white">
				<div className="flex items-center justify-between px-4 py-3 text-white" style={heroGradient}>
					<div className="flex items-center gap-2">
						<BreuLogo px={32} />
						<div className="flex flex-col leading-none">
							<span className="text-[0.78rem] font-extrabold">BREU · Nova venda</span>
							<span className="text-[0.58rem] font-medium text-white/60">Caixa 01 · balcão</span>
						</div>
					</div>
					<span className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[0.56rem] font-bold uppercase tracking-wide">
						<ScanBarcode className="h-3 w-3" /> Leitor ativo
					</span>
				</div>

				<div className="flex flex-col divide-y divide-neutral-100 px-4">
					{POS_ITEMS.map((item) => (
						<div key={item.name} className="flex items-center gap-2.5 py-2.5">
							<span
								className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
								style={
									item.scale
										? { backgroundColor: hexToRgba(BRAND.copper, 0.15), color: BRAND.copperText }
										: { backgroundColor: BRAND.surface, color: BRAND.ink }
								}
							>
								{item.scale ? <Scale className="h-3.5 w-3.5" /> : <ScanBarcode className="h-3.5 w-3.5" />}
							</span>
							<div className="flex min-w-0 flex-1 flex-col leading-tight">
								<span className="truncate text-[0.74rem] font-extrabold text-neutral-900">{item.name}</span>
								<span className="text-[0.6rem] text-neutral-500">{item.detail}</span>
							</div>
							<span className="text-[0.76rem] font-black tabular-nums text-neutral-900">{item.value}</span>
						</div>
					))}
				</div>

				<div className="mx-4 mt-1 flex items-center gap-2.5 rounded-xl px-3 py-2.5" style={{ backgroundColor: hexToRgba(BRAND.wheat, 0.45) }}>
					<div
						className="flex h-8 w-8 items-center justify-center rounded-full text-[0.65rem] font-black"
						style={{ backgroundColor: "#fff", color: BRAND.wood }}
					>
						JR
					</div>
					<div className="flex min-w-0 flex-1 flex-col leading-tight">
						<span className="text-[0.72rem] font-extrabold text-neutral-900">Juliana Rocha</span>
						<span className="text-[0.58rem] font-semibold" style={{ color: BRAND.wheatText }}>
							R$ 6,40 de cashback disponível
						</span>
					</div>
					<span className="rounded-full bg-white px-2 py-0.5 text-[0.54rem] font-black uppercase" style={{ color: BRAND.wood }}>
						Usar
					</span>
				</div>

				<div className="flex items-center justify-between px-4 py-3">
					<div className="flex flex-col leading-none">
						<span className="text-[0.54rem] font-black uppercase tracking-wide text-neutral-400">Total</span>
						<span className="mt-1 text-xl font-black tabular-nums text-neutral-900">R$ 53,47</span>
					</div>
					<div
						className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[0.72rem] font-extrabold uppercase text-white"
						style={{ backgroundColor: BRAND.wood }}
					>
						<FileCheck2 className="h-4 w-4" /> Finalizar · NFC-e
					</div>
				</div>
			</div>
		</DeviceFrame>
	);
}

/* -------------------------------------------------------------------------- */
/*  4 · Por trás do caixa — fiscal, estoque com validade, financeiro           */
/* -------------------------------------------------------------------------- */

const SALE_OUTPUTS: { icon: LucideIcon; label: string }[] = [
	{ icon: FileText, label: "Nota fiscal" },
	{ icon: Boxes, label: "Baixa de estoque" },
	{ icon: Landmark, label: "Lançamento financeiro" },
	{ icon: Gift, label: "Cashback do cliente" },
];

const BACK_OFFICE: { icon: LucideIcon; title: string; points: string[] }[] = [
	{
		icon: FileCheck2,
		title: "Fiscal",
		points: [
			"NFC-e no balcão e NF-e para empresas",
			"Certificado A1, séries e grupos tributários",
			"Rejeição da SEFAZ com o motivo e o atalho para corrigir",
		],
	},
	{
		icon: PackageCheck,
		title: "Compras e estoque",
		points: [
			"Nota do fornecedor chega sozinha e vira entrada, com custo",
			"Lotes com validade e aviso do que está para vencer",
			"Recontagem com ajuste e motivo registrados",
		],
	},
	{
		icon: Landmark,
		title: "Financeiro",
		points: [
			"Cada venda lança receita e forma de pagamento",
			"Plano de contas criado na ativação, ajustável",
			"Receitas, custos e resultado sem planilha paralela",
		],
	},
];

const EXPIRING_LOTS = [
	{ product: "Morango bandeja", lot: "Lote 1107", qty: "18 bandejas", when: "vence em 2 dias", urgent: true },
	{ product: "Iogurte natural", lot: "Lote 0932", qty: "12 un", when: "vence em 4 dias", urgent: false },
	{ product: "Folhas higienizadas", lot: "Lote 1110", qty: "24 un", when: "vence amanhã", urgent: true },
];

function BackOfficeSheet() {
	return (
		<Sheet>
			<div className="flex flex-1 flex-col px-14 pt-14">
				<SheetHeader
					eyebrow="ERP · Gestão"
					icon={LayoutDashboard}
					title="Uma venda confirmada já sai com tudo lançado"
					lead="Nota, estoque, financeiro e cashback nascem da mesma venda. Ninguém redigita nada em outro sistema — e o que é perecível ganha controle de validade."
				/>

				{/* cadeia da venda */}
				<div className="mt-8 flex items-center gap-3 rounded-2xl px-5 py-4" style={heroGradient}>
					<span className="flex flex-shrink-0 items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-[0.78rem] font-black text-neutral-900">
						<Receipt className="h-4 w-4" style={{ color: BRAND.wood }} /> 1 venda
					</span>
					<ArrowRight className="h-4 w-4 flex-shrink-0 text-white/60" />
					<div className="grid flex-1 grid-cols-4 gap-2">
						{SALE_OUTPUTS.map((o) => (
							<span
								key={o.label}
								className="flex items-center justify-center gap-1.5 rounded-xl bg-white/12 px-2 py-2.5 text-center text-[0.7rem] font-extrabold leading-tight text-white ring-1 ring-white/20"
							>
								<o.icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color: BRAND.wheat }} />
								{o.label}
							</span>
						))}
					</div>
				</div>

				<div className="mt-7 grid grid-cols-3 gap-4">
					{BACK_OFFICE.map((block) => (
						<div key={block.title} className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-5">
							<div className="flex items-center gap-2.5">
								<div
									className="flex h-9 w-9 items-center justify-center rounded-xl"
									style={{ backgroundColor: hexToRgba(BRAND.wood, 0.1), color: BRAND.wood }}
								>
									<block.icon className="h-[18px] w-[18px]" />
								</div>
								<h3 className="text-[0.92rem] font-black uppercase tracking-tight text-neutral-900">{block.title}</h3>
							</div>
							<ul className="flex flex-col gap-2">
								{block.points.map((p) => (
									<li key={p} className="flex items-start gap-2">
										<Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" style={{ color: BRAND.wheatText }} strokeWidth={3} />
										<span className="text-[0.76rem] leading-snug text-neutral-700">{p}</span>
									</li>
								))}
							</ul>
						</div>
					))}
				</div>

				<div className="mt-8 grid grid-cols-[1fr_1fr] items-start gap-8">
					<div>
						<SubHeading>Frescor sob controle</SubHeading>
						<div className="flex flex-col gap-2 rounded-2xl border border-neutral-200 bg-white p-4">
							<div className="mb-1 flex items-center gap-2">
								<AlarmClock className="h-4 w-4" style={{ color: BRAND.copperText }} />
								<span className="text-[0.68rem] font-black uppercase tracking-wide text-neutral-900">Lotes próximos do vencimento</span>
							</div>
							{EXPIRING_LOTS.map((lot) => (
								<div key={lot.lot} className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ backgroundColor: BRAND.surface }}>
									<div className="flex min-w-0 flex-1 flex-col leading-tight">
										<span className="text-[0.74rem] font-extrabold text-neutral-900">{lot.product}</span>
										<span className="text-[0.6rem] text-neutral-500">
											{lot.lot} · {lot.qty}
										</span>
									</div>
									<span
										className="rounded-full px-2 py-0.5 text-[0.56rem] font-black uppercase tracking-wide"
										style={
											lot.urgent
												? { backgroundColor: BRAND.wood, color: "#fff" }
												: { backgroundColor: BRAND.wheat, color: BRAND.wheatText }
										}
									>
										{lot.when}
									</span>
								</div>
							))}
						</div>
					</div>
					<div className="pt-8">
						<p className="text-[0.92rem] leading-relaxed text-neutral-700">
							Em uma frutaria, a margem se perde na prateleira. Saber o que vence nos próximos dias permite{" "}
							<strong className="font-extrabold text-neutral-900">agir antes</strong>: uma oferta no grupo VIP, um kit do Clube Todo Dia, uma salada do dia.
						</p>
						<p className="mt-3 text-[0.92rem] leading-relaxed text-neutral-700">
							E como o custo de cada item vem da nota do fornecedor, o resultado do mês aparece no financeiro sem planilha.
						</p>
					</div>
				</div>

				<TakeawayStrip>menos retrabalho no caixa e no escritório, menos perda na prateleira e um resultado que se lê em tempo real.</TakeawayStrip>
			</div>
			<SheetFooter index={`04 / ${TOTAL_SHEETS}`} label="ERP · Gestão" />
		</Sheet>
	);
}

/* -------------------------------------------------------------------------- */
/*  5 · CRM incluso no ERP                                                     */
/* -------------------------------------------------------------------------- */

const CRM_FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
	{ icon: Wallet, title: "Cashback no CPF", body: "Crédito a cada compra, resgatado no próprio PDV. Regras e validade definidas pelo BREU." },
	{ icon: MessageCircleMore, title: "WhatsApp automático", body: "Boas-vindas, aniversário, cashback expirando e cliente sumido, rodando sozinhos." },
	{ icon: Megaphone, title: "Campanhas segmentadas", body: "A oferta certa para quem compra frutas, quem assina o Clube, quem não volta há 30 dias." },
	{ icon: Radar, title: "Matriz RFM", body: "A base classificada em campeões, leais, em risco e perdidos — atualizada a cada venda." },
	{ icon: BarChart3, title: "BI de vendas", body: "Ticket médio, recorrência, produtos mais vendidos e faturamento atribuído às campanhas." },
	{ icon: Users, title: "Base própria", body: "Os clientes do grupo VIP e do Instagram viram contatos identificados, com histórico." },
];

function CrmSheet() {
	return (
		<Sheet>
			<div className="flex flex-1 flex-col px-14 pt-14">
				<SheetHeader
					eyebrow="CRM incluso no ERP"
					icon={RefreshCw}
					title="A fidelização já vem dentro do caixa"
					lead="Como a venda nasce no sistema, o cliente é identificado, o cashback é creditado e a campanha certa é disparada — sem integração, sem segundo sistema."
				/>

				<div className="mt-8 grid grid-cols-3 gap-3.5">
					{CRM_FEATURES.map((f) => (
						<div key={f.title} className="flex flex-col gap-2 rounded-2xl border border-neutral-200 bg-white p-4">
							<div
								className="flex h-9 w-9 items-center justify-center rounded-xl"
								style={{ backgroundColor: hexToRgba(BRAND.wheat, 0.6), color: BRAND.woodDeep }}
							>
								<f.icon className="h-[18px] w-[18px]" />
							</div>
							<h3 className="text-[0.82rem] font-black uppercase leading-tight tracking-tight text-neutral-900">{f.title}</h3>
							<p className="text-[0.74rem] leading-snug text-neutral-600">{f.body}</p>
						</div>
					))}
				</div>

				<div className="mt-8 grid grid-cols-[0.95fr_1.05fr] items-start gap-9">
					<div className="flex flex-col items-center gap-3">
						<WhatsappCampaignMock />
						<MockCaption>Campanha · cashback expirando</MockCaption>
					</div>
					<div className="flex flex-col gap-6 pt-1">
						<div>
							<SubHeading>Do grupo VIP para a base própria</SubHeading>
							<ul className="flex flex-col gap-2.5">
								<BenefitRow>O grupo continua — e passa a ter destino: quem compra é identificado no caixa.</BenefitRow>
								<BenefitRow>A oferta do dia vai para quem tem interesse, não para todos de uma vez.</BenefitRow>
								<BenefitRow>Quem some do caixa recebe um convite para voltar, com cashback de presente.</BenefitRow>
								<BenefitRow>Cada campanha mostra quanto vendeu — em reais.</BenefitRow>
							</ul>
						</div>
						<div className="rounded-2xl px-5 py-4" style={{ backgroundColor: BRAND.surface }}>
							<div className="mb-1.5 flex items-center gap-2">
								<Minus className="h-4 w-4 text-neutral-500" />
								<span className="text-[0.68rem] font-black uppercase tracking-wider text-neutral-600">Fora deste plano</span>
							</div>
							<p className="text-[0.8rem] leading-snug text-neutral-600">
								O <strong className="font-bold text-neutral-800">Chat Hub</strong> (caixa de entrada para a equipe atender as conversas do WhatsApp) e o{" "}
								<strong className="font-bold text-neutral-800">Agente de IA</strong> não estão inclusos. Podem ser adicionados depois, sem refazer nada.
							</p>
						</div>
					</div>
				</div>
			</div>
			<SheetFooter index={`05 / ${TOTAL_SHEETS}`} label="CRM incluso" />
		</Sheet>
	);
}

function WhatsappCampaignMock() {
	return (
		<DeviceFrame className="max-w-[320px] overflow-hidden">
			<div className="overflow-hidden rounded-[18px]" style={{ backgroundColor: "#e6ddd4" }}>
				<div className="flex items-center gap-3 px-4 py-3 text-white" style={{ backgroundColor: "#075E54" }}>
					<BreuLogo px={36} />
					<div className="flex flex-col leading-none">
						<span className="text-[0.84rem] font-bold">BREU Empório & Frutaria</span>
						<span className="text-[0.6rem] text-white/70">conta comercial</span>
					</div>
					<FaWhatsapp className="ml-auto h-5 w-5 text-white/80" />
				</div>
				<div
					className="flex flex-col gap-2.5 px-4 py-5"
					style={{ backgroundImage: "radial-gradient(rgba(0,0,0,0.03) 1px, transparent 1px)", backgroundSize: "16px 16px" }}
				>
					<div className="max-w-[90%] self-start rounded-2xl rounded-tl-sm bg-white px-3.5 py-2.5 shadow-sm">
						<p className="text-[0.78rem] leading-snug text-neutral-800">Oi, Juliana! 🍓 Seus R$ 6,40 de cashback no BREU vencem no sábado.</p>
						<p className="mt-2 text-[0.78rem] leading-snug text-neutral-800">
							Hoje tem morango fresquinho e salada montada do seu jeito. Passa aqui na Av. 17? 💚
						</p>
						<span className="mt-1.5 block text-right text-[0.58rem] text-neutral-500">09:40 ✓✓</span>
					</div>
					<div className="max-w-[80%] self-end rounded-2xl rounded-tr-sm px-3.5 py-2.5 shadow-sm" style={{ backgroundColor: "#dcf8c6" }}>
						<p className="text-[0.78rem] leading-snug text-neutral-800">Passo na hora do almoço! 😋</p>
						<span className="mt-1.5 block text-right text-[0.58rem] text-neutral-500">09:52 ✓✓</span>
					</div>
					<div
						className="mt-1 self-center rounded-full px-3 py-1 text-[0.58rem] font-black uppercase tracking-wide text-white shadow"
						style={{ backgroundColor: BRAND.wood }}
					>
						Convertido · compra de R$ 53,47
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
	{ icon: Target, title: "Diagnóstico e metas", body: "Lemos a base e as vendas e definimos com vocês as metas comerciais do ciclo." },
	{ icon: CalendarCheck, title: "Calendário do mês", body: "Campanhas em torno da safra, das datas e dos segmentos prioritários." },
	{ icon: Megaphone, title: "Criação e disparo", body: "Escrevemos as mensagens, escolhemos o público e disparamos. O BREU só aprova." },
	{ icon: BarChart3, title: "Resultado e ajuste", body: "Relatório mensal com faturamento atribuído. O que converteu vira régua." },
];

const SEASONAL_CAMPAIGNS = [
	{ when: "Jan–Fev", title: "Verão das frutas", body: "Manga, uva e melancia: kits refrescantes e saladas de frutas." },
	{ when: "Jun–Jul", title: "Inverno do morango", body: "Safra do morango e comidas quentinhas para os dias frios." },
	{ when: "Set", title: "Dia do Cliente BREU", body: "O sorteio vira campanha: números da sorte para quem compra." },
	{ when: "Todo mês", title: "Clube Todo Dia", body: "Convite para assinar enviado a quem já compra toda semana." },
	{ when: "Sempre", title: "Eventos e empresas", body: "Coffee break e salada de frutas oferecidos a clientes corporativos." },
	{ when: "Dez", title: "Cestas de Natal", body: "Cestas de frutas para presentear, com pré-venda para os campeões." },
];

function GrowthManagerSheet() {
	return (
		<Sheet>
			<div className="flex flex-1 flex-col px-14 pt-14">
				<SheetHeader
					eyebrow={
						<div className="flex items-center gap-2">
							<Eyebrow tone="copper">Add-on</Eyebrow>
							<span
								className="rounded-full px-2.5 py-0.5 text-[0.58rem] font-black uppercase tracking-wider text-white"
								style={{ backgroundColor: BRAND.copperText }}
							>
								R$ {formatBRL(GROWTH_DISCOUNT)} de desconto
							</span>
						</div>
					}
					icon={HeartHandshake}
					iconColor={BRAND.copperText}
					title="Gestor de Crescimento"
					lead="O sistema entrega as ferramentas. O gestor garante que elas virem venda: a gente planeja, cria, dispara e otimiza as campanhas do BREU — e a equipe segue focada no balcão."
				/>

				<div className="mt-8">
					<SubHeading>A rotina mensal, feita por nós</SubHeading>
					<div className="grid grid-cols-4 gap-3.5">
						{GROWTH_ROUTINE.map((step, i) => (
							<div key={step.title} className="flex flex-col gap-2 rounded-2xl border border-neutral-200 bg-white p-4">
								<div className="flex items-center gap-2">
									<span
										className="flex h-6 w-6 items-center justify-center rounded-full text-[0.65rem] font-black text-white"
										style={{ backgroundColor: BRAND.wood }}
									>
										{i + 1}
									</span>
									<step.icon className="h-4 w-4" style={{ color: BRAND.copperText }} />
								</div>
								<h4 className="text-[0.78rem] font-black uppercase leading-tight tracking-tight text-neutral-900">{step.title}</h4>
								<p className="text-[0.7rem] leading-snug text-neutral-600">{step.body}</p>
							</div>
						))}
					</div>
				</div>

				<div className="mt-8">
					<SubHeading>Exemplos de calendário para o BREU</SubHeading>
					<div className="grid grid-cols-3 gap-3">
						{SEASONAL_CAMPAIGNS.map((c) => (
							<div key={c.title} className="flex gap-3 rounded-2xl p-4" style={{ backgroundColor: BRAND.cream }}>
								<span
									className="flex h-fit flex-shrink-0 whitespace-nowrap rounded-lg px-2 py-1 text-[0.58rem] font-black uppercase tracking-wide text-white"
									style={{ backgroundColor: BRAND.wood }}
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
						<BenefitRow>Um gestor de crescimento dedicado ao BREU.</BenefitRow>
						<BenefitRow>Diagnóstico inicial com metas definidas juntos.</BenefitRow>
					</ul>
					<ul className="flex flex-col gap-2.5">
						<BenefitRow>Criação e gestão das campanhas, ponta a ponta.</BenefitRow>
						<BenefitRow>Relatório de resultado e acompanhamento mensal.</BenefitRow>
					</ul>
				</div>

				<TakeawayStrip>o CRM rodando de verdade todo mês — com dono, com meta e com o retorno de cada campanha medido.</TakeawayStrip>
			</div>
			<SheetFooter index={`06 / ${TOTAL_SHEETS}`} label="Add-on · Gestor de Crescimento" />
		</Sheet>
	);
}

/* -------------------------------------------------------------------------- */
/*  7 · Implantação                                                            */
/* -------------------------------------------------------------------------- */

const IMPLEMENTATION_SCOPE: { icon: LucideIcon; title: string; body: string }[] = [
	{
		icon: Store,
		title: "Configuração do ERP",
		body: "Empresa, usuários e permissões, formas de pagamento, caixas e plano de contas do financeiro.",
	},
	{
		icon: Boxes,
		title: "Migração dos produtos",
		body: "Cadastro do catálogo com preços, grupos, códigos de barras e os PLUs da balança.",
	},
	{
		icon: FileCheck2,
		title: "Configuração fiscal",
		body: "Certificado A1, séries, grupos tributários e perfis de operação, testados em homologação antes de emitir.",
	},
	{
		icon: Scale,
		title: "Balança e leitor",
		body: "Máscara da etiqueta da balança configurada e testada com os produtos pesados no PDV.",
	},
	{
		icon: Gift,
		title: "Cashback e campanhas",
		body: "Regras do cashback e campanhas automáticas de boas-vindas, aniversário e reativação no ar.",
	},
	{
		icon: GraduationCap,
		title: "Treinamento da equipe",
		body: "Caixa, emissão de nota, entrada de mercadoria e rotina do estoque, com a equipe da loja.",
	},
];

const GO_LIVE_STEPS = [
	{ n: "01", title: "Levantamento", body: "Produtos, dados fiscais e rotina do caixa." },
	{ n: "02", title: "Configuração", body: "ERP, fiscal, balança e cashback." },
	{ n: "03", title: "Prévia guiada", body: "Uma venda simulada do começo ao fim." },
	{ n: "04", title: "Primeira venda", body: "Com o checklist completo e o nosso time junto." },
];

function ImplementationSheet() {
	return (
		<Sheet>
			<div className="flex flex-1 flex-col px-14 pt-14">
				<SheetHeader
					eyebrow="Implantação · pagamento único"
					icon={Rocket}
					title="A gente coloca o sistema no ar com vocês"
					lead="Trocar de sistema assusta pelo trabalho de configurar tudo. Esse trabalho é nosso: do cadastro dos produtos à primeira nota emitida, com o time RecompraCRM ao lado."
				/>

				<div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5">
					{IMPLEMENTATION_SCOPE.map((item) => (
						<div key={item.title} className="flex items-start gap-3.5">
							<div
								className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
								style={{ backgroundColor: hexToRgba(BRAND.wheat, 0.6), color: BRAND.woodDeep }}
							>
								<item.icon className="h-5 w-5" />
							</div>
							<div className="min-w-0">
								<h4 className="text-[0.92rem] font-black leading-tight text-neutral-900">{item.title}</h4>
								<p className="mt-0.5 text-[0.8rem] leading-snug text-neutral-600">{item.body}</p>
							</div>
						</div>
					))}
				</div>

				<div className="mt-9">
					<SubHeading>Do cadastro à primeira venda</SubHeading>
					<div className="grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] items-stretch gap-2.5">
						{GO_LIVE_STEPS.map((step, i) => (
							<GoLiveStep key={step.n} step={step} last={i === GO_LIVE_STEPS.length - 1} />
						))}
					</div>
				</div>

				<div className="mt-8 rounded-2xl border border-dashed p-5" style={{ borderColor: hexToRgba(BRAND.copper, 0.7), backgroundColor: BRAND.cream }}>
					<div className="mb-3 flex items-center gap-2">
						<ClipboardCheck className="h-4 w-4" style={{ color: BRAND.copperText }} />
						<span className="text-[0.7rem] font-black uppercase tracking-wider" style={{ color: BRAND.copperText }}>
							O que precisamos do BREU
						</span>
					</div>
					<div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
						<ul className="flex flex-col gap-2.5">
							<BenefitRow>Certificado digital A1 da empresa.</BenefitRow>
							<BenefitRow>Lista de produtos — planilha ou exportação do sistema atual.</BenefitRow>
						</ul>
						<ul className="flex flex-col gap-2.5">
							<BenefitRow>Contato do contador e o regime tributário.</BenefitRow>
							<BenefitRow>Modelo da balança etiquetadora usada na loja.</BenefitRow>
						</ul>
					</div>
				</div>

				<div
					className="mt-6 flex items-center gap-4 rounded-2xl px-6 py-5"
					style={{ backgroundColor: hexToRgba(BRAND.wood, 0.08), border: `1px solid ${hexToRgba(BRAND.wood, 0.25)}` }}
				>
					<div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-white" style={{ backgroundColor: BRAND.wood }}>
						<Rocket className="h-6 w-6" />
					</div>
					<div className="min-w-0 flex-1">
						<h4 className="text-[0.92rem] font-black uppercase tracking-tight" style={{ color: BRAND.wood }}>
							R$ {formatBRL(IMPLEMENTATION_FEE)} · uma única vez
						</h4>
						<p className="text-[0.84rem] leading-snug text-neutral-700">
							Todo o trabalho acima, cobrado uma vez só. O BREU só começa a vender pelo sistema quando o checklist estiver completo e a equipe, segura.
						</p>
					</div>
				</div>
			</div>
			<SheetFooter index={`07 / ${TOTAL_SHEETS}`} label="Implantação" />
		</Sheet>
	);
}

function GoLiveStep({ step, last }: { step: { n: string; title: string; body: string }; last: boolean }) {
	return (
		<>
			<div
				className="flex flex-col gap-1 rounded-2xl p-4"
				style={last ? { backgroundColor: BRAND.wood, color: "#fff" } : { backgroundColor: BRAND.surface, color: BRAND.ink }}
			>
				<span className="text-[0.62rem] font-black tracking-wider" style={{ color: last ? BRAND.wheat : BRAND.copperText }}>
					{step.n}
				</span>
				<span className="text-[0.84rem] font-black leading-tight">{step.title}</span>
				<span className={`text-[0.68rem] leading-snug ${last ? "text-white/80" : "text-neutral-600"}`}>{step.body}</span>
			</div>
			{last ? null : <ArrowRight className="h-4 w-4 self-center" style={{ color: BRAND.copperText }} />}
		</>
	);
}

/* -------------------------------------------------------------------------- */
/*  8 · Investimento e fechamento                                              */
/* -------------------------------------------------------------------------- */

function InvestmentSheet() {
	return (
		<Sheet>
			<div className="flex flex-1 flex-col gap-6 px-14 py-11">
				<SectionLabel icon={Wallet} text="Investimento" />

				<div className="grid grid-cols-2 items-stretch gap-5">
					<InvestmentCard
						name="ERP RecompraCRM"
						tag="Mensalidade"
						tagline="PDV, fiscal, estoque, financeiro e loja digital — com o CRM incluso."
						price={`R$ ${formatBRL(ERP_MONTHLY)}`}
						period="/mês"
						features={[
							"PDV com balança e leitor de código de barras",
							"NFC-e e NF-e, compras e estoque com validade",
							"Financeiro e loja digital",
							"Cashback, WhatsApp automático, RFM e BI",
							"Exceto Chat Hub e Agente de IA",
						]}
					/>
					<InvestmentCard
						name="Gestor de Crescimento"
						tag="Add-on · com desconto"
						tagline="A gente opera as campanhas, com foco em impacto comercial."
						listPrice={`R$ ${formatBRL(GROWTH_LIST_MONTHLY)}`}
						price={`+ R$ ${formatBRL(GROWTH_MONTHLY)}`}
						period="/mês"
						highlight
						features={[
							"Gestor dedicado ao BREU",
							"Diagnóstico inicial e metas comerciais",
							"Calendário, criação e disparo das campanhas",
							"Relatório mensal de resultado",
						]}
					/>
				</div>

				{/* Resumo */}
				<div className="overflow-hidden rounded-2xl border border-neutral-200">
					<SummaryRow label="Implantação · pagamento único" value={`R$ ${formatBRL(IMPLEMENTATION_FEE)}`} />
					<SummaryRow label="ERP RecompraCRM · mensalidade" value={`R$ ${formatBRL(ERP_MONTHLY)}`} />
					<SummaryRow
						label={`Gestor de Crescimento · R$ ${formatBRL(GROWTH_DISCOUNT)} de desconto`}
						listValue={`R$ ${formatBRL(GROWTH_LIST_MONTHLY)}`}
						value={`R$ ${formatBRL(GROWTH_MONTHLY)}`}
					/>
					<div className="flex items-center justify-between px-5 py-4 text-white" style={heroGradient}>
						<div className="flex flex-col">
							<span className="text-[0.62rem] font-black uppercase tracking-[0.2em] text-white/70">Mensalidade recomendada</span>
							<span className="text-[0.82rem] font-semibold text-white/85">ERP + Gestor de Crescimento</span>
						</div>
						<div className="flex items-end gap-1">
							<span className="text-[2rem] font-black leading-none tracking-tight tabular-nums">R$ {formatBRL(FULL_MONTHLY)}</span>
							<span className="mb-0.5 text-[0.75rem] font-semibold text-white/70">/mês</span>
						</div>
					</div>
				</div>

				<div className="grid grid-cols-2 gap-4">
					<div
						className="flex items-start gap-3 rounded-xl px-5 py-3.5"
						style={{ backgroundColor: BRAND.cream, border: `1px solid ${hexToRgba(BRAND.copper, 0.5)}` }}
					>
						<BadgeCheck className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: BRAND.copperText }} />
						<p className="text-[0.78rem] leading-snug text-neutral-700">
							<strong>R$ {formatBRL(GROWTH_DISCOUNT)} de desconto por mês</strong> no Gestor de Crescimento: de R$ {formatBRL(GROWTH_LIST_MONTHLY)} por R${" "}
							{formatBRL(GROWTH_MONTHLY)}, contratado junto com o ERP.
						</p>
					</div>
					<div
						className="flex items-start gap-3 rounded-xl px-5 py-3.5"
						style={{ backgroundColor: hexToRgba(BRAND.wood, 0.06), border: `1px dashed ${hexToRgba(BRAND.wood, 0.35)}` }}
					>
						<ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: BRAND.wood }} />
						<p className="text-[0.78rem] leading-snug text-neutral-700">
							<strong>Sem surpresa.</strong> A implantação é cobrada uma única vez. A mensalidade cobre sistema, hospedagem, atualizações e suporte humano.
						</p>
					</div>
				</div>

				{/* Fechamento */}
				<div className="relative mt-auto overflow-hidden rounded-3xl px-8 py-7 text-white" style={heroGradient}>
					<div
						className="absolute inset-0 opacity-[0.12]"
						style={{ backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)", backgroundSize: "16px 16px" }}
					/>
					<div className="absolute right-0 top-0 h-full w-2" style={{ backgroundColor: BRAND.copper }} />
					<div className="relative z-10 flex flex-col gap-4">
						<div className="flex items-center gap-2">
							<Star className="h-5 w-5" fill="currentColor" />
							<h2 className="text-xl font-black uppercase leading-tight tracking-tight">Vamos colocar o BREU no sistema certo</h2>
						</div>
						<p className="max-w-xl text-[0.82rem] leading-relaxed opacity-90">
							Mais de 40 anos de frescor e confiança merecem uma operação simples e um relacionamento que se mede em vendas. Chame a gente no WhatsApp e
							combinamos o início da implantação.
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
			<SheetFooter index={`08 / ${TOTAL_SHEETS}`} label="Investimento" />
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
	features,
	highlight,
}: {
	name: string;
	tag: string;
	tagline: string;
	listPrice?: string;
	price: string;
	period: string;
	features: string[];
	highlight?: boolean;
}) {
	return (
		<div
			className="relative flex flex-col gap-4 rounded-2xl bg-white p-6"
			style={{
				border: highlight ? `2px solid ${BRAND.copper}` : "1px solid #e5e5e5",
				boxShadow: highlight ? `0 10px 30px -12px ${hexToRgba(BRAND.copperText, 0.45)}` : undefined,
			}}
		>
			<span
				className="absolute -top-3 right-5 inline-flex items-center gap-1 rounded-full px-3 py-1 text-[0.6rem] font-black uppercase tracking-wider"
				style={highlight ? { backgroundColor: BRAND.copper, color: BRAND.ink } : { backgroundColor: BRAND.wood, color: "#fff" }}
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
					<span className="select-none text-[0.78rem] font-semibold text-transparent" aria-hidden>
						·
					</span>
				)}
				<div className="flex items-end gap-1">
					<span className="text-3xl font-black tracking-tight tabular-nums" style={{ color: BRAND.wood }}>
						{price}
					</span>
					<span className="mb-1 text-[0.75rem] font-semibold text-neutral-400">{period}</span>
				</div>
			</div>

			<div className="h-px w-full bg-neutral-100" />

			<ul className="flex flex-col gap-2">
				{features.map((feature) => {
					const excluded = feature.startsWith("Exceto");
					return (
						<li key={feature} className="flex items-start gap-2">
							{excluded ? (
								<Minus className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-neutral-400" />
							) : (
								<Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" style={{ color: BRAND.wheatText }} />
							)}
							<span className={`text-[0.74rem] leading-snug ${excluded ? "text-neutral-500" : "text-neutral-700"}`}>{feature}</span>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
