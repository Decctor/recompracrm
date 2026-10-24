import { getBlogPost } from "@/app/_content/blog-posts";
import { getFeaturePage } from "@/app/_content/feature-pages";
import { Calculator } from "lucide-react";
import type { Metadata } from "next";
import { CashbackCalculatorTool } from "../_components/CashbackCalculatorTool";
import { ContinueCards, ToolCta, ToolHero, ToolJsonLd } from "../_components/ToolSections";

const PATH = "/tools/cashback-calculator";
const title = "Calculadora de cashback";
const description =
	"Calcule quanto o cashback custa por venda, que parte da margem ele consome e quantas vendas a mais o programa precisa trazer para se pagar. Grátis, com os números da sua loja.";

export const metadata: Metadata = {
	title: `${title}: quanto oferecer sem perder margem`,
	description,
	alternates: { canonical: PATH },
	openGraph: { title: `${title} | RecompraCRM`, description, url: `https://www.recompracrm.com.br${PATH}` },
	twitter: { card: "summary_large_image", title: `${title} | RecompraCRM`, description },
};

const GUIDE_SLUG = "quanto-oferecer-de-cashback-sem-perder-margem";

const STEPS = [
	{
		title: "Custo real por venda",
		formula: "ticket × cashback × uso",
		body: "O crédito que não volta a ser usado não custa nada. Por isso o custo real depende de quanto do saldo os clientes resgatam.",
	},
	{
		title: "Parte da margem",
		formula: "custo ÷ (ticket × margem)",
		body: "Quanto do lucro bruto de cada venda vira crédito usado. Acima de 25%, a calculadora marca o resultado em destaque.",
	},
	{
		title: "Vendas a mais para empatar",
		formula: "custo ÷ (margem − custo)",
		body: "Quanto as vendas entre os clientes do programa precisam crescer para a margem total ficar igual à de antes do cashback.",
	},
];

export default function CashbackCalculatorPage() {
	const guide = getBlogPost(GUIDE_SLUG);
	const feature = getFeaturePage("programa-de-cashback");

	return (
		<>
			<ToolJsonLd name={title} description={description} path={PATH} />
			<ToolHero
				icon={Calculator}
				title={title}
				lead="Não existe percentual mágico. Existe uma conta de quatro números: ticket médio, margem bruta, percentual de cashback e quanto do crédito volta a ser usado. Preencha com os números da sua loja."
			/>

			<CashbackCalculatorTool />

			<section aria-labelledby="a-conta" className="pt-[120px] max-md:pt-20">
				<div className="mx-auto max-w-[1240px] px-6">
					<h2 id="a-conta" className="max-w-[640px] text-[40px] leading-[1.05] font-semibold tracking-[-0.035em] max-md:text-[32px]">
						Como a conta é feita
					</h2>
					<ol className="mt-10 grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-6 max-md:gap-10">
						{STEPS.map((step, index) => (
							<li key={step.title} className="border-t border-[#0e1214] pt-5">
								<p className="text-[13px] font-semibold text-[#8a979c]">{String(index + 1).padStart(2, "0")}</p>
								<h3 className="mt-4 text-[20px] font-semibold tracking-[-0.02em]">{step.title}</h3>
								<p className="mt-3 inline-flex rounded-[10px] bg-[#f6f8fa] px-3 py-2 font-mono text-[13px] text-[#0e1214]">{step.formula}</p>
								<p className="mt-3 text-[15px] leading-[1.6] text-[#5b6a70]">{step.body}</p>
							</li>
						))}
					</ol>
				</div>
			</section>

			<ContinueCards
				cards={[
					{
						eyebrow: "Guia no blog",
						title: guide?.title ?? "Cashback: quanto oferecer sem comer a sua margem",
						action: "Ler o guia",
						href: `/blog/${GUIDE_SLUG}`,
					},
					{
						eyebrow: "Outra ferramenta",
						title: "Quanto custam as suas campanhas no WhatsApp",
						action: "Abrir estimador",
						href: "/tools/whatsapp-cost",
					},
					{
						eyebrow: "Funcionalidade",
						title: feature?.headline ?? "Transforme cada venda em motivo para o cliente voltar",
						action: "Conhecer o programa de cashback",
						href: "/features/programa-de-cashback",
					},
				]}
			/>

			<ToolCta
				title="Implante o cashback na sua loja esta semana"
				text="Agende uma demonstração gratuita. Veja o programa funcionando ao vivo e tire todas as suas dúvidas com um especialista."
				demoLabel="Agendar demonstração gratuita"
				whatsappText="Olá! Usei a calculadora de cashback do RecompraCRM e quero agendar uma demonstração gratuita para a minha loja."
				location="tools_cashback_cta"
			/>
		</>
	);
}
