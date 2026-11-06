import type { FAQItem } from "@/app/_content/blog-posts";

// Conteúdo da página /erp/cardapio-digital. Mira "cardápio digital" (6.600/mês), "cardápio online"
// (1.900), "como fazer cardápio digital" (880), "menu digital" (390) e "cardápio digital para
// restaurante" (260) — DataForSEO, Brasil, nov/2026. No produto o recurso se chama "Loja digital"
// (app/shop/[slug]), com os modos Cardápio e Catálogo.
//
// Só o que existe hoje:
// - pedido por entrega ou retirada (sem pedido na mesa: isso é o módulo de mesas e comandas);
// - pagamento na entrega ou na retirada (dinheiro com troco, Pix, cartão na maquininha), sem
//   pagamento online;
// - taxa de entrega fixa, entrega grátis acima de um valor e pedido mínimo (sem taxa por bairro);
// - sem gerador de QR code: a loja copia o link;
// - sem aviso automático de status no WhatsApp: o cliente acompanha numa página que se atualiza e
//   pode enviar o resumo do pedido pelo WhatsApp;
// - cashback resgatado no checkout quando o programa permite, e gerado quando o pedido é entregue;
// - NF-e automática na entrega, se a organização ligar.

const WHATSAPP_NUMBER = "553492465388";
const WHATSAPP_MENU_TEXT = "Olá! Quero conhecer o cardápio digital (loja digital) do RecompraCRM.";

export const MENU_WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MENU_TEXT)}`;

export const MENU_PATH = "/erp/cardapio-digital";

export const MENU_ORDER_STEPS = [
	{
		title: "Abre o link da loja",
		text: "O cliente entra pelo link no Instagram, no Google ou no WhatsApp. O cardápio abre no navegador, sem baixar aplicativo.",
	},
	{
		title: "Monta o pedido",
		text: "Produtos por grupo, com foto e busca. Tamanho e sabor como variações, adicionais com mínimo, máximo e preço próprio.",
	},
	{
		title: "Informa o telefone e a entrega",
		text: "Quem já comprou é reconhecido pelo telefone. O endereço vem do CEP e a taxa aparece antes de fechar.",
	},
	{
		title: "Paga na entrega e acompanha",
		text: "Dinheiro com troco, Pix ou cartão na maquininha. Depois de enviar, o cliente acompanha o pedido numa página que se atualiza sozinha.",
	},
];

export const MENU_FEATURES = [
	{
		key: "menu",
		title: "Cardápio por grupos",
		text: 'Grupos fixos no topo, busca, "Em destaque" escolhido por você e "Mais pedidos" calculado pelas vendas dos últimos 90 dias.',
	},
	{
		key: "addons",
		title: "Variações e adicionais",
		text: 'Escolha obrigatória, "escolha até 3" ou quantos quiser. O mesmo cadastro de adicionais do PDV, com preço próprio na loja.',
	},
	{
		key: "delivery",
		title: "Entrega e retirada",
		text: "Taxa de entrega fixa, entrega grátis acima de um valor e pedido mínimo. O carrinho avisa quanto falta para a entrega grátis.",
	},
	{
		key: "hours",
		title: "Horários e feriados",
		text: "Vários turnos por dia e exceções por data. Fora do horário, o cardápio continua visível e mostra quando a loja volta a receber pedidos.",
	},
	{
		key: "stock",
		title: "Estoque e preço por canal",
		text:
			"Com o controle de estoque ligado, o que acabou sai do cardápio sozinho. Dá para ter um preço na loja digital diferente do balcão, ou esconder um item só dela.",
	},
	{
		key: "brand",
		title: "Com a sua marca",
		text: "Seu logo, suas cores e uma capa em imagem ou vídeo. O link usa o nome da sua loja, e a prévia no WhatsApp mostra o seu logo.",
	},
];

export const MENU_STORE_BULLETS = [
	"Pedido entra confirmado no quadro de pedidos",
	"Colunas Não iniciado, Em preparo, Pronto, Em entrega e Entregue",
	"Pedidos do iFood no mesmo quadro",
	"Estoque baixa quando o pedido é entregue",
	"NF-e emitida na entrega, se você ligar",
];

export const MENU_COMPARISON = [
	{ topic: "Comissão por pedido", own: "Nenhuma", marketplace: "Percentual sobre cada pedido" },
	{ topic: "Dados do cliente", own: "Ficam na sua base, com telefone e histórico", marketplace: "Ficam com a plataforma" },
	{ topic: "Fidelização", own: "Cashback e cupons da sua loja", marketplace: "Promoções da plataforma" },
	{ topic: "Vitrine", own: "Só os seus produtos, com a sua marca", marketplace: "Ao lado dos concorrentes" },
];

export const MENU_FAQS: FAQItem[] = [
	{
		question: "O que é um cardápio digital?",
		answer:
			"Cardápio digital é o cardápio da loja em um link: o cliente vê os produtos com foto e preço no celular e, no caso de um cardápio com pedido, já monta e envia o pedido por ali. No RecompraCRM, ele faz parte do ERP: o pedido cai no quadro de pedidos, o cliente entra na sua base e o cashback funciona igual ao balcão.",
	},
	{
		question: "Como fazer um cardápio digital?",
		answer:
			"Os produtos já cadastrados no ERP viram o cardápio. Você escolhe o que aparece, define entrega e retirada, taxa, pedido mínimo, formas de pagamento e horários, coloca o logo e a capa e ativa a loja. O link fica com o nome da sua loja para divulgar no Instagram, no Google e no WhatsApp.",
	},
	{
		question: "Tem cobrança por pedido?",
		answer:
			"Não. Não há comissão nem taxa por pedido feito na loja digital. Ela faz parte do ERP do RecompraCRM, com proposta sob medida para a sua operação.",
	},
	{
		question: "O cliente paga online?",
		answer:
			"Não. O pagamento é feito na entrega ou na retirada: dinheiro, com a opção de informar o troco, Pix, com a chave passada no atendimento, ou cartão de débito e crédito na maquininha. Você escolhe quais formas aceita.",
	},
	{
		question: "O cardápio digital tem QR code?",
		answer:
			"A loja digital gera um link, não um QR code. Para colocar no balcão ou na embalagem, use o link em qualquer gerador de QR code e imprima. Para pedidos feitos na mesa, o ERP tem o módulo de mesas e comandas.",
	},
	{
		question: "Como fico sabendo de um pedido novo?",
		answer:
			"O pedido entra no quadro de pedidos, que se atualiza a cada 30 segundos, já confirmado e na coluna Não iniciado. Depois de enviar, o cliente também pode mandar o resumo do pedido pelo WhatsApp da loja com um toque.",
	},
	{
		question: "Funciona junto com o iFood?",
		answer:
			"Funciona. Os pedidos do iFood são importados e entram no mesmo quadro dos pedidos da loja digital, então a equipe trabalha em uma tela só. Na loja digital, o pedido não paga comissão e o cliente fica na sua base para voltar a comprar com cashback.",
	},
	{
		question: "Serve para quem não é restaurante?",
		answer:
			"Serve. Além do modo Cardápio, a loja digital tem o modo Catálogo, para lojas de roupas, pet shops, mercados e outros segmentos que vendem para entrega ou retirada.",
	},
];
