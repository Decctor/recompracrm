import type { FAQItem } from "@/app/_content/blog-posts";
import { Plus } from "lucide-react";
import { Container, Eyebrow, SectionTitle } from "./primitives";

// Perguntas frequentes da landing. Exportadas para que a página gere o schema FAQPage
// (JSON-LD) a partir da mesma fonte.
export const LANDING_FAQS: FAQItem[] = [
	{
		question: "O que é o RecompraCRM?",
		answer:
			"Um CRM de recompra para o varejo. Ele lê as vendas da loja e atua em duas frentes: fidelização, com programa de cashback, e recuperação, com segmentação RFM e campanhas automáticas pelo WhatsApp oficial da loja. Também pode ser usado como ERP completo.",
	},
	{
		question: "Preciso ter um programa de cashback para usar?",
		answer:
			"Não. A recuperação de clientes funciona só com o histórico de vendas: o sistema identifica quem está sumindo e dispara campanhas. O cashback é o que sustenta a frente de fidelização e pode ser ativado quando você quiser.",
	},
	{
		question: "Como as vendas chegam ao RecompraCRM?",
		answer:
			"Por integração com o seu ERP, PDV, delivery ou loja online (Bling, Online Software, Cardápio Web, Nuvem Shop, iFood), pelo Ponto de Interação no balcão, ou diretamente, se você usar o ERP do RecompraCRM.",
	},
	{
		question: "Como o desconto do cashback chega ao meu caixa?",
		answer:
			"O resgate é feito no Ponto de Interação: o cliente se identifica, escolhe quanto usar dentro do limite e o atendente confirma com a senha. A tela mostra o total a pagar e o atendente lança o desconto no ERP. Cada operação fica registrada no histórico, com quem aprovou. No ERP do RecompraCRM, o desconto entra direto na venda.",
	},
	{
		question: "Quanto custa o RecompraCRM?",
		answer:
			"O plano Plataforma custa R$399,90 por mês, no modelo em que você opera. O plano Plataforma + Gestor de Crescimento custa R$899,90 por mês e inclui uma equipe que opera as campanhas por você. Ambos têm 15 dias grátis, sem cartão e sem taxa de setup. O ERP tem proposta sob consulta.",
	},
	{
		question: "Preciso instalar algum aplicativo ou equipamento?",
		answer:
			"Não. O RecompraCRM roda no navegador e o Ponto de Interação funciona em qualquer tablet ou celular. Seus clientes não baixam aplicativo: acumulam e resgatam informando o telefone no balcão.",
	},
	{
		question: "Para que tipo de loja o RecompraCRM funciona?",
		answer:
			"Para varejo com venda direta ao consumidor: sorveterias, petshops, lojas de roupas, farmácias, padarias, materiais de construção, restaurantes e mais.",
	},
	{
		question: "O RecompraCRM tem período de teste grátis?",
		answer:
			"Sim. São 15 dias grátis, sem cartão de crédito e sem taxa de setup. Para o plano com Gestor de Crescimento, o começo é uma conversa de diagnóstico.",
	},
];

export function LandingFaq() {
	return (
		<section id="faq" className="bg-white py-24 sm:py-[136px]">
			<Container className="grid items-start gap-12 lg:grid-cols-3">
				<div>
					<Eyebrow>07 · Dúvidas</Eyebrow>
					<SectionTitle>Perguntas frequentes</SectionTitle>
				</div>
				<div className="min-w-0 border-t border-[#e3e8ea] lg:col-span-2">
					{LANDING_FAQS.map((faq) => (
						<details key={faq.question} className="group border-b border-[#e3e8ea] py-5 [&_summary::-webkit-details-marker]:hidden">
							<summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-semibold">
								{faq.question}
								<Plus className="h-[18px] w-[18px] shrink-0 text-[#687a80] transition-transform duration-200 group-open:rotate-45" aria-hidden />
							</summary>
							<p className="mt-3 max-w-[68ch] text-[15px] leading-[1.65] text-[#5b6a70]">{faq.answer}</p>
						</details>
					))}
				</div>
			</Container>
		</section>
	);
}
