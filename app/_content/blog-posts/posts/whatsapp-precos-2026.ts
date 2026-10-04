import type { BlogPost } from "../types";

export const whatsappPrecos2026Post: BlogPost = {
	slug: "whatsapp-api-precos-outubro-2026-varejo",
	title: "WhatsApp ficou mais caro em 1º de outubro: o que muda para a sua loja",
	headline:
		"A Meta passou a cobrar as respostas de atendimento. Quanto custa cada tipo de mensagem no Brasil e como gastar menos sem falar menos com o cliente.",
	description:
		"Desde 1º/10/2026 a Meta cobra R$ 0,035 por resposta de atendimento na API do WhatsApp. Veja a tabela de preços do Brasil (marketing, utilidade, autenticação), o limite de mensagens de marketing por pessoa e o que a LGPD exige.",
	category: "dados",
	categoryLabel: "Dados do varejo",
	cover: "whatsapp",
	publishedAt: "2026-10-04",
	readingTime: "7 min",
	seo: {
		keywords: [
			"preço whatsapp api 2026",
			"whatsapp business api brasil preço",
			"quanto custa mensagem whatsapp marketing",
			"meta cobra mensagem de atendimento",
			"whatsapp para loja",
			"lgpd whatsapp marketing",
			"opt-in whatsapp",
		],
	},
	relatedSlugs: ["black-friday-e-natal-2026-loja-fisica", "segmentacao-rfm-varejo-guia-pratico", "quanto-oferecer-de-cashback-sem-perder-margem"],
	sections: [
		{
			type: "text",
			heading: "O que mudou em 1º de outubro",
			body:
				"Desde 1º de outubro de 2026, a Meta cobra pelas **mensagens de atendimento**, as respostas que a empresa envia dentro da janela de 24 horas aberta quando o cliente escreve. Elas eram gratuitas desde novembro de 2024. No Brasil, cada resposta passou a custar **R$ 0,035**. As mensagens de utilidade enviadas dentro dessa janela também deixaram de ser gratuitas.\n\nA mudança vale para a **plataforma de API do WhatsApp Business**, usada por CRMs, chatbots e ferramentas de atendimento com vários atendentes. O aplicativo gratuito WhatsApp Business, aquele instalado no celular da loja, não foi afetado.\n\nEssa é a segunda mudança grande em pouco mais de um ano. Desde 1º de julho de 2025, a Meta cobra **por mensagem entregue**, e não mais por conversa. Na prática, cada mensagem que sai da sua loja pela API agora tem custo.",
		},
		{
			type: "table",
			heading: "Quanto custa cada mensagem no Brasil",
			columns: ["Categoria", "Para que serve", "Preço por mensagem"],
			rows: [
				["Marketing", "Promoção, novidade, convite para voltar à loja", "**R$ 0,3217** (US$ 0,0625)"],
				["Utilidade", "Pedido confirmado, saldo de cashback a vencer, aviso de retirada", "R$ 0,035 (US$ 0,0068)"],
				["Autenticação", "Código de verificação", "R$ 0,035 (US$ 0,0068)"],
				["Atendimento", "Resposta dentro de 24h de uma mensagem do cliente", "R$ 0,035, cobrada desde 1º/10/2026"],
			],
			note:
				"Tabela da Meta para o Brasil vigente a partir de 1º/10/2026; só mensagens entregues são cobradas. Utilidade e autenticação têm desconto em faixas de volume muito altas (centenas de milhares de mensagens por mês); marketing não. O provedor (BSP) pode cobrar uma taxa própria por cima.",
		},
		{
			type: "stats",
			items: [
				{ value: "≈ 9×", label: "é quanto uma mensagem de marketing custa a mais que uma de utilidade", source: "Tabela de preços da Meta, out/2026" },
				{ value: "R$ 0,035", label: "por resposta de atendimento, antes gratuita, desde 1º de outubro", source: "Meta for Developers" },
				{ value: "72 h", label: "de conversa gratuita quando o cliente chega por anúncio de clique para WhatsApp", source: "Meta for Developers" },
			],
		},
		{
			type: "text",
			heading: "Quanto isso pesa no mês de uma loja",
			body:
				"Imagine uma base de **2.000 clientes** com permissão para receber mensagens:\n\n• **Duas campanhas de marketing por mês para todos:** 4.000 × R$ 0,3217 = **R$ 1.286,80**.\n• **Um aviso de utilidade por mês** (\"seu cashback de R$ 12 vence sexta\"): 2.000 × R$ 0,035 = **R$ 70**.\n• **Atendimento:** 300 conversas por mês com 10 respostas cada = 3.000 × R$ 0,035 = **R$ 105**, valor que até setembro era zero.\n\nO peso está no marketing. E a cobrança é por mensagem entregue, então o custo cresce junto com o tamanho da lista, não com o resultado.",
		},
		{
			type: "feature-highlight",
			icon: "target",
			title: "1. Segmente antes de disparar",
			body:
				"Mandar a mesma promoção para a base inteira é a forma mais cara de usar o WhatsApp. Uma campanha para os 300 clientes que não voltam há 60 dias custa R$ 96,51 e tem um motivo claro. A mesma mensagem para 2.000 pessoas custa R$ 643,40.",
		},
		{
			type: "feature-highlight",
			icon: "coins",
			title: "2. Use utilidade para o que é utilidade",
			body:
				"Saldo de cashback a vencer, pedido pronto para retirada e confirmação de compra são mensagens de utilidade, cerca de 9 vezes mais baratas. A Meta revisa a categoria dos modelos e, desde abril de 2025, aprova como marketing um modelo enviado como utilidade que traz promoção. Mantenha o conteúdo informativo.",
		},
		{
			type: "feature-highlight",
			icon: "chat",
			title: "3. Resolva em menos mensagens",
			body:
				"Agora cada resposta conta. Uma mensagem completa, com preço, link do catálogo e horário de funcionamento, custa menos que três mensagens picadas. Respostas rápidas prontas ajudam a equipe a responder bem e de primeira.",
		},
		{
			type: "feature-highlight",
			icon: "bolt",
			title: "4. Anúncio de clique para WhatsApp abre 72 horas grátis",
			body:
				"Quando o cliente escreve a partir de um anúncio de clique para WhatsApp ou do botão da página no Facebook, usando o app do celular (Android ou iOS), e a loja responde em até 24 horas, abre-se uma janela de 72 horas em que qualquer mensagem é gratuita. Mensagens vindas do WhatsApp Web ou do desktop não abrem essa janela. Para captar clientes novos, essa porta de entrada saiu mais barata que o disparo.",
		},
		{
			type: "callout",
			tone: "atencao",
			title: "O limite de marketing que ninguém vê",
			body:
				"O WhatsApp limita quantas mensagens de marketing cada pessoa recebe, somando todas as empresas. O limite é dinâmico: depende de quanto aquela pessoa lê mensagens de marketing e de quão cheia está a caixa dela. Ele vale no Brasil. Quando a mensagem é barrada, a API devolve o erro **131049**, e a Meta orienta esperar 24 horas antes de tentar de novo.\n\nNa prática, quem manda mensagem que ninguém lê compete pior pela atenção do cliente. Mensagens enviadas dentro de uma conversa aberta pelo cliente não entram nesse limite.",
		},
		{
			type: "text",
			heading: "Opt-in: o que a Meta e a LGPD exigem",
			body:
				"A Meta exige que o cliente tenha dado **permissão (opt-in)** para receber mensagens da sua empresa, com o nome da loja claro. Vale permissão por escrito no papel ou dada pessoalmente no balcão. A Meta também recomenda permissões separadas por tipo de mensagem e uma forma fácil de sair.\n\nPela LGPD (Lei 13.709/2018), mandar marketing exige uma base legal: o **consentimento** (art. 7º, I) ou o **legítimo interesse** (art. 7º, IX, e art. 10). O legítimo interesse pede finalidade clara, respeito às expectativas do cliente e uma avaliação documentada, conforme o guia da ANPD de 2024. Em qualquer caso, o cliente pode se opor e pedir para não receber mais (art. 18, §2º).\n\n**Na prática:** no caixa, pergunte \"posso te mandar o seu saldo de cashback e as novidades pelo WhatsApp?\", registre a resposta com a data e inclua em toda campanha uma forma simples de sair, como \"responda SAIR\".",
		},
		{
			type: "callout",
			tone: "dado",
			title: "Contas cobradas em real",
			body:
				"Desde 1º de julho de 2026, novas contas do WhatsApp Business de empresas brasileiras elegíveis são criadas em reais e faturadas pelo Facebook Brasil. A partir de **1º de julho de 2027**, a Meta deixa de entregar mensagens de contas elegíveis que continuarem em outra moeda. Confirme a situação com o seu provedor.",
		},
		{
			type: "text",
			heading: "Menos disparo, mais motivo",
			body:
				"A conta nova do WhatsApp favorece quem já trabalhava do jeito certo: mensagem para quem tem motivo para recebê-la, no momento certo, com conteúdo que o cliente lê.\n\nO RecompraCRM segmenta a base por comportamento de compra (quem sumiu, quem tem saldo a vencer, quem compra uma categoria), dispara para o grupo certo e mostra quanto cada campanha trouxe em vendas. Assim você compara o custo das mensagens com o retorno.",
		},
	],
	faqs: [
		{
			question: "Quanto custa uma mensagem de marketing no WhatsApp no Brasil em 2026?",
			answer:
				"Pela tabela da Meta vigente a partir de 1º/10/2026, R$ 0,3217 (US$ 0,0625) por mensagem de marketing entregue. Mensagens de utilidade, autenticação e respostas de atendimento custam R$ 0,035 (US$ 0,0068). O provedor da API pode cobrar uma taxa adicional.",
		},
		{
			question: "O WhatsApp Business do celular também passou a cobrar?",
			answer:
				"Não. A cobrança vale para a plataforma de API do WhatsApp Business, usada por CRMs e ferramentas de atendimento. O aplicativo gratuito WhatsApp Business não foi afetado pela mudança de 1º de outubro de 2026.",
		},
		{
			question: "Responder o cliente no WhatsApp agora é pago?",
			answer:
				"Na API, sim. Desde 1º de outubro de 2026, as respostas dentro da janela de 24 horas (mensagens de atendimento) custam R$ 0,035 cada no Brasil. A exceção é a janela de 72 horas aberta quando o cliente escreve pelo app do celular a partir de um anúncio de clique para WhatsApp ou do botão da página no Facebook e a loja responde em até 24 horas: nela, as mensagens continuam gratuitas.",
		},
		{
			question: "Preciso de autorização do cliente para mandar promoção pelo WhatsApp?",
			answer:
				"Sim. A Meta exige opt-in que identifique a sua empresa, e a LGPD exige uma base legal, seja o consentimento ou o legítimo interesse, além de respeitar o pedido do cliente para não receber mais. Registre a permissão com a data e ofereça uma saída simples em toda campanha.",
		},
	],
	sources: [
		{ label: "Meta for Developers — preços da plataforma do WhatsApp Business", url: "https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing" },
		{
			label: "Meta for Developers — cobrança de mensagens fora de modelos (atendimento)",
			url: "https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages",
		},
		{
			label: "Meta for Developers — limites de mensagens de marketing por usuário",
			url: "https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/per-user-limits",
		},
		{ label: "Meta for Developers — obtendo o opt-in do cliente", url: "https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in" },
		{ label: "Meta for Developers — categorização de modelos", url: "https://developers.facebook.com/docs/whatsapp/updates-to-pricing/new-template-guidelines" },
		{ label: "Mobile Time — WhatsApp passa a cobrar respostas das empresas", url: "https://www.mobiletime.com.br/noticias/23/06/2026/whatsapp-respostas/" },
		{ label: "Lei Geral de Proteção de Dados (Lei 13.709/2018)", url: "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm" },
		{ label: "ANPD — Guia orientativo sobre legítimo interesse (2024)", url: "https://www.gov.br/anpd" },
	],
	cta: {
		headline: "Quer gastar menos com WhatsApp e vender mais com ele?",
		sub: "Veja como o RecompraCRM segmenta sua base, dispara para quem tem motivo para comprar e mostra o retorno de cada campanha.",
		buttonText: "Agendar demonstração gratuita",
		whatsappMessage: "Olá! Li o artigo sobre os novos preços do WhatsApp no blog do RecompraCRM e gostaria de entender como reduzir meu custo com campanhas.",
	},
};
