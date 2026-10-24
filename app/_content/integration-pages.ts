import type { StaticImageData } from "next/image";
import blingLogo from "@/utils/images/integrations/bling-logo.png";
import cardapioWebLogo from "@/utils/images/integrations/cardapio-web.png";
import ifoodLogo from "@/utils/images/integrations/ifood-logo.png";
import nuvemshopLogo from "@/utils/images/integrations/nuvemshop-logo.png";
import onlineSoftwareLogo from "@/utils/images/integrations/online-software-logo.png";
import type { FAQItem } from "./blog-posts";

// ----------------------------------------------------------------------------
// Content model for integration ("data connector") landing pages.
// One object per integration drives a full page + hub card. Adding a new
// integration = adding one object here. Icons are resolved by entity name and
// feature slug in components/Content/Integration/integration-icons.ts.
// ----------------------------------------------------------------------------

// A group of data the connector brings into RecompraCRM, described in plain
// business language (not source field names). Powers the "O que importamos" section
// and the "connected" panel in the hero.
export type IntegrationImportGroup = {
	entity: string; // e.g. "Vendas", "Clientes", "Produtos"
	summary: string; // one plain-language line: what comes in and why
	items: string[]; // human-readable things captured (no code / field paths)
};

// A single connection step ("Como funciona a conexão").
export type IntegrationStep = {
	title: string;
	body: string;
};

// A retention capability the imported data unlocks; links to a feature page.
export type IntegrationUnlock = {
	title: string;
	body: string;
	featureSlug: string;
};

export type IntegrationPage = {
	slug: string;
	name: string; // "Bling"
	category: string; // "ERP", "Delivery", "E-commerce", "Marketplace"
	logo: StaticImageData;
	logoAlt: string;
	title: string; // <title> / meta
	tagline: string; // hero H1 (sentence case)
	heroSubtitle: string;
	description: string; // meta description
	answerBlock: string; // 40–60 word extractable definition
	connectionSummary: string; // short line under the logo lockup
	whatWeImport: IntegrationImportGroup[];
	howItWorks: IntegrationStep[];
	unlocks: IntegrationUnlock[];
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
	updatedAt: string; // ISO date — freshness signal
	relatedIntegrationSlugs: string[];
};

export const INTEGRATION_PAGES: IntegrationPage[] = [
	{
		slug: "bling",
		name: "Bling",
		category: "ERP",
		logo: blingLogo,
		logoAlt: "Logotipo do Bling",
		title: "Integração Bling + RecompraCRM — cashback e WhatsApp automáticos",
		tagline: "Conecte o Bling e transforme cada venda em recompra",
		heroSubtitle:
			"A integração oficial importa seus pedidos, clientes e produtos do Bling automaticamente — e coloca cashback, segmentação e campanhas de WhatsApp para rodar sozinhos, sem digitar nada duas vezes.",
		description:
			"Integre o Bling ao RecompraCRM: importe vendas, clientes e produtos automaticamente e ative cashback, análise RFM e campanhas de WhatsApp. Veja como funciona a conexão passo a passo.",
		answerBlock:
			"A integração do RecompraCRM com o Bling importa automaticamente seus pedidos de venda, contatos e produtos do ERP a cada poucos minutos. Cada venda sincronizada vira base para cashback, segmentação RFM e campanhas de WhatsApp — sem digitação dupla e sem sair do fluxo que sua loja já usa no Bling.",
		connectionSummary: "Conexão oficial via OAuth. Sem planilhas, sem exportar arquivos.",
		whatWeImport: [
			{
				entity: "Vendas",
				summary: "Cada pedido do Bling vira uma venda completa no CRM — e cancelamentos são revertidos sozinhos.",
				items: ["Valor e data", "Itens e descontos", "Vendedor responsável", "Cancelamentos revertidos"],
			},
			{
				entity: "Clientes",
				summary: "Quem compra entra na sua base de contatos, pronto para receber cashback e campanhas.",
				items: ["Nome", "Telefone", "CPF / CNPJ", "Cidade e estado"],
			},
			{
				entity: "Produtos",
				summary: "Seu catálogo do Bling espelhado no CRM para análises de recompra por item.",
				items: ["Nome e código", "Categoria", "Unidade de medida"],
			},
		],
		howItWorks: [
			{
				title: "Autorize o Bling",
				body:
					"Em Configurações → Integrações, clique em conectar e autorize o acesso pela tela oficial do Bling (OAuth). Nenhuma senha é compartilhada com o RecompraCRM.",
			},
			{
				title: "Sincronização automática",
				body:
					"A cada poucos minutos o RecompraCRM busca os novos pedidos, contatos e produtos do período. Você acompanha a última sincronização e a contagem de itens importados.",
			},
			{
				title: "Organização automática",
				body: "Os pedidos do Bling viram vendas, os contatos viram clientes e os itens viram produtos — sem duplicar quem já está na sua base.",
			},
			{
				title: "Dados viram recompra",
				body:
					"Com as vendas no CRM, o cashback acumula sozinho, a análise RFM reclassifica os clientes e as campanhas de WhatsApp disparam nos gatilhos certos.",
			},
		],
		unlocks: [
			{
				title: "Cashback automático",
				body: "Cada venda importada do Bling acumula cashback conforme as regras do seu programa, sem lançamento manual.",
				featureSlug: "programa-de-cashback",
			},
			{
				title: "Campanhas de WhatsApp",
				body: "Primeira compra, cliente sumido e cashback expirando viram disparos automáticos a partir das vendas do Bling.",
				featureSlug: "campanhas-whatsapp",
			},
			{
				title: "Análise RFM e BI",
				body: "A base sincronizada alimenta a segmentação RFM e os painéis de faturamento, ticket médio e recompra.",
				featureSlug: "business-intelligence",
			},
		],
		faqs: [
			{
				question: "Como conectar o Bling ao RecompraCRM?",
				answer:
					"Em Configurações → Integrações, escolha o Bling e clique em conectar. Você é levado à tela oficial do Bling para autorizar o acesso (OAuth) e volta ao RecompraCRM já conectado. Não é preciso compartilhar senha nem gerar chaves manualmente. A partir daí a sincronização começa automaticamente.",
			},
			{
				question: "Quais dados o RecompraCRM importa do Bling?",
				answer:
					"O RecompraCRM importa os pedidos de venda (com valor, data, situação, itens e vendedor), os contatos (nome, telefone, CPF/CNPJ e endereço) e os produtos (código, nome, categoria, unidade e NCM). Esses dados alimentam o cashback, a análise RFM e as campanhas de WhatsApp automaticamente.",
			},
			{
				question: "Com que frequência a integração sincroniza?",
				answer:
					"A sincronização roda automaticamente a cada poucos minutos, buscando os pedidos, contatos e produtos mais recentes. Você não precisa apertar nenhum botão: assim que uma venda é registrada no Bling, ela chega ao RecompraCRM em seguida e já entra nos fluxos de retenção.",
			},
			{
				question: "Preciso lançar as vendas duas vezes?",
				answer:
					"Não. Você continua registrando as vendas normalmente no Bling e o RecompraCRM importa tudo sozinho. A integração foi feita justamente para lojas que já têm um ERP: elimina a digitação dupla e mantém a base de clientes e o cashback sempre atualizados.",
			},
			{
				question: "A integração com o Bling gera cashback sozinha?",
				answer:
					"Sim. Cada venda válida importada do Bling acumula cashback conforme as regras do seu programa (percentual ou valor fixo, com prazo de validade). Se a venda for cancelada no Bling, o cashback correspondente é revertido automaticamente, mantendo o saldo do cliente correto.",
			},
		],
		cta: {
			headline: "Ligue o Bling à sua estratégia de recompra",
			sub: "Agende uma demonstração gratuita e veja a integração importando vendas e gerando cashback ao vivo.",
			buttonText: "Agendar Demo Gratuita",
			whatsappMessage: "Olá! Quero saber mais sobre a integração do RecompraCRM com o Bling.",
		},
		seo: {
			keywords: [
				"integração bling",
				"bling crm",
				"conectar bling",
				"importar vendas bling",
				"bling cashback",
				"bling fidelização de clientes",
				"bling whatsapp marketing",
				"bling programa de fidelidade",
				"recompracrm bling",
			],
		},
		updatedAt: "2026-07-08",
		relatedIntegrationSlugs: ["online-software", "nuvem-shop", "cardapio-web"],
	},
	{
		slug: "online-software",
		name: "Online Software",
		category: "ERP",
		logo: onlineSoftwareLogo,
		logoAlt: "Logotipo da Online Software",
		title: "Integração Online Software + RecompraCRM — fidelização automática",
		tagline: "Ligue o Online Software e fidelize quem compra no balcão",
		heroSubtitle:
			"A integração importa as vendas do seu ERP Online Software automaticamente — com clientes, produtos, vendedores e dados fiscais — e ativa cashback, RFM e campanhas de WhatsApp sem digitar nada de novo.",
		description:
			"Integre o Online Software ao RecompraCRM: importe vendas, clientes, produtos e vendedores do ERP e ative cashback, análise RFM e campanhas de WhatsApp. Veja como conectar passo a passo.",
		answerBlock:
			"A integração do RecompraCRM com o Online Software importa automaticamente as vendas do seu ERP — incluindo clientes, produtos, vendedores e dados fiscais da nota. Cada venda de balcão vira base para cashback, segmentação RFM e campanhas de WhatsApp, sem digitação dupla e sem mudar a rotina da sua loja.",
		connectionSummary: "Conexão por credenciais de acesso do seu ERP. Sem planilhas.",
		whatWeImport: [
			{
				entity: "Vendas",
				summary: "Cada venda do balcão registrada no ERP vira uma venda completa no CRM, com dados fiscais da nota.",
				items: ["Valor e data", "Itens e descontos", "Nota fiscal (NF-e)", "Cancelamentos revertidos"],
			},
			{
				entity: "Clientes",
				summary: "Quem compra entra na sua base de contatos, pronto para receber cashback e campanhas.",
				items: ["Nome", "Telefone", "Histórico de compras"],
			},
			{
				entity: "Produtos",
				summary: "Seu catálogo do ERP espelhado no CRM para análises de recompra por item.",
				items: ["Código e descrição", "Grupo", "Unidade e NCM"],
			},
			{
				entity: "Equipe",
				summary: "Vendedores e parceiros vêm junto, para você medir desempenho e atribuir cada venda.",
				items: ["Vendedores", "Parceiros"],
			},
		],
		howItWorks: [
			{
				title: "Informe suas credenciais",
				body: "Em Configurações → Integrações, escolha o Online Software e informe as credenciais de acesso do seu ERP. A conexão é validada na hora.",
			},
			{
				title: "Sincronização automática",
				body:
					"A cada poucos minutos o RecompraCRM busca as novas vendas do período no seu ERP. Você acompanha a última sincronização e a contagem de itens importados.",
			},
			{
				title: "Organização automática",
				body:
					"As vendas do Online Software viram vendas no CRM, os clientes viram contatos e os itens viram produtos — sem duplicar quem já está na sua base.",
			},
			{
				title: "Dados viram recompra",
				body:
					"Com as vendas no CRM, o cashback acumula sozinho, a análise RFM reclassifica os clientes e as campanhas de WhatsApp disparam nos gatilhos certos.",
			},
		],
		unlocks: [
			{
				title: "Cashback automático",
				body: "Cada venda importada do Online Software acumula cashback conforme as regras do seu programa, sem lançamento manual.",
				featureSlug: "programa-de-cashback",
			},
			{
				title: "Campanhas de WhatsApp",
				body: "Primeira compra, cliente sumido e cashback expirando viram disparos automáticos a partir das vendas do ERP.",
				featureSlug: "campanhas-whatsapp",
			},
			{
				title: "Análise RFM e BI",
				body: "A base sincronizada alimenta a segmentação RFM e os painéis de faturamento, ticket médio e desempenho por vendedor.",
				featureSlug: "business-intelligence",
			},
		],
		faqs: [
			{
				question: "Como conectar o Online Software ao RecompraCRM?",
				answer:
					"Em Configurações → Integrações, escolha o Online Software e informe as credenciais de acesso do seu ERP (fornecidas pela Online Software). A conexão é validada na hora e a sincronização das vendas começa automaticamente, sem necessidade de suporte técnico.",
			},
			{
				question: "Quais dados o RecompraCRM importa do Online Software?",
				answer:
					"O RecompraCRM importa as vendas (com valor, data, itens e dados fiscais da nota), os clientes (nome e telefone), os produtos (código, descrição, grupo, unidade e NCM), além dos vendedores e parceiros. Tudo alimenta o cashback, a análise RFM e as campanhas de WhatsApp automaticamente.",
			},
			{
				question: "Preciso digitar as vendas duas vezes?",
				answer:
					"Não. Você continua registrando as vendas normalmente no Online Software e o RecompraCRM importa tudo sozinho. A integração foi feita para lojas que já têm o ERP no balcão: elimina a digitação dupla e mantém a base de clientes e o cashback sempre atualizados.",
			},
			{
				question: "A integração acompanha o desempenho dos vendedores?",
				answer:
					"Sim. Como os vendedores vêm junto com cada venda importada, o RecompraCRM gera rankings de desempenho, receita por vendedor e progresso de metas — dando ao gestor uma visão clara de quem mais vende e fideliza, sem controle manual.",
			},
		],
		cta: {
			headline: "Transforme as vendas do seu ERP em recompra",
			sub: "Agende uma demonstração gratuita e veja a integração importando vendas e gerando cashback ao vivo.",
			buttonText: "Agendar Demo Gratuita",
			whatsappMessage: "Olá! Quero saber mais sobre a integração do RecompraCRM com o Online Software.",
		},
		seo: {
			keywords: [
				"integração online software",
				"online software crm",
				"online software cashback",
				"online software fidelização",
				"importar vendas online software",
				"online software whatsapp marketing",
				"recompracrm online software",
			],
		},
		updatedAt: "2026-07-08",
		relatedIntegrationSlugs: ["bling", "cardapio-web", "nuvem-shop"],
	},
	{
		slug: "cardapio-web",
		name: "Cardápio Web",
		category: "Delivery e PDV",
		logo: cardapioWebLogo,
		logoAlt: "Logotipo do Cardápio Web",
		title: "Integração Cardápio Web + RecompraCRM — fidelize seus clientes de delivery",
		tagline: "Conecte o Cardápio Web e traga seus clientes de volta",
		heroSubtitle:
			"A integração importa os pedidos do seu Cardápio Web automaticamente — delivery, retirada e salão — e ativa cashback, RFM e campanhas de WhatsApp para transformar cada pedido em um cliente que volta.",
		description:
			"Integre o Cardápio Web ao RecompraCRM: importe pedidos, clientes e produtos automaticamente e ative cashback, análise RFM e campanhas de WhatsApp. Veja como conectar passo a passo.",
		answerBlock:
			"A integração do RecompraCRM com o Cardápio Web importa automaticamente seus pedidos de delivery, retirada e salão — com clientes, endereços e produtos. Cada pedido vira base para cashback, segmentação RFM e campanhas de WhatsApp, transformando o movimento do delivery numa base de clientes que você pode reativar.",
		connectionSummary: "Conexão por credenciais do seu Cardápio Web. Sem planilhas.",
		whatWeImport: [
			{
				entity: "Pedidos",
				summary: "Cada pedido de delivery, retirada ou salão vira uma venda completa no CRM.",
				items: ["Valor e data", "Itens e adicionais", "Taxa de entrega", "Canal (iFood, WhatsApp, Portal)"],
			},
			{
				entity: "Clientes",
				summary: "Quem pede entra na sua base com endereço, pronto para receber cashback e campanhas.",
				items: ["Nome", "Telefone", "Endereço de entrega", "Bairro e cidade"],
			},
			{
				entity: "Cardápio",
				summary: "Seus itens e combos espelhados no CRM para análises de recompra por produto.",
				items: ["Nome do item", "Combos", "Complementos e adicionais"],
			},
		],
		howItWorks: [
			{
				title: "Informe suas credenciais",
				body: "Em Configurações → Integrações, escolha o Cardápio Web e informe as credenciais de acesso da sua conta. A conexão é validada na hora.",
			},
			{
				title: "Sincronização automática",
				body:
					"A cada poucos minutos o RecompraCRM busca os novos pedidos do período. Você acompanha a última sincronização e a contagem de itens importados.",
			},
			{
				title: "Organização automática",
				body:
					"Os pedidos do Cardápio Web viram vendas no CRM, os clientes viram contatos e os itens viram produtos — sem duplicar quem já está na sua base.",
			},
			{
				title: "Pedidos viram recompra",
				body:
					"Com os pedidos no CRM, o cashback acumula sozinho, a análise RFM reclassifica os clientes e as campanhas de WhatsApp trazem de volta quem parou de pedir.",
			},
		],
		unlocks: [
			{
				title: "Cashback automático",
				body: "Cada pedido importado do Cardápio Web acumula cashback conforme as regras do seu programa, incentivando o próximo pedido.",
				featureSlug: "programa-de-cashback",
			},
			{
				title: "Campanhas de WhatsApp",
				body: "Primeiro pedido, cliente sumido e cashback expirando viram disparos automáticos que trazem o cliente de volta ao delivery.",
				featureSlug: "campanhas-whatsapp",
			},
			{
				title: "Análise RFM e BI",
				body: "A base sincronizada alimenta a segmentação RFM e os painéis de faturamento, ticket médio e frequência de pedidos.",
				featureSlug: "business-intelligence",
			},
		],
		faqs: [
			{
				question: "Como conectar o Cardápio Web ao RecompraCRM?",
				answer:
					"Em Configurações → Integrações, escolha o Cardápio Web e informe as credenciais de acesso da sua conta (identificador da loja e chave de API). A conexão é validada na hora e a importação dos pedidos começa automaticamente, sem necessidade de suporte técnico.",
			},
			{
				question: "Quais dados o RecompraCRM importa do Cardápio Web?",
				answer:
					"O RecompraCRM importa os pedidos (com valor, data, itens, adicionais e taxa de entrega), os clientes (nome, telefone e endereço de entrega) e os itens do cardápio, incluindo combos e complementos. Esses dados alimentam o cashback, a análise RFM e as campanhas de WhatsApp automaticamente.",
			},
			{
				question: "A integração funciona para delivery, retirada e salão?",
				answer:
					"Sim. O RecompraCRM identifica a modalidade de cada pedido — entrega, retirada, salão ou comanda — e o canal de origem (iFood, WhatsApp, portal ou catálogo). Assim você fideliza o cliente independentemente de como ele pediu, com a mensagem certa para cada perfil.",
			},
			{
				question: "Preciso digitar os pedidos duas vezes?",
				answer:
					"Não. Você continua operando normalmente no Cardápio Web e o RecompraCRM importa todos os pedidos sozinho. A integração elimina a digitação dupla e mantém a base de clientes e o cashback sempre atualizados, sem trabalho extra para a equipe.",
			},
		],
		cta: {
			headline: "Transforme o movimento do delivery em recompra",
			sub: "Agende uma demonstração gratuita e veja a integração importando pedidos e gerando cashback ao vivo.",
			buttonText: "Agendar Demo Gratuita",
			whatsappMessage: "Olá! Quero saber mais sobre a integração do RecompraCRM com o Cardápio Web.",
		},
		seo: {
			keywords: [
				"integração cardápio web",
				"cardápio web crm",
				"cardápio web cashback",
				"cardápio web fidelização",
				"fidelização delivery",
				"cardápio web whatsapp marketing",
				"recompracrm cardápio web",
			],
		},
		updatedAt: "2026-07-08",
		relatedIntegrationSlugs: ["ifood", "online-software", "bling"],
	},
	{
		slug: "nuvem-shop",
		name: "Nuvem Shop",
		category: "E-commerce",
		logo: nuvemshopLogo,
		logoAlt: "Logotipo da Nuvem Shop",
		title: "Integração Nuvem Shop + RecompraCRM — recompra para sua loja online",
		tagline: "Conecte a Nuvem Shop e faça o cliente comprar de novo",
		heroSubtitle:
			"A integração importa os pedidos da sua loja Nuvem Shop automaticamente — com clientes, e-mails e produtos com variantes — e ativa cashback, RFM e campanhas de WhatsApp para aumentar a recompra online.",
		description:
			"Integre a Nuvem Shop ao RecompraCRM: importe pedidos, clientes e produtos da sua loja online e ative cashback, análise RFM e campanhas de WhatsApp. Veja como conectar passo a passo.",
		answerBlock:
			"A integração do RecompraCRM com a Nuvem Shop importa automaticamente os pedidos da sua loja online — com clientes, e-mails e produtos com variantes e estoque. Cada pedido vira base para cashback, segmentação RFM e campanhas de WhatsApp, ajudando a transformar compradores de primeira viagem em clientes recorrentes.",
		connectionSummary: "Conexão oficial via OAuth. Sem exportar planilhas.",
		whatWeImport: [
			{
				entity: "Pedidos",
				summary: "Cada pedido da sua loja online vira uma venda completa no CRM, já com o status de pagamento.",
				items: ["Valor e data", "Itens e frete", "Desconto", "Pagamento confirmado"],
			},
			{
				entity: "Clientes",
				summary: "Quem compra entra na sua base com e-mail e endereço, pronto para campanhas.",
				items: ["Nome", "Telefone", "E-mail", "CPF / CNPJ", "Endereço"],
			},
			{
				entity: "Produtos",
				summary: "Seu catálogo espelhado no CRM, com variantes e estoque, para análises por item.",
				items: ["Nome e SKU", "Variantes (cor, tamanho)", "Categoria", "Estoque"],
			},
		],
		howItWorks: [
			{
				title: "Autorize a Nuvem Shop",
				body:
					"Em Configurações → Integrações, clique em conectar e autorize o acesso pela tela oficial da Nuvem Shop (OAuth). Nenhuma senha é compartilhada com o RecompraCRM.",
			},
			{
				title: "Sincronização automática",
				body:
					"A cada poucos minutos o RecompraCRM busca os novos pedidos e produtos da sua loja. Você acompanha a última sincronização e a contagem de itens importados.",
			},
			{
				title: "Organização automática",
				body:
					"Os pedidos da Nuvem Shop viram vendas no CRM, os clientes viram contatos e os itens viram produtos — sem duplicar quem já está na sua base.",
			},
			{
				title: "Pedidos viram recompra",
				body:
					"Com os pedidos no CRM, o cashback acumula sozinho, a análise RFM reclassifica os clientes e as campanhas de WhatsApp trazem de volta quem comprou uma vez só.",
			},
		],
		unlocks: [
			{
				title: "Cashback automático",
				body: "Cada pedido importado da Nuvem Shop acumula cashback conforme as regras do seu programa, incentivando a próxima compra online.",
				featureSlug: "programa-de-cashback",
			},
			{
				title: "Campanhas de WhatsApp",
				body: "Primeira compra, carrinho de quem sumiu e cashback expirando viram disparos automáticos de recompra.",
				featureSlug: "campanhas-whatsapp",
			},
			{
				title: "Análise RFM e BI",
				body: "A base sincronizada alimenta a segmentação RFM e os painéis de faturamento, ticket médio e recompra da loja online.",
				featureSlug: "business-intelligence",
			},
		],
		faqs: [
			{
				question: "Como conectar a Nuvem Shop ao RecompraCRM?",
				answer:
					"Em Configurações → Integrações, escolha a Nuvem Shop e clique em conectar. Você é levado à tela oficial da Nuvem Shop para autorizar o acesso (OAuth) e volta ao RecompraCRM já conectado, sem compartilhar senha. A sincronização dos pedidos começa automaticamente.",
			},
			{
				question: "Quais dados o RecompraCRM importa da Nuvem Shop?",
				answer:
					"O RecompraCRM importa os pedidos (com valor, data, itens, frete e status de pagamento), os clientes (nome, telefone, e-mail, CPF/CNPJ e endereço) e os produtos com variantes, categorias e estoque. Esses dados alimentam o cashback, a análise RFM e as campanhas de WhatsApp automaticamente.",
			},
			{
				question: "A integração importa os produtos com variantes?",
				answer:
					"Sim. O RecompraCRM espelha seu catálogo da Nuvem Shop com as variantes (por exemplo, cor e tamanho), SKUs, categorias e estoque. Isso permite análises de recompra por produto e por variante, além de manter o catálogo do CRM sempre alinhado à sua loja.",
			},
			{
				question: "Só entram pedidos pagos?",
				answer:
					"O RecompraCRM considera válidos os pedidos pagos (ou parcialmente pagos) e não cancelados para gerar cashback. Se um pedido é cancelado, estornado ou reembolsado na Nuvem Shop, o cashback correspondente é revertido automaticamente, mantendo o saldo do cliente correto.",
			},
		],
		cta: {
			headline: "Aumente a recompra da sua loja online",
			sub: "Agende uma demonstração gratuita e veja a integração importando pedidos e gerando cashback ao vivo.",
			buttonText: "Agendar Demo Gratuita",
			whatsappMessage: "Olá! Quero saber mais sobre a integração do RecompraCRM com a Nuvem Shop.",
		},
		seo: {
			keywords: [
				"integração nuvem shop",
				"nuvemshop crm",
				"nuvem shop cashback",
				"nuvem shop fidelização",
				"recompra e-commerce",
				"nuvem shop whatsapp marketing",
				"recompracrm nuvem shop",
			],
		},
		updatedAt: "2026-07-08",
		relatedIntegrationSlugs: ["bling", "cardapio-web", "ifood"],
	},
	{
		slug: "ifood",
		name: "iFood",
		category: "Marketplace",
		logo: ifoodLogo,
		logoAlt: "Logotipo do iFood",
		title: "Integração iFood + RecompraCRM — fidelize seus clientes de delivery",
		tagline: "Conecte o iFood e transforme pedidos em clientes recorrentes",
		heroSubtitle:
			"A integração importa os pedidos do seu iFood automaticamente — com clientes, endereços e itens — e ativa cashback, RFM e campanhas de WhatsApp para reativar quem pediu e reduzir a dependência do marketplace.",
		description:
			"Integre o iFood ao RecompraCRM: importe pedidos, clientes e produtos do marketplace e ative cashback, análise RFM e campanhas de WhatsApp. Veja como conectar passo a passo.",
		answerBlock:
			"A integração do RecompraCRM com o iFood importa automaticamente seus pedidos do marketplace — com clientes, endereços de entrega e itens. Cada pedido vira base para cashback, segmentação RFM e campanhas de WhatsApp, permitindo reativar quem pediu pelo iFood em canais diretos e reduzir a dependência do marketplace.",
		connectionSummary: "Conexão oficial via OAuth. Sem exportar planilhas.",
		whatWeImport: [
			{
				entity: "Pedidos",
				summary: "Cada pedido confirmado no iFood vira uma venda completa no CRM, com a modalidade de entrega.",
				items: ["Valor e data", "Itens e adicionais", "Taxa de entrega", "Entrega ou retirada"],
			},
			{
				entity: "Clientes",
				summary: "Quem pede entra na sua base com endereço de entrega, pronto para campanhas diretas.",
				items: ["Nome", "Telefone", "Endereço de entrega", "Bairro e cidade"],
			},
			{
				entity: "Produtos",
				summary: "Seus itens do iFood espelhados no CRM para análises de recompra por produto.",
				items: ["Nome do item", "Adicionais e observações"],
			},
		],
		howItWorks: [
			{
				title: "Autorize o iFood",
				body:
					"Em Configurações → Integrações, clique em conectar e autorize o acesso pela tela oficial do iFood (OAuth). Nenhuma senha é compartilhada com o RecompraCRM.",
			},
			{
				title: "Sincronização automática",
				body:
					"A cada poucos minutos o RecompraCRM busca os novos pedidos e sua evolução de status. Você acompanha a última sincronização e a contagem de itens importados.",
			},
			{
				title: "Organização automática",
				body: "Os pedidos do iFood viram vendas no CRM, os clientes viram contatos e os itens viram produtos — sem duplicar quem já está na sua base.",
			},
			{
				title: "Pedidos viram recompra",
				body:
					"Com os pedidos no CRM, o cashback acumula sozinho, a análise RFM reclassifica os clientes e as campanhas de WhatsApp trazem o cliente de volta pelo seu canal direto.",
			},
		],
		unlocks: [
			{
				title: "Cashback automático",
				body:
					"Cada pedido importado do iFood acumula cashback conforme as regras do seu programa, dando um motivo para o cliente pedir direto na próxima.",
				featureSlug: "programa-de-cashback",
			},
			{
				title: "Campanhas de WhatsApp",
				body: "Primeiro pedido, cliente sumido e cashback expirando viram disparos automáticos que reativam quem pediu pelo iFood.",
				featureSlug: "campanhas-whatsapp",
			},
			{
				title: "Análise RFM e BI",
				body: "A base sincronizada alimenta a segmentação RFM e os painéis de faturamento, ticket médio e frequência de pedidos.",
				featureSlug: "business-intelligence",
			},
		],
		faqs: [
			{
				question: "Como conectar o iFood ao RecompraCRM?",
				answer:
					"Em Configurações → Integrações, escolha o iFood e clique em conectar. Você é levado à tela oficial do iFood para autorizar o acesso (OAuth) e volta ao RecompraCRM já conectado, sem compartilhar senha. A sincronização dos pedidos começa automaticamente.",
			},
			{
				question: "Quais dados o RecompraCRM importa do iFood?",
				answer:
					"O RecompraCRM importa os pedidos confirmados (com valor, data, itens, adicionais e taxa de entrega), os clientes (nome, telefone e endereço de entrega) e os itens do pedido. Esses dados alimentam o cashback, a análise RFM e as campanhas de WhatsApp automaticamente.",
			},
			{
				question: "Como a integração ajuda a reduzir a dependência do iFood?",
				answer:
					"Ao importar os clientes que pedem pelo iFood, o RecompraCRM permite reativá-los pelo seu canal direto (WhatsApp) com cashback e campanhas. Assim você constrói uma base própria de clientes e incentiva os próximos pedidos a virem direto, com margem melhor do que a do marketplace.",
			},
			{
				question: "Quais pedidos entram como venda válida?",
				answer:
					"Entram como venda válida os pedidos confirmados ou concluídos no iFood. Pedidos cancelados não geram cashback, e se um pedido é cancelado após a confirmação, o cashback correspondente é revertido automaticamente, mantendo o saldo do cliente correto.",
			},
		],
		cta: {
			headline: "Fidelize quem pede pelo iFood",
			sub: "Agende uma demonstração gratuita e veja a integração importando pedidos e gerando cashback ao vivo.",
			buttonText: "Agendar Demo Gratuita",
			whatsappMessage: "Olá! Quero saber mais sobre a integração do RecompraCRM com o iFood.",
		},
		seo: {
			keywords: [
				"integração ifood",
				"ifood crm",
				"ifood cashback",
				"ifood fidelização",
				"fidelizar clientes ifood",
				"reduzir dependência ifood",
				"recompracrm ifood",
			],
		},
		updatedAt: "2026-07-08",
		relatedIntegrationSlugs: ["cardapio-web", "nuvem-shop", "online-software"],
	},
];

export function getIntegrationPage(slug: string): IntegrationPage | undefined {
	return INTEGRATION_PAGES.find((p) => p.slug === slug);
}
