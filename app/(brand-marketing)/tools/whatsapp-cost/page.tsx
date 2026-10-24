import { getBlogPost } from "@/app/_content/blog-posts";
import { getFeaturePage } from "@/app/_content/feature-pages";
import { type TWhatsappCategory, WHATSAPP_PRICES } from "@/lib/marketing-tools/whatsapp-cost";
import { Coins, MessageCircle, Target, Zap } from "lucide-react";
import type { Metadata } from "next";
import { ContinueCards, ToolCta, ToolHero, ToolJsonLd, ToolSectionHeading } from "../_components/ToolSections";
import { WhatsappCostTool } from "../_components/WhatsappCostTool";
import { formatBRL, formatUSD, formatUnitPrice } from "../_components/format";
import { WHATSAPP_CATEGORY_COLOR } from "../_components/whatsapp-colors";

const PATH = "/tools/whatsapp-cost";
const title = "Quanto custam as suas campanhas no WhatsApp";
const description = `Estime a conta mensal da API do WhatsApp Business com a tabela da Meta para o Brasil: ${formatUnitPrice(WHATSAPP_PRICES.MARKETING.brl)} por mensagem de marketing e ${formatUnitPrice(WHATSAPP_PRICES.ATENDIMENTO.brl)} por resposta de atendimento, cobrada desde 1º/10/2026.`;

export const metadata: Metadata = {
	title: "Custo do WhatsApp: estimador de campanhas na API",
	description,
	alternates: { canonical: PATH },
	openGraph: { title: `${title} | RecompraCRM`, description, url: `https://www.recompracrm.com.br${PATH}` },
	twitter: { card: "summary_large_image", title: `${title} | RecompraCRM`, description },
};

const ARTICLE_SLUG = "whatsapp-api-precos-outubro-2026-varejo";

const PRICE_ROWS: { category: TWhatsappCategory; label: string; use: string; usdNote?: string }[] = [
	{ category: "MARKETING", label: "Marketing", use: "Promoção, novidade, convite para voltar à loja" },
	{ category: "UTILIDADE", label: "Utilidade", use: "Pedido confirmado, saldo de cashback a vencer, aviso de retirada" },
	{ category: "AUTENTICACAO", label: "Autenticação", use: "Código de verificação" },
	{ category: "ATENDIMENTO", label: "Atendimento", use: "Resposta dentro de 24h de uma mensagem do cliente", usdNote: "cobrada desde 1º/10/2026" },
];

// Os números das dicas saem da mesma tabela que a calculadora usa.
const SEGMENTED_CAMPAIGN = 300;
const MARKETING_TO_UTILITY = Math.round(WHATSAPP_PRICES.MARKETING.brl / WHATSAPP_PRICES.UTILIDADE.brl);

const TIPS = [
	{
		icon: Target,
		title: "Segmente antes de disparar",
		body: `Mandar a mesma promoção para a base inteira é a forma mais cara de usar o WhatsApp. Uma campanha para os ${SEGMENTED_CAMPAIGN} clientes que não voltam há 60 dias custa ${formatBRL(SEGMENTED_CAMPAIGN * WHATSAPP_PRICES.MARKETING.brl)} e tem um motivo claro.`,
	},
	{
		icon: Coins,
		title: "Use utilidade para o que é utilidade",
		body: `Saldo de cashback a vencer, pedido pronto para retirada e confirmação de compra são mensagens de utilidade, cerca de ${MARKETING_TO_UTILITY} vezes mais baratas.`,
	},
	{
		icon: MessageCircle,
		title: "Resolva em menos mensagens",
		body:
			"Agora cada resposta conta. Uma mensagem completa, com preço, link do catálogo e horário de funcionamento, custa menos que três mensagens picadas.",
	},
	{
		icon: Zap,
		title: "Anúncio de clique para WhatsApp abre 72 horas grátis",
		body:
			"Quando o cliente escreve a partir de um anúncio de clique para WhatsApp pelo app do celular e a loja responde em até 24 horas, qualquer mensagem é gratuita por 72 horas.",
	},
];

export default function WhatsappCostPage() {
	const article = getBlogPost(ARTICLE_SLUG);
	const feature = getFeaturePage("campanhas-whatsapp");

	return (
		<>
			<ToolJsonLd name="Estimador de custo do WhatsApp" description={description} path={PATH} />
			<ToolHero
				icon={MessageCircle}
				title={title}
				lead="Na API do WhatsApp Business, a Meta cobra por mensagem entregue. Informe o tamanho da sua base e o ritmo de envios para estimar a conta do mês."
				note="Tabela da Meta para o Brasil vigente a partir de 1º/10/2026."
			/>

			<WhatsappCostTool />

			<section aria-labelledby="precos" className="pt-[120px] max-md:pt-20">
				<div className="mx-auto grid max-w-[1240px] grid-cols-[repeat(auto-fit,minmax(min(100%,480px),1fr))] items-start gap-x-[72px] gap-y-10 px-6">
					<div id="precos">
						<ToolSectionHeading eyebrow="Preços usados" title="Quanto custa cada mensagem no Brasil">
							Só mensagens entregues são cobradas. Desde 1º de outubro de 2026, as respostas de atendimento também têm custo.
						</ToolSectionHeading>
					</div>
					<div className="overflow-hidden rounded-[20px] border border-[#e3e8ea]">
						<table className="w-full border-collapse text-left text-[15px] leading-[1.5]">
							<thead>
								<tr className="bg-[#f6f8fa]">
									<th scope="col" className="px-[18px] py-3.5 text-[12px] font-semibold text-[#687a80] max-sm:px-3.5">
										Categoria
									</th>
									<th scope="col" className="px-[18px] py-3.5 text-[12px] font-semibold text-[#687a80] max-sm:hidden">
										Para que serve
									</th>
									<th scope="col" className="px-[18px] py-3.5 text-right text-[12px] font-semibold text-[#687a80] max-sm:px-3.5">
										Por mensagem
									</th>
								</tr>
							</thead>
							<tbody>
								{PRICE_ROWS.map((row) => {
									const price = WHATSAPP_PRICES[row.category];
									return (
										<tr key={row.category} className="border-t border-[#e3e8ea]">
											<td className="px-[18px] py-4 align-top max-sm:px-3.5">
												<span className="inline-flex items-center gap-2 font-semibold whitespace-nowrap">
													<span className="block h-2 w-2 flex-none rounded-full" style={{ background: WHATSAPP_CATEGORY_COLOR[row.category] }} aria-hidden />
													{row.label}
												</span>
												<span className="mt-1 block text-[13px] leading-[1.45] text-[#5b6a70] sm:hidden">{row.use}</span>
											</td>
											<td className="px-[18px] py-4 align-top text-[#5b6a70] max-sm:hidden">{row.use}</td>
											<td className="px-[18px] py-4 text-right align-top whitespace-nowrap max-sm:px-3.5">
												<span className="block font-semibold">{formatUnitPrice(price.brl)}</span>
												<span className="block text-[12px] text-[#8a979c]">{price.usd !== null ? formatUSD(price.usd) : row.usdNote}</span>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</div>
			</section>

			<section aria-labelledby="gastar-menos" className="pt-[120px] max-md:pt-20">
				<div className="mx-auto max-w-[1240px] px-6">
					<h2 id="gastar-menos" className="max-w-[640px] text-[40px] leading-[1.05] font-semibold tracking-[-0.035em] text-balance max-md:text-[32px]">
						Como gastar menos sem falar menos com o cliente
					</h2>
					<div className="mt-10 grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-6 max-md:gap-10">
						{TIPS.map((tip) => {
							const Icon = tip.icon;
							return (
								<div key={tip.title} className="border-t border-[#0e1214] pt-5">
									<span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#eef2f6] text-[#24549c]">
										<Icon className="h-5 w-5" aria-hidden />
									</span>
									<h3 className="mt-5 text-[19px] leading-[1.3] font-semibold tracking-[-0.015em]">{tip.title}</h3>
									<p className="mt-2 text-[15px] leading-[1.6] text-[#5b6a70]">{tip.body}</p>
								</div>
							);
						})}
					</div>
				</div>
			</section>

			<ContinueCards
				cards={[
					{
						eyebrow: "Artigo no blog",
						title: article?.title ?? "WhatsApp ficou mais caro em 1º de outubro: o que muda para a sua loja",
						action: "Ler o artigo",
						href: `/blog/${ARTICLE_SLUG}`,
					},
					{ eyebrow: "Outra ferramenta", title: "Calculadora de cashback", action: "Abrir calculadora", href: "/tools/cashback-calculator" },
					{
						eyebrow: "Funcionalidade",
						title: feature?.headline ?? "Campanhas automáticas no WhatsApp que vendem enquanto você dorme",
						action: "Conhecer as campanhas",
						href: "/features/campanhas-whatsapp",
					},
				]}
			/>

			<ToolCta
				title="Quer gastar menos com WhatsApp e vender mais com ele?"
				text="Veja como o RecompraCRM segmenta sua base, dispara para quem tem motivo para comprar e mostra o retorno de cada campanha."
				demoLabel="Agendar demonstração gratuita"
				whatsappText="Olá! Usei o estimador de custo do WhatsApp do RecompraCRM e quero agendar uma demonstração gratuita para a minha loja."
				location="tools_whatsapp_cta"
			/>
		</>
	);
}
