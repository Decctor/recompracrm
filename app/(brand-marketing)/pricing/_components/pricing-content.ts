import type { FAQItem } from "@/app/_content/blog-posts";
import { PLATFORM_YEARLY_MONTHLY_EQUIVALENT, PLATFORM_YEARLY_SAVINGS_PERCENT, PRICING, formatPlanPrice } from "@/app/_content/pricing";

// Conteúdo de /pricing. Mira "crm preço" (170/mês, KD 0), "quanto custa um crm" (140, KD 7) e
// "crm barato" (210) — DataForSEO, Brasil, nov/2026 —, mas o papel principal é converter: uma URL
// com os planos, o que entra em cada um e as dúvidas de preço.
//
// Fatos de cobrança (config/index.ts, PlanPicker e generate-checkout): um plano-base (CRESCIMENTO),
// mensal ou anual; o Gestor de Crescimento é add-on só no mensal; pagamento por cartão de crédito.
// A caixa de entrada com IA e o ERP não estão no plano-base: são sob consulta.

export const PRICING_PATH = "/pricing";
export const PRICING_SLUG = "pricing";
export const PRICING_WHATSAPP_TEXT = "Olá! Tenho uma dúvida sobre os planos do RecompraCRM.";

const monthly = `R$ ${formatPlanPrice(PRICING.platformMonthly)}`;
const yearly = `R$ ${formatPlanPrice(PRICING.platformYearly)}`;
const yearlyEquivalent = `R$ ${formatPlanPrice(PLATFORM_YEARLY_MONTHLY_EQUIVALENT)}`;
const bundle = `R$ ${formatPlanPrice(PRICING.bundleMonthly)}`;
const consultoria = `R$ ${formatPlanPrice(PRICING.consultoriaMonthly)}`;

export const PRICING_ADDONS = [
	{
		key: "atendimento",
		title: "Atendimento no WhatsApp com IA",
		text:
			"Caixa de entrada compartilhada no número da loja, para a equipe responder os clientes, e o agente de IA que consulta compras, produtos e cashback e passa a conversa para a equipe quando precisa.",
		price: "Sob consulta",
		href: "/solutions/crm-para-varejo#atendimento",
		linkLabel: "Como funciona o atendimento",
	},
	{
		key: "erp",
		title: "ERP RecompraCRM",
		text:
			"PDV, nota fiscal, estoque, financeiro, cardápio digital e mesas e comandas, no mesmo cadastro de clientes e cashback. Implantação acompanhada.",
		price: "Proposta sob medida",
		href: "/erp",
		linkLabel: "Conhecer o ERP",
	},
];

export const PRICING_COMPARISON: { feature: string; platform: boolean | string; bundle: boolean | string }[] = [
	{ feature: "Programa de cashback e Ponto de Interação", platform: true, bundle: true },
	{ feature: "Campanhas automáticas no WhatsApp", platform: true, bundle: true },
	{ feature: "Segmentação RFM e públicos", platform: true, bundle: true },
	{ feature: "Business Intelligence de vendas", platform: true, bundle: true },
	{ feature: "Integração com o sistema da loja", platform: true, bundle: true },
	{ feature: "Suporte humano", platform: true, bundle: true },
	{ feature: "Importação dos seus dados de venda", platform: "Você faz", bundle: "A gente faz" },
	{ feature: "Criação e gestão das campanhas", platform: "Você faz", bundle: "A gente faz" },
	{ feature: "Diagnóstico inicial com metas", platform: false, bundle: true },
	{ feature: "Relatório mensal de resultado", platform: false, bundle: true },
	{ feature: "Plano anual com desconto", platform: true, bundle: false },
];

export const PRICING_FAQS: FAQItem[] = [
	{
		question: "Quanto custa o RecompraCRM?",
		answer: `O plano Plataforma custa ${monthly} por mês, ou ${yearly} por ano (${yearlyEquivalent} por mês, ${PLATFORM_YEARLY_SAVINGS_PERCENT}% a menos). O Plataforma + Gestor de Crescimento, em que a equipe do RecompraCRM opera as campanhas pela loja, custa ${bundle} por mês. Os dois têm ${PRICING.trialDays} dias grátis, sem cartão de crédito e sem taxa de setup.`,
	},
	{
		question: "Quanto custa um CRM para loja?",
		answer: `Depende do que vem junto. Um CRM de varejo que já traz cashback, campanhas no WhatsApp e segmentação de clientes custa, no RecompraCRM, ${monthly} por mês, sem cobrança por cliente cadastrado nem por campanha. A integração com o sistema da loja e o suporte humano estão incluídos.`,
	},
	{
		question: "Preciso de cartão de crédito para testar?",
		answer: `Não. O teste de ${PRICING.trialDays} dias é liberado sem cartão. Se decidir continuar, a assinatura é paga com cartão de crédito.`,
	},
	{
		question: "Tem contrato de fidelidade?",
		answer: "Não. A assinatura é mensal (ou anual, se você escolher) e pode ser cancelada quando quiser, sem multa e sem taxa de setup.",
	},
	{
		question: "O que muda com o Gestor de Crescimento?",
		answer: `A plataforma é a mesma. A diferença é quem opera: com o Gestor de Crescimento (${consultoria} a mais por mês), a equipe do RecompraCRM importa os seus dados, faz o diagnóstico, cria e ajusta as campanhas e manda o relatório de resultado todo mês. Ele é cobrado só no ciclo mensal.`,
	},
	{
		question: "As mensagens do WhatsApp estão incluídas?",
		answer:
			"O RecompraCRM não limita os envios: as campanhas e os avisos automáticos estão no plano. A Meta cobra por mensagem entregue, direto na conta do WhatsApp Business da loja. A calculadora de custo do WhatsApp estima esse valor pelo tamanho da sua base.",
	},
	{
		question: "O atendimento com IA e o ERP estão no plano?",
		answer:
			"Não estão no plano-base. A caixa de entrada compartilhada com o agente de IA é um adicional liberado sob consulta, e o ERP (PDV, nota fiscal, estoque e financeiro) tem proposta sob medida. Fale com um especialista para receber os valores.",
	},
	{
		question: "Funciona para rede de lojas?",
		answer:
			"Funciona, com uma base de clientes única: o cliente acumula cashback em uma loja e resgata em qualquer outra. Para redes, o valor é sob consulta, conforme o número de lojas e as integrações.",
	},
];
