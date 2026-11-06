import {
	BadgeDollarSign,
	CalendarClock,
	ChartPie,
	ChefHat,
	Hourglass,
	Layers,
	type LucideIcon,
	RefreshCw,
	Repeat,
	ShoppingBag,
	Smartphone,
	Trash2,
	TrendingUp,
	Undo2,
} from "lucide-react";
import Link from "next/link";
import { CheckList } from "../../_components/CheckList";
import { ScaledMock } from "../../_components/ScaledMock";
import { InboundInvoicesMock } from "../../_components/mocks/InboundInvoicesMock";
import { StockMovementsMock } from "../../_components/mocks/StockMovementsMock";
import { PurchaseItemsMock } from "./mocks/PurchaseItemsMock";
import { StockLotsMock } from "./mocks/StockLotsMock";
import { StockRecountMock } from "./mocks/StockRecountMock";
import { STOCK_COMPARISON, STOCK_DEDUCTION_SOURCES, STOCK_LOT_BULLETS, STOCK_REPORTS, STOCK_XML_BULLETS } from "./stock-content";

// Mesma tipografia e painéis de /erp, /erp/pdv e /erp/cardapio-digital.
const CONTAINER = "mx-auto max-w-[1240px] px-6 max-md:px-4";
const EYEBROW = "mb-4 text-[13px] font-semibold text-[#24549c]";
const H2 = "text-balance text-[48px] font-semibold leading-[1.05] tracking-[-0.035em] max-md:text-[36px]";
const H3 = "text-balance text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] max-md:text-[26px]";
const LEAD = "mt-5 text-pretty text-[17px] leading-[1.6] text-[#5b6a70]";
const SPLIT = "grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-center gap-x-[72px] gap-y-12";
const PANEL = "rounded-[28px] bg-[#eef2f6] p-10 max-md:rounded-[20px] max-md:p-5";

const SOURCE_ICONS: Record<string, LucideIcon> = { pdv: ShoppingBag, orders: Smartphone, recipe: ChefHat, reversal: Undo2 };
const REPORT_ICONS: Record<string, LucideIcon> = {
	abc: ChartPie,
	giro: RefreshCw,
	reposicao: Repeat,
	parado: Hourglass,
	custos: TrendingUp,
	perdas: Trash2,
	vencimentos: CalendarClock,
	valor: BadgeDollarSign,
};

export function StockDeduction() {
	return (
		<section id="baixa" className="scroll-mt-[80px] bg-white pt-36 max-md:pt-24">
			<div className={CONTAINER}>
				<div className="max-w-[680px]">
					<p className={EYEBROW}>01 · Saídas</p>
					<h2 className={H2}>A venda baixa o estoque sozinha.</h2>
					<p className={LEAD}>
						Não existe fechamento de estoque no fim do dia. Cada canal de venda do ERP baixa o saldo no momento certo, e cada movimento fica registrado com
						o saldo antes e depois.
					</p>
				</div>
				<ul className="mt-14 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,250px),1fr))] gap-4 p-0">
					{STOCK_DEDUCTION_SOURCES.map((source) => {
						const Icon = SOURCE_ICONS[source.key] ?? Layers;
						return (
							<li key={source.key} className="flex flex-col gap-3 rounded-[20px] border border-[#e3e8ea] p-6">
								<Icon className="size-5 text-[#24549c]" aria-hidden />
								<h3 className="text-[19px] font-semibold leading-[1.25] tracking-[-0.02em]">{source.title}</h3>
								<p className="text-[15px] leading-[1.55] text-[#5b6a70]">{source.text}</p>
							</li>
						);
					})}
				</ul>
				<div className={`${SPLIT} mt-24 max-md:mt-16`}>
					<div className={`${PANEL} max-[959px]:order-last`}>
						<ScaledMock width={760} label="Movimentações de estoque com venda, aquisição e ajuste manual, mostrando o saldo antes e depois">
							<StockMovementsMock />
						</ScaledMock>
					</div>
					<div className="max-w-[460px]">
						<h3 className={H3}>Cada movimento com origem, responsável e saldo.</h3>
						<p className={LEAD}>
							Venda, compra, produção, devolução, consumo, descarte e ajuste de recontagem ficam no mesmo histórico, filtrável por entradas, saídas e por
							origem automática ou manual. Movimento manual sempre pede o motivo.
						</p>
					</div>
				</div>
			</div>
		</section>
	);
}

export function StockInbound() {
	return (
		<section id="entrada" className="bg-white pt-36 max-md:pt-24">
			<div className={CONTAINER}>
				<div className={SPLIT}>
					<div className="max-w-[520px]">
						<p className={EYEBROW}>02 · Entradas</p>
						<h2 className={H2}>A nota do fornecedor vira entrada no estoque.</h2>
						<p className={LEAD}>
							Envie o XML da NF-e e cada item da nota é ligado ao seu produto. Os itens que já foram vinculados antes chegam prontos; o resto fica numa fila
							para você confirmar, vincular ou cadastrar.
						</p>
					</div>
					<CheckList items={STOCK_XML_BULLETS} />
				</div>
				<div className={`${PANEL} mt-14`}>
					<ScaledMock
						width={1120}
						label="Etapa de itens da nova compra: itens da nota do fornecedor ligados aos produtos do estoque, com vínculo lembrado, sugestão, produto sem vínculo e conversão de caixa para unidade"
					>
						<PurchaseItemsMock />
					</ScaledMock>
				</div>
				<div className={`${SPLIT} mt-24 max-md:mt-16`}>
					<div className="max-w-[460px]">
						<h3 className={H3}>As notas emitidas para o seu CNPJ aparecem sozinhas.</h3>
						<p className={LEAD}>
							Com o módulo fiscal ativo, as NF-e dos seus fornecedores chegam em Notas recebidas, com ciência, confirmação, desconhecimento e o download do
							XML e do DANFE, sem pedir o arquivo por e-mail.
						</p>
					</div>
					<div className={PANEL}>
						<ScaledMock width={760} label="Notas recebidas da SEFAZ com a manifestação do destinatário e o download do XML e do DANFE">
							<InboundInvoicesMock />
						</ScaledMock>
					</div>
				</div>
			</div>
		</section>
	);
}

export function StockLots() {
	return (
		<section id="lotes" className="bg-white pt-36 max-md:pt-24">
			<div className={`${CONTAINER} ${SPLIT}`}>
				<div className={`${PANEL} max-[959px]:order-last`}>
					<ScaledMock
						width={820}
						label="Lotes de estoque com saldo, validade e origem: um lote ativo de produção, um vencendo em poucos dias e um vencido"
					>
						<StockLotsMock />
					</ScaledMock>
				</div>
				<div className="max-w-[460px]">
					<p className={EYEBROW}>03 · Lotes e validade</p>
					<h2 className={H2}>O que vence antes sai primeiro.</h2>
					<p className={LEAD}>
						Compras com validade e produções viram lotes com saldo próprio. A venda e a produção consomem o lote mais próximo do vencimento, e o que venceu
						sai do fluxo de consumo.
					</p>
					<CheckList items={STOCK_LOT_BULLETS} />
				</div>
			</div>
		</section>
	);
}

export function StockRecount() {
	return (
		<section id="inventario" className="bg-white pt-36 max-md:pt-24">
			<div className={CONTAINER}>
				<div className="max-w-[680px]">
					<p className={EYEBROW}>04 · Inventário</p>
					<h2 className={H2}>Inventário de estoque numa tabela, não numa prancheta.</h2>
					<p className={LEAD}>
						A equipe conta a prateleira e digita a quantidade ao lado do saldo atual. A diferença aparece na hora, o rascunho fica salvo enquanto a contagem
						avança e, ao aplicar, cada diferença vira um ajuste registrado.
					</p>
				</div>
				<div className={`${PANEL} mt-14`}>
					<ScaledMock
						width={1000}
						label="Recontagem de estoque com a foto de cada produto, o saldo atual, a quantidade contada e a diferença, e a barra para aplicar a recontagem"
					>
						<StockRecountMock />
					</ScaledMock>
				</div>
			</div>
		</section>
	);
}

export function StockReports() {
	return (
		<section id="relatorios" data-dock="dark" className="mt-36 bg-[#0b1628] py-32 text-white max-md:mt-24 max-md:py-24">
			<div className={CONTAINER}>
				<div className="max-w-[720px]">
					<p className="mb-4 text-[13px] font-semibold text-[#ffb900]">05 · Relatórios</p>
					<h2 className="text-balance text-[48px] font-semibold leading-[1.05] tracking-[-0.035em] max-md:text-[36px]">
						Gestão de estoque é decidir o que comprar.
					</h2>
					<p className="mt-5 text-pretty text-[17px] leading-[1.6] text-white/66">
						Em vez de um estoque mínimo digitado à mão, o ponto de pedido de cada produto é calculado do consumo e do prazo de entrega das compras
						anteriores, com uma margem de segurança. Os relatórios cobrem 30 dias, 90 dias ou 12 meses.
					</p>
				</div>
				<ul className="mt-14 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-px overflow-hidden rounded-[20px] bg-white/10 p-0">
					{STOCK_REPORTS.map((report) => {
						const Icon = REPORT_ICONS[report.key] ?? Layers;
						return (
							<li key={report.key} className="flex flex-col gap-3 bg-[#0b1628] p-7">
								<Icon className="size-5 text-[#ffb900]" aria-hidden />
								<h3 className="text-[19px] font-semibold tracking-[-0.02em]">{report.title}</h3>
								<p className="text-[15px] leading-[1.55] text-white/66">{report.text}</p>
							</li>
						);
					})}
				</ul>
				<div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-[15px] font-medium">
					<Link href="/glossary/curva-abc" className="text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">
						O que é curva ABC
					</Link>
					<Link href="/glossary/giro-de-estoque" className="text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">
						Como calcular o giro de estoque
					</Link>
					<Link href="/glossary/margem-bruta" className="text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">
						Margem bruta
					</Link>
				</div>
			</div>
		</section>
	);
}

export function StockComparison() {
	return (
		<section id="planilha" className="bg-white pt-36 max-md:pt-24">
			<div className={CONTAINER}>
				<div className="max-w-[680px]">
					<p className={EYEBROW}>06 · Planilha ou sistema</p>
					<h2 className={H2}>A planilha de controle de estoque não sabe o que o caixa vendeu.</h2>
					<p className={LEAD}>Ela funciona enquanto alguém digita cada venda e cada compra. Num sistema ligado ao PDV, quem digita é a própria venda.</p>
				</div>
				<div className="mt-12 overflow-hidden rounded-[20px] border border-[#e3e8ea]">
					<div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)] bg-[#f7f9f9] text-[13px] font-semibold text-[#4b585d] max-md:hidden">
						<span className="px-6 py-4" />
						<span className="px-6 py-4 text-[#24549c]">Sistema integrado ao PDV</span>
						<span className="px-6 py-4">Planilha</span>
					</div>
					{STOCK_COMPARISON.map((row) => (
						<div
							key={row.topic}
							className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)] border-t border-[#e3e8ea] text-[15px] max-md:grid-cols-1 max-md:gap-1 max-md:px-5 max-md:py-5 max-md:first-of-type:border-t-0"
						>
							<span className="px-6 py-5 font-semibold max-md:p-0">{row.topic}</span>
							<span className="px-6 py-5 text-[#0e1214] max-md:p-0">
								<span className="hidden text-[13px] font-semibold text-[#24549c] max-md:block">Sistema</span>
								{row.system}
							</span>
							<span className="px-6 py-5 text-[#5b6a70] max-md:p-0 max-md:pt-2">
								<span className="hidden text-[13px] font-semibold text-[#4b585d] max-md:block">Planilha</span>
								{row.sheet}
							</span>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}

const ERP_MODULES = [
	{ title: "PDV", text: "A frente de caixa que baixa o estoque a cada venda, com leitor e balança.", href: "/erp/pdv" },
	{
		title: "Cardápio digital",
		text: "A loja com link próprio, que esconde o que acabou e baixa o estoque na entrega.",
		href: "/erp/cardapio-digital",
	},
	{ title: "Produções e receitas", text: "Ficha técnica que consome os insumos e gera lotes com validade.", href: "/erp#compras" },
	{ title: "Financeiro", text: "A compra recebida vira conta a pagar, e a perda vira lançamento.", href: "/erp/financeiro" },
];

export function StockErpModules() {
	return (
		<section id="modulos" className="bg-white pt-36 max-md:pt-24">
			<div className={CONTAINER}>
				<div className="max-w-[680px]">
					<p className={EYEBROW}>07 · Junto com o estoque</p>
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
