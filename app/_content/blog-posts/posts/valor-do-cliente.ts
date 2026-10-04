import type { BlogPost } from "../types";

export const valorDoClientePost: BlogPost = {
	slug: "quanto-vale-um-cliente-que-volta",
	title: "Quanto vale um cliente que volta? O que os números de retenção dizem e o que não dizem",
	headline:
		"\"Reter é 5 vezes mais barato\" e \"5% de retenção dá até 95% de lucro\" circulam sem fonte. Fomos atrás da origem e trouxemos uma conta que você pode fazer com os dados da sua loja.",
	description:
		"De onde vêm as estatísticas famosas de retenção de clientes (HBR, Bain, Marketing Metrics), o que elas realmente dizem, quanto da receita vem dos melhores clientes e como calcular o valor de um cliente na sua loja.",
	category: "dados",
	categoryLabel: "Dados do varejo",
	cover: "valor-do-cliente",
	publishedAt: "2026-10-04",
	readingTime: "8 min",
	seo: {
		keywords: [
			"retenção de clientes estatísticas",
			"custo de aquisição vs retenção",
			"quanto vale um cliente",
			"valor do cliente varejo",
			"taxa de recompra",
			"fidelização de clientes dados",
			"regra 80/20 clientes",
		],
	},
	relatedSlugs: ["segmentacao-rfm-varejo-guia-pratico", "quanto-oferecer-de-cashback-sem-perder-margem", "como-fechar-a-semana-no-varejo-e-preparar-a-proxima"],
	sections: [
		{
			type: "text",
			heading: "Os números que todo mundo repete",
			body:
				"Qualquer apresentação sobre fidelização tem pelo menos um destes: \"conquistar um cliente custa de 5 a 25 vezes mais que manter\", \"aumentar a retenção em 5% eleva o lucro de 25% a 95%\" e \"a chance de vender para um cliente atual é de 60% a 70%\".\n\nA ideia por trás deles é boa. Mas, quando fomos atrás da origem de cada um, encontramos estudos antigos, de outros setores, citados com números que as próprias fontes não sustentam. Antes de usá-los para decidir onde investir, vale saber o que eles realmente dizem.",
		},
		{
			type: "table",
			heading: "De onde vêm as estatísticas famosas",
			columns: ["A afirmação", "A origem", "O que a fonte diz de fato"],
			rows: [
				[
					"Conquistar custa de 5 a 25 vezes mais que reter",
					"Amy Gallo, Harvard Business Review, 2014",
					"A própria autora diz que o número varia \"dependendo do estudo em que você acredita e do setor em que está\". O artigo não cita um estudo único.",
				],
				[
					"5% a mais de retenção aumenta o lucro de 25% a 95%",
					"Reichheld e Sasser, Harvard Business Review, 1990",
					"Segundo o artigo, como é citado, reduzir em 5% a perda de clientes elevou o lucro de 25% a 85% em empresas de serviços: 85% numa rede de agências bancárias, 50% numa corretora de seguros, 30% numa rede de oficinas. O \"95%\" não aparece nessas citações nem no boletim da Bain, e varejo não foi analisado.",
				],
				[
					"Vender para cliente atual: 60% a 70% de chance; para um novo, 5% a 20%",
					"Atribuída ao livro Marketing Metrics (2006)",
					"É repetida sem página nem método. Não conseguimos confirmá-la no livro.",
				],
			],
			note: "O próprio boletim da Bain sobre o tema, de 2001, afirma apenas que, em serviços financeiros, 5% a mais de retenção gera mais de 25% de lucro.",
		},
		{
			type: "callout",
			tone: "dado",
			title: "Então retenção não importa?",
			body:
				"Importa, e os estudos originais mostram um efeito real e grande. O problema é usar o número de um banco americano dos anos 1990 para decidir o orçamento de uma loja de bairro em 2026. O número que interessa é o da sua loja, e ele dá para calcular. Mostramos como abaixo.",
		},
		{
			type: "text",
			heading: "Os melhores clientes pagam boa parte das contas, mas mudam",
			body:
				"A famosa regra 80/20 (20% dos clientes geram 80% das vendas) também é mais branda na prática. Um estudo com seis anos de dados de mais de 100 mil domicílios americanos, em 22 categorias de supermercado, encontrou que os 20% que mais compram respondem por **65% a 73% das vendas** de uma marca (Kim, Singh e Winer, 2017).\n\nPesquisadores do Instituto Ehrenberg-Bass chegaram a uma proporção ainda menor: os 20% que mais compram costumam responder por **pouco mais da metade** das vendas de uma marca, perto de 60/20. E observaram algo mais útil para o lojista: mesmo em marcas estáveis, cerca de **metade** dos maiores compradores de um ano nem se qualifica para o grupo dos 20% no ano seguinte (Sharp, Romaniuk e Graham, 2019).\n\nA lição: a concentração existe, mas o grupo do topo muda. Não basta mimar quem já compra muito. É preciso perceber quem está esfriando e continuar trazendo clientes novos para o topo.",
		},
		{
			type: "stats",
			items: [
				{ value: "65–73%", label: "das vendas de uma marca vêm dos 20% que mais compram", source: "Kim, Singh e Winer, 2017" },
				{ value: "½", label: "dos maiores compradores sai do grupo do topo no ano seguinte", source: "Sharp, Romaniuk e Graham, 2019" },
				{ value: "88,3%", label: "dos consumidores brasileiros usam programas de fidelidade", source: "ABEMF/Valuenet, 2025" },
			],
		},
		{
			type: "text",
			heading: "A conta que vale para a sua loja",
			body:
				"O valor de um cliente em 12 meses, em margem, é:\n\n• **Ticket médio × compras por ano × margem bruta**\n\nCom ticket de R$ 80, 6 compras por ano e margem de 40%, cada cliente fiel deixa **R$ 192 de margem por ano**. Se 100 clientes assim param de vir, a loja perde R$ 19.200 de margem no ano, e precisa conquistar 100 novos clientes, que ainda não têm o hábito, só para ficar no mesmo lugar.\n\nPara chegar aos seus números, tire do sistema de vendas:\n\n• Quantos clientes identificados compraram nos últimos 12 meses.\n• O ticket médio e o número médio de compras por cliente.\n• Desses clientes, quantos compraram de novo em até 90 dias: essa é a sua **taxa de recompra**.\n• Quanto você gasta, entre anúncio, desconto de primeira compra e brinde, para trazer um cliente novo.\n\nCom isso você tem o seu próprio \"X vezes mais caro\", com dados da sua operação.",
		},
		{
			type: "feature-highlight",
			icon: "chart",
			title: "Taxa de recompra em 90 dias",
			body:
				"De cada 100 clientes que compraram, quantos voltaram em até 90 dias? É o indicador mais simples de fidelização e o primeiro a cair quando algo vai mal no atendimento, no estoque ou no preço.",
		},
		{
			type: "feature-highlight",
			icon: "clock",
			title: "Clientes que passaram do ponto",
			body:
				"Se o seu cliente costuma voltar a cada 30 dias, quem está há 60 dias sem comprar está esfriando. Essa lista, ordenada por quanto o cliente gastava, é a agenda de contato mais valiosa da semana.",
		},
		{
			type: "feature-highlight",
			icon: "coins",
			title: "Margem por cliente, não só faturamento",
			body:
				"Dois clientes com o mesmo gasto podem deixar margens muito diferentes. Olhar a margem por cliente evita gastar esforço de retenção com quem só compra o item em promoção.",
		},
		{
			type: "text",
			heading: "Do número à ação",
			body:
				"O valor de um cliente que volta não se prova com estatística emprestada. Ele aparece quando você mede a recompra da sua loja, vê quem está esfriando e age antes de o cliente sumir.\n\nO RecompraCRM calcula esses indicadores a partir do histórico de vendas, mostra quem está em risco e permite acionar cada grupo com uma campanha no WhatsApp, medindo quanto voltou em vendas.",
		},
	],
	faqs: [
		{
			question: "É verdade que conquistar um cliente custa 5 vezes mais que manter?",
			answer:
				"É uma regra de bolso, não um dado. A faixa \"5 a 25 vezes\" vem de um artigo da Harvard Business Review de 2014, em que a autora diz que o número varia conforme o estudo e o setor, sem citar uma pesquisa única. O mais seguro é calcular a proporção da sua loja: quanto você gasta para trazer um cliente novo e quanto vale, em margem, um cliente que volta.",
		},
		{
			question: "De onde vem a estatística de que 5% de retenção aumenta o lucro em até 95%?",
			answer:
				"É atribuída ao artigo \"Zero Defections\" de Reichheld e Sasser (Harvard Business Review, 1990), citado com aumentos de 25% a 85% no lucro ao reduzir em 5% a perda de clientes em empresas de serviços, como banco, seguros e oficinas. O \"95%\" não aparece nas citações do estudo nem no boletim da Bain de 2001, e o varejo não foi analisado.",
		},
		{
			question: "Como calcular o valor de um cliente na minha loja?",
			answer:
				"Multiplique o ticket médio pelo número de compras por ano e pela margem bruta. Com ticket de R$ 80, 6 compras por ano e 40% de margem, cada cliente fiel vale R$ 192 de margem por ano. Some a taxa de recompra em 90 dias para saber quantos clientes estão de fato voltando.",
		},
		{
			question: "A regra 80/20 vale para clientes de loja?",
			answer:
				"Existe concentração, mas geralmente menor que 80/20. Em supermercados, os 20% que mais compram respondem por 65% a 73% das vendas de uma marca (Kim, Singh e Winer, 2017), e outros estudos apontam algo perto de 60/20. Além disso, cerca de metade dos maiores compradores muda de um ano para o outro.",
		},
	],
	sources: [
		{ label: "Amy Gallo — The Value of Keeping the Right Customers (HBR, 2014)", url: "https://hbr.org/2014/10/the-value-of-keeping-the-right-customers" },
		{ label: "Bain & Company — Prescription for Cutting Costs (Reichheld, 2001)", url: "https://media.bain.com/Images/BB_Prescription_cutting_costs.pdf" },
		{ label: "Ipsos — Shattering the Myths of Customer Loyalty", url: "https://www.ipsos.com/en-us/shattering-myths-customer-loyalty" },
		{ label: "Kim, Singh e Winer — The Pareto rule for frequently purchased packaged goods (Marketing Letters, 2017)", url: "https://doi.org/10.1007/s11002-017-9442-5" },
		{ label: "Sharp, Romaniuk e Graham — Marketing's 60/20 Pareto Law (Ehrenberg-Bass, 2019)", url: "https://openresearch.lsbu.ac.uk/item/88vw1" },
		{
			label: "ABEMF/Valuenet — 88% dos brasileiros utilizam programas de fidelidade (via Panrotas)",
			url: "https://www.panrotas.com.br/mercado/pesquisas-e-estatisticas/2025/10/88-dos-brasileiros-utilizam-programas-de-fidelidade-diz-pesquisa-da-abemf_222537.html",
		},
	],
	cta: {
		headline: "Quer saber quanto vale o cliente da sua loja?",
		sub: "O RecompraCRM calcula recompra, valor por cliente e quem está esfriando a partir das suas vendas, e ajuda a trazer cada um de volta.",
		buttonText: "Agendar demonstração gratuita",
		whatsappMessage: "Olá! Li o artigo sobre o valor do cliente que volta no blog do RecompraCRM e gostaria de agendar uma demonstração.",
	},
};
