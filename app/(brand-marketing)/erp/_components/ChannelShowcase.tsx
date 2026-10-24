import { cn } from "@/lib/utils";
import { ChannelTabs } from "./ChannelTabs";
import { CheckList } from "./CheckList";
import { ScaledMock } from "./ScaledMock";
import { CheckoutSummaryMock } from "./mocks/CheckoutSummaryMock";
import { ShopPhoneMock } from "./mocks/ShopPhoneMock";
import { TablesBoardMock } from "./mocks/TablesBoardMock";

const BALCAO_BULLETS = [
	"Cliente vinculado com título RFM, total comprado e saldo",
	"Resgate limitado pelo saldo e pela regra do programa",
	"Pagamento dividido entre PIX, cartão, dinheiro e fiado",
	"Orçamentos salvos e sessões de caixa com abertura e fechamento",
];

const LOJA_BULLETS = [
	"Link próprio, com capa, logo e as cores da sua marca",
	"Retirada e entrega, com prazo e pedido mínimo",
	"Pedidos chegam para a equipe confirmar e preparar",
	"Quem compra pela loja entra na base e no cashback",
];

const H3 = "text-[28px] font-semibold leading-[1.15] tracking-[-0.025em] max-md:text-[24px]";
const LEAD = "mt-3.5 text-[16px] leading-[1.6] text-[#5b6a70]";

export function ChannelShowcase() {
	return (
		<section id="canais" className="bg-white pt-36 max-md:pt-24">
			<div className="mx-auto max-w-[1240px] px-6 max-md:px-4">
				<ChannelTabs
					intro={
						<div className="max-w-[620px]">
							<p className="mb-4 text-[13px] font-semibold text-[#24549c]">01 · Canais de venda</p>
							<h2 className="text-balance text-[48px] font-semibold leading-[1.05] tracking-[-0.035em] max-md:text-[36px]">
								Balcão, loja digital e salão no mesmo cadastro.
							</h2>
							<p className="mt-[18px] text-pretty text-[17px] leading-[1.6] text-[#5b6a70]">
								Produtos, estoque e clientes são os mesmos em todos os canais. Quem compra por qualquer um deles entra na base e acumula cashback.
							</p>
						</div>
					}
					panels={{
						balcao: (
							<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] items-center gap-14">
								<div className="max-w-[420px]">
									<h3 className={H3}>O cashback entra no checkout como mais uma linha do resumo.</h3>
									<p className={LEAD}>
										O operador vincula o cliente, vê o histórico e aplica o saldo dentro do limite do seu programa. Desconto acima da alçada pede aprovação de
										um gestor.
									</p>
									<CheckList items={BALCAO_BULLETS} />
								</div>
								<ScaledMock width={440} label="Resumo do checkout com desconto em cashback, limite do operador e total da venda">
									<CheckoutSummaryMock />
								</ScaledMock>
							</div>
						),
						loja: (
							<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-center gap-14">
								<ScaledMock width={410} label="Loja digital da Gelateria Aurora aberta em um celular">
									<ShopPhoneMock />
								</ScaledMock>
								<div className="max-w-[440px]">
									<h3 className={H3}>Uma loja com o seu link, as suas cores e o seu cardápio.</h3>
									<p className={LEAD}>
										O cliente escolhe os produtos, define retirada ou entrega e envia o pedido. A equipe confirma no painel e a venda segue o mesmo caminho do
										balcão.
									</p>
									<CheckList items={LOJA_BULLETS} />
								</div>
							</div>
						),
						mesas: (
							<div className="flex flex-col gap-10">
								<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] items-end gap-x-14 gap-y-6">
									<h3 className={cn(H3, "max-w-[460px]")}>O salão inteiro em um quadro, com o tempo de cada pedido.</h3>
									<p className="max-w-[520px] text-[16px] leading-[1.6] text-[#5b6a70]">
										Cada mesa tem as suas contas e comandas. Pedidos que passam do tempo mudam de cor, e ao fechar a conta a venda segue para nota, estoque e
										cashback.
									</p>
								</div>
								<ScaledMock width={980} label="Quadro de mesas e comandas com o tempo e o status de cada pedido">
									<TablesBoardMock />
								</ScaledMock>
							</div>
						),
					}}
				/>
			</div>
		</section>
	);
}
