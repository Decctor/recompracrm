import type { FAQItem } from "@/app/_content/blog-posts";
import {
	CONSULTORIA_INCLUDED,
	HUB_INCLUDED,
	PLATFORM_YEARLY_MONTHLY_EQUIVALENT,
	PLATFORM_YEARLY_SAVINGS_PERCENT,
	PRICING,
	formatPlanPrice,
} from "@/app/_content/pricing";

// Conteúdo de /pricing. Mira "crm preço" (170/mês, KD 0), "quanto custa um crm" (140, KD 7) e
// "crm barato" (210) — DataForSEO, Brasil, nov/2026 —, mas o papel principal é converter: uma URL
// com os planos, o que entra em cada um e as dúvidas de preço.
//
// Fatos de cobrança (config/index.ts, PlanPicker e generate-checkout): dois planos-base, CRM e
// CRM + ERP, mensais ou anuais; dois adicionais que entram em qualquer um deles — o Hub de
// Atendimentos (caixa de entrada + agente de IA) e o Gestor de Crescimento, este só no mensal.
// Preço fixo por loja, sem limite de uso; pagamento por cartão de crédito.

export const PRICING_PATH = "/pricing";
export const PRICING_SLUG = "pricing";
export const PRICING_WHATSAPP_TEXT = "Olá! Tenho uma dúvida sobre os planos do RecompraCRM.";

const monthly = `R$ ${formatPlanPrice(PRICING.platformMonthly)}`;
const yearly = `R$ ${formatPlanPrice(PRICING.platformYearly)}`;
const yearlyEquivalent = `R$ ${formatPlanPrice(PLATFORM_YEARLY_MONTHLY_EQUIVALENT)}`;
const erpMonthly = `R$ ${formatPlanPrice(PRICING.erpMonthly)}`;
const hubMonthly = `R$ ${formatPlanPrice(PRICING.hubMonthly)}`;
const consultoria = `R$ ${formatPlanPrice(PRICING.consultoriaMonthly)}`;

export const PRICING_ADDONS = [
	{
		key: "atendimento",
		title: "Hub de Atendimentos",
		text:
			"O WhatsApp da loja numa caixa de entrada para a equipe toda, com um agente de IA que responde os clientes. Entra e sai da assinatura quando você quiser.",
		price: `+ ${hubMonthly}/mês`,
		included: HUB_INCLUDED,
		href: "/solutions/crm-para-varejo#atendimento",
		linkLabel: "Como funciona o atendimento",
		ctaLabel: "Tirar uma dúvida",
		ctaText: "Olá! Tenho uma dúvida sobre o Hub de Atendimentos do RecompraCRM.",
	},
	{
		key: "consultoria",
		title: "Gestor de Crescimento",
		text:
			"A plataforma é a mesma, mas quem opera é a equipe do RecompraCRM. Cobrado só no ciclo mensal.",
		price: `+ ${consultoria}/mês`,
		included: CONSULTORIA_INCLUDED,
		href: "/#planos",
		linkLabel: "Ver como funciona",
		ctaLabel: "Agendar diagnóstico",
		ctaText: "Olá! Quero agendar um diagnóstico e entender a gestão com gestor de crescimento dedicado do RecompraCRM.",
	},
];

export const PRICING_COMPARISON: { feature: string; crm: boolean | string; erp: boolean | string }[] = [
	{ feature: "Programa de cashback e Ponto de Interação", crm: true, erp: true },
	{ feature: "Campanhas automáticas no WhatsApp", crm: true, erp: true },
	{ feature: "Segmentação RFM e públicos", crm: true, erp: true },
	{ feature: "Business Intelligence de vendas", crm: true, erp: true },
	{ feature: "Integração com o sistema da loja", crm: true, erp: true },
	{ feature: "Suporte humano", crm: true, erp: true },
	{ feature: "PDV (frente de caixa)", crm: false, erp: true },
	{ feature: "Emissão de nota fiscal", crm: false, erp: true },
	{ feature: "Estoque e financeiro", crm: false, erp: true },
	{ feature: "Cardápio digital, mesas e comandas", crm: false, erp: true },
	{ feature: "Hub de Atendimentos com agente de IA", crm: "Adicional", erp: "Adicional" },
	{ feature: "Gestor de Crescimento", crm: "Adicional", erp: "Adicional" },
	{ feature: "Limite de campanhas, clientes ou usuários", crm: "Sem limite", erp: "Sem limite" },
	{ feature: "Plano anual com desconto", crm: true, erp: true },
];

export const PRICING_FAQS: FAQItem[] = [
	{
		question: "Quanto custa o RecompraCRM?",
		answer: `O plano CRM custa ${monthly} por mês, ou ${yearly} por ano (${yearlyEquivalent} por mês, ${PLATFORM_YEARLY_SAVINGS_PERCENT}% a menos). O plano CRM + ERP, que acrescenta PDV, nota fiscal, estoque e financeiro, custa ${erpMonthly} por mês. O Hub de Atendimentos (${hubMonthly} a mais por mês) e o Gestor de Crescimento (${consultoria} a mais por mês) são adicionais e entram em qualquer um dos dois planos. Todos têm ${PRICING.trialDays} dias grátis, sem cartão de crédito e sem taxa de setup.`,
	},
	{
		question: "Quanto custa um CRM para loja?",
		answer: `Depende do que vem junto. Um CRM de varejo que já traz cashback, campanhas no WhatsApp e segmentação de clientes custa, no RecompraCRM, ${monthly} por mês, sem cobrança por cliente cadastrado nem por campanha. A integração com o sistema da loja e o suporte humano estão incluídos.`,
	},
	{
		question: "Tem limite de campanhas, clientes ou usuários?",
		answer:
			"Não. O preço é fixo por loja e não muda com o número de campanhas, de clientes cadastrados, de usuários ou de atendentes. O agente de IA do Hub de Atendimentos segue uma política de uso justo.",
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
		question: "O ERP e o atendimento com IA estão no plano?",
		answer: `O ERP entra no plano CRM + ERP (${erpMonthly} por mês): PDV, nota fiscal, estoque e financeiro no mesmo cadastro de clientes e cashback. O atendimento com IA é o adicional Hub de Atendimentos (${hubMonthly} a mais por mês): a caixa de entrada compartilhada no número da loja e o agente de IA, sem limite de atendentes. O adicional pode ser incluído ou retirado a qualquer momento, pela própria plataforma.`,
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
		question: "Funciona para rede de lojas?",
		answer:
			"Funciona, com uma base de clientes única: o cliente acumula cashback em uma loja e resgata em qualquer outra. Para redes, o valor é sob consulta, conforme o número de lojas e as integrações.",
	},
];
