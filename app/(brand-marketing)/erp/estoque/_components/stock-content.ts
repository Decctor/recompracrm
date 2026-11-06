import type { FAQItem } from "@/app/_content/blog-posts";

// Conteúdo da página /erp/estoque. Mira "controle de estoque" (5.400/mês, KD 4), "gestão de
// estoque" (2.900), "planilha de controle de estoque" (2.900), "sistema de controle de estoque"
// (1.300), "inventário de estoque" (1.300) e "estoque mínimo" (480) — DataForSEO, Brasil, nov/2026.
//
// Só o que existe hoje:
// - um saldo por produto e por variante (sem depósitos, filiais nem transferência);
// - baixa automática na entrega do pedido (no balcão, ao finalizar), com estorno no cancelamento;
//   ficha técnica baixa os insumos; iFood só baixa se a política do canal estiver ligada;
// - entrada por XML (e PDF/foto lidos com IA) com vínculo lembrado por fornecedor, conversão de
//   unidade e custo médio; notas da SEFAZ com manifestação só com o módulo fiscal ativo, e a nota
//   recebida não vira compra com um clique;
// - lotes com validade e FEFO, sem alerta por WhatsApp/e-mail (a validade aparece na tela);
// - recontagem em tabela, sem contagem cega e sem leitor de código de barras;
// - sem campo de estoque mínimo: o ponto de pedido é calculado do consumo e do prazo de reposição;
// - sem importação de produtos por planilha e sem exportação dos relatórios.

const WHATSAPP_NUMBER = "553492465388";
const WHATSAPP_STOCK_TEXT = "Olá! Quero conhecer o controle de estoque do ERP do RecompraCRM.";

export const STOCK_WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_STOCK_TEXT)}`;

export const STOCK_PATH = "/erp/estoque";

export const STOCK_DEDUCTION_SOURCES = [
	{
		key: "pdv",
		title: "Venda no balcão",
		text: "A venda finalizada no PDV baixa o estoque na hora, inclusive o que foi pesado na balança.",
	},
	{
		key: "orders",
		title: "Loja digital e comandas",
		text: "O pedido baixa quando é entregue, não quando é feito. Pedido cancelado antes disso não mexe no saldo.",
	},
	{
		key: "recipe",
		title: "Ficha técnica",
		text: "Produto montado na hora pode baixar os insumos da receita em vez de um saldo próprio. Adicionais baixam o produto vinculado.",
	},
	{
		key: "reversal",
		title: "Cancelamento e devolução",
		text: "Venda cancelada ou editada depois de entregue devolve o saldo com uma entrada de estorno, no mesmo lote de onde saiu.",
	},
];

export const STOCK_XML_BULLETS = [
	"XML da NF-e com leitura exata; PDF ou foto da nota lidos com IA",
	"Item ligado ao produto pelo vínculo lembrado, pelo código ou por sugestão",
	"Caixa com 12 vira 12 unidades, com o fator sugerido pela descrição",
	"Frete, IPI e ST rateados no custo de cada item",
	"Custo médio recalculado a cada entrada",
];

export const STOCK_LOT_BULLETS = [
	"Saldo por lote, com fabricação e validade",
	"Venda e produção consomem primeiro o lote que vence antes",
	"Filtro de lotes vencendo em 7 dias e vencidos",
	"Descarte registra a perda com o custo do lote",
	"Etiqueta do lote com QR code e validade",
];

export const STOCK_REPORTS = [
	{ key: "abc", title: "Curva ABC", text: "Quais produtos fazem 80% do faturamento e merecem nunca faltar." },
	{ key: "giro", title: "Giro e cobertura", text: "Quantos dias o saldo de cada produto dura no ritmo atual de venda." },
	{ key: "reposicao", title: "Ponto de pedido", text: "O que já está na hora de comprar, com a quantidade e o valor sugeridos." },
	{ key: "parado", title: "Estoque parado", text: "O que está há mais de 30, 60 ou 90 dias sem sair, e quanto dinheiro está ali." },
	{ key: "custos", title: "Custos", text: "Os itens cujo custo de compra mais mudou e o efeito na margem com o preço de hoje." },
	{ key: "perdas", title: "Perdas", text: "Descartes, vencimentos e ajustes de recontagem, por mês e por motivo." },
	{ key: "vencimentos", title: "Vencimentos", text: "Os lotes que vencem nos próximos dias e o valor em risco." },
	{ key: "valor", title: "Valor imobilizado", text: "Quanto dinheiro está parado no estoque hoje e como isso mudou no período." },
];

export const STOCK_COMPARISON = [
	{ topic: "Baixa das vendas", system: "Automática, a cada venda entregue", sheet: "Digitada no fim do dia" },
	{ topic: "Entrada de mercadoria", system: "Pelo XML da nota do fornecedor", sheet: "Item por item, à mão" },
	{ topic: "Custo", system: "Custo médio recalculado a cada compra", sheet: "Último preço anotado" },
	{ topic: "Validade", system: "Por lote, com o que vence primeiro saindo antes", sheet: "Uma coluna que ninguém atualiza" },
	{ topic: "O que comprar", system: "Ponto de pedido calculado do consumo", sheet: "Olhar a prateleira" },
];

export const STOCK_FAQS: FAQItem[] = [
	{
		question: "O que é controle de estoque?",
		answer:
			"Controle de estoque é saber, a qualquer momento, quanto de cada produto a loja tem, quanto custou e quanto sai por dia. Ele junta três registros: o que entra (compras e produções), o que sai (vendas, consumo e perdas) e o que foi contado de verdade na prateleira. No RecompraCRM, as entradas vêm da nota do fornecedor, as saídas vêm das vendas, e a recontagem corrige a diferença.",
	},
	{
		question: "Como fazer controle de estoque em uma loja pequena?",
		answer:
			"Comece pelos produtos que mais vendem e ative o rastreamento só neles. Lance as compras pela nota fiscal, deixe as vendas baixarem o saldo sozinhas e faça uma recontagem periódica para corrigir quebras e erros. Com isso, os relatórios de giro e de ponto de pedido já mostram o que comprar e o que está parado.",
	},
	{
		question: "Planilha de controle de estoque funciona?",
		answer:
			"Funciona enquanto alguém digita cada venda e cada compra. O problema é que a planilha não sabe o que foi vendido no caixa, então ela fica atrasada em relação à prateleira. Num sistema integrado ao PDV, a venda baixa o estoque no mesmo momento, e a planilha vira só a tela de recontagem.",
	},
	{
		question: "O que é estoque mínimo e ponto de pedido?",
		answer:
			"Estoque mínimo é a quantidade abaixo da qual o produto não deveria ficar. Ponto de pedido é o saldo em que é hora de comprar, para a mercadoria chegar antes de acabar. No RecompraCRM não há um mínimo fixo para digitar: o ponto de pedido é calculado do consumo de cada produto e do prazo de entrega das compras anteriores, com uma margem de segurança, e o relatório sugere a quantidade a comprar.",
	},
	{
		question: "Como fazer inventário de estoque?",
		answer:
			"Na recontagem, a loja informa a quantidade contada de cada produto numa tabela, ao lado do saldo atual e da diferença. O rascunho fica salvo no navegador enquanto a contagem acontece. Ao aplicar, o sistema registra um ajuste para cada diferença, com o motivo. Quando o saldo diminui, a diferença sai dos lotes na ordem de validade.",
	},
	{
		question: "Dá para controlar lote e validade?",
		answer:
			"Dá. Compras com validade e produções geram lotes com saldo próprio. A venda consome primeiro o lote que vence antes, a tela de lotes filtra o que vence em 7 dias e o que já venceu, e o descarte registra a perda com o custo do lote. A validade é acompanhada na tela; não há aviso automático por WhatsApp ou e-mail.",
	},
	{
		question: "Consigo dar entrada pela nota do fornecedor?",
		answer:
			"Sim. Na nova compra, envie o XML da NF-e (ou um PDF ou foto da nota, lidos com IA). Cada item da nota é ligado ao seu produto, com a conversão de caixa para unidade e o custo com frete e impostos rateados. O vínculo fica lembrado para a próxima nota do mesmo fornecedor. O estoque entra quando a compra é marcada como recebida.",
	},
	{
		question: "Funciona com mais de um depósito ou filial?",
		answer:
			"Hoje não. O estoque tem um saldo por produto e por variante, sem separação por depósito e sem transferência entre lojas. Para redes com estoque separado por filial, o RecompraCRM funciona ao lado do sistema atual da rede.",
	},
	{
		question: "Quanto custa?",
		answer:
			"O controle de estoque faz parte do ERP do RecompraCRM, com proposta sob medida para a sua operação e implantação acompanhada. Fale com um especialista pelo WhatsApp para receber o valor.",
	},
];
