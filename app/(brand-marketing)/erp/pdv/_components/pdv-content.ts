import type { FAQItem } from "@/app/_content/blog-posts";

// Conteúdo da página /erp/pdv. Mira as buscas "sistema pdv", "pdv", "frente de caixa", "pdv para
// loja" e "sistema de vendas" (DataForSEO, Brasil, nov/2026). Tudo o que está aqui existe no produto:
// leitor de código de barras e balança (lib/pos), sessões de caixa com conferência cega
// (app/dashboard/sales/cash-sessions), maquininha Stone (lib/payment-attempts), orçamento e
// condicional (saleStatusEnum) e NFC-e (módulo fiscal). Não prometa impressão de cupom nem modo
// offline: o PDV não tem nenhum dos dois hoje.

const WHATSAPP_NUMBER = "553492465388";
const WHATSAPP_PDV_TEXT = "Olá! Quero conhecer o PDV do RecompraCRM para a frente de caixa da minha loja.";

export const PDV_WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_PDV_TEXT)}`;

export const PDV_PATH = "/erp/pdv";

export const PDV_SALE_STEPS = [
	{
		title: "Bipe, busque ou pese",
		text:
			"O leitor de código de barras lança o item direto no carrinho; bipar três vezes é quantidade 3, não três linhas. Produto vendido por peso vem da balança do caixa.",
	},
	{
		title: "Identifique o cliente pelo telefone",
		text: "O caixa vê o saldo de cashback, o segmento RFM e o histórico de compras antes de fechar a venda. Sem cadastro, a venda sai como consumidor.",
	},
	{
		title: "Receba como o cliente quiser",
		text:
			"Dinheiro, Pix, cartão e fiado na mesma venda, com a maquininha Stone integrada. O cashback entra como desconto, dentro do limite do seu programa.",
	},
	{
		title: "Finalize e está tudo lançado",
		text: "A NFC-e é emitida, o estoque baixa, o financeiro recebe o lançamento e o cashback da compra é creditado, com aviso no WhatsApp do cliente.",
	},
];

export const PDV_FEATURES = [
	{
		key: "barcode",
		title: "Leitor de código de barras",
		text:
			"Funciona com qualquer leitor USB. Reconhece EAN-13, UPC e etiquetas de balança, e pede para escolher quando dois produtos têm o mesmo código.",
	},
	{
		key: "scale",
		title: "Balança no caixa",
		text:
			"A balança é lida direto pelo navegador, sem programa extra. Toledo, Filizola, Urano, Elgin e outras marcas; o pareamento detecta a configuração sozinho.",
	},
	{
		key: "variants",
		title: "Variações e adicionais",
		text: "Tamanho, sabor e cor como variações, adicionais com preço próprio. O caixa monta o item em uma tela, sem cadastrar cada combinação.",
	},
	{
		key: "quote",
		title: "Orçamento e condicional",
		text: "Salve a venda como orçamento e confirme depois, ou envie peças em condicional com o estoque reservado até o cliente decidir.",
	},
	{
		key: "terminal",
		title: "Maquininha integrada",
		text: "A cobrança vai do PDV para a maquininha Stone com o valor certo. Sem redigitar, sem diferença entre o caixa e o extrato.",
	},
	{
		key: "discount",
		title: "Desconto com limite e aprovação",
		text: "Cada operador tem um limite de desconto. Acima dele, a venda pede a aprovação de quem tem permissão, e fica registrado quem aprovou.",
	},
];

export const PDV_CASH_BULLETS = [
	"Abertura com fundo de troco, por operador",
	"Sangria e suprimento registrados com motivo",
	"Fechamento com o esperado por forma de pagamento",
	"Conferência cega: o operador conta antes de ver o esperado",
	"Vendas do turno separadas por vendedor",
];

export const PDV_FAQS: FAQItem[] = [
	{
		question: "O que é um sistema PDV?",
		answer:
			"PDV (ponto de venda) é o sistema da frente de caixa: onde o atendente lança os produtos, identifica o cliente, recebe o pagamento e finaliza a venda. No RecompraCRM, o PDV faz parte do ERP, então a mesma venda emite a NFC-e, baixa o estoque, lança no financeiro e credita o cashback do cliente.",
	},
	{
		question: "Preciso instalar algum programa no computador?",
		answer:
			"Não. O PDV roda no navegador, em computador, tablet ou celular. O leitor de código de barras funciona como um teclado, em qualquer navegador. A balança do caixa é lida pelo Chrome ou Edge no computador.",
	},
	{
		question: "O PDV emite NFC-e?",
		answer:
			"Sim. Com o certificado A1 configurado, a NFC-e é emitida ao finalizar a venda, e a NF-e fica disponível para vendas a empresas. Dá para testar no ambiente de homologação antes de emitir de verdade.",
	},
	{
		question: "Funciona com a minha maquininha de cartão?",
		answer:
			"A integração com a maquininha é com a Stone: o PDV envia a cobrança com o valor da venda. Com outra maquininha, o pagamento é registrado no PDV normalmente, só sem o envio automático do valor.",
	},
	{
		question: "Como funciona o fechamento de caixa?",
		answer:
			"Cada operador abre o caixa com o fundo de troco. Sangrias e suprimentos ficam registrados durante o turno. No fechamento, o sistema mostra o esperado por forma de pagamento e a diferença do que foi contado. Com a conferência cega ligada, o operador informa a contagem antes de ver o esperado.",
	},
	{
		question: "Já uso outro sistema de PDV. Posso usar só o CRM?",
		answer:
			"Pode. O CRM importa as vendas de sistemas como Bling, Online Software e Cardápio Web, e o cashback e as campanhas funcionam do mesmo jeito. O PDV do RecompraCRM é para quem quer que a venda nasça no mesmo sistema do cashback.",
	},
	{
		question: "Quanto custa o PDV?",
		answer:
			"O PDV faz parte do ERP do RecompraCRM, com proposta sob medida para a sua operação e implantação acompanhada. Fale com um especialista pelo WhatsApp para receber o valor.",
	},
];
