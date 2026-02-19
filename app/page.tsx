"use client";
import AnalyticsSection from "@/app/_components/AnalyticsSection";
import BenefitsSection from "@/app/_components/BenefitsSection";
import CampaignSection from "@/app/_components/CampaignSection";
import CashbackSection from "@/app/_components/CashbackSection";
import InsightsSection from "@/app/_components/InsightsSection";
import RFMSection from "@/app/_components/RFMSection";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AppSubscriptionPlans } from "@/config";
import { formatToMoney } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import LogoCompleteHorizontalColorful from "@/utils/svgs/logos/RECOMPRA - COMPLETE - HORIZONTAL- COLORFUL.svg";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import {
	ArrowRight,
	BadgeDollarSign,
	BarChart3,
	Bot,
	CheckCircle2,
	ChevronDown,
	CirclePlus,
	Clock,
	Crown,
	FileSpreadsheet,
	Handshake,
	Lock,
	MessageCircle,
	Package,
	PieChart,
	Shield,
	UserX,
	Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";

// Mock data for the analytics section
const MOCK_SELLERS = [
	{ rank: 1, name: "Ana Silva", revenue: "R$ 45.200", sales: 120, ticket: "R$ 376", avatar: null, growth: "+12%" },
	{ rank: 2, name: "Roberto Santos", revenue: "R$ 38.900", sales: 98, ticket: "R$ 396", avatar: null, growth: "+8%" },
	{ rank: 3, name: "Carla Dias", revenue: "R$ 32.100", sales: 85, ticket: "R$ 377", avatar: null, growth: "+15%" },
	{ rank: 4, name: "Marcos Lima", revenue: "R$ 28.500", sales: 72, ticket: "R$ 395", avatar: null, growth: "+5%" },
	{ rank: 5, name: "Juliana Costa", revenue: "R$ 25.400", sales: 65, ticket: "R$ 390", avatar: null, growth: "+3%" },
];

const MOCK_PARTNERS = [
	{ rank: 1, name: "Influenciador A", revenue: "R$ 12.500", sales: 45, ticket: "R$ 277", avatar: null, growth: "+22%" },
	{ rank: 2, name: "Blog Parceiro", revenue: "R$ 8.900", sales: 32, ticket: "R$ 278", avatar: null, growth: "+10%" },
	{ rank: 3, name: "Afiliado Top", revenue: "R$ 5.100", sales: 18, ticket: "R$ 283", avatar: null, growth: "+5%" },
	{ rank: 4, name: "Canal Tech", revenue: "R$ 4.200", sales: 15, ticket: "R$ 280", avatar: null, growth: "+4%" },
	{ rank: 5, name: "Review Site", revenue: "R$ 3.800", sales: 12, ticket: "R$ 316", avatar: null, growth: "+2%" },
];

const MOCK_PRODUCTS = [
	{ rank: 1, name: "Kit Skin Care Premium", revenue: "R$ 15.200", sales: 150, ticket: "R$ 101", avatar: null, growth: "+18%" },
	{ rank: 2, name: "Serum Vitamina C", revenue: "R$ 12.800", sales: 128, ticket: "R$ 100", avatar: null, growth: "+12%" },
	{ rank: 3, name: "Hidratante Facial", revenue: "R$ 9.500", sales: 95, ticket: "R$ 100", avatar: null, growth: "+7%" },
	{ rank: 4, name: "Protetor Solar FPS 70", revenue: "R$ 8.200", sales: 82, ticket: "R$ 100", avatar: null, growth: "+9%" },
	{ rank: 5, name: "Tônico Renovador", revenue: "R$ 6.100", sales: 61, ticket: "R$ 100", avatar: null, growth: "+5%" },
];

// Problem cards data
const PROBLEM_CARDS = [
	{
		icon: UserX,
		title: "Cliente comprou uma vez e nunca mais voltou",
		description: "Você sabe que ele existe, mas não tem como trazê-lo de volta de forma automática.",
	},
	{
		icon: Clock,
		title: "Horas perdidas mandando mensagem por mensagem",
		description: "Copiar, colar, enviar. Repetir 50 vezes. E ainda assim esquece de alguém.",
	},
	{
		icon: FileSpreadsheet,
		title: "Dados espalhados em 5 planilhas diferentes",
		description: "Vendas aqui, clientes ali, cashback em outro lugar. Impossível ter visão do todo.",
	},
];

// FAQ data
const FAQ_ITEMS = [
	{
		question: "Preciso de integração com meu sistema?",
		answer:
			"Não. O RecompraCRM funciona de forma independente. Você pode começar hoje mesmo usando nosso Ponto de Interação (tablet no balcão). Se quiser, integramos com seu ERP depois — mas não é obrigatório.",
	},
	{
		question: "Quanto tempo leva pra ver resultado?",
		answer:
			"Depende do seu volume. Lojas que cadastram vendas diariamente costumam ver os primeiros clientes reativados em 2-3 semanas. O cashback funciona como gatilho: o cliente volta pra usar o saldo.",
	},
	{
		question: "E se eu já tiver um programa de cashback?",
		answer:
			"Você pode migrar ou rodar os dois em paralelo. O diferencial do RecompraCRM é a automação: identificamos inativos e enviamos cashback pelo WhatsApp automaticamente. Não é só um sistema de pontos.",
	},
	{
		question: "Funciona pra qual tipo de loja?",
		answer:
			"Varejo físico com vendas recorrentes: cosméticos, pet shops, materiais de construção, farmácias, óticas. Se você tem clientes que deveriam voltar mas não voltam, o RecompraCRM ajuda.",
	},
	{
		question: "E se eu não gostar?",
		answer: "15 dias grátis para testar. Sem cartão de crédito. Se não fizer sentido pro seu negócio, você cancela sem burocracia.",
	},
];

// RFM Segment tooltips
const RFM_TOOLTIPS = {
	campeoes: "Compram frequentemente, gastam muito e compraram recentemente. Seus melhores clientes.",
	leais: "Compram com regularidade e têm bom ticket médio. Merecem atenção especial.",
	em_risco: "Já foram bons clientes, mas estão ficando inativos. Hora de reativar.",
	novos: "Compraram recentemente pela primeira vez. Momento de criar relacionamento.",
};

export default function LandingPage() {
	const [rankingTab, setRankingTab] = useState<"sellers" | "partners" | "products">("sellers");
	const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">("monthly");
	const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
	console.log("LandingPage");
	return (
		<div className="min-h-screen bg-black text-white antialiased">
			{/* Navbar */}
			<header className="h-[10vh] sticky top-0 z-50 bg-black/80 backdrop-blur-md border-b border-white/5 transition-all duration-300">
				<div className="flex items-center justify-between container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-full">
					{/* Logo */}
					<Link href="/" className="flex items-center gap-2 group">
						<div className="relative w-36 h-12">
							<Image src={LogoCompleteHorizontalColorful} alt="RecompraCRM" fill className="object-contain" priority />
						</div>
					</Link>

					{/* Menu Center */}
					<nav className="hidden lg:flex items-center gap-8">
						<Link href="#cashback" className="text-sm font-medium text-white/70 hover:text-white transition-colors">
							Cashback
						</Link>
						<Link href="#campanhas" className="text-sm font-medium text-white/70 hover:text-white transition-colors">
							Automação
						</Link>
						<Link href="#analytics" className="text-sm font-medium text-white/70 hover:text-white transition-colors">
							Analytics
						</Link>
						<Link href="#pricing" className="text-sm font-medium text-white/70 hover:text-white transition-colors">
							Planos
						</Link>
					</nav>

					{/* Right Actions */}
					<div className="flex items-center gap-4">
						<Link href="/auth/signin" className="text-sm font-medium text-white/70 hover:text-white transition-colors hidden sm:block">
							Entrar
						</Link>
						<Link href="/auth/signup" target="_blank" rel="noopener noreferrer">
							<Button
								size="sm"
								className="bg-[#24549C] hover:bg-[#1e4682] text-white rounded-full font-medium px-6 h-10 shadow-2xl shadow-blue-600/30 hover:shadow-blue-600/40 transition-all hover:-translate-y-0.5"
							>
								Cadastrar
							</Button>
						</Link>
					</div>
				</div>
			</header>

			{/* Hero Section */}
			<HeroSection />

			{/* Problem Section (NEW) */}
			<section className="py-20 bg-zinc-950 border-y border-white/5">
				<div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
					<div className="text-center mb-16">
						<h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Reconhece esse cenário?</h2>
						<p className="text-lg text-white/60">Problemas comuns no varejo que custam dinheiro todo mês.</p>
					</div>

					<div className="grid md:grid-cols-3 gap-6">
						{PROBLEM_CARDS.map((problem, idx) => (
							<div key={idx.toString()} className="bg-zinc-900/50 border border-white/5 rounded-xl p-6 hover:border-red-500/30 transition-colors group">
								<div className="w-12 h-12 rounded-lg bg-red-500/10 flex items-center justify-center mb-4 group-hover:bg-red-500/20 transition-colors">
									<problem.icon className="w-6 h-6 text-red-400" />
								</div>
								<h3 className="font-semibold text-white mb-2 text-lg">{problem.title}</h3>
								<p className="text-sm text-white/60 leading-relaxed">{problem.description}</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* Feature: Cashback / POI */}
			<CashbackSection />

			{/* Feature: Campanhas */}
			<CampaignSection />

			{/* Feature: Whatsapp Hub */}
			<section id="whatsapp-hub" className="py-20 bg-black relative overflow-hidden">
				<div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
					<div className="grid lg:grid-cols-2 gap-16 items-center">
						<div className="order-2 lg:order-1">
							<div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-sm font-medium mb-6 backdrop-blur-sm">
								<Bot className="w-4 h-4" />
								Whatsapp Hub (Beta)
							</div>
							<h2 className="text-3xl md:text-5xl font-bold mb-6 text-white">
								IA responde as dúvidas. <br />
								<span className="text-white/50">Você fecha a venda.</span>
							</h2>
							<div className="mb-6">
								<span className="inline-flex items-center rounded-md bg-purple-400/10 px-2 py-1 text-xs font-medium text-purple-400 ring-1 ring-inset ring-purple-400/20">
									Early Access
								</span>
							</div>
							<p className="text-lg text-white/60 mb-8 leading-relaxed">
								O cliente pergunta "qual a voltagem?" às 23h. A IA responde. Quando ele diz "quero comprar", você recebe um alerta com todo o histórico. Só
								entra quando vale a pena.
							</p>
							<div className="space-y-4 mb-8">
								<div className="flex items-start gap-4">
									<div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0 border border-green-500/20">
										<MessageCircle className="w-5 h-5 text-green-500" />
									</div>
									<div>
										<h4 className="text-white font-semibold mb-1">Atendimento 24/7</h4>
										<p className="text-sm text-white/60">A IA responde perguntas básicas (voltagem, medidas, disponibilidade) mesmo de madrugada.</p>
									</div>
								</div>
								<div className="flex items-start gap-4">
									<div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0 border border-green-500/20">
										<Bot className="w-5 h-5 text-green-500" />
									</div>
									<div>
										<h4 className="text-white font-semibold mb-1">Transferência Inteligente</h4>
										<p className="text-sm text-white/60">Detectou interesse em fechar? A IA alerta seu vendedor e transfere com todo o contexto.</p>
									</div>
								</div>
							</div>
						</div>

						<div className="order-1 lg:order-2 relative">
							<AnimatedChatWireframe />
							<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-green-500/10 blur-3xl -z-10 rounded-full" />
						</div>
					</div>
				</div>
			</section>

			{/* Analytics Deep Dive Section */}
			<AnalyticsSection />

			{/* Feature: BI - RFM */}
			<RFMSection />

			{/* Feature: AI-Hints */}
			<InsightsSection />

			{/* Feature: BI - Performance */}
			<section id="analytics" className="py-20 bg-black overflow-hidden">
				<div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
					<div className="grid lg:grid-cols-2 gap-16 items-center">
						<div>
							<div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-medium mb-6 backdrop-blur-sm">
								<BarChart3 className="w-4 h-4" />
								Performance Comercial
							</div>
							<h2 className="text-3xl md:text-5xl font-bold mb-6 text-white">
								Quem vende mais? <br />
								<span className="text-white/50">A resposta na tela.</span>
							</h2>
							<p className="text-lg text-white/60 mb-8 leading-relaxed">
								Ranking atualizado em tempo real. Mostre na TV da loja e veja a competição saudável começar. Também funciona para parceiros e produtos.
							</p>
							<div className="flex flex-col gap-4">
								<div className="flex items-center gap-4 p-4 rounded-xl hover:bg-white/5 transition-colors border border-transparent hover:border-white/5 cursor-default">
									<div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
										<Users className="w-6 h-6 text-blue-400" />
									</div>
									<div>
										<h4 className="font-semibold text-white">Gamificação Natural</h4>
										<p className="text-sm text-white/50">O ranking cria competição saudável. Sem você precisar cobrar.</p>
									</div>
								</div>
								<div className="flex items-center gap-4 p-4 rounded-xl hover:bg-white/5 transition-colors border border-transparent hover:border-white/5 cursor-default">
									<div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
										<PieChart className="w-6 h-6 text-purple-400" />
									</div>
									<div>
										<h4 className="font-semibold text-white">Curva ABC de Produtos</h4>
										<p className="text-sm text-white/50">Saiba exatamente quais itens não podem faltar no estoque.</p>
									</div>
								</div>
							</div>
						</div>

						<div className="relative">
							<AnimatedRankingWireframe />
							<div className="absolute -inset-4 bg-[#24549C]/20 blur-3xl -z-10 rounded-full opacity-30" />
						</div>
					</div>
				</div>
			</section>

			{/* Why RecompraCRM Section */}
			<BenefitsSection />

			{/* Feature: Pricing */}
			<section id="pricing" className="py-24 bg-black relative overflow-hidden border-t border-white/5">
				<div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
					<div className="text-center mb-16 max-w-3xl mx-auto">
						<span className="text-[#24549C] font-semibold text-sm tracking-wider uppercase mb-2 block">Planos e Preços</span>
						<h2 className="text-3xl md:text-5xl font-bold mb-6 text-white">
							Simples e <br />
							<span className="text-white/50">transparente.</span>
						</h2>
						<p className="text-lg text-white/60">Sem taxa de setup. Sem surpresas. Cancele quando quiser.</p>
					</div>

					{/* Billing Toggle */}
					<div className="flex justify-center mb-12">
						<div className="relative flex items-center bg-zinc-900 border border-white/10 p-1.5 rounded-full">
							<button
								type="button"
								onClick={() => setBillingInterval("monthly")}
								className={cn(
									"relative z-10 box-border w-32 rounded-full py-2.5 text-center text-sm font-bold transition-colors duration-300",
									billingInterval === "monthly" ? "text-white" : "text-white/40 hover:text-white/60",
								)}
							>
								MENSAL
							</button>
							<button
								type="button"
								onClick={() => setBillingInterval("yearly")}
								className={cn(
									"relative z-10 box-border w-32 rounded-full py-2.5 text-center text-sm font-bold transition-colors duration-300",
									billingInterval === "yearly" ? "text-white" : "text-white/40 hover:text-white/60",
								)}
							>
								ANUAL
							</button>
							<div
								className={cn(
									"absolute top-1.5 bottom-1.5 w-32 rounded-full bg-[#24549C] shadow-lg shadow-blue-500/20 transition-all duration-300 ease-in-out",
									billingInterval === "monthly" ? "left-1.5" : "left-[calc(100%-8.35rem)]",
								)}
							/>
						</div>
					</div>

					{/* Plans Grid */}
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 items-start max-w-7xl mx-auto">
						{(Object.keys(AppSubscriptionPlans) as Array<keyof typeof AppSubscriptionPlans>).map((planKey) => {
							const plan = AppSubscriptionPlans[planKey];
							const pricing = plan.pricing[billingInterval];
							const isPopular = planKey === "CRESCIMENTO";

							// Calculate discount
							const monthlyPrice = plan.pricing.monthly.price;
							const yearlyPrice = plan.pricing.yearly.price;
							const discountPercentage = Math.round(((monthlyPrice * 12 - yearlyPrice) / (monthlyPrice * 12)) * 100);

							return (
								<div
									key={planKey}
									className={cn(
										"relative flex flex-col rounded-3xl p-8 transition-all duration-300 border bg-zinc-900/40 backdrop-blur-md",
										isPopular ? "border-[#24549C] shadow-2xl shadow-blue-500/10 scale-105 z-10" : "border-white/5 hover:border-white/10 hover:bg-zinc-900/60",
									)}
								>
									{isPopular && (
										<div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#24549C] text-white px-4 py-1 rounded-full text-xs font-bold tracking-wide uppercase shadow-lg">
											Mais Popular
										</div>
									)}

									{/* Discount Badge for Yearly */}
									{billingInterval === "yearly" && (
										<div className="absolute top-4 right-4 bg-green-500/20 border border-green-500/30 text-green-400 px-2 py-1 rounded-md text-xs font-bold tracking-wide">
											-{discountPercentage}% OFF
										</div>
									)}

									{/* Header */}
									<div className="mb-6">
										<h3 className="font-bold text-2xl text-white mb-2">{plan.name}</h3>
										<p className="text-white/50 text-sm leading-relaxed min-h-[40px]">{plan.description}</p>
									</div>

									{/* Pricing */}
									<div className="mb-8 pb-8 border-b border-white/5">
										<div className="flex items-baseline gap-1">
											<span className="text-sm text-white/40 font-medium">R$</span>
											<span className="font-bold text-4xl text-white tracking-tight">{formatToMoney(pricing.price).split(",")[0].replace("R$", "")}</span>
											<span className="text-2xl font-bold text-white">,{formatToMoney(pricing.price).split(",")[1]}</span>
											<span className="text-white/40 font-medium ml-2 text-sm">{billingInterval === "monthly" ? "/mês" : "/ano"}</span>
										</div>
										{billingInterval === "yearly" && (
											<div className="mt-2 text-xs text-green-400 font-medium">Economize {formatToMoney(monthlyPrice * 12 - yearlyPrice)} por ano</div>
										)}
									</div>

									{/* Features */}
									<ul className="space-y-4 mb-8 flex-1">
										{plan.pricingTableFeatures.map((feature, idx) => (
											<li key={idx.toString()} className="flex items-start gap-3">
												<div className={cn("mt-0.5 rounded-full p-0.5", feature.checked ? "bg-green-500/20 text-green-500" : "bg-white/5 text-white/20")}>
													<CheckCircle2 className="h-3.5 w-3.5" />
												</div>
												<span className={cn("text-sm leading-snug", feature.checked ? "text-white/80" : "text-white/40 line-through")}>{feature.label}</span>
											</li>
										))}
									</ul>

									{/* CTA */}
									<Link href="/auth/signup" className="mt-auto">
										<Button
											className={cn(
												"w-full rounded-xl py-6 text-base font-bold transition-all duration-300",
												isPopular
													? "bg-[#24549C] hover:bg-[#1e4682] text-white shadow-2xl shadow-blue-600/30"
													: "bg-white/5 hover:bg-white/10 text-white border border-white/10",
											)}
										>
											Testar 15 dias grátis
										</Button>
									</Link>
								</div>
							);
						})}
					</div>

					{/* Guarantee Text */}
					<div className="mt-12 text-center">
						<p className="text-white/60 text-base font-medium">15 dias grátis para testar. Sem cartão de crédito.</p>
					</div>

					<div className="mt-8 text-center">
						<p className="text-white/40 text-sm">
							Precisa de um plano customizado para grandes redes?{" "}
							<a
								href="https://wa.me/553499480791"
								target="_blank"
								rel="noopener noreferrer"
								className="text-[#24549C] hover:text-blue-400 font-medium border-b border-[#24549C]/30 hover:border-blue-400 transition-colors"
							>
								Fale com nossos especialistas
							</a>
						</p>
					</div>
				</div>
			</section>

			{/* FAQ Section (NEW) */}
			<section className="py-20 bg-zinc-950 border-y border-white/5">
				<div className="container mx-auto max-w-3xl px-4">
					<div className="text-center mb-16">
						<h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Perguntas Frequentes</h2>
						<p className="text-lg text-white/60">Tire suas dúvidas antes de começar.</p>
					</div>

					<div className="space-y-4">
						{FAQ_ITEMS.map((faq, idx) => (
							<div key={idx.toString()} className="bg-zinc-900/50 border border-white/5 rounded-xl overflow-hidden">
								<button
									type="button"
									onClick={() => setOpenFaqIndex(openFaqIndex === idx ? null : idx)}
									className="w-full flex items-center justify-between p-6 text-left hover:bg-white/5 transition-colors"
								>
									<span className="font-semibold text-white pr-4">{faq.question}</span>
									<ChevronDown className={cn("w-5 h-5 text-white/60 transition-transform flex-shrink-0", openFaqIndex === idx && "rotate-180")} />
								</button>
								{openFaqIndex === idx && (
									<div className="px-6 pb-6">
										<p className="text-white/60 leading-relaxed">{faq.answer}</p>
									</div>
								)}
							</div>
						))}
					</div>
				</div>
			</section>

			{/* Final CTA Section (NEW) */}
			<section className="py-24 bg-gradient-to-b from-[#24549C]/20 to-black">
				<div className="container mx-auto max-w-4xl px-4 text-center">
					<h2 className="text-3xl md:text-5xl font-bold text-white mb-6">Pronto pra trazer seus clientes de volta?</h2>
					<p className="text-xl text-white/60 mb-10">15 dias grátis. Sem cartão de crédito. Setup em menos de 1 hora.</p>
					<div className="flex flex-col sm:flex-row items-center justify-center gap-4">
						<Link href="/auth/signup">
							<Button className="bg-[#24549C] hover:bg-[#1e4682] text-white rounded-full px-10 h-14 text-lg font-bold shadow-2xl shadow-blue-600/30 hover:shadow-blue-600/50 hover:-translate-y-1 transition-all duration-300">
								Começar teste grátis <ArrowRight className="w-5 h-5 ml-2" />
							</Button>
						</Link>
						<a href="https://wa.me/553499480791?text=Gostaria%20de%20ver%20como%20o%20RecompraCRM%20funciona!" target="_blank" rel="noopener noreferrer">
							<Button
								variant="outline"
								className="border-white/10 bg-white/5 hover:bg-white/10 text-white rounded-full px-10 h-14 text-lg font-semibold hover:border-white/20 transition-all duration-300"
							>
								Falar com especialista
							</Button>
						</a>
					</div>
				</div>
			</section>

			{/* Footer */}
			<footer className="bg-black border-t border-white/10">
				<div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
					<div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
						<div>
							<h3 className="font-bold text-lg mb-3 text-white">RecompraCRM</h3>
							<p className="text-sm text-white/60">Plataforma de recompra para varejo físico.</p>
						</div>

						<div>
							<h4 className="font-semibold mb-3 text-white">Produtos</h4>
							<ul className="space-y-2 text-sm text-white/60">
								<li>Cashback e Pontos</li>
								<li>Campanhas Automáticas</li>
								<li>WhatsApp Hub</li>
								<li>Business Intelligence</li>
							</ul>
						</div>

						<div>
							<h4 className="font-semibold mb-3 text-white">Sobre</h4>
							<ul className="space-y-2 text-sm text-white/60">
								<li>
									<Link href="/legal" className="hover:text-white transition-colors">
										Termos e Políticas
									</Link>
								</li>
								<li>Privacidade</li>
								<li>Contato</li>
							</ul>
						</div>
					</div>

					{/* Trust Indicators */}
					<div className="flex flex-wrap items-center justify-center gap-6 py-6 border-t border-white/5 mb-6">
						<div className="flex items-center gap-2 text-sm text-white/50">
							<Lock className="w-4 h-4" />
							<span>Dados protegidos (LGPD)</span>
						</div>
						<div className="flex items-center gap-2 text-sm text-white/50">
							<Shield className="w-4 h-4" />
							<span>Pagamento seguro (Stripe)</span>
						</div>
						<div className="flex items-center gap-2 text-sm text-white/50">
							<MessageCircle className="w-4 h-4" />
							<span>Suporte em horário comercial</span>
						</div>
					</div>

					<div className="pt-6 border-t border-white/10 text-center text-sm text-white/60">
						© {new Date().getFullYear()} RecompraCRM. Todos os direitos reservados.
					</div>
				</div>
			</footer>
		</div>
	);
}

const RotatingText = () => {
	const words = ["sumiu.", "esfriou.", "parou.", "esqueceu."];
	const containerRef = useRef<HTMLSpanElement>(null);
	// We use a fixed width container to prevent layout shifts during rotation
	// Adjust min-w-[...] based on your longest word if needed

	useGSAP(
		() => {
			// Enable lag smoothing for better performance
			gsap.ticker.lagSmoothing(1000, 16);

			const tl = gsap.timeline({ repeat: -1 });
			const wordElements = containerRef.current?.children;

			if (wordElements) {
				// Set initial state for all except first - using scale instead of blur for GPU acceleration
				gsap.set(wordElements, { y: 20, opacity: 0, scale: 0.95, position: "absolute", force3D: true });
				gsap.set(wordElements[0], { y: 0, opacity: 1, scale: 1, position: "relative", force3D: true });

				// Create the loop
				words.forEach((_, index) => {
					const current = wordElements[index];
					const next = wordElements[(index + 1) % words.length];

					tl
						.to(current, {
							y: -20,
							opacity: 0,
							scale: 0.95,
							duration: 0.5,
							ease: "power2.in",
							force3D: true,
							delay: 1.5, // How long the word stays visible
							onComplete: () => {
								// Reset position for next cycle, keep it absolute to not break flow
								gsap.set(current, { position: "absolute" });
							},
						})
						.to(
							next,
							{
								y: 0,
								opacity: 1,
								scale: 1,
								duration: 0.6,
								ease: "power2.out",
								force3D: true,
								onStart: () => {
									// Make relative so it takes up space in the DOM flow
									gsap.set(next, { position: "relative" });
								},
							},
							"<0.1",
						); // slight overlap for smooth transition
				});
			}
		},
		{ scope: containerRef },
	);

	return (
		<span
			ref={containerRef}
			className="relative inline-flex flex-col items-center justify-center h-[1.2em] overflow-hidden align-bottom min-w-[180px] sm:min-w-[220px] text-left"
			style={{ willChange: "transform" }}
		>
			{words.map((word, i) => (
				<span
					key={i.toString()}
					className={`block text-transparent bg-clip-text bg-gradient-to-r from-[#FF4D00] via-[#FF8700] to-[#E7000B] ${i === 0 ? "relative" : "absolute top-0 left-0"}`}
					style={{ willChange: "transform, opacity" }}
				>
					{word}
				</span>
			))}
		</span>
	);
};
function HeroSection() {
	const container = useRef(null);

	useGSAP(
		() => {
			// Master timeline for the entrance animation with GPU acceleration
			const tl = gsap.timeline({ defaults: { ease: "power3.out", force3D: true } });

			tl
				.from(".hero-badge", {
					y: -20,
					opacity: 0,
					duration: 0.8,
				})
				.from(
					".hero-headline-static",
					{
						y: 30,
						opacity: 0,
						duration: 1,
						stagger: 0.1, // Stagger lines if broken
					},
					"-=0.4",
				)
				.from(
					".hero-subtext",
					{
						y: 20,
						opacity: 0,
						duration: 0.8,
					},
					"-=0.6",
				)
				.from(
					".hero-cta",
					{
						y: 20,
						opacity: 0,
						duration: 0.8,
						stagger: 0.1,
					},
					"-=0.6",
				);

			// Simplified pulse using opacity only (no expensive textShadow)
			gsap.to(".subtext-highlight", {
				opacity: 0.85,
				repeat: -1,
				yoyo: true,
				duration: 2,
				delay: 2,
				ease: "sine.inOut",
			});
		},
		{ scope: container },
	);

	return (
		<section ref={container} className="min-h-[90vh] relative flex items-center justify-center py-6 md:py-8 lg:py-12 xl:py-16 overflow-hidden">
			{/* Background Elements - optimized with reduced blur and GPU layer hints */}
			<div
				className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full pointer-events-none"
				style={{ transform: "translateX(-50%) translateZ(0)" }}
			>
				<div
					className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-[#24549C]/20 rounded-full blur-[80px] opacity-40"
					style={{ transform: "translateX(-50%) translateZ(0)" }}
				/>
				<div
					className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-[60px] opacity-30"
					style={{ transform: "translateZ(0)" }}
				/>
			</div>

			<div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
				<div className="text-center max-w-5xl mx-auto">
					{/* Badge */}
					<div className="hero-badge inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 mb-3 md:mb-4 lg:mb-6 backdrop-blur-md hover:bg-white/10 transition-colors cursor-default group opacity-100">
						<span className="relative flex h-2 w-2">
							<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FFD600] opacity-75" />
							<span className="relative inline-flex rounded-full h-2 w-2 bg-[#FFD600]" />
						</span>
						<span className="text-xs font-medium text-white/90 tracking-wide">CASHBACK + WHATSAPP + BI EM UM SÓ LUGAR</span>
					</div>

					{/* Headline */}
					<h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl 2xl:text-7xl font-bold tracking-tight text-white mb-2 md:mb-3 lg:mb-4 leading-[1.2] md:leading-[1.15]">
						<span className="hero-headline-static block">Traga de volta o cliente que</span>
						<div className="hero-headline-static mt-1 md:mt-2">
							<RotatingText />
						</div>
					</h1>

					{/* Subheadline */}
					<p className="hero-subtext text-xs sm:text-sm md:text-base lg:text-lg xl:text-xl text-white/60 mb-4 md:mb-5 lg:mb-8 max-w-3xl mx-auto leading-relaxed font-light">
						Identifique quem parou de comprar, envie <span className="subtext-highlight text-white font-medium">cashback automático</span> pelo WhatsApp e
						acompanhe tudo em um dashboard. <span className="text-white/80">Sem planilhas, sem trabalho manual.</span>
					</p>

					{/* CTA Buttons */}
					<div className="flex flex-col sm:flex-row items-center justify-center gap-2 md:gap-3">
						<a href="/auth/signup" target="_blank" rel="noopener noreferrer" className="hero-cta w-full sm:w-auto">
							<Button className="w-full sm:w-auto bg-[#24549C] hover:bg-[#1e4682] text-white rounded-full px-4 md:px-5 lg:px-6 h-9 md:h-10 lg:h-11 xl:h-12 text-xs md:text-sm lg:text-base font-bold shadow-2xl shadow-blue-600/30 hover:shadow-blue-600/50 hover:-translate-y-1 transition-all duration-300">
								Teste Gratuitamente <ArrowRight className="w-3.5 h-3.5 md:w-4 md:h-4 ml-1.5 inline" />
							</Button>
						</a>
						<Link href="/auth/signin" className="hero-cta w-full sm:w-auto">
							<Button
								variant="outline"
								className="w-full sm:w-auto border-white/10 bg-white/5 hover:bg-white/10 text-white rounded-full px-4 md:px-5 lg:px-6 h-9 md:h-10 lg:h-11 xl:h-12 text-xs md:text-sm lg:text-base font-semibold hover:border-white/20 hover:text-white transition-all duration-300"
							>
								Acessar plataforma
							</Button>
						</Link>
					</div>
					<p className="mt-2 text-white/60 text-base font-medium">Teste por 15 dias grátis. Sem cartão de crédito.</p>
				</div>
			</div>
		</section>
	);
}

// ==========================================
// ANIMATED WIREFRAME COMPONENTS
// ==========================================

// Animated WhatsApp Chat Wireframe
function AnimatedChatWireframe() {
	const containerRef = useRef<HTMLDivElement>(null);
	const [visibleMessages, setVisibleMessages] = useState(0);
	const [showTyping, setShowTyping] = useState(false);

	const messages = [
		{ id: 1, type: "user", text: "Qual a voltagem do ventilador?" },
		{ id: 2, type: "bot", text: "O Ventilador Turbo está disponível em 110V e 220V! Qual você precisa? 🌀" },
		{ id: 3, type: "user", text: "220V. Quero comprar." },
		{ id: 4, type: "bot", text: "Perfeito! Vou chamar um de nossos atendentes para finalizar sua compra. 🎯" },
		{ id: 5, type: "system", text: "⚡ Transferido para: Carlos (Vendas)" },
	];

	useGSAP(
		() => {
			gsap.ticker.lagSmoothing(1000, 16);

			const runAnimation = () => {
				setVisibleMessages(0);
				setShowTyping(false);

				const tl = gsap.timeline({
					onComplete: () => {
						setTimeout(() => runAnimation(), 4000);
					},
				});

				messages.forEach((msg, index) => {
					if (msg.type === "bot") {
						tl.call(() => setShowTyping(true));
						tl.to({}, { duration: 1 });
						tl.call(() => setShowTyping(false));
					}
					tl.call(() => setVisibleMessages(index + 1));
					tl.to({}, { duration: 0.8 });
				});

				tl.to({}, { duration: 2 });
			};

			runAnimation();
		},
		{ scope: containerRef },
	);

	return (
		<div ref={containerRef} className="relative z-10 w-full max-w-md mx-auto">
			<div className="bg-zinc-900 border border-white/10 rounded-3xl p-6 shadow-2xl">
				<div className="flex items-center gap-3 mb-6 border-b border-white/5 pb-4">
					<div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
						<Bot className="w-5 h-5 text-green-500" />
					</div>
					<div>
						<div className="font-semibold text-white">Assistente Virtual</div>
						<div className="text-xs text-white/40">Triagem Automática</div>
					</div>
				</div>

				<div className="space-y-4 font-sans text-sm min-h-[200px]">
					{messages.slice(0, visibleMessages).map((msg) => (
						<div
							key={msg.id}
							className={cn("flex", msg.type === "user" ? "justify-end" : msg.type === "system" ? "justify-center" : "justify-start")}
							style={{ willChange: "transform, opacity" }}
						>
							{msg.type === "system" ? (
								<span className="text-xs text-green-400 bg-green-500/10 px-3 py-1 rounded-full border border-green-500/20">{msg.text}</span>
							) : (
								<div
									className={cn(
										"py-2 px-4 rounded-2xl max-w-[85%]",
										msg.type === "user" ? "bg-[#24549C] text-white rounded-tr-sm" : "bg-zinc-800 text-white/90 rounded-tl-sm border border-white/5",
									)}
								>
									{msg.text}
								</div>
							)}
						</div>
					))}

					{showTyping && (
						<div className="flex justify-start">
							<div className="bg-zinc-800 text-white/90 py-3 px-4 rounded-2xl rounded-tl-sm border border-white/5">
								<div className="flex gap-1">
									<span className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
									<span className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
									<span className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
								</div>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

// Animated Ranking Wireframe
function AnimatedRankingWireframe() {
	const containerRef = useRef<HTMLDivElement>(null);
	const [activeTab, setActiveTab] = useState<"sellers" | "partners" | "products">("sellers");

	const tabs: Array<"sellers" | "partners" | "products"> = ["sellers", "partners", "products"];
	const data = { sellers: MOCK_SELLERS, partners: MOCK_PARTNERS, products: MOCK_PRODUCTS };

	const getLabel = () => {
		switch (activeTab) {
			case "sellers":
				return "Top Vendedores";
			case "partners":
				return "Top Parceiros";
			case "products":
				return "Top Produtos";
		}
	};

	useGSAP(
		() => {
			gsap.ticker.lagSmoothing(1000, 16);

			let tabIndex = 0;
			const tabInterval = setInterval(() => {
				tabIndex = (tabIndex + 1) % tabs.length;
				setActiveTab(tabs[tabIndex]);
			}, 4000);

			return () => clearInterval(tabInterval);
		},
		{ scope: containerRef },
	);

	useGSAP(
		() => {
			const items = containerRef.current?.querySelectorAll(".ranking-item");
			if (!items) return;

			gsap.fromTo(items, { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.4, stagger: 0.1, ease: "power2.out", force3D: true });
		},
		{ scope: containerRef, dependencies: [activeTab] },
	);

	return (
		<div ref={containerRef} className="bg-zinc-900 border border-white/10 rounded-2xl p-4 shadow-2xl flex flex-col gap-4">
			<div className="flex flex-wrap items-center justify-between gap-4">
				<h4 className="font-bold text-white">{getLabel()}</h4>
				<div className="flex bg-zinc-800 rounded-lg p-1 gap-1">
					<Button
						variant={activeTab === "sellers" ? "default" : "ghost"}
						size="icon"
						className={cn("h-8 w-8 rounded-md", activeTab === "sellers" ? "bg-[#24549C] text-white" : "text-white/60")}
						onClick={() => setActiveTab("sellers")}
					>
						<Users className="w-4 h-4" />
					</Button>
					<Button
						variant={activeTab === "partners" ? "default" : "ghost"}
						size="icon"
						className={cn("h-8 w-8 rounded-md", activeTab === "partners" ? "bg-[#24549C] text-white" : "text-white/60")}
						onClick={() => setActiveTab("partners")}
					>
						<Handshake className="w-4 h-4" />
					</Button>
					<Button
						variant={activeTab === "products" ? "default" : "ghost"}
						size="icon"
						className={cn("h-8 w-8 rounded-md", activeTab === "products" ? "bg-[#24549C] text-white" : "text-white/60")}
						onClick={() => setActiveTab("products")}
					>
						<Package className="w-4 h-4" />
					</Button>
				</div>
			</div>

			<div className="flex flex-col gap-2 max-h-[360px] overflow-auto scrollbar-none">
				{data[activeTab].map((item) => (
					<div
						key={`${activeTab}-${item.rank}`}
						className={cn(
							"ranking-item bg-black/40 border border-white/5 flex w-full flex-col sm:flex-row gap-2 rounded-xl px-3 py-3 items-center",
							item.rank === 1 && "border-yellow-500/20 bg-yellow-500/5",
							item.rank === 2 && "border-gray-400/20 bg-gray-400/5",
							item.rank === 3 && "border-orange-600/20 bg-orange-600/5",
						)}
						style={{ willChange: "transform, opacity" }}
					>
						<div className="w-full flex items-center justify-between gap-2 flex-wrap">
							<div className="flex items-center gap-3">
								{item.rank <= 3 ? (
									<Crown
										className={cn(
											"w-5 h-5 min-w-5 min-h-5",
											item.rank === 1 && "text-yellow-500",
											item.rank === 2 && "text-gray-400",
											item.rank === 3 && "text-orange-600",
										)}
									/>
								) : (
									<div className="w-6 h-6 min-w-6 min-h-6 rounded-full bg-white/10 flex items-center justify-center">
										<span className="text-xs font-bold text-white/60">{item.rank}</span>
									</div>
								)}
								<Avatar className="w-8 h-8 min-w-8 min-h-8 hidden lg:block border border-white/10">
									<AvatarFallback className="bg-zinc-800 text-xs text-white">{item.name.slice(0, 2).toUpperCase()}</AvatarFallback>
								</Avatar>
								<div className="flex items-start flex-col">
									<h1 className="text-sm font-bold tracking-tight text-white">{item.name}</h1>
								</div>
							</div>
							<div className="flex items-center gap-2">
								<div className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[0.65rem] font-bold bg-[#24549C]/10 text-[#24549C] border border-[#24549C]/20">
									<BadgeDollarSign className="w-3 min-w-3 h-3 min-h-3" />
									<p className="text-xs font-bold tracking-tight uppercase text-white">{item.revenue}</p>
								</div>
								{activeTab !== "products" && (
									<div className="hidden sm:flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[0.65rem] font-bold bg-zinc-800/50 text-white/60 border border-white/5">
										<CirclePlus className="w-3 min-w-3 h-3 min-h-3" />
										<p className="text-xs font-bold tracking-tight uppercase">{item.sales}</p>
									</div>
								)}
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
