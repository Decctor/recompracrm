import { ClipboardList, CreditCard, Layers, type LucideIcon, ScanBarcode, Scale, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { CheckList } from "../../_components/CheckList";
import { ScaledMock } from "../../_components/ScaledMock";
import { CheckoutSummaryMock } from "../../_components/mocks/CheckoutSummaryMock";
import { CashCloseMock } from "./mocks/CashCloseMock";
import { PDV_CASH_BULLETS, PDV_FEATURES, PDV_SALE_STEPS } from "./pdv-content";

// Mesma tipografia e painéis da página /erp, para as duas parecerem uma só.
const EYEBROW = "mb-4 text-[13px] font-semibold text-[#24549c]";
const H2 = "text-balance text-[48px] font-semibold leading-[1.05] tracking-[-0.035em] max-md:text-[36px]";
const LEAD = "mt-5 text-pretty text-[17px] leading-[1.6] text-[#5b6a70]";
const SPLIT = "grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-center gap-x-[72px] gap-y-12";
const PANEL = "rounded-[28px] bg-[#eef2f6] p-10 max-md:rounded-[20px] max-md:p-5";

const FEATURE_ICONS: Record<string, LucideIcon> = {
	barcode: ScanBarcode,
	scale: Scale,
	variants: Layers,
	quote: ClipboardList,
	terminal: CreditCard,
	discount: ShieldCheck,
};

export function PdvSaleSteps() {
	return (
		<section id="venda" className="bg-white pt-36 max-md:pt-24">
			<div className="mx-auto max-w-[1240px] px-6 max-md:px-4">
				<div className="max-w-[680px]">
					<p className={EYEBROW}>01 · Uma venda no balcão</p>
					<h2 className={H2}>Do bipe à nota em quatro passos.</h2>
					<p className={LEAD}>O caixa trabalha em uma tela só. O que acontece depois do clique em finalizar, o sistema faz sozinho.</p>
				</div>
				<ol className="mt-14 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,250px),1fr))] gap-4 p-0">
					{PDV_SALE_STEPS.map((step, index) => (
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

export function PdvFeatures() {
	return (
		<section id="recursos" className="bg-white pt-36 max-md:pt-24">
			<div className="mx-auto max-w-[1240px] px-6 max-md:px-4">
				<div className="max-w-[680px]">
					<p className={EYEBROW}>02 · Recursos do caixa</p>
					<h2 className={H2}>Feito para a fila andar.</h2>
					<p className={LEAD}>O que o operador usa o dia inteiro, sem atalho escondido nem tela de configuração no meio da venda.</p>
				</div>
				<ul className="mt-14 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-x-10 gap-y-12 p-0">
					{PDV_FEATURES.map((feature) => {
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

export function PdvCashSession() {
	return (
		<section id="caixa" className="bg-white pt-36 max-md:pt-24">
			<div className={`mx-auto max-w-[1240px] px-6 max-md:px-4 ${SPLIT}`}>
				<div className="max-w-[460px]">
					<p className={EYEBROW}>03 · Abertura e fechamento</p>
					<h2 className={H2}>O caixa fecha sem planilha.</h2>
					<p className={LEAD}>
						Cada operador abre o próprio caixa. No fim do turno, o sistema já sabe quanto deveria ter na gaveta e mostra a diferença do que foi contado.
					</p>
					<CheckList items={PDV_CASH_BULLETS} />
				</div>
				<div className={PANEL}>
					<ScaledMock width={440} label="Fechamento de caixa com vendas por vendedor, composição do dinheiro esperado e contagem sem diferença">
						<CashCloseMock />
					</ScaledMock>
				</div>
			</div>
		</section>
	);
}

export function PdvCashback() {
	return (
		<section id="cashback" data-dock="dark" className="mt-36 bg-[#0b1628] py-32 text-white max-md:mt-24 max-md:py-24">
			<div className={`mx-auto max-w-[1240px] px-6 max-md:px-4 ${SPLIT}`}>
				<div className="rounded-[28px] bg-white/6 p-10 text-[#0e1214] max-md:rounded-[20px] max-md:p-5 max-[959px]:order-last">
					<ScaledMock width={440} label="Resumo do checkout com o saldo de cashback do cliente aplicado como desconto">
						<CheckoutSummaryMock />
					</ScaledMock>
				</div>
				<div className="max-w-[460px]">
					<p className="mb-4 text-[13px] font-semibold text-[#ffb900]">04 · PDV com cashback</p>
					<h2 className="text-balance text-[48px] font-semibold leading-[1.05] tracking-[-0.035em] max-md:text-[36px]">
						O cliente resgata no caixa só com o telefone.
					</h2>
					<p className="mt-5 text-pretty text-[17px] leading-[1.6] text-white/66">
						Em um PDV comum, o cashback fica em outro sistema e o desconto é digitado à mão. Aqui o saldo aparece quando o cliente é identificado, o resgate
						respeita o limite do seu programa e a próxima compra já gera crédito novo.
					</p>
					<div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-[15px] font-medium">
						<Link href="/features/programa-de-cashback" className="text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">
							Como funciona o programa de cashback
						</Link>
						<Link href="/tools/cashback-calculator" className="text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">
							Calcular o percentual da sua loja
						</Link>
					</div>
				</div>
			</div>
		</section>
	);
}

const ERP_MODULES = [
	{ title: "Nota fiscal", text: "NFC-e e NF-e emitidas a partir da venda, com a fila de rejeições.", href: "/erp#fiscal" },
	{ title: "Compras e estoque", text: "Entrada por XML, lotes com validade e o saldo de cada movimento.", href: "/erp/estoque" },
	{ title: "Financeiro", text: "Contas, transações e o resultado do mês, sem conciliar à mão.", href: "/erp#financeiro" },
	{ title: "Mesas, comandas e loja digital", text: "Os outros canais de venda, no mesmo cadastro de produtos e clientes.", href: "/erp#canais" },
];

export function PdvErpModules() {
	return (
		<section id="modulos" className="bg-white pt-36 max-md:pt-24">
			<div className="mx-auto max-w-[1240px] px-6 max-md:px-4">
				<div className="max-w-[680px]">
					<p className={EYEBROW}>05 · Junto com o PDV</p>
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
