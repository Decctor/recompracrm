import type { FAQItem } from "@/app/_content/blog-posts";

// Conteúdo da página /erp/financeiro. Mira "fluxo de caixa" (14.800/mês), "controle financeiro"
// (6.600), "conciliação bancária" (6.600, KD 9), "planilha de fluxo de caixa" (4.400), "sistema
// financeiro" (1.900) e "contas a pagar e receber" (1.300) — DataForSEO, Brasil, nov/2026. "dre"
// (49.500) é quase todo Diretoria Regional de Ensino: a DRE gerencial aparece no texto, não no título.
//
// Só o que existe hoje:
// - cada venda gera o lançamento e uma transação por forma de pagamento, na conta e com o prazo
//   configurados; crédito parcelado vira uma transação por mês; compra gera as contas a pagar, com
//   as duplicatas da NF-e;
// - conciliação por extrato importado (OFX, CSV, XLS/XLSX, PDF e imagem lidos com IA), com sugestões
//   em três etapas e confirmação sempre humana; sem conexão direta com o banco (Open Finance não
//   está ativo);
// - DRE gerencial por competência, fluxo de caixa projetado (30/60/90 dias), recebíveis e pagáveis,
//   fiados, faturas de cartão, recorrências e transferências;
// - plano de contas criado na ativação, sem edição pela loja; sem taxa de maquininha configurável
//   (taxas só lançadas na transação, e as do iFood automáticas); sem anexos, sem cobrança por boleto
//   ou Pix, sem exportação dos relatórios e sem separação por filial.

const WHATSAPP_NUMBER = "553492465388";
const WHATSAPP_FINANCE_TEXT = "Olá! Quero conhecer o financeiro do ERP do RecompraCRM.";

export const FINANCE_WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_FINANCE_TEXT)}`;

export const FINANCE_PATH = "/erp/financeiro";

export const FINANCE_SOURCES = [
	{
		key: "sale",
		title: "Venda",
		text:
			"Cada forma de pagamento vira uma conta a receber na conta certa, com o prazo que você definiu. Crédito em 3x são três recebimentos, um por mês.",
	},
	{
		key: "purchase",
		title: "Compra",
		text: "A compra recebida vira conta a pagar. Com a NF-e do fornecedor, as duplicatas da nota já chegam como parcelas.",
	},
	{
		key: "cash",
		title: "Caixa do PDV",
		text: "Sangria e suprimento saem do caixa como transferência registrada, com o operador e o motivo.",
	},
	{
		key: "ifood",
		title: "iFood e perdas",
		text: "As taxas do iFood entram como despesa sozinhas, e a perda de estoque vira lançamento pelo custo médio.",
	},
];

export const FINANCE_RECONCILIATION_BULLETS = [
	"Extrato em OFX, CSV ou planilha; PDF e foto lidos com IA",
	"Sugestão por valor e data, por combinação de lançamentos e por IA",
	"Nada é conciliado sem alguém confirmar",
	"Linha sem lançamento vira lançamento na hora",
	"As regras aprendem com o que você confirma",
];

export const FINANCE_PAYABLES_BULLETS = [
	"Total a receber, total a pagar e capital de giro",
	"Aging e calendário de vencimentos",
	"Fiados por cliente, com a idade da dívida",
	"Faturas de cartão da empresa, com fechamento e vencimento",
	"Juros, multas e taxas pagos no período",
];

export const FINANCE_DRE_LINES = [
	{ label: "Receita bruta", value: "R$ 86.420,00" },
	{ label: "(−) Custos", value: "R$ 31.870,00" },
	{ label: "(=) Lucro bruto", value: "R$ 54.550,00", strong: true },
	{ label: "(−) Despesas", value: "R$ 28.940,00" },
	{ label: "(=) Resultado operacional", value: "R$ 25.610,00", strong: true },
];

export const FINANCE_COMPARISON = [
	{ topic: "Vendas do dia", system: "Lançadas pela própria venda, por forma de pagamento", sheet: "Somadas à mão no fechamento" },
	{ topic: "Contas a pagar", system: "Criadas pela compra, com as duplicatas da nota", sheet: "Digitadas quando o boleto chega" },
	{ topic: "Conciliação", system: "Extrato importado, com sugestões para confirmar", sheet: "Linha por linha, comparando com o banco" },
	{ topic: "Fluxo de caixa", system: "Projetado com o que já está a receber e a pagar", sheet: "Uma estimativa refeita todo mês" },
	{ topic: "Resultado", system: "DRE por competência, com margem bruta e operacional", sheet: "Saldo do banco no fim do mês" },
];

export const FINANCE_FAQS: FAQItem[] = [
	{
		question: "O que é controle financeiro de uma loja?",
		answer:
			"É registrar tudo o que entra e sai, quando entra e sai e por quê. Ele responde três perguntas: quanto a loja tem hoje (caixa), quanto vai ter nas próximas semanas (fluxo de caixa) e se ela dá lucro (resultado). No RecompraCRM, as vendas e as compras alimentam o financeiro sozinhas, e a conciliação confere tudo com o extrato do banco.",
	},
	{
		question: "Qual a diferença entre fluxo de caixa e DRE?",
		answer:
			"O fluxo de caixa mostra o dinheiro que entra e sai em cada dia, pela data do pagamento. A DRE (demonstração do resultado) mostra se a operação dá lucro no período, pela data de competência: uma venda parcelada entra inteira na DRE do mês, mas no caixa entra aos poucos. O ERP mostra os dois, e a visão geral junta os dois lados.",
	},
	{
		question: "Como funciona a conciliação bancária?",
		answer:
			"Você importa o extrato da conta (OFX é o formato recomendado; CSV, planilha, PDF e foto também entram). O sistema compara cada linha com os lançamentos pelo valor e pela data, também por combinações de dois ou três lançamentos, e usa IA para os casos difíceis. Cada sugestão espera a sua confirmação, e o que não tem lançamento vira um na hora.",
	},
	{
		question: "O sistema conecta direto com o meu banco?",
		answer:
			"Não. Hoje a conciliação é pelo extrato importado, que você baixa no banco e envia ao ERP. Não há conexão automática com bancos nem Open Finance.",
	},
	{
		question: "As taxas da maquininha são descontadas sozinhas?",
		answer:
			"Não. Para cada forma de pagamento você define a conta de recebimento e o prazo, mas a taxa da maquininha não é configurada: ela é lançada na transação quando aparece no extrato. As taxas do iFood, essas sim, entram sozinhas como despesa.",
	},
	{
		question: "Planilha de fluxo de caixa ou sistema?",
		answer:
			"A planilha funciona enquanto alguém lança cada venda e cada conta. Num sistema ligado ao PDV e às compras, as entradas e as saídas previstas já existem, então o fluxo de caixa é projetado sozinho e avisa quando o saldo vai ficar negativo.",
	},
	{
		question: "Dá para controlar o fiado dos clientes?",
		answer:
			"Dá. A venda fiada vira uma conta a receber do cliente, com vencimento. A tela de fiados mostra o total em aberto, o vencido, a idade da dívida e o prazo médio de quitação, e o recebimento pode ser parcial.",
	},
	{
		question: "Quanto custa o financeiro?",
		answer:
			"O financeiro faz parte do ERP do RecompraCRM, com proposta sob medida para a sua operação e implantação acompanhada. Fale com um especialista pelo WhatsApp para receber o valor.",
	},
];
