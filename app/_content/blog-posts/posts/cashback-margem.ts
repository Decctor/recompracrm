import type { BlogPost } from "../types";

export const cashbackMargemPost: BlogPost = {
	slug: "quanto-oferecer-de-cashback-sem-perder-margem",
	title: "Cashback: quanto oferecer sem comer a sua margem",
	headline: "Não existe percentual mágico. Existe uma conta de quatro números e uma calculadora para você fazer a da sua loja.",
	description:
		"Como definir o percentual de cashback da sua loja a partir do ticket médio, da margem bruta e da taxa de uso do crédito. Com calculadora, exemplos por margem e dados da ABEMF sobre fidelidade no Brasil.",
	category: "guias",
	categoryLabel: "Guias práticos",
	cover: "cashback",
	publishedAt: "2026-10-04",
	readingTime: "7 min",
	seo: {
		keywords: [
			"quanto oferecer de cashback",
			"percentual de cashback loja",
			"cashback margem de lucro",
			"como calcular cashback",
			"programa de cashback varejo",
			"cashback loja física",
			"programa de fidelidade cashback",
		],
	},
	relatedSlugs: ["quanto-vale-um-cliente-que-volta", "segmentacao-rfm-varejo-guia-pratico", "whatsapp-api-precos-outubro-2026-varejo"],
	sections: [
		{
			type: "text",
			heading: "Todo mundo quer cashback. Ninguém publica quanto dar",
			body:
				"Programa de fidelidade já faz parte da rotina do brasileiro. Em pesquisa da ABEMF com a Valuenet, **88,3% dos consumidores disseram usar programas de fidelidade**, e o cashback foi o segundo benefício mais desejado (53,3%), atrás só do desconto.\n\nA pergunta que todo lojista faz, \"quanto devo oferecer?\", não tem resposta pronta. Procuramos e não encontramos nenhuma referência confiável de percentual por segmento. E faz sentido que não exista: o percentual certo depende de três números que só a sua loja tem. Por isso, em vez de um número mágico, este guia traz a conta.",
		},
		{
			type: "stats",
			items: [
				{ value: "88,3%", label: "dos consumidores usam programas de fidelidade", source: "ABEMF/Valuenet, 2025" },
				{ value: "53,3%", label: "querem cashback como benefício, atrás só do desconto (59,5%)", source: "ABEMF/Valuenet, 2025" },
				{ value: "11,6%", label: "dos pontos venceram sem uso no 3º tri de 2025, a menor taxa da série", source: "ABEMF" },
			],
		},
		{
			type: "text",
			heading: "O custo do cashback não é o percentual",
			body:
				"Quando a loja oferece 5% de cashback, ela não gasta 5% de cada venda. Ela gasta 5% **do crédito que o cliente volta para usar**. O crédito que vence sem uso não custa nada (mas frustra o cliente, então não conte com isso como estratégia).\n\nA conta por venda é:\n\n• **Custo real** = ticket médio × percentual de cashback × parte do crédito que é usada\n• **Margem bruta** = ticket médio × margem bruta %\n\nExemplo: ticket de R$ 80, cashback de 5% e 60% do crédito usado. O custo real é R$ 80 × 5% × 60% = **R$ 2,40 por venda**. Com margem bruta de 40% (R$ 32), o cashback consome 7,5% da margem.\n\nA taxa de uso varia muito. Nos grandes programas de pontos e milhas, só 11,6% venceram sem uso no 3º trimestre de 2025 (ABEMF), ou seja, quase 90% foi resgatado. Em loja, o número depende do prazo e de quanto você lembra o cliente do saldo. Use o seu histórico, ou comece com uma estimativa conservadora (alta).",
		},
		{
			type: "text",
			heading: "Quanto o programa precisa vender a mais para se pagar",
			body:
				"O cashback incide sobre **todas** as compras dos participantes, inclusive as que aconteceriam de qualquer jeito. Ele se paga quando as compras a mais que ele provoca geram margem suficiente para cobrir o crédito de todas.\n\nSe o custo real por venda é **c** e a margem por venda é **m**, o programa empata quando as vendas dos participantes crescem pelo menos **c ÷ (m − c)**. No exemplo, R$ 2,40 ÷ (R$ 32 − R$ 2,40) = **8,1%** a mais de vendas.\n\nUm crescimento de 8% na frequência de quem participa é uma meta realista para um programa bem comunicado. Já com margem de 25% e cashback de 10%, o empate exige quase 32% a mais. Aí o percentual alto vira prejuízo.",
		},
		{
			type: "cashback-calculator",
			heading: "Faça a conta da sua loja",
		},
		{
			type: "table",
			heading: "A mesma regra em margens diferentes",
			columns: ["Margem bruta", "Margem por venda", "Custo real do cashback", "Vendas a mais para empatar"],
			rows: [
				["25%", "R$ 20,00", "R$ 2,40 (12% da margem)", "**+13,6%**"],
				["40%", "R$ 32,00", "R$ 2,40 (7,5% da margem)", "**+8,1%**"],
				["60%", "R$ 48,00", "R$ 2,40 (5% da margem)", "**+5,3%**"],
				["25%, com cashback de 10%", "R$ 20,00", "R$ 4,80 (24% da margem)", "**+31,6%**"],
			],
			note: "Exemplo com ticket médio de R$ 80, cashback de 5% (exceto na última linha) e 60% do crédito usado. Refaça com os números da sua loja na calculadora acima.",
		},
		{
			type: "feature-highlight",
			icon: "clock",
			title: "Prazo curto faz voltar",
			body:
				"A validade do crédito deve acompanhar o ciclo de compra. Se o seu cliente volta em média a cada 30 dias, um crédito de 45 dias cria urgência sem parecer armadilha. Avise antes de vencer: um aviso de saldo é mensagem de utilidade no WhatsApp, cerca de 9 vezes mais barata que uma de marketing.",
		},
		{
			type: "feature-highlight",
			icon: "target",
			title: "Valor mínimo de uso protege o ticket",
			body:
				"Permitir usar o crédito só em compras acima de um valor (por exemplo, o dobro do crédito) evita que a próxima visita seja uma compra pequena paga com o saldo e faz o cashback puxar o ticket para cima.",
		},
		{
			type: "feature-highlight",
			icon: "gift",
			title: "Bônus direcionado custa menos que percentual alto",
			body:
				"Em vez de subir o percentual para todo mundo, mantenha a base baixa e ofereça um bônus pontual para quem está esfriando: \"R$ 15 de crédito até domingo\" para clientes que não voltam há 60 dias. O custo cai só onde há algo a recuperar.",
		},
		{
			type: "feature-highlight",
			icon: "chart",
			title: "Compare o cliente com ele mesmo",
			body:
				"Para saber se o cashback funciona, compare a frequência de cada participante antes e depois de entrar no programa. Comparar participantes com não participantes engana: os melhores clientes são os primeiros a aderir, e o programa leva o crédito por um hábito que já existia.",
		},
		{
			type: "text",
			heading: "Comece pequeno e ajuste com dados",
			body:
				"Um bom ponto de partida é o menor percentual que ainda soa como vantagem para o seu cliente, com prazo alinhado ao ciclo de compra e uma regra de uso mínimo. Depois de 90 dias, olhe a taxa de uso do crédito e a frequência dos participantes, e refaça a conta.\n\nNo RecompraCRM você configura percentual, prazo e regras de uso, o cliente recebe o saldo no WhatsApp, e os relatórios mostram quanto crédito foi gerado, quanto foi usado e quanto voltou em vendas.",
		},
	],
	faqs: [
		{
			question: "Qual o percentual ideal de cashback para uma loja?",
			answer:
				"Não existe um percentual ideal publicado, porque ele depende do ticket médio, da margem bruta e de quanto do crédito o cliente usa. A regra é que o custo real (ticket × cashback × taxa de uso) caiba na margem e que o programa gere vendas a mais suficientes para se pagar: com ticket de R$ 80, margem de 40%, cashback de 5% e 60% de uso, o empate exige 8,1% de vendas a mais.",
		},
		{
			question: "Como calcular o custo do cashback?",
			answer:
				"Multiplique o ticket médio pelo percentual de cashback e pela parte do crédito que os clientes realmente usam. Com ticket de R$ 80, 5% de cashback e 60% de uso, o custo real é R$ 2,40 por venda, e não R$ 4.",
		},
		{
			question: "Cashback é melhor que desconto?",
			answer:
				"Desconto reduz a margem da venda de hoje. Cashback só custa quando o cliente volta, e por isso funciona como motivo para a próxima visita. Na pesquisa ABEMF/Valuenet de 2025, desconto (59,5%) e cashback (53,3%) foram os benefícios mais desejados pelos consumidores.",
		},
		{
			question: "O RecompraCRM calcula o retorno do cashback?",
			answer:
				"Sim. O RecompraCRM registra o crédito gerado e o usado por cliente e mostra quanto voltou em vendas, para você ajustar percentual, prazo e regras com base nos seus números.",
		},
	],
	sources: [
		{
			label: "ABEMF/Valuenet — 88% dos brasileiros utilizam programas de fidelidade (via Panrotas)",
			url: "https://www.panrotas.com.br/mercado/pesquisas-e-estatisticas/2025/10/88-dos-brasileiros-utilizam-programas-de-fidelidade-diz-pesquisa-da-abemf_222537.html",
		},
		{ label: "ABEMF — resultados do mercado de fidelização (via Panrotas)", url: "https://www.panrotas.com.br/tudo-sobre/abemf" },
		{
			label: "ABEMF — Panorama da Fidelização no Brasil, 3ª edição (via Estado de Minas)",
			url: "https://www.em.com.br/mundo-corporativo/2024/09/6951134-cashback-movimenta-comercios-e-atrai-consumidores.html",
		},
		{ label: "Meta for Developers — preços da plataforma do WhatsApp Business", url: "https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing" },
	],
	cta: {
		headline: "Quer um cashback que se paga?",
		sub: "Veja como configurar percentual, prazo e regras no RecompraCRM e acompanhar quanto o programa traz de volta em vendas.",
		buttonText: "Agendar demonstração gratuita",
		whatsappMessage: "Olá! Li o artigo sobre quanto oferecer de cashback no blog do RecompraCRM e gostaria de agendar uma demonstração.",
	},
};
