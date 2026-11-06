import type { FAQItem } from "./blog-posts";

// Glossário de varejo (/glossary e /glossary/[slug]). Cada verbete mira a busca "o que é …" do
// termo, quase sempre informativa e de dificuldade baixa (DataForSEO, Brasil, nov/2026): "o que é
// crm" 27.100/mês, "churn" 14.800, "markup" 14.800, "o que é cashback" 12.100, "curva abc" 12.100,
// "o que é cac" 6.600, "o que é pdv" 4.400, "o que é nps" 4.400, "ticket médio" 2.400, "o que é
// ltv" 2.400, "o que é nfc-e" 1.900, "margem bruta" 1.600, "giro de estoque" 1.000…
//
// Regras do conteúdo:
// - `definition` responde a pergunta em 40–60 palavras, sozinha (é o trecho que buscadores e IAs
//   citam). Os números dos exemplos são de uma loja hipotética e dizem isso.
// - `inRecompra` só existe quando o produto faz algo com o termo, e diz exatamente o quê:
//   curva ABC (catálogo de produtos), giro e cobertura (relatório de estoque), LTV (perfil do
//   cliente), ticket médio e margem (painel), segmentos RFM, NFC-e e PDV (ERP), pesquisa pelo
//   WhatsApp (gatilho PESQUISA). Markup e CAC não são calculados pelo produto: sem `inRecompra`.

export type GlossaryCategory = "CLIENTES" | "VENDAS_E_MARGEM" | "ESTOQUE_E_ERP";

export const GLOSSARY_CATEGORY_LABELS: Record<GlossaryCategory, string> = {
	CLIENTES: "Clientes e fidelização",
	VENDAS_E_MARGEM: "Vendas e margem",
	ESTOQUE_E_ERP: "Estoque e ERP",
};

export type GlossaryTerm = {
	slug: string;
	/** Como o termo aparece em listas e no título da página. */
	term: string;
	/** Nome por extenso, quando o termo é sigla. */
	fullName?: string;
	category: GlossaryCategory;
	/** Título da página (<title>), com a busca no começo. */
	seoTitle: string;
	metaDescription: string;
	/** A pergunta do H1, como o lojista digita. */
	question: string;
	definition: string;
	formula?: {
		expression: string;
		parts: { name: string; meaning: string }[];
	};
	example?: {
		/** Um exemplo de loja, sempre hipotético. */
		lines: string[];
		result: string;
	};
	sections: { heading: string; body: string }[];
	inRecompra?: { text: string; href: string; label: string };
	related: string[];
	faqs: FAQItem[];
	keywords: string[];
};

export const GLOSSARY_TERMS: GlossaryTerm[] = [
	{
		slug: "crm",
		term: "CRM",
		fullName: "Customer Relationship Management",
		category: "CLIENTES",
		seoTitle: "O que é CRM: significado, para que serve e como usar na loja",
		metaDescription:
			"CRM é a gestão do relacionamento com o cliente: o histórico de compras de cada pessoa organizado para vender de novo. Veja o que é, para que serve e como funciona no varejo.",
		question: "O que é CRM?",
		definition:
			"CRM (Customer Relationship Management, ou gestão do relacionamento com o cliente) é o sistema e o método de guardar quem compra, o quê e quando, para vender de novo para a mesma pessoa. No varejo, o CRM transforma o histórico de vendas em ações: lembrar quem sumiu, premiar quem volta e saber quem é o melhor cliente.",
		sections: [
			{
				heading: "Para que serve um CRM no varejo",
				body:
					"Uma loja física costuma vender bem para quem entra, mas não sabe quem entrou. O CRM resolve isso ligando cada venda a um cliente, normalmente pelo telefone. Com esse histórico, dá para ver a frequência de cada um, o ticket médio, quem parou de comprar e quem está comprando mais, e agir sobre cada grupo em vez de fazer promoção para todo mundo.",
			},
			{
				heading: "CRM de vendas e CRM de relacionamento",
				body:
					"No B2B, CRM costuma significar um funil de vendas: oportunidades, propostas e negociações. No varejo, o CRM que importa é o de relacionamento e recompra: o cliente já comprou, e o trabalho é fazê-lo voltar. Por isso ele anda junto de programa de fidelidade, campanhas no WhatsApp e segmentação por comportamento.",
			},
		],
		inRecompra: {
			text:
				"O RecompraCRM é um CRM de recompra para o varejo: liga cada venda ao cliente pelo telefone, classifica a base em segmentos RFM e aciona cashback e campanhas no WhatsApp para quem precisa voltar.",
			href: "/",
			label: "Conhecer o RecompraCRM",
		},
		related: ["fidelizacao", "matriz-rfm", "churn", "ltv"],
		faqs: [
			{
				question: "O que significa a sigla CRM?",
				answer: "CRM vem de Customer Relationship Management, em português gestão do relacionamento com o cliente.",
			},
			{
				question: "Loja pequena precisa de CRM?",
				answer:
					"Precisa de algum jeito de saber quem são os clientes e quando cada um voltou pela última vez. Em loja pequena, isso costuma ficar na memória do dono e se perde quando a base cresce. Um CRM de varejo faz esse registro a cada venda, sem planilha.",
			},
		],
		keywords: ["o que é crm", "crm significado", "o que é crm de vendas", "crm para varejo"],
	},
	{
		slug: "churn",
		term: "Churn",
		fullName: "Taxa de cancelamento ou abandono",
		category: "CLIENTES",
		seoTitle: "O que é churn: significado, como calcular e como reduzir no varejo",
		metaDescription:
			"Churn é a taxa de clientes que deixam de comprar em um período. Veja o significado, a fórmula com exemplo e como reduzir o churn em uma loja física.",
		question: "O que é churn?",
		definition:
			"Churn é a porcentagem de clientes que deixam de comprar em um período. Em assinaturas, é quem cancela; no varejo, onde não há contrato, é quem passa do intervalo normal de compra sem voltar. Um churn alto significa que a loja precisa conquistar cada vez mais clientes novos só para manter o faturamento.",
		formula: {
			expression: "Churn (%) = clientes que pararam de comprar ÷ clientes ativos no início do período × 100",
			parts: [
				{ name: "Clientes que pararam", meaning: "quem estava ativo e passou do prazo de inatividade sem comprar" },
				{ name: "Clientes ativos no início", meaning: "quem comprou dentro do prazo de inatividade no começo do período" },
			],
		},
		example: {
			lines: [
				"Loja hipotética com 1.000 clientes ativos em janeiro",
				"Prazo de inatividade: 90 dias sem comprar",
				"Em abril, 120 desses clientes estavam há mais de 90 dias sem comprar",
			],
			result: "Churn do trimestre = 120 ÷ 1.000 × 100 = 12%",
		},
		sections: [
			{
				heading: "Como definir churn quando não há cancelamento",
				body:
					"No varejo, ninguém avisa que parou de comprar. O jeito é definir um prazo de inatividade: se o cliente compra em média a cada 30 dias, passar de 60 ou 90 dias sem comprar é sinal de abandono. O prazo certo depende do ciclo de compra do segmento — uma padaria e uma ótica têm ciclos muito diferentes.",
			},
			{
				heading: "Como reduzir o churn",
				body:
					"O churn cai quando a loja age antes de o cliente esquecer dela: um crédito de cashback com validade dá um motivo concreto para voltar, e uma mensagem no WhatsApp para quem está passando do ciclo normal recupera parte de quem ia sumir. O importante é acompanhar quem está esfriando, não só quem já foi.",
			},
		],
		inRecompra: {
			text:
				'No RecompraCRM, os segmentos RFM "Em risco" e "Perdidos" mostram quem está esfriando e quem já sumiu, e as campanhas no WhatsApp podem ser disparadas automaticamente quando o cliente entra nesses segmentos.',
			href: "/features/business-intelligence",
			label: "Ver a análise RFM",
		},
		related: ["retencao-de-clientes", "matriz-rfm", "ltv", "fidelizacao"],
		faqs: [
			{
				question: "Qual é a diferença entre churn e retenção?",
				answer:
					"São lados da mesma moeda: o churn mede quem saiu, a retenção mede quem ficou. Sem contar os clientes novos, a taxa de retenção é aproximadamente 100% menos o churn do período.",
			},
			{
				question: "Qual é um churn bom para loja física?",
				answer:
					"Depende do segmento e do prazo de inatividade escolhido, então não existe um número universal. O mais útil é acompanhar a tendência do seu próprio churn mês a mês e ver se as ações de recompra estão fazendo ele cair.",
			},
		],
		keywords: ["churn", "o que é churn", "churn rate", "taxa de churn", "como calcular churn"],
	},
	{
		slug: "markup",
		term: "Markup",
		category: "VENDAS_E_MARGEM",
		seoTitle: "O que é markup: fórmula, como calcular e diferença para margem",
		metaDescription:
			"Markup é o índice aplicado sobre o custo para chegar ao preço de venda. Veja a fórmula, um exemplo de loja e a diferença entre markup e margem.",
		question: "O que é markup?",
		definition:
			"Markup é o índice que a loja multiplica pelo custo do produto para chegar ao preço de venda. Ele precisa cobrir impostos, despesas fixas e o lucro desejado. Um markup de 2,5 significa que o produto que custa R$ 40 é vendido por R$ 100 — o que não é o mesmo que ter 150% de margem.",
		formula: {
			expression: "Markup = 1 ÷ (1 − (impostos % + despesas % + lucro %)) · Preço de venda = custo × markup",
			parts: [
				{ name: "Impostos %", meaning: "o que incide sobre a venda, como Simples Nacional ou ICMS" },
				{ name: "Despesas %", meaning: "aluguel, salários e demais custos fixos, como parte do faturamento" },
				{ name: "Lucro %", meaning: "a margem de lucro que a loja quer ter em cada venda" },
			],
		},
		example: {
			lines: ["Produto com custo de R$ 40", "Impostos 8% + despesas fixas 32% + lucro desejado 20% = 60%", "Markup = 1 ÷ (1 − 0,60) = 2,5"],
			result: "Preço de venda = R$ 40 × 2,5 = R$ 100",
		},
		sections: [
			{
				heading: "Markup e margem não são a mesma coisa",
				body:
					"O markup é calculado sobre o custo; a margem, sobre o preço de venda. No exemplo, o markup é 2,5 (ou 150% sobre o custo), mas a margem bruta é 60%, porque R$ 60 de diferença representam 60% dos R$ 100 vendidos. Confundir os dois leva a dar descontos que parecem pequenos e comem todo o lucro.",
			},
			{
				heading: "Markup e programa de cashback",
				body:
					"Cashback e descontos saem da margem, não do markup. Antes de definir o percentual de um programa de fidelidade, vale olhar a margem real de cada categoria: um cashback de 5% pesa muito mais em um produto com margem de 20% do que em um com margem de 60%.",
			},
		],
		related: ["margem-bruta", "ticket-medio", "cashback", "curva-abc"],
		faqs: [
			{
				question: "Como calcular o markup de forma simples?",
				answer:
					"Some os percentuais de impostos, despesas fixas e lucro desejado, subtraia de 1 e divida 1 pelo resultado. Com 60% no total, o markup é 1 ÷ 0,40 = 2,5, e o preço de venda é o custo multiplicado por 2,5.",
			},
			{
				question: "Um markup de 100% dá 100% de lucro?",
				answer:
					"Não. Markup de 100% (índice 2) significa vender pelo dobro do custo, o que dá 50% de margem bruta — e ainda é preciso pagar impostos e despesas antes de sobrar lucro.",
			},
		],
		keywords: ["markup", "o que é markup", "como calcular markup", "markup e margem"],
	},
	{
		slug: "cashback",
		term: "Cashback",
		category: "CLIENTES",
		seoTitle: "O que é cashback: como funciona para o cliente e para a loja",
		metaDescription:
			"Cashback é a parte do valor da compra que volta para o cliente como crédito. Veja como funciona, a diferença para desconto e como uma loja física usa cashback para fidelizar.",
		question: "O que é cashback?",
		definition:
			"Cashback, ou dinheiro de volta, é a parte do valor de uma compra que retorna ao cliente como crédito. Em uma loja física, esse crédito tem validade e só pode ser usado na próxima compra na mesma loja — por isso o cashback funciona como programa de fidelidade: dá ao cliente um motivo concreto e com prazo para voltar.",
		example: {
			lines: ["Loja hipotética com cashback de 5% e validade de 30 dias", "Cliente compra R$ 80"],
			result: "Ganha R$ 4,00 de crédito para usar em até 30 dias na mesma loja",
		},
		sections: [
			{
				heading: "Cashback ou desconto?",
				body:
					"O desconto reduz o preço da compra de hoje e acaba ali. O cashback mantém o preço cheio hoje e devolve parte do valor como crédito para a próxima compra. Para a loja, isso significa que o benefício só tem custo quando o cliente volta — e o crédito que vence sem uso não custa nada.",
			},
			{
				heading: "Como controlar o custo do cashback",
				body:
					"Três regras definem quanto o programa custa: o percentual de cashback, a validade do crédito e o limite de resgate por compra. Com validade curta e um limite de, por exemplo, 30% do valor da próxima compra, o cashback traz o cliente de volta sem virar desconto permanente.",
			},
		],
		inRecompra: {
			text:
				"No RecompraCRM, o cashback é creditado a cada venda identificada pelo telefone, com validade e limite de resgate, e o cliente é avisado no WhatsApp quando ganha crédito e quando ele está para vencer.",
			href: "/solutions/programa-de-fidelidade",
			label: "Montar um programa de fidelidade",
		},
		related: ["fidelizacao", "margem-bruta", "retencao-de-clientes", "ticket-medio"],
		faqs: [
			{
				question: "Como funciona o cashback em loja física?",
				answer:
					"O cliente informa o telefone na compra, ganha um percentual do valor como crédito e usa esse crédito como desconto em uma próxima compra na mesma loja, dentro da validade e do limite de resgate definidos pela loja.",
			},
			{
				question: "Quanto de cashback uma loja deve oferecer?",
				answer:
					"Depende da margem e do ticket: lojas costumam começar entre 3% e 12%. A calculadora de cashback do RecompraCRM mostra quanto cada percentual custa por venda antes de você decidir.",
			},
		],
		keywords: ["o que é cashback", "cashback significado", "como funciona cashback", "cashback loja"],
	},
	{
		slug: "curva-abc",
		term: "Curva ABC",
		category: "ESTOQUE_E_ERP",
		seoTitle: "O que é curva ABC: como fazer a classificação de produtos e estoque",
		metaDescription:
			"Curva ABC é a classificação dos produtos pela importância no faturamento: A, B e C. Veja como montar, os percentuais usuais e como usar no estoque da loja.",
		question: "O que é curva ABC?",
		definition:
			"Curva ABC é a classificação dos produtos pela participação no faturamento. Os itens A são os poucos que trazem a maior parte da receita, os B têm importância intermediária e os C são muitos itens que vendem pouco. Ela segue o princípio de Pareto e ajuda a decidir onde não pode faltar estoque.",
		formula: {
			expression: "Ordene os produtos pelo faturamento e some a participação acumulada: A até ~80%, B até ~95%, C o restante",
			parts: [
				{ name: "Classe A", meaning: "os itens que somam cerca de 80% do faturamento" },
				{ name: "Classe B", meaning: "os seguintes, até cerca de 95% acumulado" },
				{ name: "Classe C", meaning: "a cauda longa, com os últimos 5% do faturamento" },
			],
		},
		example: {
			lines: [
				"Loja hipotética com 500 produtos e R$ 200 mil de faturamento no trimestre",
				"Os 90 produtos mais vendidos somam R$ 160 mil (80%)",
				"Os 110 seguintes somam R$ 30 mil (até 95%)",
			],
			result: "90 itens A, 110 itens B e 300 itens C",
		},
		sections: [
			{
				heading: "Como usar a curva ABC na loja",
				body:
					"Itens A não podem faltar: merecem compra frequente, estoque de segurança e posição de destaque. Itens B pedem acompanhamento regular. Itens C são candidatos a estoque menor, compra sob demanda ou saída do mix. Os percentuais 80/15/5 são uma convenção, não uma regra; o importante é a ordem.",
			},
			{
				heading: "Curva ABC de produtos e de clientes",
				body:
					'A mesma lógica vale para clientes: poucos clientes respondem por boa parte do faturamento. É por isso que a análise RFM separa os campeões dos clientes ocasionais — perder um cliente "A" pesa muito mais do que perder vários "C".',
			},
		],
		inRecompra: {
			text:
				"No ERP do RecompraCRM, cada produto do catálogo mostra a posição na curva ABC e dá para filtrar o catálogo por classe, junto com o saldo e o histórico de estoque.",
			href: "/erp",
			label: "Conhecer o ERP",
		},
		related: ["giro-de-estoque", "margem-bruta", "matriz-rfm", "markup"],
		faqs: [
			{
				question: "Quais são os percentuais da curva ABC?",
				answer:
					"A convenção mais usada é: classe A até cerca de 80% do faturamento acumulado, classe B até cerca de 95% e classe C o restante. Algumas lojas usam 70/20/10; o que importa é aplicar o mesmo critério sempre.",
			},
			{
				question: "De quanto em quanto tempo refazer a curva ABC?",
				answer:
					"Pelo menos a cada trimestre, e sempre que houver mudança de estação ou de mix. Um sistema que recalcula a classe automaticamente evita trabalhar com uma curva desatualizada.",
			},
		],
		keywords: ["curva abc", "o que é curva abc", "curva abc estoque", "classificação abc"],
	},
	{
		slug: "cac",
		term: "CAC",
		fullName: "Custo de Aquisição de Clientes",
		category: "CLIENTES",
		seoTitle: "O que é CAC: custo de aquisição de clientes, fórmula e exemplo",
		metaDescription:
			"CAC é quanto a loja gasta, em média, para conquistar um cliente novo. Veja a fórmula, um exemplo e por que comparar o CAC com o LTV.",
		question: "O que é CAC?",
		definition:
			"CAC (Custo de Aquisição de Clientes) é quanto a empresa gasta, em média, para conquistar cada cliente novo. Ele soma o investimento em marketing e vendas de um período e divide pelo número de clientes novos que chegaram. Sozinho diz pouco: o CAC faz sentido quando comparado ao que esse cliente vai gastar ao longo do tempo (LTV).",
		formula: {
			expression: "CAC = (investimento em marketing + vendas no período) ÷ clientes novos no período",
			parts: [
				{ name: "Investimento", meaning: "anúncios, panfletos, comissões, brindes de inauguração e similares" },
				{ name: "Clientes novos", meaning: "quem fez a primeira compra no período" },
			],
		},
		example: {
			lines: ["Loja hipotética que investiu R$ 3.000 em anúncios e panfletos no mês", "150 clientes fizeram a primeira compra no período"],
			result: "CAC = R$ 3.000 ÷ 150 = R$ 20 por cliente novo",
		},
		sections: [
			{
				heading: "CAC e LTV juntos",
				body:
					"Se um cliente custa R$ 20 para chegar e compra uma única vez R$ 40, com margem de 40%, a conta não fecha. Se ele volta e compra várias vezes ao longo do ano, o mesmo CAC vira um ótimo investimento. Por isso a pergunta certa não é só quanto custa trazer o cliente, mas quantas vezes ele volta.",
			},
			{
				heading: "Como melhorar a relação CAC e LTV",
				body:
					"Há dois caminhos: gastar menos para trazer cada cliente ou fazer cada cliente valer mais. No varejo físico, o segundo costuma ser mais barato: um programa de fidelidade e lembretes de recompra aumentam o número de compras do cliente que a loja já pagou para conquistar.",
			},
		],
		related: ["ltv", "retencao-de-clientes", "churn", "fidelizacao"],
		faqs: [
			{
				question: "O que entra no cálculo do CAC?",
				answer:
					"Tudo o que foi gasto para atrair clientes novos no período: mídia paga, materiais impressos, comissões de vendas ligadas a novos clientes e ações de captação. Gastos com quem já é cliente não entram.",
			},
			{
				question: "Qual é a relação ideal entre LTV e CAC?",
				answer:
					"Uma referência comum é o LTV valer pelo menos três vezes o CAC. Mais importante que o número exato é acompanhar se a relação melhora quando a loja investe em recompra.",
			},
		],
		keywords: ["o que é cac", "cac custo de aquisição", "como calcular cac", "cac e ltv"],
	},
	{
		slug: "pdv",
		term: "PDV",
		fullName: "Ponto de Venda",
		category: "ESTOQUE_E_ERP",
		seoTitle: "O que é PDV: ponto de venda, frente de caixa e sistema PDV",
		metaDescription:
			"PDV é o ponto de venda: o lugar e o sistema onde a venda é registrada e paga. Veja o que é, o que um sistema PDV faz e como escolher um para a loja.",
		question: "O que é PDV?",
		definition:
			"PDV (ponto de venda) é o lugar onde a venda acontece e, por extensão, o sistema da frente de caixa: onde o atendente lança os produtos, recebe o pagamento e emite a nota fiscal. Um sistema PDV também baixa o estoque e registra a venda no financeiro, para que a loja não digite a mesma informação duas vezes.",
		sections: [
			{
				heading: "O que um sistema PDV faz",
				body:
					"O básico é lançar itens (por busca, leitor de código de barras ou balança), receber em uma ou mais formas de pagamento e emitir a NFC-e. Um bom PDV também controla o caixa de cada operador — abertura, sangria e fechamento — e limita descontos por usuário, para a loja saber exatamente o que entrou e quem autorizou o quê.",
			},
			{
				heading: "PDV, ponto de venda e merchandising",
				body:
					'No marketing, "material de PDV" é a comunicação visual perto do caixa: cartazes, displays e expositores. No sistema, PDV é a frente de caixa. Os dois sentidos se encontram no mesmo lugar: é no ponto de venda que o cliente decide e paga, e é ali que um programa de fidelidade precisa funcionar sem atrasar a fila.',
			},
		],
		inRecompra: {
			text:
				"O PDV do RecompraCRM roda no navegador, com leitor de código de barras, balança, maquininha Stone, NFC-e e fechamento de caixa com conferência cega — e cada venda já credita o cashback do cliente.",
			href: "/erp/pdv",
			label: "Conhecer o PDV",
		},
		related: ["nfc-e", "ticket-medio", "giro-de-estoque", "cashback"],
		faqs: [
			{
				question: "PDV e frente de caixa são a mesma coisa?",
				answer: "Na prática, sim: frente de caixa é o nome comum para o sistema PDV usado no balcão, onde a venda é registrada, paga e faturada.",
			},
			{
				question: "Preciso de computador para ter um PDV?",
				answer:
					"Não necessariamente. Sistemas PDV que rodam no navegador funcionam em computador, tablet ou celular; periféricos como leitor de código de barras e balança costumam pedir um computador no caixa.",
			},
		],
		keywords: ["o que é pdv", "pdv significado", "sistema pdv", "frente de caixa"],
	},
	{
		slug: "nps",
		term: "NPS",
		fullName: "Net Promoter Score",
		category: "CLIENTES",
		seoTitle: "O que é NPS: como calcular o Net Promoter Score com exemplo",
		metaDescription:
			"NPS mede a chance de o cliente indicar a loja, de 0 a 10. Veja como calcular promotores, neutros e detratores, com exemplo, e como usar o NPS no varejo.",
		question: "O que é NPS?",
		definition:
			"NPS (Net Promoter Score) é um indicador de lealdade que pergunta ao cliente, de 0 a 10, o quanto ele recomendaria a empresa a um amigo. Quem dá 9 ou 10 é promotor, 7 ou 8 é neutro e de 0 a 6 é detrator. O NPS é a porcentagem de promotores menos a de detratores, e vai de −100 a 100.",
		formula: {
			expression: "NPS = % de promotores (notas 9–10) − % de detratores (notas 0–6)",
			parts: [
				{ name: "Promotores", meaning: "notas 9 e 10" },
				{ name: "Neutros", meaning: "notas 7 e 8 — contam no total, mas não entram na subtração" },
				{ name: "Detratores", meaning: "notas de 0 a 6" },
			],
		},
		example: {
			lines: ["Loja hipotética com 200 respostas", "120 promotores (60%), 50 neutros e 30 detratores (15%)"],
			result: "NPS = 60 − 15 = 45",
		},
		sections: [
			{
				heading: "Como fazer a pesquisa de NPS na loja",
				body:
					"A pergunta precisa chegar logo depois da compra, enquanto a experiência está fresca, e ser fácil de responder. No varejo físico, o WhatsApp costuma funcionar melhor que e-mail ou formulário impresso. Vale perguntar também o motivo da nota: é ele que mostra o que corrigir.",
			},
			{
				heading: "O que fazer com o resultado",
				body:
					"Detratores pedem contato rápido para entender o problema. Neutros são os mais fáceis de perder para o concorrente. Promotores são candidatos a indicar a loja — e a receber um incentivo para isso. O número em si importa menos que a tendência e as ações tomadas a partir dele.",
			},
		],
		inRecompra: {
			text:
				"No RecompraCRM, é possível enviar uma pesquisa pelo WhatsApp depois da compra e guardar a resposta no cadastro do cliente, para usar depois na segmentação das campanhas.",
			href: "/features/campanhas-whatsapp",
			label: "Ver as campanhas no WhatsApp",
		},
		related: ["fidelizacao", "retencao-de-clientes", "churn", "crm"],
		faqs: [
			{
				question: "Qual é um NPS bom?",
				answer:
					"Um NPS acima de zero significa mais promotores que detratores. Referências de mercado costumam tratar valores acima de 50 como muito bons, mas a comparação mais útil é com o seu próprio NPS ao longo do tempo.",
			},
			{
				question: "De quanto em quanto tempo medir o NPS?",
				answer:
					"Uma pesquisa contínua, logo após a compra, é melhor que uma rodada anual: mostra problemas enquanto ainda dá para resolver e acompanha o efeito das mudanças.",
			},
		],
		keywords: ["o que é nps", "nps net promoter score", "como calcular nps", "pesquisa nps"],
	},
	{
		slug: "ticket-medio",
		term: "Ticket médio",
		category: "VENDAS_E_MARGEM",
		seoTitle: "Ticket médio: o que é, como calcular e como aumentar na loja",
		metaDescription:
			"Ticket médio é o valor médio de cada venda. Veja como calcular, um exemplo de loja e formas de aumentar o ticket médio sem dar desconto.",
		question: "O que é ticket médio?",
		definition:
			"Ticket médio é o valor médio de cada venda: o faturamento de um período dividido pelo número de vendas. Ele mostra quanto cada cliente gasta por visita e, junto com a frequência de compra, explica o faturamento da loja. Aumentar o ticket médio é vender mais para quem já está no caixa.",
		formula: {
			expression: "Ticket médio = faturamento do período ÷ número de vendas do período",
			parts: [
				{ name: "Faturamento", meaning: "o total vendido, já com descontos" },
				{ name: "Número de vendas", meaning: "a quantidade de cupons ou vendas fechadas, não de itens" },
			],
		},
		example: {
			lines: ["Loja hipotética com R$ 48.000 de faturamento no mês", "1.200 vendas fechadas no mesmo mês"],
			result: "Ticket médio = R$ 48.000 ÷ 1.200 = R$ 40",
		},
		sections: [
			{
				heading: "Como aumentar o ticket médio",
				body:
					"As formas mais comuns são combos e kits, sugestão de adicionais e complementos no caixa, produtos de impulso perto do balcão e benefícios a partir de um valor mínimo de compra. Um cashback que só vale para compras acima de um valor também empurra o ticket para cima sem baixar o preço.",
			},
			{
				heading: "Ticket médio, frequência e faturamento",
				body:
					"Faturamento é número de clientes × frequência × ticket médio. Uma promoção que aumenta o ticket mas espanta clientes pode até baixar o faturamento. Por isso o ticket médio deve ser acompanhado junto com a frequência de compra e a quantidade de clientes ativos.",
			},
		],
		inRecompra: {
			text:
				"O painel do RecompraCRM mostra o ticket médio da loja e por vendedor, comparado com o período anterior, e o programa de cashback pode ter um valor mínimo de compra para gerar crédito.",
			href: "/features/business-intelligence",
			label: "Ver os relatórios",
		},
		related: ["ltv", "margem-bruta", "markup", "cashback"],
		faqs: [
			{
				question: "Ticket médio considera desconto?",
				answer: "Sim. O cálculo usa o faturamento real, depois de descontos, dividido pelo número de vendas.",
			},
			{
				question: "Qual é a diferença entre ticket médio e LTV?",
				answer:
					"O ticket médio é quanto o cliente gasta por compra. O LTV é quanto ele gasta ao longo de todo o relacionamento com a loja: ticket médio × número de compras.",
			},
		],
		keywords: ["ticket médio", "o que é ticket médio", "como calcular ticket médio", "como aumentar ticket médio"],
	},
	{
		slug: "ltv",
		term: "LTV",
		fullName: "Lifetime Value",
		category: "CLIENTES",
		seoTitle: "O que é LTV (lifetime value): como calcular o valor do cliente",
		metaDescription:
			"LTV é o valor que um cliente gera para a loja ao longo de todo o relacionamento. Veja a fórmula para o varejo, um exemplo e como aumentar o LTV.",
		question: "O que é LTV?",
		definition:
			"LTV (Lifetime Value, ou valor do tempo de vida do cliente) é quanto um cliente gera para a loja durante todo o relacionamento. No varejo, é o ticket médio multiplicado pelo número de compras ao longo do tempo. Ele mostra quanto vale a pena investir para conquistar e manter cada cliente.",
		formula: {
			expression: "LTV = ticket médio × compras por ano × anos de relacionamento (× margem, para o LTV de lucro)",
			parts: [
				{ name: "Ticket médio", meaning: "o valor médio de cada compra do cliente" },
				{ name: "Compras por ano", meaning: "a frequência média de compra" },
				{ name: "Anos de relacionamento", meaning: "por quanto tempo, em média, o cliente continua comprando" },
			],
		},
		example: {
			lines: ["Cliente hipotético com ticket médio de R$ 40", "Compra 2 vezes por mês (24 por ano), por 3 anos", "Margem bruta de 40%"],
			result: "LTV de receita = R$ 2.880 · LTV de margem = R$ 1.152",
		},
		sections: [
			{
				heading: "Por que o LTV importa",
				body:
					"O LTV mostra que um cliente não vale a compra de hoje, mas a soma das próximas. Um cliente que gasta R$ 40 por visita e volta duas vezes por mês vale milhares de reais em poucos anos. Perder esse cliente para o concorrente custa muito mais do que o desconto que talvez o tivesse mantido.",
			},
			{
				heading: "Como aumentar o LTV",
				body:
					"Há três alavancas: o ticket médio, a frequência e o tempo de relacionamento. No varejo físico, as duas últimas costumam ser as mais fáceis de mover: um motivo para voltar antes do ciclo normal e um contato quando o cliente começa a sumir mantêm o cliente comprando por mais tempo.",
			},
		],
		inRecompra: {
			text:
				"No RecompraCRM, o perfil de cada cliente mostra o total comprado, o número de compras e o tempo de relacionamento, e a análise RFM separa quem tem o maior valor para a loja.",
			href: "/blog/quanto-vale-um-cliente-que-volta",
			label: "Ler: quanto vale um cliente que volta",
		},
		related: ["cac", "ticket-medio", "churn", "matriz-rfm"],
		faqs: [
			{
				question: "LTV é receita ou lucro?",
				answer:
					"Os dois existem. O LTV de receita soma o que o cliente gasta; o LTV de margem multiplica isso pela margem bruta e é o melhor para comparar com o custo de aquisição (CAC).",
			},
			{
				question: "Como calcular o LTV sem muitos dados?",
				answer:
					"Use o ticket médio da loja, a frequência média de compra dos clientes identificados e uma estimativa conservadora de quanto tempo eles continuam comprando. Mesmo uma conta aproximada já mostra quanto vale reter um cliente.",
			},
		],
		keywords: ["o que é ltv", "lifetime value", "como calcular ltv", "valor do cliente"],
	},
	{
		slug: "nfc-e",
		term: "NFC-e",
		fullName: "Nota Fiscal de Consumidor Eletrônica",
		category: "ESTOQUE_E_ERP",
		seoTitle: "O que é NFC-e: nota fiscal de consumidor eletrônica e como emitir",
		metaDescription:
			"NFC-e é a nota fiscal eletrônica das vendas no varejo para o consumidor final. Veja o que é, a diferença para NF-e e o que a loja precisa para emitir.",
		question: "O que é NFC-e?",
		definition:
			"NFC-e (Nota Fiscal de Consumidor Eletrônica, modelo 65) é o documento fiscal das vendas presenciais ao consumidor final no varejo. Ela é emitida pelo sistema da loja, autorizada pela Secretaria da Fazenda do estado e entregue ao cliente como DANFE impresso ou por QR Code. Substituiu o antigo cupom fiscal na maioria dos estados.",
		sections: [
			{
				heading: "NFC-e ou NF-e?",
				body:
					"A NFC-e (modelo 65) é para a venda no balcão ao consumidor final. A NF-e (modelo 55) é usada em vendas para empresas, vendas com transporte da mercadoria e outras operações que exigem destinatário identificado. Uma loja que vende para consumidor e também para CNPJ costuma precisar das duas.",
			},
			{
				heading: "O que é preciso para emitir NFC-e",
				body:
					"Inscrição estadual ativa, credenciamento para NFC-e na Secretaria da Fazenda do estado, certificado digital (geralmente A1), o código de segurança do contribuinte (CSC) e um sistema emissor. As regras de cada estado variam; o contador costuma cuidar do credenciamento e da configuração tributária dos produtos.",
			},
		],
		inRecompra: {
			text:
				"O ERP do RecompraCRM emite NFC-e e NF-e a partir da venda, com certificado A1, ambiente de homologação para testar antes e uma fila de notas rejeitadas com o motivo e o atalho para corrigir.",
			href: "/erp#fiscal",
			label: "Ver o módulo fiscal",
		},
		related: ["pdv", "giro-de-estoque", "curva-abc", "ticket-medio"],
		faqs: [
			{
				question: "NFC-e é obrigatória?",
				answer:
					"Para o varejo que vende ao consumidor final, a NFC-e é o documento fiscal exigido na maior parte dos estados. As regras e prazos variam por estado, então confirme com o seu contador.",
			},
			{
				question: "Precisa imprimir a NFC-e?",
				answer:
					"Depende do estado e da preferência do cliente: muitos estados aceitam entregar o DANFE da NFC-e de forma digital, por QR Code, e-mail ou mensagem, sem papel.",
			},
		],
		keywords: ["o que é nfc-e", "nfc-e significado", "nota fiscal de consumidor eletrônica", "como emitir nfc-e"],
	},
	{
		slug: "margem-bruta",
		term: "Margem bruta",
		category: "VENDAS_E_MARGEM",
		seoTitle: "Margem bruta: o que é, como calcular e diferença para margem líquida",
		metaDescription:
			"Margem bruta é quanto sobra da venda depois do custo da mercadoria. Veja a fórmula, um exemplo de loja e a diferença para margem líquida e markup.",
		question: "O que é margem bruta?",
		definition:
			"Margem bruta é a porcentagem do preço de venda que sobra depois de pagar o custo da mercadoria vendida (CMV). É com essa sobra que a loja paga impostos, aluguel, salários e ainda tem lucro. Uma margem bruta de 40% significa que, de cada R$ 100 vendidos, R$ 40 ficam para cobrir o resto.",
		formula: {
			expression: "Margem bruta (%) = (receita − custo da mercadoria vendida) ÷ receita × 100",
			parts: [
				{ name: "Receita", meaning: "o valor vendido, já com descontos" },
				{ name: "Custo da mercadoria vendida (CMV)", meaning: "quanto a loja pagou pelos produtos que saíram" },
			],
		},
		example: {
			lines: ["Venda hipotética de R$ 100", "Custo dos produtos vendidos: R$ 60"],
			result: "Margem bruta = (100 − 60) ÷ 100 × 100 = 40%",
		},
		sections: [
			{
				heading: "Margem bruta, margem líquida e markup",
				body:
					"A margem bruta desconta só o custo da mercadoria. A margem líquida desconta também impostos e todas as despesas, e é o lucro de fato. O markup é calculado sobre o custo, não sobre o preço: markup de 2,5 equivale a 60% de margem bruta.",
			},
			{
				heading: "Por que a margem define o seu programa de fidelidade",
				body:
					"Todo benefício — desconto, brinde ou cashback — sai da margem bruta. Antes de escolher o percentual de cashback, a loja precisa saber quanto da margem está disposta a reinvestir para trazer o cliente de volta. A conta muda bastante entre uma categoria com 25% e outra com 60% de margem.",
			},
		],
		inRecompra: {
			text:
				"O painel do RecompraCRM mostra a margem bruta da loja junto com o faturamento e o ticket médio, e a calculadora de cashback mostra quanto da margem cada percentual consome.",
			href: "/tools/cashback-calculator",
			label: "Abrir a calculadora de cashback",
		},
		related: ["markup", "ticket-medio", "cashback", "curva-abc"],
		faqs: [
			{
				question: "Qual é uma boa margem bruta para loja?",
				answer:
					"Varia muito por segmento: alimentação e mercado trabalham com margens menores e giro alto, moda e acessórios com margens maiores e giro menor. Compare com a sua própria margem por categoria e acompanhe a tendência.",
			},
			{
				question: "Margem bruta inclui impostos?",
				answer: "Na conta mais simples, não: ela desconta só o custo da mercadoria. Impostos sobre a venda e despesas entram na margem líquida.",
			},
		],
		keywords: ["margem bruta", "o que é margem bruta", "como calcular margem bruta", "margem bruta e líquida"],
	},
	{
		slug: "giro-de-estoque",
		term: "Giro de estoque",
		category: "ESTOQUE_E_ERP",
		seoTitle: "Giro de estoque: o que é, como calcular e qual o ideal",
		metaDescription:
			"Giro de estoque mostra quantas vezes o estoque se renova em um período. Veja a fórmula, um exemplo e como transformar o giro em dias de cobertura.",
		question: "O que é giro de estoque?",
		definition:
			"Giro de estoque é quantas vezes o estoque da loja se renova em um período: o custo do que foi vendido dividido pelo valor médio do estoque. Um giro alto significa que o produto sai rápido e o dinheiro não fica parado na prateleira; um giro baixo indica excesso de compra ou produto que não vende.",
		formula: {
			expression: "Giro de estoque = custo da mercadoria vendida no período ÷ estoque médio (a custo)",
			parts: [
				{ name: "Custo da mercadoria vendida", meaning: "o custo de tudo o que saiu no período" },
				{ name: "Estoque médio", meaning: "a média do valor do estoque, a preço de custo, no período" },
			],
		},
		example: {
			lines: ["Loja hipotética com R$ 240 mil de custo de mercadoria vendida no ano", "Estoque médio de R$ 40 mil a preço de custo"],
			result: "Giro = 6 vezes por ano, ou cerca de 60 dias de cobertura",
		},
		sections: [
			{
				heading: "Giro e dias de cobertura",
				body:
					"O giro também pode ser lido em dias: 365 dividido pelo giro anual é por quantos dias, em média, o estoque dura. Com giro 6, são cerca de 60 dias. Para comprar, essa visão é a mais útil: mostra quais produtos vão acabar antes da próxima entrega e quais estão com estoque para meses.",
			},
			{
				heading: "Como melhorar o giro",
				body:
					"Comprar com base no consumo real, e não no feeling, reduzir a cauda de itens C que quase não vendem e acompanhar a validade de perecíveis são os passos mais comuns. Do lado das vendas, trazer o cliente de volta com mais frequência também acelera o giro sem precisar de liquidação.",
			},
		],
		inRecompra: {
			text:
				"O relatório de estoque do ERP do RecompraCRM mostra o giro e a cobertura de cada produto, calculados a partir do consumo real, junto com lotes e validade.",
			href: "/erp#compras",
			label: "Ver compras e estoque",
		},
		related: ["curva-abc", "margem-bruta", "pdv", "nfc-e"],
		faqs: [
			{
				question: "Qual é o giro de estoque ideal?",
				answer:
					"Não há um número único: perecíveis e mercado precisam de giro alto, enquanto móveis e eletrônicos convivem com giro menor. O ideal é comparar o giro de cada categoria com o seu histórico e com o prazo de pagamento aos fornecedores.",
			},
			{
				question: "Giro de estoque é calculado a custo ou a preço de venda?",
				answer:
					"O mais correto é usar o custo nos dois lados da conta: custo da mercadoria vendida dividido pelo estoque médio a custo. Misturar custo e preço de venda distorce o resultado.",
			},
		],
		keywords: ["giro de estoque", "o que é giro de estoque", "como calcular giro de estoque", "cobertura de estoque"],
	},
	{
		slug: "fidelizacao",
		term: "Fidelização de clientes",
		category: "CLIENTES",
		seoTitle: "O que é fidelização de clientes e como fidelizar na loja física",
		metaDescription:
			"Fidelização é fazer o cliente voltar a comprar na mesma loja por escolha. Veja o que é, a diferença para satisfação e as formas de fidelizar clientes no varejo.",
		question: "O que é fidelização de clientes?",
		definition:
			"Fidelização de clientes é o conjunto de ações que faz o cliente voltar a comprar na mesma loja por escolha, mesmo tendo outras opções. Vai além da satisfação: um cliente satisfeito pode nunca mais voltar, enquanto um cliente fiel tem um motivo concreto para preferir a loja — atendimento, conveniência ou um benefício como cashback.",
		sections: [
			{
				heading: "Satisfação não é fidelidade",
				body:
					"Um cliente pode gostar da compra e, na próxima vez, entrar no concorrente porque estava mais perto ou porque lembrou dele primeiro. Fidelizar é criar o motivo para a próxima visita: um crédito que só vale na loja, um contato no momento certo, um tratamento que o reconhece pelo nome.",
			},
			{
				heading: "Como fidelizar clientes no varejo",
				body:
					"Os pilares são identificar quem compra (normalmente pelo telefone), dar um benefício com prazo para voltar, falar com o cliente pelos canais que ele usa — no Brasil, o WhatsApp — e acompanhar quem está esfriando para agir antes de ele sumir. Programa de fidelidade sem esse acompanhamento vira só desconto.",
			},
		],
		inRecompra: {
			text:
				"O RecompraCRM junta as quatro frentes: cashback com validade no balcão, identificação pelo telefone, campanhas automáticas no WhatsApp e a análise RFM que mostra quem está esfriando.",
			href: "/solutions/programa-de-fidelidade",
			label: "Ver como montar um programa de fidelidade",
		},
		related: ["cashback", "retencao-de-clientes", "churn", "crm"],
		faqs: [
			{
				question: "Qual é a diferença entre fidelização e retenção?",
				answer:
					"Retenção é o resultado medido: quantos clientes continuaram comprando. Fidelização é o trabalho para chegar lá: as ações que dão ao cliente um motivo para preferir a loja.",
			},
			{
				question: "Programa de fidelidade funciona para loja pequena?",
				answer:
					"Funciona, desde que seja simples para o cliente e para a equipe: identificação pelo telefone, um benefício fácil de entender e um lembrete quando ele está para vencer.",
			},
		],
		keywords: ["o que é fidelização", "fidelização de clientes", "como fidelizar clientes", "fidelizar clientes varejo"],
	},
	{
		slug: "matriz-rfm",
		term: "Matriz RFM",
		category: "CLIENTES",
		seoTitle: "O que é matriz RFM: recência, frequência e valor na segmentação",
		metaDescription:
			"Matriz RFM classifica clientes por recência, frequência e valor de compra. Veja como funciona a pontuação, os segmentos e como usar a análise RFM no varejo.",
		question: "O que é matriz RFM?",
		definition:
			"Matriz RFM é uma forma de segmentar clientes por três medidas do histórico de compras: Recência (há quanto tempo comprou), Frequência (quantas vezes comprou) e Valor (quanto gastou). Cada medida recebe uma nota, e a combinação das notas agrupa os clientes em segmentos como campeões, fiéis, em risco e perdidos.",
		formula: {
			expression: "Nota de 1 a 5 para Recência, Frequência e Valor → de 555 (melhor) a 111 (pior), 125 combinações",
			parts: [
				{ name: "Recência", meaning: "há quantos dias foi a última compra — quanto mais recente, maior a nota" },
				{ name: "Frequência", meaning: "quantas compras no período analisado" },
				{ name: "Valor", meaning: "quanto o cliente gastou no período" },
			],
		},
		example: {
			lines: [
				"Cliente hipotético que comprou há 5 dias, 20 vezes no ano, com gasto alto: 5-5-5",
				"Cliente hipotético que não compra há 150 dias, mas comprava toda semana: 1-5-4",
			],
			result: "O primeiro é campeão; o segundo é um bom cliente em risco, que merece contato agora",
		},
		sections: [
			{
				heading: "Para que serve a análise RFM",
				body:
					"Ela troca a promoção para todo mundo por ações para cada grupo: agradecer e premiar os campeões, trazer de volta os bons clientes que estão esfriando, e não gastar mensagem com quem comprou uma vez há muito tempo. É a base de campanhas de recompra que fazem sentido para o cliente.",
			},
			{
				heading: "Como montar a matriz RFM",
				body:
					"Separe o histórico de vendas de um período (12 meses é comum), calcule as três medidas por cliente e divida cada uma em cinco faixas. Feito em planilha, o trabalho precisa ser refeito todo mês; em um CRM, a classificação acompanha cada venda.",
			},
		],
		inRecompra: {
			text:
				"O RecompraCRM classifica a base automaticamente em 11 segmentos RFM, com os últimos 12 meses de vendas, e permite disparar campanhas quando um cliente entra ou permanece em um segmento.",
			href: "/blog/segmentacao-rfm-varejo-guia-pratico",
			label: "Ler o guia prático de RFM",
		},
		related: ["churn", "ltv", "retencao-de-clientes", "crm"],
		faqs: [
			{
				question: "O que significa RFM?",
				answer:
					"RFM significa Recência, Frequência e Valor (do inglês Monetary): as três medidas do histórico de compras usadas para segmentar os clientes.",
			},
			{
				question: "Quais são os segmentos da matriz RFM?",
				answer:
					"Os nomes variam, mas os mais comuns são campeões, clientes fiéis, potenciais fiéis, novos clientes, precisam de atenção, em risco, hibernando e perdidos. O RecompraCRM usa 11 segmentos.",
			},
		],
		keywords: ["matriz rfm", "o que é matriz rfm", "análise rfm", "segmentação rfm"],
	},
	{
		slug: "retencao-de-clientes",
		term: "Retenção de clientes",
		category: "CLIENTES",
		seoTitle: "Retenção de clientes: o que é, como calcular a taxa e como melhorar",
		metaDescription:
			"Retenção de clientes é a capacidade de manter os clientes comprando. Veja a fórmula da taxa de retenção, um exemplo de loja e ações para reter mais clientes.",
		question: "O que é retenção de clientes?",
		definition:
			"Retenção de clientes é a capacidade da loja de manter os clientes que já conquistou comprando ao longo do tempo. A taxa de retenção mede, em um período, quantos dos clientes do início continuaram ativos, sem contar os que chegaram depois. É o oposto do churn.",
		formula: {
			expression: "Taxa de retenção (%) = (clientes ativos no fim − clientes novos no período) ÷ clientes ativos no início × 100",
			parts: [
				{ name: "Clientes ativos no fim", meaning: "quem estava dentro do prazo de compra no fim do período" },
				{ name: "Clientes novos", meaning: "quem fez a primeira compra durante o período" },
				{ name: "Clientes ativos no início", meaning: "a base ativa no começo do período" },
			],
		},
		example: {
			lines: ["Loja hipotética com 1.000 clientes ativos no início do trimestre", "1.050 ativos no fim, dos quais 200 são novos"],
			result: "Retenção = (1.050 − 200) ÷ 1.000 × 100 = 85%",
		},
		sections: [
			{
				heading: "Por que retenção pesa no faturamento",
				body:
					"Cada cliente retido é um cliente que a loja não precisa pagar para conquistar de novo. Quando a retenção cai, o faturamento só se mantém com mais investimento em atração — e o custo de aquisição sobe. Por isso a retenção é um dos indicadores mais diretos da saúde do negócio.",
			},
			{
				heading: "Como aumentar a retenção",
				body:
					"Medir primeiro: saber quem são os clientes ativos e quem está passando do ciclo normal. Depois, dar um motivo para voltar (um benefício com prazo), lembrar o cliente no canal que ele usa e corrigir o que faz o cliente sair, que muitas vezes aparece em uma pesquisa simples pós-compra.",
			},
		],
		inRecompra: {
			text:
				"O RecompraCRM mostra quantos clientes estão ativos, em risco e perdidos pela análise RFM, e as campanhas automáticas no WhatsApp agem sobre quem está para sair, com o resultado medido em vendas.",
			href: "/features/campanhas-whatsapp",
			label: "Ver as campanhas de recompra",
		},
		related: ["churn", "fidelizacao", "ltv", "cac"],
		faqs: [
			{
				question: "Qual é a diferença entre retenção e fidelização?",
				answer: "Retenção é o resultado (quantos clientes ficaram); fidelização é o conjunto de ações que leva a esse resultado.",
			},
			{
				question: "Como calcular a taxa de retenção sem contar clientes novos?",
				answer:
					"Subtraia os clientes novos do total de ativos no fim do período e divida pelo total de ativos no início. Assim a conta mostra só quem já era cliente e continuou comprando.",
			},
		],
		keywords: ["retenção de clientes", "taxa de retenção", "como calcular taxa de retenção", "o que é retenção de clientes"],
	},
];

export function getGlossaryTerm(slug: string) {
	return GLOSSARY_TERMS.find((term) => term.slug === slug);
}
