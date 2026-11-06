import type { FAQItem } from "@/app/_content/blog-posts";

// Conteúdo de /solutions/crm-para-varejo. Mira "sistema de crm" (8.100/mês, KD 30), "crm whatsapp"
// (3.600, KD 12), "crm para whatsapp" (1.000), "crm para varejo" (140) e "crm para pequenas empresas"
// (170) — DataForSEO, Brasil, nov/2026. "crm gratuito" (2.900) fica de fora: o produto não é grátis.
//
// Só o que existe hoje:
// - base: PDV, Ponto de Interação, cardápio digital, integrações (Bling, Online Software, Cardápio
//   Web, Nuvem Shop, iFood, ERPFlex) e planilha de clientes e de vendas; deduplicação pelo telefone;
// - 11 segmentos RFM recalculados todo dia, com cortes configuráveis; Públicos combinam segmentos com
//   localização, compradores de um produto e campos personalizados;
// - campanhas por gatilho com receita atribuída e incremental (sem métrica de ROI e sem grupo de
//   controle); e-mail só como acompanhante do WhatsApp; sem SMS;
// - caixa de entrada compartilhada com agente de IA (adicional sob consulta, fora do plano-base);
// - API oficial do WhatsApp com o número da própria loja (a conexão não oficial existe, mas não é
//   promovida aqui);
// - carteiras de clientes por vendedor e metas; sem funil de oportunidades B2B e sem NPS.

export const CRM_PATH = "/solutions/crm-para-varejo";
export const CRM_SLUG = "crm-para-varejo";
export const CRM_WHATSAPP_TEXT = "Olá! Quero conhecer o CRM do RecompraCRM para a minha loja.";

export const CRM_DEFINITION =
	"Um sistema de CRM para varejo guarda quem compra na loja, o quê, quando e por quanto, e usa esse histórico para fazer cada cliente voltar. Diferente do CRM de vendas B2B, que acompanha negociações num funil, o CRM de varejo trabalha com quem já comprou: identifica o cliente pelo telefone a cada venda, separa quem está esfriando e aciona cashback e mensagens no WhatsApp no momento certo.";

export const CRM_SOURCES = [
	{ key: "pdv", title: "PDV e balcão", text: "O caixa identifica o cliente pelo telefone e cadastra em segundos quem ainda não está na base." },
	{ key: "pdi", title: "Ponto de Interação", text: "Um tablet no balcão onde o próprio cliente se cadastra e vê o saldo de cashback." },
	{ key: "shop", title: "Cardápio digital", text: "Todo pedido pelo link da loja liga o cliente à base pelo telefone, sem cadastro com senha." },
	{
		key: "integrations",
		title: "Integrações",
		text: "Vendas de Bling, Online Software, Cardápio Web, Nuvem Shop, iFood e ERPFlex entram sozinhas, com o histórico.",
	},
	{ key: "sheet", title: "Planilha", text: "Clientes e vendas antigos entram por planilha, com a IA sugerindo qual coluna é qual." },
];

export const CRM_PROFILE_BULLETS = [
	"Compras, valor comprado e ticket médio",
	"Em que dia da semana e do mês ele costuma comprar",
	"Os produtos, os grupos e os vendedores preferidos",
	"Segmento RFM, saldo de cashback e histórico de compras",
	"Aniversário, endereços, tags e anotações",
];

export const CRM_CAMPAIGN_TRIGGERS = [
	"Primeira compra e nova compra",
	"Cashback acumulado e cashback expirando",
	"Aniversário do cliente",
	"Entrada ou permanência num segmento, como Em risco ou Hibernando",
	"Envio único, recorrente ou promoção do produto que cada cliente mais recompra",
	"Pesquisa com botões, com a resposta salva no cadastro",
];

export const CRM_TEAM_BULLETS = [
	"Carteira de clientes por vendedor, com os contatos do dia",
	"Cadência de contato por segmento RFM",
	"Metas da loja e de cada vendedor",
	"Vendas influenciadas pela carteira no mês",
];

export const CRM_FAQS: FAQItem[] = [
	{
		question: "O que é um sistema de CRM?",
		answer:
			"CRM (Customer Relationship Management, ou gestão do relacionamento com o cliente) é o sistema que guarda o histórico de cada cliente e transforma esse histórico em ação. No varejo, isso significa saber quem comprou, o quê e quando, e fazer essa pessoa voltar: com cashback, com uma mensagem no WhatsApp no momento certo e com a equipe sabendo com quem falar hoje.",
	},
	{
		question: "Qual a diferença entre CRM de varejo e CRM de vendas?",
		answer:
			"O CRM de vendas, comum no B2B, acompanha oportunidades num funil até o fechamento. O CRM de varejo começa depois da primeira compra: o trabalho é a recompra. Por isso o RecompraCRM não tem funil de oportunidades; ele tem a base de clientes de cada venda, segmentos RFM, cashback e campanhas no WhatsApp.",
	},
	{
		question: "O CRM funciona com o WhatsApp da minha loja?",
		answer:
			"Sim. A conexão é pela API oficial do WhatsApp (Cloud API da Meta), com o número da própria loja. As campanhas usam modelos de mensagem aprovados pela Meta. Para responder os clientes pelo sistema, a caixa de entrada compartilhada com o agente de IA é um adicional, liberado sob consulta.",
	},
	{
		question: "Preciso trocar o sistema que uso hoje no caixa?",
		answer:
			"Não. Se a loja usa Bling, Online Software, Cardápio Web, Nuvem Shop, iFood ou ERPFlex, as vendas entram sozinhas no CRM. Sem integração, o Ponto de Interação no balcão registra o cliente e a venda, e o histórico antigo entra por planilha. Quem quiser a venda nascendo no mesmo sistema pode usar o ERP do RecompraCRM.",
	},
	{
		question: "Como o CRM sabe quem está deixando de comprar?",
		answer:
			"Todo dia, cada cliente é classificado pela matriz RFM: há quanto tempo comprou (recência), quantas vezes (frequência) e quanto gastou (valor). Quem cai em segmentos como Em risco, Hibernando ou Não pode perdê-los pode receber uma campanha automática no WhatsApp assim que entra no segmento.",
	},
	{
		question: "Como medir o resultado das campanhas?",
		answer:
			"Cada campanha mostra mensagens entregues, conversões, taxa de conversão e receita atribuída, dentro da janela de atribuição que você escolhe (7 dias por padrão). A receita incremental estima o que veio além do que o cliente já compraria pelo próprio ritmo, e as conversões são separadas em aquisição, reativação e aceleração.",
	},
	{
		question: "O CRM serve para loja pequena?",
		answer:
			"Serve, e costuma ser onde ele mais faz diferença: a loja pequena vive de cliente que volta. A configuração do cashback já vem sugerida por segmento, as campanhas têm modelos prontos e, no plano com Gestor de Crescimento, a equipe do RecompraCRM opera as campanhas pela loja.",
	},
	{
		question: "Quanto custa o CRM?",
		answer:
			"O plano Plataforma custa R$ 399,90 por mês, e o Plataforma + Gestor de Crescimento, em que a equipe do RecompraCRM opera as campanhas, R$ 899,90 por mês. Os dois têm a mesma plataforma, com 15 dias grátis, sem cartão de crédito e sem taxa de setup. A caixa de entrada com o agente de IA é um adicional sob consulta.",
	},
];
