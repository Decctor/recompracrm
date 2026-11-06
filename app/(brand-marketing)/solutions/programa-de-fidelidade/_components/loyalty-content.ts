import type { FAQItem } from "@/app/_content/blog-posts";

// Conteúdo de /solutions/programa-de-fidelidade. Mira a busca ampla "programa de fidelidade"
// (5.400/mês, KD 36), mais "cartão fidelidade digital" (390), "fidelização de clientes" (480),
// "retenção de clientes" (390) e "como fidelizar clientes" (210) — DataForSEO, Brasil, nov/2026.
// A página de produto (/features/programa-de-cashback) fica com "programa de cashback"; esta
// explica o tema e leva para lá.
//
// Só o que o produto faz hoje: cashback com validade e limite de resgate, terminologia em reais ou
// em pontos (cashbackProgramTerminologyEnum), catálogo de recompensas (cashbackProgramPrizes),
// identificação pelo telefone no Ponto de Interação, tela de saldo na loja e avisos no WhatsApp.
// Clube de vantagens entre lojas ainda é proposta (docs/benefits-clubs): não prometer.

export const LOYALTY_PATH = "/solutions/programa-de-fidelidade";
export const LOYALTY_SLUG = "solucao-programa-de-fidelidade";

export const LOYALTY_WHATSAPP_TEXT = "Olá! Quero montar um programa de fidelidade para a minha loja com o RecompraCRM.";

export const LOYALTY_DEFINITION =
	"Programa de fidelidade é a regra que dá ao cliente um motivo concreto para voltar à mesma loja: a cada compra ele ganha algo — um carimbo, pontos ou um crédito em dinheiro — que só vale na próxima visita. No varejo físico, o formato que mais funciona é o cashback com validade, porque o cliente entende o valor na hora e tem um prazo para usar.";

export type TLoyaltyModel = {
	name: string;
	how: string;
	customer: string;
	store: string;
	highlight?: boolean;
};

export const LOYALTY_MODELS: TLoyaltyModel[] = [
	{
		name: "Cartão carimbo",
		how: "A cada compra, um carimbo. Completou o cartão, ganha um brinde.",
		customer: "Simples, mas o cartão se perde e o brinde demora.",
		store: "Barato, sem dado nenhum: a loja não sabe quem é o cliente.",
	},
	{
		name: "Pontos",
		how: "Cada real vira pontos, trocados por produtos ou descontos.",
		customer: "Difícil saber quanto vale um ponto; o prêmio parece distante.",
		store: "Exige catálogo de prêmios e cálculo de conversão.",
	},
	{
		name: "Cashback",
		how: "Uma parte da compra volta como crédito em reais, com validade.",
		customer: "Entende o valor na hora e tem prazo para voltar.",
		store: "Custo controlado por percentual, validade e limite de resgate.",
		highlight: true,
	},
	{
		name: "Clube por assinatura",
		how: "O cliente paga uma mensalidade para ter descontos fixos.",
		customer: "Só compensa para quem compra muito; o resto não entra.",
		store: "Receita recorrente, mas atinge uma parte pequena da base.",
	},
];

export const LOYALTY_STEPS = [
	{
		title: "Escolha o percentual pela margem",
		text:
			"Comece entre 3% e 12% de cashback, conforme a margem e o ticket. A calculadora mostra quanto o programa custa por venda antes de você ligar.",
		link: { label: "Abrir a calculadora", href: "/tools/cashback-calculator" },
	},
	{
		title: "Defina validade e limite de resgate",
		text: "A validade curta cria o motivo para voltar logo; o limite de resgate por compra protege a margem. Cada segmento tem uma sugestão pronta.",
		link: { label: "Ver por segmento", href: "/segments" },
	},
	{
		title: "Decida se fala em reais ou em pontos",
		text: "O mesmo programa pode aparecer para o cliente como saldo em reais ou em pontos, e ainda trocar o saldo por recompensas do seu catálogo.",
	},
	{
		title: "Identifique o cliente pelo telefone",
		text: "No Ponto de Interação, o atendente digita o telefone, registra a venda e mostra o saldo. Sem cartão, sem aplicativo e sem cadastro longo.",
		link: { label: "Como funciona o Ponto de Interação", href: "/features/ponto-de-interacao" },
	},
	{
		title: "Lembre o cliente no WhatsApp",
		text: "Avisos automáticos de crédito ganho e de cashback perto de vencer trazem o cliente de volta antes que o saldo expire.",
		link: { label: "Campanhas no WhatsApp", href: "/features/campanhas-whatsapp" },
	},
];

export const LOYALTY_DIGITAL_CARD_BULLETS = [
	"O cliente é identificado pelo telefone no balcão",
	"O saldo aparece para o atendente antes de fechar a venda",
	"Uma tela na loja mostra como acumular e a validade",
	"O cliente recebe no WhatsApp o crédito ganho e o aviso de vencimento",
];

export const LOYALTY_FAQS: FAQItem[] = [
	{
		question: "O que é um programa de fidelidade?",
		answer: LOYALTY_DEFINITION,
	},
	{
		question: "Qual é o melhor programa de fidelidade para loja física?",
		answer:
			"Para a maioria das lojas físicas, o cashback com validade: o cliente entende o valor em reais na hora da compra e tem um prazo para usar o crédito, o que traz a próxima visita mais rápido do que pontos ou cartão carimbo. O custo fica sob controle pelo percentual, pela validade e pelo limite de resgate por compra.",
	},
	{
		question: "Como criar um programa de fidelidade para a minha loja?",
		answer:
			"Defina o percentual de cashback pela sua margem, escolha uma validade curta e um limite de resgate por compra, decida se o saldo aparece em reais ou em pontos e registre cada venda com o telefone do cliente. No RecompraCRM, a configuração já vem sugerida por segmento e o setup leva menos de um dia.",
	},
	{
		question: "Cartão fidelidade de papel ainda funciona?",
		answer:
			"Funciona para dar um brinde, mas a loja não fica sabendo quem é o cliente, quando ele parou de vir nem quanto ele gasta. No cartão fidelidade digital, o cliente é identificado pelo telefone, o saldo fica no sistema e a loja pode avisar no WhatsApp quando o crédito está para vencer.",
	},
	{
		question: "O cliente precisa baixar um aplicativo?",
		answer:
			"Não. O cliente informa o telefone no balcão, o atendente registra a venda no Ponto de Interação e o crédito entra na hora. Os avisos chegam pelo WhatsApp que ele já usa.",
	},
	{
		question: "Quanto custa um programa de fidelidade?",
		answer:
			"O custo do benefício é o cashback que o cliente efetivamente usa, controlado por percentual, validade e limite de resgate. O RecompraCRM, que opera o programa, custa a partir de R$ 399,90 por mês no plano Plataforma, com 15 dias grátis e sem cartão de crédito.",
	},
	{
		question: "Dá para usar pontos em vez de dinheiro?",
		answer:
			"Sim. O programa pode mostrar o saldo ao cliente em reais ou em pontos, e você pode cadastrar recompensas para o cliente trocar o saldo por produtos, além do desconto na compra.",
	},
];
