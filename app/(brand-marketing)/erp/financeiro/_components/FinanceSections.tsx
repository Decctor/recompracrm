import { ArrowRight, Bike, ChevronRight, type LucideIcon, Plus, ShoppingBag, ShoppingCart, Vault } from "lucide-react";
import Link from "next/link";
import { CheckList } from "../../_components/CheckList";
import { ScaledMock } from "../../_components/ScaledMock";
import { TrackedCta } from "../../_components/TrackedCta";
import { FinanceOverviewMock } from "../../_components/mocks/FinanceOverviewMock";
import {
	FINANCE_COMPARISON,
	FINANCE_DRE_LINES,
	FINANCE_FAQS,
	FINANCE_PAYABLES_BULLETS,
	FINANCE_RECONCILIATION_BULLETS,
	FINANCE_SOURCES,
	FINANCE_WHATSAPP_URL,
} from "./finance-content";
import { CashFlowMock } from "./mocks/CashFlowMock";
import { ReconciliationMock } from "./mocks/ReconciliationMock";
import { StoreCreditMock } from "./mocks/StoreCreditMock";

// Mesma tipografia e painéis de /erp, /erp/pdv, /erp/cardapio-digital e /erp/estoque.
const CONTAINER = "mx-auto max-w-[1240px] px-6 max-md:px-4";
const EYEBROW = "mb-4 text-[13px] font-semibold text-[#24549c]";
const H2 = "text-balance text-[48px] font-semibold leading-[1.05] tracking-[-0.035em] max-md:text-[36px]";
const LEAD = "mt-5 text-pretty text-[17px] leading-[1.6] text-[#5b6a70]";
const SPLIT = "grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-center gap-x-[72px] gap-y-12";
const PANEL = "rounded-[28px] bg-[#eef2f6] p-10 max-md:rounded-[20px] max-md:p-5";

const SOURCE_ICONS: Record<string, LucideIcon> = { sale: ShoppingBag, purchase: ShoppingCart, cash: Vault, ifood: Bike };

export function FinanceHero() {
	return (
		<section id="top" className="bg-white pt-[168px] max-md:pt-32">
			<div className="mx-auto flex max-w-[960px] flex-col items-center px-6 text-center">
				<nav aria-label="Navegação estrutural" className="flex items-center gap-1.5 text-[13px] font-medium text-[#687a80]">
					<Link href="/erp" className="transition-colors hover:text-[#0e1214]">
						ERP
					</Link>
					<ChevronRight className="size-3.5" aria-hidden />
					<span className="text-[#0e1214]">Financeiro</span>
				</nav>
				<h1 className="mt-7 max-w-[900px] text-balance text-[68px] font-semibold leading-[1.02] tracking-[-0.04em] max-md:text-[44px] max-[420px]:text-[38px]">
					Controle financeiro que a venda já preenche.
				</h1>
				<p className="mt-6 max-w-[660px] text-pretty text-[19px] leading-[1.55] text-[#5b6a70] max-md:text-[17px]">
					Contas a receber nascem da venda, contas a pagar nascem da compra, e o extrato do banco é conferido com sugestões. O que sobra para você é olhar
					o fluxo de caixa e o resultado do mês.
				</p>
				<div className="mt-9 flex flex-wrap justify-center gap-2.5">
					<TrackedCta
						href={FINANCE_WHATSAPP_URL}
						ctaId="erp_finance_hero_especialista"
						location="erp_finance_hero"
						className="inline-flex h-11 items-center gap-2 rounded-full bg-[#24549c] px-5 text-[15px] font-medium text-white transition-colors hover:bg-[#1f4886]"
					>
						Ver o financeiro funcionando
						<ArrowRight className="size-4 flex-none" aria-hidden />
					</TrackedCta>
					<TrackedCta
						href="#lancamentos"
						ctaId="erp_finance_hero_como_funciona"
						location="erp_finance_hero"
						className="inline-flex h-11 items-center rounded-full border border-[#e3e8ea] px-5 text-[15px] font-medium text-[#0e1214] transition-colors hover:bg-[#f7f9f9]"
					>
						Como funciona
					</TrackedCta>
				</div>
				<p className="mt-5 text-[13px] text-[#687a80]">Contas a pagar e receber · Conciliação bancária · Fluxo de caixa · DRE gerencial</p>
			</div>
			<div className="mx-auto mt-[72px] max-w-[1400px] px-6 max-md:mt-14 max-md:px-4">
				<div className="overflow-hidden rounded-[28px] bg-[#eef2f6] px-12 pt-12 max-md:rounded-[20px] max-md:px-4 max-md:pt-4">
					<ScaledMock
						width={1040}
						label="Visão geral do financeiro: receitas, custos, despesas e caixa líquido do mês, e a cascata do faturamento ao resultado operacional com as margens"
					>
						<FinanceOverviewMock />
					</ScaledMock>
				</div>
			</div>
		</section>
	);
}

export function FinanceSources() {
	return (
		<section id="lancamentos" className="scroll-mt-[80px] bg-white pt-36 max-md:pt-24">
			<div className={CONTAINER}>
				<div className="max-w-[680px]">
					<p className={EYEBROW}>01 · Lançamentos</p>
					<h2 className={H2}>O financeiro se preenche com a operação.</h2>
					<p className={LEAD}>
						Cada venda gera o lançamento contábil e as transações de cada forma de pagamento, no plano de contas criado na ativação. O que não vem da
						operação, como aluguel e folha, entra como lançamento recorrente.
					</p>
				</div>
				<ul className="mt-14 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,250px),1fr))] gap-4 p-0">
					{FINANCE_SOURCES.map((source) => {
						const Icon = SOURCE_ICONS[source.key] ?? Plus;
						return (
							<li key={source.key} className="flex flex-col gap-3 rounded-[20px] border border-[#e3e8ea] p-6">
								<Icon className="size-5 text-[#24549c]" aria-hidden />
								<h3 className="text-[19px] font-semibold leading-[1.25] tracking-[-0.02em]">{source.title}</h3>
								<p className="text-[15px] leading-[1.55] text-[#5b6a70]">{source.text}</p>
							</li>
						);
					})}
				</ul>
			</div>
		</section>
	);
}

export function FinanceReconciliation() {
	return (
		<section id="conciliacao" className="bg-white pt-36 max-md:pt-24">
			<div className={CONTAINER}>
				<div className={SPLIT}>
					<div className="max-w-[520px]">
						<p className={EYEBROW}>02 · Conciliação bancária</p>
						<h2 className={H2}>O extrato do banco chega com a sugestão de cada lançamento.</h2>
						<p className={LEAD}>
							Importe o extrato da conta e cada linha chega com a sugestão do lançamento correspondente. Você confirma o que está certo, rejeita o que não
							está e cria o lançamento do que faltava.
						</p>
					</div>
					<CheckList items={FINANCE_RECONCILIATION_BULLETS} />
				</div>
				<div className={`${PANEL} mt-14`}>
					<ScaledMock
						width={1000}
						label="Conciliação bancária com linhas do extrato pendentes e as sugestões de lançamento automática, heurística e por IA para confirmar ou rejeitar"
					>
						<ReconciliationMock />
					</ScaledMock>
				</div>
			</div>
		</section>
	);
}

export function FinanceCashFlow() {
	return (
		<section id="fluxo-de-caixa" className="bg-white pt-36 max-md:pt-24">
			<div className={CONTAINER}>
				<div className="max-w-[720px]">
					<p className={EYEBROW}>03 · Fluxo de caixa</p>
					<h2 className={H2}>O fluxo de caixa dos próximos 90 dias, sem planilha.</h2>
					<p className={LEAD}>
						O saldo projetado parte do caixa de hoje e soma o que já está a receber e a pagar, inclusive as recorrências. Se o saldo for ficar negativo, o
						relatório avisa a data, com tempo de antecipar recebimentos ou renegociar uma saída.
					</p>
				</div>
				<div className={`${PANEL} mt-14`}>
					<ScaledMock
						width={1040}
						label="Fluxo de caixa projetado para 30 dias, com o caixa consolidado, a geração média, o runway e o saldo projetado dia a dia"
					>
						<CashFlowMock />
					</ScaledMock>
				</div>
			</div>
		</section>
	);
}

export function FinancePayables() {
	return (
		<section id="contas" className="bg-white pt-36 max-md:pt-24">
			<div className={`${CONTAINER} ${SPLIT}`}>
				<div className={`${PANEL} max-[959px]:order-last`}>
					<ScaledMock
						width={760}
						label="Fiados da loja com o total em aberto, o vencido, o recebido no período, o prazo médio de quitação e a idade da dívida"
					>
						<StoreCreditMock />
					</ScaledMock>
				</div>
				<div className="max-w-[460px]">
					<p className={EYEBROW}>04 · Contas a pagar e receber</p>
					<h2 className={H2}>Quem deve, para quem a loja deve e quando.</h2>
					<p className={LEAD}>
						Recebíveis e pagáveis mostram a posição de hoje e o calendário dos vencimentos. O fiado tem uma tela própria, com cada cliente, o atraso e o
						recebimento parcial.
					</p>
					<CheckList items={FINANCE_PAYABLES_BULLETS} />
				</div>
			</div>
		</section>
	);
}

export function FinanceDre() {
	return (
		<section id="dre" data-dock="dark" className="mt-36 bg-[#0b1628] py-32 text-white max-md:mt-24 max-md:py-24">
			<div className={`${CONTAINER} ${SPLIT}`}>
				<div className="max-w-[480px]">
					<p className="mb-4 text-[13px] font-semibold text-[#ffb900]">05 · DRE gerencial</p>
					<h2 className="text-balance text-[48px] font-semibold leading-[1.05] tracking-[-0.035em] max-md:text-[36px]">
						O lucro do mês, não só o saldo do banco.
					</h2>
					<p className="mt-5 text-pretty text-[17px] leading-[1.6] text-white/66">
						A DRE gerencial organiza o mês por competência: receita, custos, lucro bruto, despesas e resultado operacional, aberta por conta do plano. Ao
						lado, as margens dos últimos 12 meses e a composição dos custos e despesas.
					</p>
					<div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-[15px] font-medium">
						<Link href="/glossary/margem-bruta" className="text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">
							O que é margem bruta
						</Link>
						<Link href="/glossary/markup" className="text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">
							Markup e preço de venda
						</Link>
					</div>
				</div>
				<div className="rounded-[28px] bg-white/6 p-8 max-md:rounded-[20px] max-md:p-5">
					<p className="text-[12px] font-bold uppercase tracking-wide text-white/60">Demonstrativo do período · outubro (hipotético)</p>
					<dl className="mt-5 flex flex-col">
						{FINANCE_DRE_LINES.map((line) => (
							<div key={line.label} className="flex items-baseline justify-between gap-4 border-t border-white/10 py-3.5 first:border-t-0">
								<dt className={line.strong ? "text-[16px] font-semibold" : "text-[15px] text-white/72"}>{line.label}</dt>
								<dd className={line.strong ? "text-[18px] font-semibold" : "text-[15px] text-white/80"}>{line.value}</dd>
							</div>
						))}
					</dl>
					<div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-5">
						<div>
							<p className="text-[11px] font-semibold uppercase tracking-wide text-white/55">Margem bruta</p>
							<p className="mt-1 text-[28px] font-semibold">63,1%</p>
						</div>
						<div>
							<p className="text-[11px] font-semibold uppercase tracking-wide text-white/55">Margem operacional</p>
							<p className="mt-1 text-[28px] font-semibold">29,6%</p>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}

export function FinanceComparison() {
	return (
		<section id="planilha" className="bg-white pt-36 max-md:pt-24">
			<div className={CONTAINER}>
				<div className="max-w-[680px]">
					<p className={EYEBROW}>06 · Planilha ou sistema</p>
					<h2 className={H2}>A planilha de fluxo de caixa depende de alguém lembrar de lançar.</h2>
					<p className={LEAD}>Num financeiro ligado ao PDV e às compras, a maior parte dos lançamentos já está lá quando você abre a tela.</p>
				</div>
				<div className="mt-12 overflow-hidden rounded-[20px] border border-[#e3e8ea]">
					<div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)] bg-[#f7f9f9] text-[13px] font-semibold text-[#4b585d] max-md:hidden">
						<span className="px-6 py-4" />
						<span className="px-6 py-4 text-[#24549c]">Financeiro integrado</span>
						<span className="px-6 py-4">Planilha</span>
					</div>
					{FINANCE_COMPARISON.map((row) => (
						<div
							key={row.topic}
							className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)] border-t border-[#e3e8ea] text-[15px] max-md:grid-cols-1 max-md:gap-1 max-md:px-5 max-md:py-5 max-md:first-of-type:border-t-0"
						>
							<span className="px-6 py-5 font-semibold max-md:p-0">{row.topic}</span>
							<span className="px-6 py-5 text-[#0e1214] max-md:p-0">
								<span className="hidden text-[13px] font-semibold text-[#24549c] max-md:block">Integrado</span>
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
	{ title: "PDV", text: "Cada forma de pagamento da venda vira uma conta a receber, na conta certa.", href: "/erp/pdv" },
	{ title: "Controle de estoque", text: "A compra pela NF-e gera as contas a pagar, e a perda vira lançamento.", href: "/erp/estoque" },
	{ title: "Cardápio digital", text: "O pedido vira venda com a forma de pagamento escolhida, como no balcão.", href: "/erp/cardapio-digital" },
	{ title: "Nota fiscal", text: "NFC-e e NF-e emitidas a partir da venda, com a fila de rejeições.", href: "/erp#fiscal" },
];

export function FinanceErpModules() {
	return (
		<section id="modulos" className="bg-white pt-36 max-md:pt-24">
			<div className={CONTAINER}>
				<div className="max-w-[680px]">
					<p className={EYEBROW}>07 · Junto com o financeiro</p>
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

export function FinanceFaq() {
	return (
		<section id="faq" className="bg-white py-36 max-md:py-24">
			<div className="mx-auto grid max-w-[1240px] gap-x-[72px] gap-y-10 px-6 max-md:px-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
				<div>
					<p className="mb-4 text-[13px] font-semibold text-[#24549c]">08 · Dúvidas</p>
					<h2 className="text-balance text-[48px] font-semibold leading-[1.05] tracking-[-0.035em] max-md:text-[36px]">Perguntas sobre o financeiro.</h2>
				</div>
				<div className="flex flex-col border-t border-[#e3e8ea]">
					{FINANCE_FAQS.map((faq, index) => (
						<details key={faq.question} open={index === 0} className="group border-b border-[#e3e8ea]">
							<summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-[18px] font-semibold leading-[1.35] tracking-[-0.01em] [&::-webkit-details-marker]:hidden">
								{faq.question}
								<Plus className="size-5 flex-none text-[#687a80] transition-transform group-open:rotate-45" aria-hidden />
							</summary>
							<p className="max-w-[680px] pb-6 text-[16px] leading-[1.65] text-[#5b6a70]">{faq.answer}</p>
						</details>
					))}
				</div>
			</div>
		</section>
	);
}
