import IfoodLogo from "@/utils/images/integrations/ifood-logo.png";
import Image from "next/image";
import { CheckList } from "./CheckList";
import { ScaledMock } from "./ScaledMock";
import { FinanceOverviewMock } from "./mocks/FinanceOverviewMock";
import { FiscalDocumentsMock } from "./mocks/FiscalDocumentsMock";
import { InboundInvoicesMock } from "./mocks/InboundInvoicesMock";
import { StockMovementsMock } from "./mocks/StockMovementsMock";

const FISCAL_BULLETS = [
	"NFC-e no balcão, NF-e para venda a empresas",
	"Certificado A1, séries, grupos tributários e perfis de operação",
	"Ambiente de homologação para testar antes de emitir",
	"Emissão automática ao finalizar, com exceções por forma de pagamento",
];

const STOCK_BULLETS = [
	"Itens da nota vinculados aos seus produtos, com custo atualizado",
	"Lotes com validade e aviso do que está para vencer",
	"Recontagem com o ajuste registrado e o motivo",
	"Cada entrada, saída e devolução guarda o saldo antes e depois",
];

const EYEBROW = "text-[13px] font-semibold text-[#687a80]";
const H3 = "mt-3 text-balance text-[32px] font-semibold leading-[1.12] tracking-[-0.03em] max-md:text-[28px]";
const LEAD = "mt-3.5 text-[16px] leading-[1.6] text-[#5b6a70]";
const SPLIT = "grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-center gap-x-[72px] gap-y-12";
const PANEL = "rounded-[28px] bg-[#eef2f6] p-10 max-md:rounded-[20px] max-md:p-5";

export function ErpModules() {
	return (
		<section id="modulos" className="bg-white pt-36 max-md:pt-24">
			<div className="mx-auto flex max-w-[1240px] flex-col gap-[120px] px-6 max-md:gap-20 max-md:px-4">
				<div className="max-w-[640px]">
					<p className="mb-4 text-[13px] font-semibold text-[#24549c]">03 · Módulos</p>
					<h2 className="text-balance text-[48px] font-semibold leading-[1.05] tracking-[-0.035em] max-md:text-[36px]">O que fica por trás do caixa.</h2>
				</div>

				<div id="fiscal" className={SPLIT}>
					<div className="max-w-[420px]">
						<p className={EYEBROW}>Fiscal</p>
						<h3 className={H3}>NFC-e e NF-e emitidas a partir da venda.</h3>
						<p className={LEAD}>
							Quando a SEFAZ rejeita, o documento mostra o motivo e o atalho para corrigir. Pendências ficam em uma fila própria, com contagem na barra
							lateral.
						</p>
						<CheckList items={FISCAL_BULLETS} />
					</div>
					<div className={PANEL}>
						<ScaledMock width={720} label="Lista de documentos fiscais com notas autorizadas e uma NFC-e rejeitada com atalho para corrigir o produto">
							<FiscalDocumentsMock />
						</ScaledMock>
					</div>
				</div>

				<div id="compras" className={SPLIT}>
					{/* Empilhado (< 960px) o texto vem antes da tela, como em Fiscal, para não encostar dois painéis cinza. */}
					<div className={`${PANEL} flex flex-col gap-4 max-[959px]:order-last`}>
						<ScaledMock width={760} label="Notas fiscais recebidas de fornecedores com ações de manifestação, XML e DANFE">
							<InboundInvoicesMock />
						</ScaledMock>
						<ScaledMock width={760} label="Movimentações de estoque com venda, aquisição e ajuste manual, mostrando o saldo antes e depois">
							<StockMovementsMock />
						</ScaledMock>
					</div>
					<div className="max-w-[420px]">
						<p className={EYEBROW}>Compras e estoque</p>
						<h3 className={H3}>A nota do fornecedor vira entrada no estoque.</h3>
						<p className={LEAD}>
							As notas emitidas contra o seu CNPJ chegam sozinhas em Notas recebidas. Você vincula os itens aos seus produtos e a entrada é feita a partir do
							XML, com custo e lote.
						</p>
						<CheckList items={STOCK_BULLETS} />
					</div>
				</div>

				<div id="financeiro" className="flex flex-col gap-12">
					<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-end gap-x-[72px] gap-y-6">
						<div className="max-w-[480px]">
							<p className={EYEBROW}>Financeiro</p>
							<h3 className={H3}>Receitas, custos e resultado sem planilha paralela.</h3>
						</div>
						<p className="max-w-[520px] text-[16px] leading-[1.6] text-[#5b6a70]">
							Cada venda gera o lançamento contábil e as transações de cada forma de pagamento. O plano de contas é criado na ativação e você ajusta como
							quiser.
						</p>
					</div>
					<div className="rounded-[28px] bg-[#eef2f6] p-12 max-md:rounded-[20px] max-md:p-5">
						<ScaledMock width={1040} label="Visão geral do financeiro com receitas, custos, despesas, resultado e o gráfico de fluxo de transações">
							<FinanceOverviewMock />
						</ScaledMock>
					</div>
				</div>

				<div id="integracoes" className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-6 border-y border-[#e3e8ea] py-7 max-md:gap-4">
					<span className="flex size-[52px] items-center justify-center rounded-[26px] border border-[#e3e8ea] bg-white p-2.5">
						<Image src={IfoodLogo} alt="iFood" className="size-full object-contain" />
					</span>
					<p className="text-[16px] leading-[1.6] text-[#5b6a70]">
						<strong className="font-semibold text-[#0e1214]">Vende também no iFood?</strong> Os pedidos seguem chegando pela integração e entram na base de
						clientes e no cashback, sem nota, lançamento ou baixa de estoque em duplicidade.
					</p>
				</div>
			</div>
		</section>
	);
}
