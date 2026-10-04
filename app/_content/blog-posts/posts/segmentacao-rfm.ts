import type { BlogPost } from "../types";

export const segmentacaoRfmPost: BlogPost = {
	slug: "segmentacao-rfm-varejo-guia-pratico",
	title: "Segmentação RFM na prática: como descobrir quem acionar primeiro",
	headline: "Recência, frequência e valor: o método do marketing direto que cabe numa planilha, com os ajustes de que a loja pequena precisa.",
	description:
		"Guia prático de segmentação RFM para o varejo: o que é recência, frequência e valor monetário, como dar notas de 1 a 5 numa planilha, o ajuste para lojas com muitos clientes de compra única e que ação tomar com cada segmento.",
	category: "guias",
	categoryLabel: "Guias práticos",
	cover: "rfm",
	publishedAt: "2026-10-04",
	readingTime: "7 min",
	seo: {
		keywords: [
			"segmentação rfm",
			"análise rfm varejo",
			"matriz rfm",
			"como fazer rfm no excel",
			"segmentação de clientes loja",
			"recência frequência valor",
			"clientes em risco",
		],
	},
	relatedSlugs: ["quanto-vale-um-cliente-que-volta", "como-fechar-a-semana-no-varejo-e-preparar-a-proxima", "whatsapp-api-precos-outubro-2026-varejo"],
	sections: [
		{
			type: "text",
			heading: "Um método dos catálogos que funciona no balcão",
			body:
				"RFM nasceu no marketing direto americano, quando empresas de catálogo precisavam decidir para quem mandar a próxima edição pelo correio, que era caro. Foi popularizado por Arthur Hughes no livro Strategic Database Marketing (1994) e estudado academicamente por Bult e Wansbeek (1995).\n\nO problema da loja hoje é o mesmo, só que no WhatsApp: cada mensagem de marketing custa cerca de R$ 0,32 na API, e o cliente tem paciência limitada. RFM responde **para quem falar primeiro** usando só três dados que o seu sistema de vendas já tem.",
		},
		{
			type: "feature-highlight",
			icon: "clock",
			title: "R de recência: há quanto tempo comprou",
			body:
				"Dias desde a última compra. É, em geral, o indicador que melhor prevê quem vai responder a uma oferta: quem comprou semana passada lembra da loja, quem comprou há um ano talvez nem lembre.",
		},
		{
			type: "feature-highlight",
			icon: "calendar",
			title: "F de frequência: quantas vezes comprou",
			body:
				"Número de compras no período, normalmente 12 meses. Mostra o hábito: quem comprou 8 vezes já tem a loja na rotina, quem comprou uma vez ainda está decidindo.",
		},
		{
			type: "feature-highlight",
			icon: "coins",
			title: "M de valor monetário: quanto gastou",
			body:
				"Total gasto no período. Diz quanto está em jogo se aquele cliente sumir e ajuda a decidir quanto esforço vale a pena para recuperá-lo.",
		},
		{
			type: "timeline",
			heading: "Como montar numa planilha",
			items: [
				{
					date: "Passo 1",
					title: "Exporte as vendas dos últimos 12 meses",
					body: "Você precisa de três colunas: cliente (CPF ou telefone), data da venda e valor. Vendas sem cliente identificado ficam de fora.",
				},
				{
					date: "Passo 2",
					title: "Resuma por cliente",
					body: "Com uma tabela dinâmica, calcule para cada cliente os dias desde a última compra, o número de compras e o total gasto.",
				},
				{
					date: "Passo 3",
					title: "Dê notas de 1 a 5",
					body:
						"O método clássico divide os clientes em cinco grupos de mesmo tamanho (quintis) para cada critério. Os 20% mais recentes ganham R = 5, os 20% que mais compraram ganham F = 5, e os 20% que mais gastaram ganham M = 5.",
				},
				{
					date: "Passo 4",
					title: "Junte as notas",
					body:
						"Cada cliente vira um código de três dígitos, de 555 (o melhor cliente) a 111. São 125 combinações, muitas para agir, então agrupe em poucos segmentos, como na tabela abaixo.",
				},
				{
					date: "Passo 5",
					title: "Decida uma ação por segmento e repita todo mês",
					body: "Os clientes mudam de segmento. A fotografia de hoje vale por algumas semanas; refaça a conta todo mês.",
				},
			],
		},
		{
			type: "callout",
			tone: "atencao",
			title: "O ajuste para a loja pequena",
			body:
				"Em muitas lojas, metade dos clientes comprou uma vez só. Aí os quintis de frequência quebram: não dá para dividir em cinco grupos iguais um monte de clientes empatados com 1 compra.\n\nA nossa recomendação é usar **faixas fixas** em vez de quintis. Para frequência, por exemplo: 1 compra, 2, 3 a 4, 5 a 9, 10 ou mais. Para recência, use faixas ligadas ao seu ciclo de compra: se o cliente costuma voltar em 30 dias, até 30, 31 a 60, 61 a 90, 91 a 180, mais de 180.",
		},
		{
			type: "table",
			heading: "Do segmento à ação",
			columns: ["Segmento", "Como reconhecer", "O que fazer"],
			rows: [
				["Campeões", "Recência e frequência altas", "Acesso antecipado e reconhecimento. Não precisam de desconto: peça indicação."],
				["Novos promissores", "Compraram há pouco, uma única vez", "A meta é a 2ª compra em até 30 dias: boas-vindas e um crédito com prazo curto."],
				["Esfriando", "Frequência alta, recência caindo", "Contato pessoal antes que sumam: novidade da categoria que compram."],
				["Em risco", "Gastavam muito, sem comprar há tempo", "**Prioridade da semana.** É onde há mais valor em jogo: mensagem individual, não disparo."],
				["Perdidos", "Recência, frequência e valor baixos", "Reativação de baixo custo, uma ou duas tentativas. Não gaste demais aqui."],
			],
		},
		{
			type: "text",
			heading: "Transforme o RFM em rotina",
			body:
				"RFM só funciona se virar hábito. Um bom ritmo é revisar os segmentos no fechamento da semana, escolher um grupo para acionar e conferir na semana seguinte quem voltou.\n\nNo RecompraCRM, a matriz RFM é atualizada automaticamente a partir das vendas, sugere ações por segmento e permite disparar a campanha no WhatsApp para o grupo certo, medindo o retorno de cada ação.",
		},
	],
	faqs: [
		{
			question: "O que é segmentação RFM?",
			answer:
				"É um método que classifica os clientes por recência (há quanto tempo compraram), frequência (quantas vezes compraram) e valor monetário (quanto gastaram). Cada critério recebe uma nota de 1 a 5, e a combinação mostra quem são os melhores clientes, quem está esfriando e quem está perdido.",
		},
		{
			question: "Como fazer análise RFM no Excel?",
			answer:
				"Exporte as vendas de 12 meses com cliente, data e valor. Resuma por cliente os dias desde a última compra, o número de compras e o total gasto. Dê notas de 1 a 5 em cada critério (por quintis ou por faixas fixas), junte as três notas e agrupe os códigos em poucos segmentos com uma ação para cada.",
		},
		{
			question: "Qual segmento RFM devo acionar primeiro?",
			answer:
				"Os clientes em risco: gastavam muito e compravam com frequência, mas estão há tempo sem voltar. É onde há mais valor a recuperar, e eles merecem contato individual, não uma mensagem em massa.",
		},
		{
			question: "O RecompraCRM faz a segmentação RFM automaticamente?",
			answer:
				"Sim. O RecompraCRM monta a matriz RFM a partir do histórico de vendas, atualiza os segmentos automaticamente, sugere ações para cada grupo e permite disparar campanhas no WhatsApp para o segmento escolhido.",
		},
	],
	sources: [
		{ label: "Bult e Wansbeek — Optimal Selection for Direct Mail (Marketing Science, 1995)", url: "https://ideas.repec.org/a/inm/ormksc/v14y1995i4p378-394.html" },
		{ label: "IBM SPSS — introdução à análise RFM", url: "https://www.ibm.com/support/knowledgecenter/SSLVMB_23.0.0/spss/rfm/rfm_intro.xml.html" },
		{ label: "Meta for Developers — preços da plataforma do WhatsApp Business", url: "https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing" },
	],
	cta: {
		headline: "Quer saber quem acionar primeiro na sua loja?",
		sub: "O RecompraCRM monta a matriz RFM com as suas vendas e transforma cada segmento em uma campanha pronta para disparar.",
		buttonText: "Agendar demonstração gratuita",
		whatsappMessage: "Olá! Li o guia de segmentação RFM no blog do RecompraCRM e gostaria de agendar uma demonstração.",
	},
};
