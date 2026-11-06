import { Boxes, Clock3, Layers, LayoutGrid, type LucideIcon, Palette, Truck } from "lucide-react";
import Link from "next/link";
import { CheckList } from "../../_components/CheckList";
import { ScaledMock } from "../../_components/ScaledMock";
import { MENU_COMPARISON, MENU_FEATURES, MENU_ORDER_STEPS, MENU_STORE_BULLETS } from "./menu-content";
import { OrderTrackingMock } from "./mocks/OrderTrackingMock";
import { OrdersBoardMock } from "./mocks/OrdersBoardMock";
import { ShopCashbackMock } from "./mocks/ShopCashbackMock";

// Mesma tipografia e painéis de /erp e /erp/pdv, para as páginas do ERP parecerem uma só.
const CONTAINER = "mx-auto max-w-[1240px] px-6 max-md:px-4";
const EYEBROW = "mb-4 text-[13px] font-semibold text-[#24549c]";
const H2 = "text-balance text-[48px] font-semibold leading-[1.05] tracking-[-0.035em] max-md:text-[36px]";
const LEAD = "mt-5 text-pretty text-[17px] leading-[1.6] text-[#5b6a70]";
const SPLIT = "grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-center gap-x-[72px] gap-y-12";
const PANEL = "rounded-[28px] bg-[#eef2f6] p-10 max-md:rounded-[20px] max-md:p-5";

const FEATURE_ICONS: Record<string, LucideIcon> = {
	menu: LayoutGrid,
	addons: Layers,
	delivery: Truck,
	hours: Clock3,
	stock: Boxes,
	brand: Palette,
};

export function MenuOrderSteps() {
	return (
		<section id="pedido" className="scroll-mt-[80px] bg-white pt-36 max-md:pt-24">
			<div className={CONTAINER}>
				<div className="max-w-[680px]">
					<p className={EYEBROW}>01 · O pedido do cliente</p>
					<h2 className={H2}>Do link ao pedido em quatro passos.</h2>
					<p className={LEAD}>Sem aplicativo e sem cadastro com senha. O cliente é reconhecido pelo telefone e vê o total antes de enviar.</p>
				</div>
				<ol className="mt-14 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,250px),1fr))] gap-4 p-0">
					{MENU_ORDER_STEPS.map((step, index) => (
						<li key={step.title} className="flex flex-col gap-3 rounded-[20px] border border-[#e3e8ea] p-6">
							<span className="inline-flex size-8 items-center justify-center rounded-full bg-[#eef2f6] text-[14px] font-semibold text-[#24549c]">
								{index + 1}
							</span>
							<h3 className="text-[19px] font-semibold leading-[1.25] tracking-[-0.02em]">{step.title}</h3>
							<p className="text-[15px] leading-[1.55] text-[#5b6a70]">{step.text}</p>
						</li>
					))}
				</ol>
			</div>
		</section>
	);
}

export function MenuFeatures() {
	return (
		<section id="recursos" className="bg-white pt-36 max-md:pt-24">
			<div className={CONTAINER}>
				<div className="max-w-[680px]">
					<p className={EYEBROW}>02 · O cardápio</p>
					<h2 className={H2}>Os produtos que você já cadastrou viram o cardápio.</h2>
					<p className={LEAD}>Nada de montar o cardápio em outro sistema: preço, foto, variações e estoque vêm do mesmo cadastro do PDV.</p>
				</div>
				<ul className="mt-14 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-x-10 gap-y-12 p-0">
					{MENU_FEATURES.map((feature) => {
						const Icon = FEATURE_ICONS[feature.key] ?? Layers;
						return (
							<li key={feature.key} className="flex flex-col gap-3 border-t border-[#e3e8ea] pt-6">
								<Icon className="size-5 text-[#24549c]" aria-hidden />
								<h3 className="text-[19px] font-semibold leading-[1.25] tracking-[-0.02em]">{feature.title}</h3>
								<p className="text-[15px] leading-[1.6] text-[#5b6a70]">{feature.text}</p>
							</li>
						);
					})}
				</ul>
			</div>
		</section>
	);
}

export function MenuStoreSide() {
	return (
		<section id="pedidos" className="bg-white pt-36 max-md:pt-24">
			<div className={CONTAINER}>
				<div className={SPLIT}>
					<div className="max-w-[480px]">
						<p className={EYEBROW}>03 · Na loja</p>
						<h2 className={H2}>O pedido chega pronto para preparar.</h2>
						<p className={LEAD}>
							Nada de copiar pedido do WhatsApp para o caixa. O pedido entra no quadro já confirmado, a equipe move de coluna em coluna e o cliente acompanha
							cada etapa pelo celular.
						</p>
						<CheckList items={MENU_STORE_BULLETS} />
					</div>
					<div className={`${PANEL} flex justify-center`}>
						<div className="w-full max-w-[340px]">
							<ScaledMock
								width={410}
								label="Página de acompanhamento do pedido no celular do cliente, em preparo, com o botão de enviar o pedido pelo WhatsApp"
							>
								<OrderTrackingMock />
							</ScaledMock>
						</div>
					</div>
				</div>
				<div className={`${PANEL} mt-6`}>
					<ScaledMock
						width={1080}
						label="Quadro de pedidos com pedidos da loja digital e do iFood nas colunas Não iniciado, Em preparo, Pronto, Em entrega e Entregue"
					>
						<OrdersBoardMock />
					</ScaledMock>
				</div>
			</div>
		</section>
	);
}

export function MenuCashback() {
	return (
		<section id="cashback" data-dock="dark" className="mt-36 bg-[#0b1628] py-32 text-white max-md:mt-24 max-md:py-24">
			<div className={`${CONTAINER} ${SPLIT}`}>
				<div className="max-w-[460px]">
					<p className="mb-4 text-[13px] font-semibold text-[#ffb900]">04 · Cardápio digital com cashback</p>
					<h2 className="text-balance text-[48px] font-semibold leading-[1.05] tracking-[-0.035em] max-md:text-[36px]">
						Quem pede pelo link volta a pedir pelo link.
					</h2>
					<p className="mt-5 text-pretty text-[17px] leading-[1.6] text-white/66">
						Todo pedido liga o cliente à sua base pelo telefone. Se o seu programa permitir, o saldo de cashback é usado no checkout, dentro do limite que
						você definiu, e o pedido entregue gera crédito novo para a próxima compra.
					</p>
					<ul className="mt-8 flex list-none flex-col gap-3 p-0 text-[15px] leading-[1.5] text-white/80">
						<li>Cliente novo entra na base com a origem &quot;Loja digital&quot;</li>
						<li>Cupons e recompensas do clube resgatáveis no checkout</li>
						<li>A página do pedido mostra quanto o cliente ganhou de volta</li>
					</ul>
					<div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-[15px] font-medium">
						<Link href="/features/programa-de-cashback" className="text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">
							Como funciona o programa de cashback
						</Link>
						<Link href="/tools/cashback-calculator" className="text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">
							Calcular o percentual da sua loja
						</Link>
					</div>
				</div>
				<div className="flex justify-center rounded-[28px] bg-white/6 p-10 max-md:rounded-[20px] max-md:p-5">
					<div className="w-full max-w-[420px]">
						<ScaledMock width={420} label="Etapa de descontos do checkout da loja digital, com o saldo de cashback aplicado ao pedido">
							<ShopCashbackMock />
						</ScaledMock>
					</div>
				</div>
			</div>
		</section>
	);
}

export function MenuComparison() {
	return (
		<section id="comparativo" className="bg-white pt-36 max-md:pt-24">
			<div className={CONTAINER}>
				<div className="max-w-[680px]">
					<p className={EYEBROW}>05 · Link próprio ou marketplace</p>
					<h2 className={H2}>O marketplace traz o cliente. O seu link fica com ele.</h2>
					<p className={LEAD}>Os dois convivem: os pedidos do iFood entram no mesmo quadro. A diferença é o que sobra para a loja em cada pedido.</p>
				</div>
				<div className="mt-12 overflow-hidden rounded-[20px] border border-[#e3e8ea]">
					<div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)] bg-[#f7f9f9] text-[13px] font-semibold text-[#4b585d] max-md:hidden">
						<span className="px-6 py-4" />
						<span className="px-6 py-4 text-[#24549c]">Cardápio digital próprio</span>
						<span className="px-6 py-4">Marketplace de delivery</span>
					</div>
					{MENU_COMPARISON.map((row) => (
						<div
							key={row.topic}
							className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)] border-t border-[#e3e8ea] text-[15px] max-md:grid-cols-1 max-md:gap-1 max-md:px-5 max-md:py-5 max-md:first-of-type:border-t-0"
						>
							<span className="px-6 py-5 font-semibold max-md:p-0">{row.topic}</span>
							<span className="px-6 py-5 text-[#0e1214] max-md:p-0">
								<span className="hidden text-[13px] font-semibold text-[#24549c] max-md:block">Próprio</span>
								{row.own}
							</span>
							<span className="px-6 py-5 text-[#5b6a70] max-md:p-0 max-md:pt-2">
								<span className="hidden text-[13px] font-semibold text-[#4b585d] max-md:block">Marketplace</span>
								{row.marketplace}
							</span>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}

const ERP_MODULES = [
	{ title: "PDV", text: "A frente de caixa com o mesmo cadastro de produtos, clientes e cashback.", href: "/erp/pdv" },
	{ title: "Mesas e comandas", text: "Para o pedido feito no salão, com contas por mesa, comanda ou cliente.", href: "/erp#canais" },
	{ title: "Estoque", text: "Entrada por XML, lotes com validade e a baixa de cada pedido entregue.", href: "/erp#compras" },
	{ title: "Nota fiscal", text: "NF-e e NFC-e emitidas a partir da venda, com a fila de rejeições.", href: "/erp#fiscal" },
];

export function MenuErpModules() {
	return (
		<section id="modulos" className="bg-white pt-36 max-md:pt-24">
			<div className={CONTAINER}>
				<div className="max-w-[680px]">
					<p className={EYEBROW}>06 · Junto com o cardápio</p>
					<h2 className={H2}>O resto do ERP já está ligado.</h2>
				</div>
				<ul className="mt-12 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-4 p-0">
					{ERP_MODULES.map((item) => (
						<li key={item.title}>
							<Link
								href={item.href}
								className="flex h-full flex-col gap-2 rounded-[20px] border border-[#e3e8ea] p-6 transition-colors hover:border-[#c9d1d4] hover:bg-[#f7f9f9]"
							>
								<span className="text-[17px] font-semibold tracking-[-0.01em]">{item.title}</span>
								<span className="text-[14px] leading-[1.55] text-[#5b6a70]">{item.text}</span>
								<span className="mt-auto pt-2 text-[14px] font-medium text-[#24549c]">Ver no ERP →</span>
							</Link>
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}
