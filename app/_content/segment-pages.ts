import type { FAQItem } from "./blog-posts";

// ----------------------------------------------------------------------------
// Content model for segment landing pages (/segments/[slug]).
// One config per segment drives a full conversion landing + hub card, no modelo
// "página-por-segmento" (Fidelimax). Adding a new segment = adding one config.
// The old blog case posts (/blog/como-recompracrm-pode-ajudar-*) redirect here —
// see the redirects() map in next.config.mjs.
// ----------------------------------------------------------------------------

export type SegmentStat = { value: string; label: string };

// A retention engine applied to the segment; links to a feature page.
export type SegmentPlaybookItem = {
	emoji: string;
	title: string;
	body: string;
	featureSlug: string;
};

export type SegmentPage = {
	slug: string;
	name: string; // "Sorveteria" — breadcrumb, cards, FAQ copy
	audience: string; // plural audience: "sorveterias e gelaterias"
	emoji: string;
	title: string; // keyword-first <title> (layout appends "| RecompraCRM")
	metaDescription: string;
	tagline: string; // hero H1
	heroSubtitle: string;
	answerBlock: string; // 40–60 word extractable definition (AEO)
	publishedAt: string;
	updatedAt: string;
	challenge: string; // segment pain, plain language
	suggestedConfig: {
		stats: SegmentStat[];
		note: string;
	};
	playbook: SegmentPlaybookItem[];
	result: string; // outcome band before the CTA
	faqs: FAQItem[];
	cta: {
		headline: string;
		sub: string;
		buttonText: string;
		whatsappMessage: string;
	};
	seo: {
		keywords: string[];
	};
	relatedSlugs: string[];
};

type SegmentPageConfig = {
	slug: string;
	name: string;
	audience: string;
	emoji: string;
	title: string;
	metaDescription: string;
	tagline: string;
	heroSubtitle: string;
	answerBlock: string;
	publishedAt: string;
	cashbackPercent: string;
	expirationDays: string;
	rescueLimit: string;
	purchaseCycle: string;
	mainChallenge: string;
	cashbackUse: string;
	whatsappUse: string;
	rfmUse: string;
	pdiUse: string;
	result: string;
	keywords: string[];
	relatedSlugs: string[];
};

const UPDATED_AT = "2026-07-11";

function createSegmentPage(config: SegmentPageConfig): SegmentPage {
	return {
		slug: config.slug,
		name: config.name,
		audience: config.audience,
		emoji: config.emoji,
		title: config.title,
		metaDescription: config.metaDescription,
		tagline: config.tagline,
		heroSubtitle: config.heroSubtitle,
		answerBlock: config.answerBlock,
		publishedAt: config.publishedAt,
		updatedAt: UPDATED_AT,
		challenge: `${config.mainChallenge}\n\nNa prática, o problema quase nunca é só atrair gente nova. O desafio é fazer quem já comprou lembrar da loja, voltar no intervalo certo e comprar de novo antes de migrar para o concorrente.`,
		suggestedConfig: {
			stats: [
				{ value: config.cashbackPercent, label: "Cashback inicial sugerido, com controle de margem" },
				{ value: `${config.expirationDays} dias`, label: `Validade alinhada ao ciclo de ${config.purchaseCycle}` },
				{ value: config.rescueLimit, label: "Limite de resgate por compra para proteger a rentabilidade" },
			],
			note: "Você ajusta as regras quando quiser — mas já começa com uma configuração alinhada à margem e ao ciclo de recompra do segmento.",
		},
		playbook: [
			{
				emoji: "💸",
				title: "Cashback ajustado ao ciclo de compra",
				body: config.cashbackUse,
				featureSlug: "programa-de-cashback",
			},
			{
				emoji: "📱",
				title: "Campanhas automáticas no WhatsApp",
				body: config.whatsappUse,
				featureSlug: "campanhas-whatsapp",
			},
			{
				emoji: "📊",
				title: "Análise RFM para priorizar clientes",
				body: config.rfmUse,
				featureSlug: "business-intelligence",
			},
			{
				emoji: "🖥️",
				title: "Registro sem fricção no ponto de venda",
				body: config.pdiUse,
				featureSlug: "ponto-de-interacao",
			},
		],
		result: config.result,
		faqs: [
			{
				question: `Como funciona o programa de fidelidade para ${config.audience}?`,
				answer: `O RecompraCRM organiza a retenção de ${config.audience} em quatro frentes integradas: cashback que dá ao cliente um motivo concreto para voltar, campanhas automáticas no WhatsApp disparadas por comportamento, um Ponto de Interação (PDI) no balcão e análise RFM. Assim, cada venda vira uma próxima visita, sem depender de promoção genérica.`,
			},
			{
				question: `Qual é a melhor configuração de cashback para ${config.name.toLowerCase()}?`,
				answer: `Para esse segmento, uma configuração inicial segura costuma partir de ${config.cashbackPercent} de cashback, validade de ${config.expirationDays} dias e limite de resgate em torno de ${config.rescueLimit} da compra — alinhada à margem e ao ciclo de ${config.purchaseCycle}. Você ajusta as regras depois, mas já começa com um ponto de partida rentável.`,
			},
			{
				question: "O cliente precisa baixar aplicativo para participar do programa?",
				answer: "Não. No Ponto de Interação, o atendente identifica o cliente pelo telefone, registra a venda e permite o resgate com uma confirmação rápida. O cliente não instala aplicativo nem carrega cartão de fidelidade — acumula e usa o cashback direto no balcão, em segundos.",
			},
			{
				question: `Quanto tempo leva para implantar o RecompraCRM em ${config.name.toLowerCase()}?`,
				answer: "O setup é feito em menos de um dia. A equipe do RecompraCRM configura o cashback, integra seus dados de venda e treina os atendentes. A partir da primeira venda registrada, você já começa a acumular dados de retenção e a acionar campanhas automáticas.",
			},
		],
		cta: {
			headline: "Pronto para fazer seus clientes voltarem?",
			sub: `Agende uma demonstração gratuita e veja cashback, campanhas no WhatsApp, PDI e análise RFM funcionando para ${config.audience}.`,
			buttonText: "Agendar Demo Gratuita",
			whatsappMessage: `Olá! Vi a página de ${config.name} no site do RecompraCRM e gostaria de agendar uma demonstração.`,
		},
		seo: {
			keywords: [
				`programa de fidelidade ${config.name.toLowerCase()}`,
				`crm ${config.name.toLowerCase()}`,
				`cashback ${config.name.toLowerCase()}`,
				`fidelização ${config.name.toLowerCase()}`,
				...config.keywords,
			],
		},
		relatedSlugs: config.relatedSlugs,
	};
}

export const SEGMENT_PAGES: SegmentPage[] = [
	// --- Food service (ICP núcleo) ---
	createSegmentPage({
		slug: "restaurantes",
		name: "Restaurantes e Lanchonetes",
		audience: "restaurantes, lanchonetes, cafeterias e lojas de alimentação",
		emoji: "🍽️",
		title: "CRM e Fidelidade para Restaurantes e Lanchonetes",
		metaDescription:
			"Programa de fidelidade com cashback para restaurantes, lanchonetes e cafeterias venderem mais para quem já é cliente. Resultados em 30 dias. Agende uma demo.",
		tagline: "Programa de fidelidade para restaurantes e lanchonetes",
		heroSubtitle:
			"Cashback que traz o cliente de volta na próxima refeição e campanhas de WhatsApp que lembram dele antes do concorrente. Sem aplicativo, sem cartãozinho de papel.",
		answerBlock:
			"O RecompraCRM é um programa de fidelidade para restaurantes, lanchonetes e cafeterias que combina cashback, campanhas automáticas no WhatsApp, registro rápido no balcão e análise RFM. Cada refeição gera um crédito que puxa a próxima visita — e o sistema aciona o cliente certo, no momento certo, sem trabalho manual da equipe.",
		publishedAt: "2026-03-12",
		cashbackPercent: "5%",
		expirationDays: "30",
		rescueLimit: "30%",
		purchaseCycle: "visitas semanais",
		mainChallenge:
			"Negócios de alimentação vivem de frequência. O cliente pode amar o produto, mas se ele não for lembrado no almoço, no café da tarde ou no fim de semana, a próxima compra vai para o concorrente mais visível.",
		cashbackUse:
			"Em alimentação, o cashback funciona como convite para a próxima visita. Um crédito pequeno, com validade curta, é suficiente para trazer o cliente de volta antes que o hábito esfrie.",
		whatsappUse:
			"Campanhas podem ativar clientes que não aparecem há alguns dias, divulgar combos da semana, lembrar saldo de cashback e criar ações de aniversário sem depender de postagem orgânica.",
		rfmUse:
			"A análise RFM mostra quem come toda semana, quem está reduzindo frequência e quem veio uma vez e sumiu. Isso ajuda a proteger a recorrência, que é o coração do segmento.",
		pdiUse:
			"No balcão, o PDI registra vendas rápidas e mostra o cashback acumulado sem atrapalhar a fila. A equipe mantém o ritmo e o cliente sai com um motivo claro para voltar.",
		result:
			"Restaurantes e lanchonetes passam a estimular visitas recorrentes, reduzir dias fracos e transformar clientes ocasionais em compradores habituais.",
		keywords: ["crm restaurante", "fidelização restaurante", "cashback restaurante", "programa de fidelidade lanchonete", "marketing cafeteria"],
		relatedSlugs: ["delivery", "padaria-e-confeitaria", "sorveteria"],
	}),
	createSegmentPage({
		slug: "delivery",
		name: "Delivery",
		audience: "restaurantes e operações de delivery",
		emoji: "🛵",
		title: "Programa de Fidelidade para Delivery",
		metaDescription:
			"Cashback e campanhas no WhatsApp para o seu delivery transformar pedidos em clientes recorrentes. Integra com iFood e cardápio digital. Agende uma demo.",
		tagline: "Programa de fidelidade para delivery",
		heroSubtitle:
			"Transforme o pedido de hoje no pedido da próxima semana — e o cliente do marketplace em cliente da casa. Integração com iFood e Cardápio Web importa tudo automaticamente.",
		answerBlock:
			"O RecompraCRM é um programa de fidelidade para delivery que importa pedidos automaticamente das integrações com iFood e Cardápio Web, gera cashback a cada compra e aciona campanhas de WhatsApp por comportamento. A operação constrói base própria de clientes e reduz a dependência de comissão de marketplace.",
		publishedAt: "2026-07-11",
		cashbackPercent: "5%",
		expirationDays: "30",
		rescueLimit: "30%",
		purchaseCycle: "pedidos semanais",
		mainChallenge:
			"No delivery, o cliente está a um clique do concorrente e as plataformas cobram comissão sobre cada pedido. Quem não constrói base própria fica refém do marketplace: paga para vender de novo para o mesmo cliente, sem saber quem ele é nem quando ele sumiu.",
		cashbackUse:
			"Cashback com validade curta transforma o pedido de hoje no pedido da próxima semana. O cliente acumula crédito a cada compra e ganha um motivo concreto para pedir direto de você, no canal onde a margem é sua.",
		whatsappUse:
			"Campanhas podem reativar quem não pede há duas semanas, avisar saldo de cashback expirando, divulgar combos do fim de semana e transformar o cliente do iFood em cliente da casa. As integrações importam os pedidos automaticamente — delivery, retirada e salão.",
		rfmUse:
			"O RFM separa quem pede toda semana, quem só aparece em promoção e quem experimentou uma vez e sumiu. Cada grupo recebe a campanha certa, em vez de cupom genérico para todo mundo.",
		pdiUse:
			"Para retirada no balcão e atendimento no salão, o PDI registra a venda pelo telefone do cliente e unifica o histórico com os pedidos de delivery importados das integrações. Uma única base, todos os canais.",
		result:
			"Operações de delivery reduzem a dependência de marketplace, aumentam pedidos diretos e ganham previsibilidade de recorrência semanal.",
		keywords: ["fidelidade delivery", "crm delivery", "cashback delivery", "fidelizar clientes ifood", "marketing delivery"],
		relatedSlugs: ["restaurantes", "padaria-e-confeitaria", "sorveteria"],
	}),
	createSegmentPage({
		slug: "padaria-e-confeitaria",
		name: "Padaria e Confeitaria",
		audience: "padarias, confeitarias e docerias",
		emoji: "🍰",
		title: "Programa de Fidelidade para Padaria e Confeitaria",
		metaDescription:
			"CRM com cashback para padarias e confeitarias fidelizarem clientes do dia a dia. Campanhas no WhatsApp que trazem o cliente de volta. Agende uma demo.",
		tagline: "Programa de fidelidade para padarias e confeitarias",
		heroSubtitle:
			"O cliente que compra pão todo dia pode comprar bolo no fim de semana e encomendar a festa do filho. Cashback e WhatsApp transformam conveniência em vínculo.",
		answerBlock:
			"O RecompraCRM é um programa de fidelidade para padarias e confeitarias que combina cashback de validade curta, campanhas automáticas no WhatsApp e registro rápido no balcão. O cliente da rotina ganha um motivo para voltar sempre na mesma padaria — e a loja passa a divulgar fornadas, encomendas e kits para quem realmente compra.",
		publishedAt: "2026-03-19",
		cashbackPercent: "8%",
		expirationDays: "30",
		rescueLimit: "40%",
		purchaseCycle: "compras diárias e semanais",
		mainChallenge:
			"Padarias e confeitarias têm potencial enorme de frequência, mas o cliente decide muito por conveniência. Se não houver vínculo, a compra vai para o caminho mais fácil.",
		cashbackUse: "Cashback com validade curta estimula retorno rápido para café, pão, doces, encomendas e produtos de fim de semana.",
		whatsappUse:
			"Campanhas podem divulgar fornadas, encomendas de festa, kits de café, datas comemorativas e lembrar clientes que sumiram da rotina.",
		rfmUse: "O RFM mostra clientes diários, compradores de encomenda, clientes de fim de semana e pessoas que reduziram frequência.",
		pdiUse: "O PDI precisa ser rápido, e nesse cenário ele registra telefone, venda e cashback sem travar a operação do balcão.",
		result: "Padarias e confeitarias aumentam frequência, estimulam encomendas e recuperam clientes que saíram da rotina.",
		keywords: ["crm padaria", "cashback padaria", "fidelização confeitaria", "marketing doceria"],
		relatedSlugs: ["restaurantes", "acougue-e-peixaria", "supermercado-e-mercearia"],
	}),
	createSegmentPage({
		slug: "sorveteria",
		name: "Sorveteria",
		audience: "sorveterias e gelaterias",
		emoji: "🍦",
		title: "Programa de Fidelidade para Sorveteria e Gelateria",
		metaDescription:
			"Cashback e campanhas no WhatsApp para sua sorveteria fidelizar clientes e aumentar a recompra. Configure em minutos e veja resultado em 30 dias. Agende uma demo.",
		tagline: "Programa de fidelidade para sorveterias e gelaterias",
		heroSubtitle:
			"Sorvete é compra por impulso — fidelidade é o que transforma o impulso em hábito. Cashback e WhatsApp trazem o cliente de volta antes do próximo calor.",
		answerBlock:
			"O RecompraCRM é um programa de fidelidade para sorveterias e gelaterias que combina cashback, campanhas automáticas no WhatsApp, registro rápido no balcão e análise RFM. Cada casquinha gera crédito para a próxima visita, e o sistema reativa clientes sumidos e movimenta os dias frios sem esforço manual da equipe.",
		publishedAt: "2026-03-10",
		cashbackPercent: "8%",
		expirationDays: "30",
		rescueLimit: "40%",
		purchaseCycle: "visitas quinzenais",
		mainChallenge:
			"Sorveteria vive de impulso, clima e sazonalidade. Nos dias quentes a fila dobra, mas no inverno e nos dias de chuva o movimento despenca — e o cliente que amou o gelato simplesmente esquece de voltar.",
		cashbackUse:
			"O cashback transforma o impulso de hoje em plano para a próxima visita: o cliente sai com crédito na mão e um prazo para usá-lo, o que aproxima as visitas e sustenta o movimento fora do pico.",
		whatsappUse:
			"Campanhas podem reativar quem não aparece há semanas, divulgar sabores novos, criar ações para dias frios e aniversários, e avisar quando o saldo de cashback está perto de vencer.",
		rfmUse:
			"O RFM mostra quem vem toda semana, quem só aparece no verão e quem experimentou uma vez e sumiu — para cada grupo, uma campanha diferente, em vez de promoção genérica.",
		pdiUse:
			"No balcão, o PDI registra a venda pelo telefone do cliente em segundos, sem atrapalhar a fila do fim de semana. Sem aplicativo, sem cartão de papel picotado.",
		result: "Sorveterias reduzem a dependência do clima, aumentam a frequência de visitas e transformam clientes de verão em clientes do ano inteiro.",
		keywords: ["crm sorveteria", "fidelizar clientes sorveteria", "cashback sorveteria", "marketing sorveteria", "sistema fidelidade sorveteria"],
		relatedSlugs: ["restaurantes", "padaria-e-confeitaria", "delivery"],
	}),
	createSegmentPage({
		slug: "acougue-e-peixaria",
		name: "Açougue e Peixaria",
		audience: "açougues e peixarias",
		emoji: "🥩",
		title: "Programa de Fidelidade para Açougue e Peixaria",
		metaDescription:
			"Cashback e campanhas no WhatsApp para açougues e peixarias fidelizarem clientes da compra semanal. Traga o cliente de volta ao balcão. Agende uma demo.",
		tagline: "Programa de fidelidade para açougues e peixarias",
		heroSubtitle:
			"O cliente do churrasco de sábado pode ser o cliente de toda semana. Cashback e WhatsApp transformam confiança no corte em rotina de compra.",
		answerBlock:
			"O RecompraCRM é um programa de fidelidade para açougues e peixarias que combina cashback de validade curta, campanhas automáticas no WhatsApp e registro rápido no balcão. A compra semanal ganha um benefício concreto, e a loja passa a divulgar cortes, combos e peixe fresco para quem realmente compra.",
		publishedAt: "2026-03-19",
		cashbackPercent: "5%",
		expirationDays: "30",
		rescueLimit: "30%",
		purchaseCycle: "compras semanais",
		mainChallenge:
			"Açougue e peixaria vivem de confiança, qualidade e rotina. O cliente volta quando lembra, quando confia e quando enxerga vantagem em comprar sempre no mesmo lugar.",
		cashbackUse:
			"Cashback de validade curta ajuda a puxar a próxima compra semanal e pode incentivar cortes especiais, kits de churrasco e compras maiores.",
		whatsappUse: "Campanhas podem divulgar cortes do fim de semana, combos, chegada de peixe fresco, datas de churrasco e cashback prestes a vencer.",
		rfmUse: "O RFM separa clientes de compra semanal, clientes de alto ticket para churrasco e compradores que deixaram de aparecer.",
		pdiUse: "O PDI registra vendas pelo telefone no balcão e transforma um atendimento recorrente em dados para relacionamento.",
		result: "Açougues e peixarias aumentam previsibilidade semanal e fortalecem a fidelidade baseada em confiança e benefício.",
		keywords: ["crm açougue", "cashback açougue", "fidelização peixaria", "marketing açougue"],
		relatedSlugs: ["supermercado-e-mercearia", "padaria-e-confeitaria", "restaurantes"],
	}),
	createSegmentPage({
		slug: "supermercado-e-mercearia",
		name: "Supermercado e Mercearia",
		audience: "supermercados, mercados de bairro e mercearias",
		emoji: "🛒",
		title: "Programa de Fidelidade para Supermercado e Mercearia",
		metaDescription:
			"Cashback e inteligência de dados para supermercados e mercados de bairro fidelizarem clientes e elevarem o ticket. Veja como. Agende uma demonstração.",
		tagline: "Programa de fidelidade para supermercados e mercearias",
		heroSubtitle:
			"O cliente compra toda semana — só nem sempre na sua loja. Cashback conservador e campanhas no WhatsApp criam preferência sem corroer margem.",
		answerBlock:
			"O RecompraCRM é um programa de fidelidade para supermercados, mercados de bairro e mercearias que combina cashback com controle de margem, campanhas automáticas no WhatsApp e análise RFM. Em vez de competir só por panfleto de oferta, a loja cria um saldo que prende a próxima compra de reposição.",
		publishedAt: "2026-03-12",
		cashbackPercent: "3%",
		expirationDays: "30",
		rescueLimit: "25%",
		purchaseCycle: "compras de reposição",
		mainChallenge:
			"Supermercados e mercearias têm alta frequência, mas margens apertadas e muita comparação de preço. O cliente compra sempre, só nem sempre compra no mesmo lugar.",
		cashbackUse:
			"Um cashback conservador ajuda a criar preferência sem corroer margem. Em vez de competir apenas por preço em todos os itens, a loja cria um saldo que prende a próxima compra.",
		whatsappUse:
			"Campanhas podem divulgar ofertas de reposição, lembrar cashback perto do vencimento, promover cestas sazonais e recuperar clientes que reduziram a frequência no mês.",
		rfmUse:
			"O RFM revela famílias que compram muito e com frequência, clientes de conveniência e compradores em queda. Cada grupo pode receber uma comunicação proporcional ao seu valor.",
		pdiUse: "O PDI permite registrar compras pelo telefone, acumular crédito e manter um histórico útil mesmo em operações simples de bairro.",
		result: "Mercados passam a competir por relacionamento e hábito, não apenas por panfleto de oferta.",
		keywords: ["crm supermercado", "fidelização mercearia", "cashback supermercado", "marketing mercado de bairro"],
		relatedSlugs: ["acougue-e-peixaria", "padaria-e-confeitaria", "farmacia-e-drogaria"],
	}),
	// --- Recorrência e cuidado ---
	createSegmentPage({
		slug: "pet-shop",
		name: "Pet Shop",
		audience: "pet shops e casas de ração",
		emoji: "🐾",
		title: "Programa de Fidelidade para Pet Shop e Casa de Ração",
		metaDescription:
			"CRM com cashback e WhatsApp automático para pet shops aumentarem a recorrência de tutores. Recupere clientes inativos sem esforço. Agende uma demonstração.",
		tagline: "Programa de fidelidade para pet shops e casas de ração",
		heroSubtitle:
			"A ração acaba a cada 30 dias — a pergunta é se o tutor volta na sua loja ou compra no marketplace. Cashback e WhatsApp garantem que ele volte.",
		answerBlock:
			"O RecompraCRM é um programa de fidelidade para pet shops e casas de ração que combina cashback, campanhas automáticas no WhatsApp e análise RFM. O ciclo previsível da ração vira recorrência garantida: o tutor acumula crédito a cada compra e recebe o lembrete certo antes de o pote esvaziar.",
		publishedAt: "2026-03-11",
		cashbackPercent: "5%",
		expirationDays: "45",
		rescueLimit: "30%",
		purchaseCycle: "reposição de ração",
		mainChallenge:
			"Pet shop é um dos varejos com maior potencial de recorrência: a ração acaba, o banho é semanal, o vínculo emocional é fortíssimo. Mas é também um dos mais atacados por marketplace e assinatura — quem não cria vínculo perde o tutor para o frete grátis.",
		cashbackUse:
			"O cashback acompanha o ciclo da ração: o tutor compra hoje, acumula crédito e tem um motivo concreto para voltar na próxima reposição em vez de pedir online. Também incentiva banho e tosa, petiscos e acessórios entre reposições.",
		whatsappUse:
			"Campanhas podem lembrar a reposição de ração no intervalo certo, avisar cashback expirando, divulgar banho e tosa em dias fracos, parabenizar o aniversário do pet e reativar tutores que não aparecem há mais de um ciclo.",
		rfmUse:
			"O RFM separa tutores recorrentes de alto valor, clientes só de ração, clientes de banho e tosa e quem está escorregando para o concorrente — cada grupo com uma ação própria.",
		pdiUse:
			"No balcão, o PDI registra a venda pelo telefone do tutor em segundos e mostra o saldo acumulado, transformando cada atendimento em dado de retenção sem cadastro demorado.",
		result: "Pet shops aumentam a recorrência de ração, elevam o ticket com serviços e acessórios e param de perder tutores para o marketplace.",
		keywords: ["crm petshop", "fidelizar clientes petshop", "cashback pet shop", "programa fidelidade pet", "marketing pet shop"],
		relatedSlugs: ["farmacia-e-drogaria", "supermercado-e-mercearia", "varejo"],
	}),
	createSegmentPage({
		slug: "farmacia-e-drogaria",
		name: "Farmácia e Drogaria",
		audience: "farmácias e drogarias",
		emoji: "💊",
		title: "Programa de Fidelidade para Farmácia e Drogaria",
		metaDescription:
			"Cashback e campanhas automáticas para farmácias fidelizarem clientes e garantirem a recompra de recorrentes. Configure hoje. Agende uma demo do RecompraCRM.",
		tagline: "Programa de fidelidade para farmácias e drogarias",
		heroSubtitle:
			"O cliente recorrente de farmácia vale ouro — e alterna entre preço, proximidade e urgência. Cashback e lembretes no WhatsApp criam preferência de verdade.",
		answerBlock:
			"O RecompraCRM é um programa de fidelidade para farmácias e drogarias que combina cashback moderado em categorias permitidas, campanhas automáticas no WhatsApp e análise RFM. Clientes de uso contínuo ganham um motivo para concentrar as compras na mesma farmácia, e a loja passa a agir antes de perder recorrência.",
		publishedAt: "2026-03-14",
		cashbackPercent: "3%",
		expirationDays: "45",
		rescueLimit: "25%",
		purchaseCycle: "reposição recorrente",
		mainChallenge:
			"Farmácias têm compras recorrentes, mas o cliente alterna entre preço, proximidade e urgência. A retenção depende de conveniência, lembrança e confiança.",
		cashbackUse: "Um cashback moderado em categorias permitidas cria incentivo para voltar sem depender de desconto agressivo em todos os produtos.",
		whatsappUse:
			"Campanhas podem lembrar itens de cuidado contínuo, produtos de higiene, dermocosméticos, aniversário e cashback próximo do vencimento.",
		rfmUse: "O RFM ajuda a identificar clientes frequentes, clientes de alto ticket em dermocosméticos e compradores que reduziram a recorrência.",
		pdiUse: "O PDI registra vendas de forma rápida no balcão e fortalece o vínculo pelo telefone, mantendo histórico para futuras ações.",
		result: "Farmácias criam uma base mais recorrente e comunicável, com campanhas segmentadas e controle sobre o impacto de cada ação.",
		keywords: ["crm farmácia", "fidelização farmácia", "cashback farmácia", "marketing drogaria"],
		relatedSlugs: ["perfumaria-e-cosmeticos", "supermercado-e-mercearia", "pet-shop"],
	}),
	createSegmentPage({
		slug: "perfumaria-e-cosmeticos",
		name: "Perfumaria e Cosméticos",
		audience: "perfumarias, lojas de cosméticos e beleza",
		emoji: "💄",
		title: "Programa de Fidelidade para Perfumaria e Cosméticos",
		metaDescription:
			"CRM com cashback para perfumarias e lojas de beleza aumentarem a recompra. Campanhas automáticas no WhatsApp que vendem sozinhas. Agende uma demonstração.",
		tagline: "Programa de fidelidade para perfumarias e cosméticos",
		heroSubtitle:
			"Reposição previsível + desejo por novidade = o segmento perfeito para fidelizar. Cashback mantém a próxima reposição na sua loja, não no marketplace.",
		answerBlock:
			"O RecompraCRM é um programa de fidelidade para perfumarias e lojas de cosméticos que combina cashback, campanhas automáticas no WhatsApp e análise RFM. A reposição de produtos de uso contínuo fica presa à sua loja, e o crédito acumulado incentiva a experimentação de kits, lançamentos e linhas premium.",
		publishedAt: "2026-03-13",
		cashbackPercent: "8%",
		expirationDays: "60",
		rescueLimit: "45%",
		purchaseCycle: "reposição e autocuidado",
		mainChallenge:
			"Beleza combina recompra previsível com desejo por novidade. O cliente repõe produtos de uso contínuo, mas também troca de marca quando recebe uma oferta melhor.",
		cashbackUse:
			"Cashback ajuda a manter a próxima reposição dentro da sua loja e ainda incentiva experimentação de novos produtos, kits e linhas premium.",
		whatsappUse:
			"Campanhas podem lembrar reposição de shampoo, skincare e perfume, divulgar lançamentos, criar kits de presente e acionar clientes que compravam com frequência e pararam.",
		rfmUse:
			"O RFM identifica clientes recorrentes de alto valor, compradores de datas comemorativas e pessoas que precisam de estímulo para a segunda compra.",
		pdiUse: "O PDI dá ao atendente uma forma simples de registrar a venda e reforçar o saldo de cashback no fim do atendimento consultivo.",
		result: "Perfumarias e lojas de cosméticos aumentam recompra, elevam ticket com kits e reduzem perda de clientes para marketplaces.",
		keywords: ["crm perfumaria", "crm cosméticos", "cashback cosméticos", "fidelização beleza"],
		relatedSlugs: ["farmacia-e-drogaria", "loja-de-roupas", "joalheria-e-acessorios"],
	}),
	// --- Moda e estilo ---
	createSegmentPage({
		slug: "loja-de-roupas",
		name: "Loja de Roupas",
		audience: "lojas de roupas, moda e vestuário",
		emoji: "👗",
		title: "Programa de Fidelidade para Loja de Roupas e Moda",
		metaDescription:
			"Fidelize clientes da sua loja de roupas com cashback e campanhas automáticas no WhatsApp. Faça o cliente voltar a cada coleção. Peça uma demo do RecompraCRM.",
		tagline: "Programa de fidelidade para lojas de roupas e moda",
		heroSubtitle:
			"A cliente que amou a compra de hoje precisa lembrar de você na próxima coleção. Cashback cria a ponte — e o WhatsApp faz o convite.",
		answerBlock:
			"O RecompraCRM é um programa de fidelidade para lojas de roupas e moda que combina cashback, campanhas automáticas no WhatsApp e análise RFM. Cada compra gera crédito que puxa a cliente de volta no lançamento da coleção, na troca de estação e nas datas fortes — sem depender só de post no Instagram.",
		publishedAt: "2026-03-11",
		cashbackPercent: "8%",
		expirationDays: "60",
		rescueLimit: "40%",
		purchaseCycle: "troca de coleção e estação",
		mainChallenge:
			"Moda tem forte concorrência, compra emocional e sazonalidade por coleção. A cliente pode amar a loja e ainda assim passar meses sem voltar — porque ninguém a chamou de volta no momento certo.",
		cashbackUse:
			"O cashback transforma a compra da coleção atual em crédito para a próxima: a cliente sai da loja com um motivo financeiro concreto para voltar na troca de estação, em vez de esperar a memória funcionar.",
		whatsappUse:
			"Campanhas podem avisar lançamento de coleção, peças que combinam com a última compra, promoções de fim de estação, aniversário e saldo de cashback perto de vencer — mensagens que parecem atendimento, não spam.",
		rfmUse:
			"O RFM separa clientes de alto ticket, caçadoras de promoção, clientes fiéis de coleção e quem comprou uma vez e sumiu — cada grupo com abordagem e oferta próprias.",
		pdiUse:
			"No caixa, o PDI registra a venda pelo telefone, vincula a vendedora e mostra o crédito disponível — útil para fechar a peça adicional na hora.",
		result: "Lojas de moda aumentam a recompra entre coleções, elevam o ticket com venda complementar e reduzem a dependência de liquidação.",
		keywords: ["crm loja de roupas", "fidelizar clientes moda", "cashback loja de roupa", "programa fidelidade moda", "marketing loja de roupas"],
		relatedSlugs: ["loja-de-calcados", "joalheria-e-acessorios", "perfumaria-e-cosmeticos"],
	}),
	createSegmentPage({
		slug: "loja-de-calcados",
		name: "Loja de Calçados",
		audience: "lojas de calçados",
		emoji: "👟",
		title: "Programa de Fidelidade para Loja de Calçados",
		metaDescription:
			"Fidelize clientes da sua loja de calçados com cashback e WhatsApp automático. Reative quem não compra há meses. Peça uma demo gratuita do RecompraCRM.",
		tagline: "Programa de fidelidade para lojas de calçados",
		heroSubtitle:
			"Ticket relevante, compra espaçada, muita ocasião: calçados precisam de uma ponte entre uma compra e a próxima. O cashback é essa ponte.",
		answerBlock:
			"O RecompraCRM é um programa de fidelidade para lojas de calçados que combina cashback, campanhas automáticas no WhatsApp e análise RFM. Quem comprou um tênis ganha crédito para voltar — para meia, palmilha, chinelo ou o próximo par na nova ocasião — e a loja aciona o cliente nas datas que importam.",
		publishedAt: "2026-03-13",
		cashbackPercent: "8%",
		expirationDays: "60",
		rescueLimit: "40%",
		purchaseCycle: "troca de modelos e ocasiões",
		mainChallenge:
			"Calçados têm ticket relevante, compra menos frequente e forte influência de ocasião: volta às aulas, trabalho, esporte, festa, presente e troca de estação.",
		cashbackUse:
			"O cashback cria uma ponte entre uma compra e a próxima. Quem comprou um tênis pode voltar para meia, palmilha, chinelo, produto de cuidado ou outro par em uma nova ocasião.",
		whatsappUse:
			"Campanhas podem avisar lançamento de coleção, numeração disponível, volta às aulas, Dia dos Pais, Dia das Mães e saldo prestes a vencer.",
		rfmUse: "O RFM separa clientes de alto ticket, compradores de promoção, famílias recorrentes e clientes que compraram uma vez e não voltaram.",
		pdiUse:
			"No caixa, o PDI ajuda a identificar o cliente por telefone, registrar o vendedor e mostrar o crédito disponível para complementar a venda.",
		result: "Lojas de calçados ganham motivos para trazer o cliente entre grandes compras e aumentam oportunidades de venda complementar.",
		keywords: ["crm loja de calçados", "cashback calçados", "fidelização sapataria", "marketing calçados"],
		relatedSlugs: ["loja-de-roupas", "esportes-e-lazer", "joalheria-e-acessorios"],
	}),
	createSegmentPage({
		slug: "joalheria-e-acessorios",
		name: "Joalheria e Acessórios",
		audience: "joalherias e lojas de acessórios",
		emoji: "💎",
		title: "Programa de Fidelidade para Joalheria e Acessórios",
		metaDescription:
			"Fidelize clientes da sua joalheria com cashback e campanhas segmentadas no WhatsApp. Aumente a recompra em datas-chave. Peça uma demo do RecompraCRM.",
		tagline: "Programa de fidelidade para joalherias e acessórios",
		heroSubtitle:
			"Entre uma data especial e a próxima, sua marca precisa continuar lembrada. Cashback de alto valor e campanhas VIP fazem esse trabalho.",
		answerBlock:
			"O RecompraCRM é um programa de fidelidade para joalherias e lojas de acessórios que combina cashback em compras de alto valor, campanhas segmentadas no WhatsApp e análise RFM. O crédito da compra de hoje vira presente complementar, manutenção ou a próxima data comemorativa — e os clientes VIP recebem tratamento à altura.",
		publishedAt: "2026-03-16",
		cashbackPercent: "10%",
		expirationDays: "120",
		rescueLimit: "50%",
		purchaseCycle: "presentes e ocasiões",
		mainChallenge:
			"Joalherias e acessórios dependem de datas, presentes e desejo. O cliente compra em ocasiões específicas, e a marca precisa permanecer lembrada até a próxima.",
		cashbackUse:
			"Cashback em compras de alto valor cria crédito para manutenção, acessórios menores, presente complementar ou próxima data comemorativa.",
		whatsappUse: "Campanhas podem antecipar Dia dos Namorados, Dia das Mães, aniversários, lançamentos e convites VIP para clientes Campeões.",
		rfmUse: "O RFM identifica clientes de alto valor, compradores de datas específicas e pessoas que precisam de estímulo para uma nova ocasião.",
		pdiUse: "O PDI registra o histórico de compra e ajuda o vendedor a reforçar o relacionamento com um benefício concreto no fechamento.",
		result: "Joalherias deixam de depender apenas da próxima data forte e constroem uma base VIP acionável.",
		keywords: ["crm joalheria", "cashback joalheria", "fidelização acessórios", "marketing joalheria"],
		relatedSlugs: ["loja-de-roupas", "perfumaria-e-cosmeticos", "otica"],
	}),
	createSegmentPage({
		slug: "otica",
		name: "Ótica",
		audience: "óticas",
		emoji: "👓",
		title: "Programa de Fidelidade para Ótica",
		metaDescription:
			"CRM com cashback para óticas fidelizarem clientes e lembrarem da troca de lentes na hora certa. Campanhas automáticas no WhatsApp. Agende uma demonstração.",
		tagline: "Programa de fidelidade para óticas",
		heroSubtitle:
			"O cliente pode demorar meses para voltar — ou você pode dar motivos para ele aparecer antes: solar, segunda armação, lentes de contato, manutenção.",
		answerBlock:
			"O RecompraCRM é um programa de fidelidade para óticas que combina cashback de alto valor, campanhas automáticas no WhatsApp e análise RFM. O crédito da compra consultiva vira óculos solar, segunda armação ou lentes de contato — e o sistema lembra o cliente da revisão e da renovação na hora certa.",
		publishedAt: "2026-03-16",
		cashbackPercent: "12%",
		expirationDays: "120",
		rescueLimit: "50%",
		purchaseCycle: "renovação e acessórios",
		mainChallenge:
			"Óticas têm alto valor percebido, margens interessantes e recompra espaçada. O cliente pode demorar meses para voltar, então relacionamento é decisivo.",
		cashbackUse: "Cashback permite criar uma próxima visita para óculos solar, segunda armação, lentes de contato, manutenção ou acessórios.",
		whatsappUse: "Campanhas podem lembrar revisão, aniversário, renovação de lentes, promoções de segunda armação e créditos próximos do vencimento.",
		rfmUse: "O RFM ajuda a separar clientes premium, compradores de ocasião e clientes antigos que precisam ser reativados antes da próxima troca.",
		pdiUse:
			"O PDI registra a venda consultiva e mostra ao cliente o crédito gerado, fortalecendo a percepção de benefício em uma compra de maior ticket.",
		result: "Óticas criam novos motivos de retorno entre ciclos longos e aumentam a chance de segunda compra dentro da própria base.",
		keywords: ["crm ótica", "cashback ótica", "fidelização ótica", "marketing ótica"],
		relatedSlugs: ["joalheria-e-acessorios", "farmacia-e-drogaria", "perfumaria-e-cosmeticos"],
	}),
	// --- Casa, hobby e família ---
	createSegmentPage({
		slug: "eletronicos-e-eletrodomesticos",
		name: "Eletrônicos e Eletrodomésticos",
		audience: "lojas de eletrônicos e eletrodomésticos",
		emoji: "📱",
		title: "Programa de Fidelidade para Loja de Eletrônicos",
		metaDescription:
			"Cashback e campanhas automáticas para lojas de eletrônicos e eletrodomésticos fidelizarem clientes e venderem mais. Veja em 30 dias. Agende uma demo.",
		tagline: "Programa de fidelidade para lojas de eletrônicos",
		heroSubtitle:
			"Depois da compra grande, vem o silêncio — a menos que a compra grande gere crédito para acessórios, upgrades e a próxima necessidade.",
		answerBlock:
			"O RecompraCRM é um programa de fidelidade para lojas de eletrônicos e eletrodomésticos que combina cashback conservador, campanhas automáticas no WhatsApp e análise RFM. A compra de alto ticket gera crédito que traz o cliente de volta para acessórios, periféricos e pequenos eletros — em vez de sumir até a próxima TV.",
		publishedAt: "2026-03-15",
		cashbackPercent: "3%",
		expirationDays: "90",
		rescueLimit: "20%",
		purchaseCycle: "troca e acessórios",
		mainChallenge:
			"Eletrônicos têm ticket alto, margem pressionada e baixa frequência. Depois de uma compra grande, a loja precisa criar novas oportunidades sem depender só de outra compra grande.",
		cashbackUse:
			"Cashback pode trazer o cliente de volta para acessórios, garantia, instalação, cabos, capas, suportes, periféricos e pequenos eletros.",
		whatsappUse:
			"Campanhas podem divulgar acessórios compatíveis, ofertas de upgrade, datas comerciais e saldo de cashback gerado por compras de maior valor.",
		rfmUse: "O RFM mostra clientes de alto ticket, compradores recorrentes de acessórios e pessoas que compraram uma vez e nunca mais voltaram.",
		pdiUse: "O PDI registra a venda e reforça no caixa que a compra grande gerou crédito para uma próxima necessidade.",
		result: "Lojas de eletrônicos aumentam recompra em categorias complementares e mantêm contato com clientes de alto valor.",
		keywords: ["crm eletrônicos", "cashback eletrodomésticos", "fidelização eletrônicos", "marketing loja eletrônicos"],
		relatedSlugs: ["casa-e-decoracao", "autopecas", "esportes-e-lazer"],
	}),
	createSegmentPage({
		slug: "casa-e-decoracao",
		name: "Casa e Decoração",
		audience: "lojas de casa, decoração, móveis e utilidades",
		emoji: "🛋️",
		title: "Programa de Fidelidade para Loja de Casa e Decoração",
		metaDescription:
			"CRM com cashback para lojas de decoração e móveis aumentarem a recompra. Reative clientes com campanhas automáticas. Agende uma demo do RecompraCRM.",
		tagline: "Programa de fidelidade para lojas de casa e decoração",
		heroSubtitle:
			"Entre um projeto e outro, o cliente some. Cashback e campanhas de inspiração criam a ponte para itens complementares e o próximo ambiente.",
		answerBlock:
			"O RecompraCRM é um programa de fidelidade para lojas de casa, decoração e móveis que combina cashback, campanhas automáticas no WhatsApp e análise RFM. A peça grande de hoje gera crédito para almofadas, iluminação e decoração menor — e a loja mantém contato útil até o próximo projeto do cliente.",
		publishedAt: "2026-03-17",
		cashbackPercent: "8%",
		expirationDays: "90",
		rescueLimit: "40%",
		purchaseCycle: "projetos e ambientação",
		mainChallenge:
			"Casa e decoração tem compra inspiracional, ticket variável e ciclos por projeto. O cliente pode comprar uma peça hoje e só voltar quando tiver novo ambiente para montar.",
		cashbackUse:
			"Cashback cria uma ponte para itens complementares: almofadas, aromatizadores, utensílios, iluminação, tapetes, vasos e decoração menor.",
		whatsappUse:
			"Campanhas podem divulgar coleções, combinações de ambientes, datas de casa nova, promoções por categoria e crédito gerado em compras maiores.",
		rfmUse: "O RFM identifica clientes em projeto ativo, compradores de alto ticket e clientes que precisam ser reativados com inspiração e benefício.",
		pdiUse: "O PDI registra vendas por cliente e vendedor, dando visibilidade para relacionamento consultivo e futuras indicações.",
		result: "Lojas de casa e decoração aumentam venda complementar e mantêm contato útil entre projetos.",
		keywords: ["crm decoração", "cashback móveis", "fidelização casa decoração", "marketing loja decoração"],
		relatedSlugs: ["eletronicos-e-eletrodomesticos", "materiais-de-construcao", "papelaria-e-presentes"],
	}),
	createSegmentPage({
		slug: "esportes-e-lazer",
		name: "Esportes e Lazer",
		audience: "lojas de artigos esportivos e lazer",
		emoji: "🏋️",
		title: "Programa de Fidelidade para Loja de Esportes",
		metaDescription:
			"Fidelize clientes da sua loja de artigos esportivos com cashback e WhatsApp automático. Faça o cliente voltar e gastar mais. Peça uma demonstração.",
		tagline: "Programa de fidelidade para lojas de esportes",
		heroSubtitle:
			"Quem começa um esporte evolui — e cada evolução é uma compra. Cashback e campanhas por modalidade acompanham a jornada do cliente.",
		answerBlock:
			"O RecompraCRM é um programa de fidelidade para lojas de artigos esportivos que combina cashback, campanhas automáticas no WhatsApp e análise RFM. O cliente que comprou o primeiro tênis de corrida ganha crédito para roupas, acessórios e upgrades — e a loja aciona cada modalidade com a campanha certa.",
		publishedAt: "2026-03-18",
		cashbackPercent: "7%",
		expirationDays: "60",
		rescueLimit: "40%",
		purchaseCycle: "treino, hobby e temporada",
		mainChallenge:
			"Esporte e lazer vendem por hábito, objetivo e temporada. Quem começa uma atividade precisa de reposição, acessórios e evolução de equipamento.",
		cashbackUse: "Cashback incentiva o cliente a voltar para acessórios, roupas, suplementação, manutenção ou upgrade conforme avança no esporte.",
		whatsappUse:
			"Campanhas podem segmentar por modalidade, divulgar lançamentos, ativar volta aos treinos e recuperar clientes que pararam de comprar.",
		rfmUse: "O RFM mostra atletas recorrentes, compradores por temporada e clientes promissores que ainda estão formando hábito.",
		pdiUse: "O PDI registra vendas e vendedores, ajudando a equipe a acompanhar relacionamento com clientes de maior potencial.",
		result: "Lojas de esporte transformam compra pontual em jornada de evolução, com mais recorrência e venda complementar.",
		keywords: ["crm loja esportiva", "cashback artigos esportivos", "fidelização esportes", "marketing loja esportes"],
		relatedSlugs: ["loja-de-calcados", "brinquedos-e-infantil", "eletronicos-e-eletrodomesticos"],
	}),
	createSegmentPage({
		slug: "brinquedos-e-infantil",
		name: "Brinquedos e Infantil",
		audience: "lojas de brinquedos e produtos infantis",
		emoji: "🧸",
		title: "Programa de Fidelidade para Loja Infantil e Brinquedos",
		metaDescription:
			"Cashback e campanhas automáticas para lojas de brinquedos e produtos infantis fidelizarem famílias. Aumente a recompra. Agende uma demo do RecompraCRM.",
		tagline: "Programa de fidelidade para lojas infantis e de brinquedos",
		heroSubtitle:
			"Criança cresce, muda de fase e de tamanho — cada fase é uma recompra. Cashback e campanhas por idade mantêm a família voltando.",
		answerBlock:
			"O RecompraCRM é um programa de fidelidade para lojas de brinquedos e produtos infantis que combina cashback, campanhas automáticas no WhatsApp e análise RFM. A família acumula crédito a cada compra e recebe sugestões pela fase da criança — do presente de aniversário à volta às aulas.",
		publishedAt: "2026-03-18",
		cashbackPercent: "8%",
		expirationDays: "60",
		rescueLimit: "45%",
		purchaseCycle: "crescimento e datas infantis",
		mainChallenge:
			"Brinquedos e infantil dependem de crescimento, presente e calendário. O cliente compra em datas fortes, mas também tem necessidades recorrentes conforme a criança muda de fase.",
		cashbackUse:
			"Cashback ajuda a trazer a família de volta para o próximo presente, roupa, acessório, item escolar ou brinquedo adequado à nova idade.",
		whatsappUse: "Campanhas podem ativar aniversário da criança, Dia das Crianças, Natal, volta às aulas, kits por faixa etária e cashback expirando.",
		rfmUse: "O RFM separa famílias frequentes, compradores de presente, clientes sazonais e clientes de alto valor.",
		pdiUse: "O PDI registra a compra pelo telefone e cria histórico para campanhas futuras sem exigir cadastro complexo na loja.",
		result: "Lojas infantis criam recorrência ao redor de fases da criança, não apenas de datas comemorativas.",
		keywords: ["crm brinquedos", "cashback loja infantil", "fidelização loja de brinquedos", "marketing infantil"],
		relatedSlugs: ["papelaria-e-presentes", "loja-de-roupas", "esportes-e-lazer"],
	}),
	createSegmentPage({
		slug: "papelaria-e-presentes",
		name: "Papelaria e Presentes",
		audience: "papelarias e lojas de presentes",
		emoji: "✏️",
		title: "Programa de Fidelidade para Papelaria e Loja de Presentes",
		metaDescription:
			"Cashback e WhatsApp automático para papelarias e lojas de presentes fidelizarem clientes o ano todo. Configure em minutos. Agende uma demonstração.",
		tagline: "Programa de fidelidade para papelarias e lojas de presentes",
		heroSubtitle:
			"Volta às aulas, Dia dos Professores, Natal — e todos os meses entre eles. Cashback conecta a sazonalidade com compras o ano inteiro.",
		answerBlock:
			"O RecompraCRM é um programa de fidelidade para papelarias e lojas de presentes que combina cashback, campanhas automáticas no WhatsApp e análise RFM. O pico da volta às aulas vira crédito que traz o cliente de volta entre as datas — para material complementar, presentes e compras por impulso.",
		publishedAt: "2026-03-17",
		cashbackPercent: "8%",
		expirationDays: "60",
		rescueLimit: "40%",
		purchaseCycle: "datas e reposição",
		mainChallenge:
			"Papelarias e presentes combinam compras recorrentes, sazonalidade escolar e compras por impulso. O cliente precisa lembrar da loja antes da data chegar.",
		cashbackUse:
			"Cashback funciona bem para voltar entre datas: material complementar, embalagem, itens criativos, papelaria fina e presentes menores.",
		whatsappUse:
			"Campanhas podem ativar volta às aulas, Dia dos Professores, Natal, aniversários, kits de presente e clientes com cashback próximo do vencimento.",
		rfmUse: "O RFM separa famílias recorrentes, compradores corporativos, clientes de presente e clientes sazonais.",
		pdiUse: "O PDI registra vendas rápidas e ajuda a transformar compras pequenas em histórico útil para próximas campanhas.",
		result: "Papelarias passam a conectar sazonalidade com relacionamento contínuo, aumentando retorno entre períodos de pico.",
		keywords: ["crm papelaria", "cashback papelaria", "fidelização loja de presentes", "marketing papelaria"],
		relatedSlugs: ["brinquedos-e-infantil", "casa-e-decoracao", "varejo"],
	}),
	// --- Técnico e profissional ---
	createSegmentPage({
		slug: "materiais-de-construcao",
		name: "Materiais de Construção",
		audience: "lojas de materiais de construção",
		emoji: "🛠️",
		title: "CRM e Fidelidade para Loja de Materiais de Construção",
		metaDescription:
			"Fidelize clientes da sua loja de construção com cashback e inteligência de recompra. Traga o cliente de volta na próxima obra. Peça uma demonstração.",
		tagline: "Programa de fidelidade para lojas de materiais de construção",
		heroSubtitle:
			"Uma obra rende várias compras — se o cliente não trocar de fornecedor a cada orçamento. Cashback mantém o projeto inteiro dentro da sua loja.",
		answerBlock:
			"O RecompraCRM é um programa de fidelidade para lojas de materiais de construção que combina cashback, campanhas automáticas no WhatsApp e análise RFM. O cliente acumula crédito da primeira compra de material bruto ao acabamento — e mestres de obra e profissionais recorrentes recebem tratamento diferenciado.",
		publishedAt: "2026-03-14",
		cashbackPercent: "5%",
		expirationDays: "90",
		rescueLimit: "30%",
		purchaseCycle: "obras e manutenção",
		mainChallenge:
			"Materiais de construção têm compras por projeto. O cliente pode voltar várias vezes durante uma obra, mas também pode trocar de fornecedor a cada orçamento.",
		cashbackUse:
			"Cashback ajuda a manter o cliente dentro da sua loja durante todo o projeto: primeira compra de material bruto, reposição, acabamento e manutenção.",
		whatsappUse:
			"Campanhas podem recuperar orçamentos não convertidos, lembrar saldo de cashback, divulgar condições por categoria e acionar clientes profissionais.",
		rfmUse: "O RFM destaca mestres de obra, profissionais recorrentes, clientes de obra ativa e compradores que sumiram depois de alto volume.",
		pdiUse: "No balcão, o PDI registra vendas por vendedor e cliente, ajudando a medir relacionamento comercial além do pedido isolado.",
		result: "Lojas de construção aumentam repetição durante obras, protegem clientes profissionais e acompanham melhor quem gera maior faturamento.",
		keywords: ["crm construção", "cashback material de construção", "fidelização loja de construção", "marketing materiais construção"],
		relatedSlugs: ["materiais-eletricos-e-hidraulicos", "casa-e-decoracao", "autopecas"],
	}),
	createSegmentPage({
		slug: "materiais-eletricos-e-hidraulicos",
		name: "Materiais Elétricos e Hidráulicos",
		audience: "lojas de materiais elétricos e hidráulicos",
		emoji: "⚡",
		title: "Programa de Fidelidade para Loja de Materiais Elétricos e Hidráulicos",
		metaDescription:
			"CRM com cashback para lojas de materiais elétricos e hidráulicos fidelizarem eletricistas, encanadores e clientes de obra. Peça uma demonstração.",
		tagline: "Programa de fidelidade para lojas de materiais elétricos e hidráulicos",
		heroSubtitle:
			"O eletricista que compra bem volta para todos os chamados. Cashback e condições para profissionais transformam urgência de obra em recorrência.",
		answerBlock:
			"O RecompraCRM é um programa de fidelidade para lojas de materiais elétricos e hidráulicos que combina cashback, campanhas automáticas no WhatsApp e análise RFM. Eletricistas, encanadores e clientes de obra acumulam crédito a cada serviço — e a loja enxerga quais contas profissionais sustentam o faturamento.",
		publishedAt: "2026-03-20",
		cashbackPercent: "5%",
		expirationDays: "90",
		rescueLimit: "30%",
		purchaseCycle: "obras, reparos e manutenção",
		mainChallenge:
			"Materiais elétricos e hidráulicos têm compra técnica, recorrência profissional e urgência de obra. Quem atende bem uma necessidade pode ganhar várias compras do mesmo projeto.",
		cashbackUse: "Cashback mantém eletricistas, encanadores e clientes de obra voltando para reposição, acabamento e novos chamados.",
		whatsappUse:
			"Campanhas podem divulgar linhas de giro, kits por tipo de serviço, condições para profissionais e recuperação de clientes que compravam com frequência.",
		rfmUse: "O RFM ajuda a identificar profissionais recorrentes, clientes de obra ativa e contas de alto valor em risco.",
		pdiUse: "O PDI registra compras por telefone e vendedor, criando histórico para acompanhamento comercial mesmo sem um ERP complexo.",
		result: "Lojas técnicas ganham recorrência com profissionais e melhor controle sobre clientes que sustentam o faturamento.",
		keywords: ["crm materiais elétricos", "cashback materiais hidráulicos", "fidelização loja elétrica", "marketing materiais elétricos"],
		relatedSlugs: ["materiais-de-construcao", "autopecas", "casa-e-decoracao"],
	}),
	createSegmentPage({
		slug: "autopecas",
		name: "Autopeças",
		audience: "lojas de autopeças",
		emoji: "🔧",
		title: "Programa de Fidelidade para Loja de Autopeças",
		metaDescription:
			"CRM com cashback e WhatsApp para autopeças aumentarem a recorrência de clientes. Recupere quem sumiu. Agende uma demo gratuita do RecompraCRM.",
		tagline: "Programa de fidelidade para lojas de autopeças",
		heroSubtitle:
			"Todo carro volta para manutenção — a questão é em qual loja. Cashback e relacionamento com oficinas garantem que seja na sua.",
		answerBlock:
			"O RecompraCRM é um programa de fidelidade para lojas de autopeças que combina cashback, campanhas automáticas no WhatsApp e análise RFM. Consumidor final e oficinas parceiras acumulam crédito a cada manutenção — e a loja aciona revisões sazonais e recupera quem sumiu, sem depender só de disponibilidade e preço.",
		publishedAt: "2026-03-15",
		cashbackPercent: "5%",
		expirationDays: "90",
		rescueLimit: "30%",
		purchaseCycle: "manutenção automotiva",
		mainChallenge:
			"Autopeças alterna urgência, orçamento e relacionamento com aplicadores. Quando o cliente precisa, ele compra de quem responde rápido e passa confiança.",
		cashbackUse: "Cashback fortalece a próxima manutenção e pode incentivar retorno para acessórios, fluidos, palhetas, lâmpadas e itens preventivos.",
		whatsappUse:
			"Campanhas podem acionar oficinas parceiras, divulgar linhas de giro, lembrar revisões sazonais e recuperar clientes que compravam com frequência.",
		rfmUse: "O RFM diferencia consumidor final, oficinas recorrentes e compradores de alto valor que merecem atendimento mais próximo.",
		pdiUse: "O PDI registra vendas e ajuda a equipe a vincular compras a clientes ou parceiros, melhorando a leitura de recorrência.",
		result: "Autopeças passa a usar relacionamento e recorrência como vantagem, não apenas disponibilidade e preço.",
		keywords: ["crm autopeças", "cashback autopeças", "fidelização autopeças", "marketing autopeças"],
		relatedSlugs: ["materiais-eletricos-e-hidraulicos", "materiais-de-construcao", "eletronicos-e-eletrodomesticos"],
	}),
	// --- Estrutura e escala ---
	createSegmentPage({
		slug: "rede-de-lojas",
		name: "Rede de Lojas e Franquias",
		audience: "redes de lojas, filiais e franquias",
		emoji: "🏬",
		title: "CRM para Rede de Lojas e Franquias",
		metaDescription:
			"Programa de fidelidade centralizado para redes de lojas e franquias: cashback, campanhas no WhatsApp e visão por unidade. Padronize a retenção. Agende uma demo.",
		tagline: "CRM de fidelização para redes de lojas e franquias",
		heroSubtitle:
			"Um programa único para todas as unidades: o cliente acumula em uma loja, resgata em qualquer outra — e a matriz enxerga a retenção da rede inteira.",
		answerBlock:
			"O RecompraCRM é um CRM de fidelização para redes de lojas e franquias que centraliza cashback, campanhas de WhatsApp e análise RFM em um programa único. O cliente acumula e resgata em qualquer unidade, cada loja opera seu próprio PDI, e a matriz compara retenção, vendas e campanhas por unidade nos dashboards.",
		publishedAt: "2026-07-11",
		cashbackPercent: "5%",
		expirationDays: "60",
		rescueLimit: "30%",
		purchaseCycle: "compras entre unidades",
		mainChallenge:
			"Em uma rede, cada unidade costuma tratar o cliente de um jeito: uma faz desconto no caderno, outra tem grupo de WhatsApp, outra não faz nada. O cliente que compra em duas lojas da mesma marca é tratado como dois desconhecidos — e a gestão não enxerga a retenção da rede como um todo.",
		cashbackUse:
			"Um programa de cashback único padroniza o benefício em todas as unidades: o cliente acumula em uma loja e resgata em qualquer outra da rede, fortalecendo a marca em vez de cada balcão isolado.",
		whatsappUse:
			"Campanhas centralizadas garantem que toda unidade se comunique com o mesmo padrão: recuperação de inativos, aniversário, segunda compra e cashback expirando rodam automaticamente para a base inteira, sem depender da iniciativa de cada gerente.",
		rfmUse:
			"O RFM consolidado mostra os melhores clientes da rede e também compara unidades: onde a recorrência é forte, onde a base está esfriando e qual loja precisa de ação primeiro.",
		pdiUse:
			"Cada unidade opera seu próprio PDI no balcão, mas todas alimentam a mesma base de clientes. A matriz acompanha vendas, campanhas e retenção por loja nos dashboards, com visão individual e agregada.",
		result:
			"Redes e franquias saem de ações isoladas por loja para uma máquina de retenção padronizada, com dados comparáveis entre unidades e uma base de clientes que pertence à marca.",
		keywords: ["crm rede de lojas", "fidelidade franquia", "programa de fidelidade multi-loja", "crm para franquias", "fidelização rede de lojas"],
		relatedSlugs: ["varejo", "restaurantes", "supermercado-e-mercearia"],
	}),
	createSegmentPage({
		slug: "varejo",
		name: "Varejo",
		audience: "lojas físicas de diferentes segmentos",
		emoji: "🏪",
		title: "Programa de Fidelidade para Loja Física e Varejo",
		metaDescription:
			"Cashback, campanhas no WhatsApp e análise RFM para qualquer loja física fidelizar clientes e aumentar a recompra. Configure em minutos. Agende uma demo.",
		tagline: "Programa de fidelidade para qualquer loja física",
		heroSubtitle:
			"Não achou seu segmento nas outras páginas? A lógica do varejo se repete: clientes compram, somem e voltam para quem se comunica melhor. O RecompraCRM funciona em qualquer balcão.",
		answerBlock:
			"O RecompraCRM é um programa de fidelidade para lojas físicas de qualquer segmento que combina cashback flexível, campanhas automáticas no WhatsApp, registro rápido no balcão e análise RFM. Toda operação com caixa, vendedor ou atendimento presencial pode sair do relacionamento improvisado para uma rotina mensurável de retenção.",
		publishedAt: "2026-03-20",
		cashbackPercent: "5%",
		expirationDays: "60",
		rescueLimit: "30%",
		purchaseCycle: "recompra do seu segmento",
		mainChallenge:
			"Mesmo quando o segmento não se encaixa em uma categoria óbvia, a lógica do varejo se repete: clientes compram, somem, voltam por acaso ou migram para quem se comunica melhor.",
		cashbackUse: "Cashback é um ponto de partida flexível para qualquer operação que queira dar ao cliente um motivo concreto para retornar.",
		whatsappUse:
			"Campanhas podem ser adaptadas para primeira compra, segunda compra, aniversário, recuperação de inativos, cashback expirando e ações sazonais.",
		rfmUse: "O RFM revela quais clientes merecem prioridade, quais estão esfriando e quais já precisam de uma campanha de recuperação.",
		pdiUse:
			"O PDI funciona em qualquer loja com balcão, caixa, vendedor ou atendimento presencial, registrando vendas e alimentando os dados de retenção.",
		result: "Qualquer varejo físico pode sair do relacionamento improvisado para uma rotina simples de fidelização, campanha e análise.",
		keywords: ["crm varejo", "cashback loja física", "fidelização varejo", "marketing loja física"],
		relatedSlugs: ["rede-de-lojas", "loja-de-roupas", "supermercado-e-mercearia"],
	}),
];

export function getSegmentPage(slug: string) {
	return SEGMENT_PAGES.find((page) => page.slug === slug);
}
