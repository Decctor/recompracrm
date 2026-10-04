import type { TIsoCoverKey } from "@/components/Illustrations/Isometric/IsoCover";
import type { ContentSection, FAQItem } from "./blog-posts";

export type FeaturePage = {
	slug: string;
	title: string;
	headline: string;
	description: string;
	cover: TIsoCoverKey; // ilustração isométrica da capa
	sections: ContentSection[];
	faqs?: FAQItem[];
	cta: {
		headline: string;
		sub: string;
		buttonText: string;
		whatsappMessage: string;
	};
	seo: {
		keywords: string[];
	};
	relatedSegmentSlugs: string[]; // segment landings (/segmentos/[slug]) shown as "por segmento"
	relatedFeatureSlugs: string[];
	// Fontes dos números de mercado citados na página (números do próprio produto não entram).
	sources?: { label: string; url: string }[];
};

export const FEATURE_PAGES: FeaturePage[] = [
	{
		slug: "programa-de-cashback",
		title: "Programa de Cashback para Varejo — RecompraCRM",
		headline: "Transforme cada venda em motivo para o cliente voltar",
		description:
			"Crie um programa de cashback personalizado para sua loja física. Configure percentuais, prazos e regras — o RecompraCRM automatiza tudo enquanto você foca nas vendas.",
		cover: "feature-cashback",
		seo: {
			keywords: [
				"programa cashback loja",
				"cashback fidelização clientes",
				"sistema cashback varejo",
				"cashback loja física",
				"programa de fidelidade cashback",
				"como criar programa cashback",
				"software cashback varejo",
			],
		},
		relatedSegmentSlugs: ["restaurantes", "pet-shop", "loja-de-roupas"],
		relatedFeatureSlugs: ["campanhas-whatsapp", "ponto-de-interacao", "business-intelligence"],
		sources: [
			{
				label: "ABEMF/Valuenet — 88% dos brasileiros utilizam programas de fidelidade (via Panrotas)",
				url: "https://www.panrotas.com.br/mercado/pesquisas-e-estatisticas/2025/10/88-dos-brasileiros-utilizam-programas-de-fidelidade-diz-pesquisa-da-abemf_222537.html",
			},
			{
				label: "ABEMF — Panorama da Fidelização no Brasil, 3ª edição (via Estado de Minas)",
				url: "https://www.em.com.br/mundo-corporativo/2024/09/6951134-cashback-movimenta-comercios-e-atrai-consumidores.html",
			},
		],
		sections: [
			{
				type: "text",
				heading: "O que é cashback e por que ele funciona no varejo",
				body: "Cashback é simples: o cliente compra na sua loja e recebe de volta uma porcentagem do valor gasto — um crédito que só pode ser usado em uma próxima visita. Esse mecanismo cria um vínculo poderoso entre o consumidor e o seu negócio.\n\nAo contrário dos tradicionais cartões de pontos (que demoram séculos para render algo), o cashback é tangível e imediato. O cliente sabe exatamente quanto acumulou, sente que está ganhando dinheiro de volta, e tem um incentivo concreto para voltar antes que o crédito expire.",
			},
			{
				type: "stats",
				items: [
					{ value: "88,3%", label: "dos consumidores brasileiros usam programas de fidelidade", source: "ABEMF/Valuenet, 2025" },
					{ value: "53,3%", label: "querem cashback como benefício, atrás só do desconto", source: "ABEMF/Valuenet, 2025" },
					{ value: "83,2%", label: "preferem comprar de empresas que têm programa de fidelidade", source: "ABEMF, Panorama da Fidelização, 2024" },
				],
			},
			{
				type: "feature-highlight",
				icon: "gear",
				title: "Configure do seu jeito — sem complicação",
				body: "No RecompraCRM, você define as regras do cashback em minutos:\n\n• **Percentual de retorno**: de 1% a 20%, você escolhe o que faz sentido para a margem do seu negócio.\n• **Prazo de validade**: créditos expiram em 30, 60 ou 90 dias — criando urgência para o cliente voltar logo.\n• **Valor mínimo para resgate**: evite resgates insignificantes definindo um saldo mínimo.\n• **Promoções pontuais**: duplique o cashback em datas especiais para turbinar o movimento.\n\nTudo configurável pelo painel administrativo, sem precisar de TI ou suporte técnico.",
			},
			{
				type: "feature-highlight",
				icon: "monitor",
				title: "Integrado ao PDI — experiência fluida no caixa",
				body: "O cashback funciona em perfeita sincronia com o Ponto de Interação (PDI), nosso totem de balcão. O atendente registra a venda, o sistema calcula e acumula o cashback automaticamente, e o cliente vê o saldo atualizado na tela em tempo real.\n\nNa hora de resgatar, basta o cliente informar o CPF ou telefone. Sem app para baixar, sem cartão para carregar, sem atrito. O resgate é processado na hora, descontado do total da compra.",
			},
			{
				type: "feature-highlight",
				icon: "phone",
				title: "Notificações automáticas por WhatsApp",
				body: "Cada vez que o cliente acumula ou usa cashback, ele recebe uma notificação automática pelo WhatsApp com o extrato atualizado. Isso reforça a sensação de valor e mantém sua marca presente no celular do cliente sem esforço da sua equipe.\n\nAlém disso, quando o cashback está próximo de expirar, o sistema envia um lembrete automático — criando urgência e trazendo o cliente de volta antes que ele esqueça.",
			},
			{
				type: "feature-highlight",
				icon: "chart",
				title: "Relatórios que revelam o ROI real do cashback",
				body: "Através do painel de Business Intelligence do RecompraCRM, você acompanha em tempo real:\n\n• Quanto de cashback foi distribuído e resgatado por período\n• Quais clientes mais acumulam e mais resgatam\n• Taxa de retorno de clientes após acumular cashback\n• Comparativo de ticket médio: clientes com e sem cashback\n• ROI do programa — você vê exatamente quanto cada real de cashback gerou em receita",
			},
			{
				type: "text",
				heading: "Funciona para qualquer segmento do varejo físico",
				body: "O programa de cashback do RecompraCRM já foi implementado com sucesso em sorveterias, petshops, lojas de moda, farmácias, padarias, lojas de ferragens e muito mais. Qualquer negócio com venda direta ao consumidor e interesse em aumentar a frequência de compra pode se beneficiar.\n\nO setup é feito em menos de um dia. Nossa equipe configura o sistema junto com você, treina os atendentes e você já começa a acumular dados desde a primeira venda.",
			},
		],
		faqs: [
			{
				question: "Como funciona o programa de cashback do RecompraCRM?",
				answer:
					"O cliente compra na sua loja física e recebe de volta uma porcentagem do valor como crédito, que só pode ser usado em uma próxima compra. Você define o percentual, o prazo de validade e o valor mínimo de resgate. Todo o cálculo, acúmulo e resgate é automático, integrado ao caixa e às notificações por WhatsApp.",
			},
			{
				question: "Qual percentual de cashback devo oferecer na minha loja?",
				answer:
					"No RecompraCRM você configura de 1% a 20%. O percentual certo depende do seu ticket médio, da sua margem bruta e de quanto do crédito os clientes usam: o custo real é ticket × cashback × taxa de uso, e ele precisa caber na margem. O guia \"Cashback: quanto oferecer sem comer a sua margem\", no blog, traz a conta e uma calculadora. Dá para aumentar o percentual em datas especiais e comparar qual valor gera mais recompra.",
			},
			{
				question: "O cliente precisa baixar algum aplicativo para usar o cashback?",
				answer:
					"Não. O cliente não instala aplicativo nem carrega cartão. Para acumular ou resgatar, basta informar o CPF ou o telefone no Ponto de Interação. O saldo aparece na tela em tempo real e o resgate é descontado na hora, direto no caixa, sem atrito.",
			},
			{
				question: "O cashback expira?",
				answer:
					"Sim, e isso é intencional. Você define a validade (30, 60 ou 90 dias) para criar urgência de retorno. Quando o crédito está perto de vencer, o sistema envia um lembrete automático por WhatsApp, trazendo o cliente de volta antes que ele esqueça.",
			},
		],
		cta: {
			headline: "Implante o cashback na sua loja esta semana",
			sub: "Agende uma demonstração gratuita. Veja o programa funcionando ao vivo e tire todas as suas dúvidas com um especialista.",
			buttonText: "Agendar Demo Gratuita",
			whatsappMessage: "Olá! Quero saber mais sobre o Programa de Cashback do RecompraCRM para minha loja.",
		},
	},
	{
		slug: "campanhas-whatsapp",
		title: "Campanhas Automáticas no WhatsApp para Varejo — RecompraCRM",
		headline: "Campanhas automáticas no WhatsApp que vendem enquanto você dorme",
		description:
			"Crie campanhas segmentadas e automáticas no WhatsApp para sua loja. Reative clientes inativos, divulgue promoções e acompanhe o ROI de cada mensagem enviada.",
		cover: "feature-campanhas",
		seo: {
			keywords: [
				"campanhas whatsapp varejo",
				"automação whatsapp loja",
				"marketing whatsapp varejo",
				"whatsapp business loja",
				"campanhas automáticas whatsapp",
				"disparos whatsapp segmentados",
				"whatsapp crm varejo",
			],
		},
		relatedSegmentSlugs: ["delivery", "farmacia-e-drogaria", "sorveteria"],
		relatedFeatureSlugs: ["programa-de-cashback", "ponto-de-interacao", "business-intelligence"],
		sources: [
			{
				label: "Mobile Time/Opinion Box — Super Panorama 2026",
				url: "https://www.mobiletime.com.br/noticias/17/06/2026/super-panorama-26/",
			},
			{
				label: "Meta for Developers — preços da plataforma do WhatsApp Business",
				url: "https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing",
			},
		],
		sections: [
			{
				type: "text",
				heading: "Por que o WhatsApp é o canal nº 1 do varejo brasileiro",
				body: "O WhatsApp está na tela inicial de 64,8% dos smartphones brasileiros (Mobile Time/Opinion Box, 2026). É ali que o seu cliente conversa, e é ali que a sua loja precisa estar.\n\nO problema? A maioria dos lojistas ainda envia mensagens manualmente — copiando e colando textos, perdendo horas e sem saber se gerou alguma venda. O RecompraCRM transforma o WhatsApp numa máquina de vendas automatizada, segmentada e mensurável.",
			},
			{
				type: "stats",
				items: [
					{ value: "64,8%", label: "dos smartphones brasileiros têm o WhatsApp na tela inicial", source: "Mobile Time/Opinion Box, 2026" },
					{ value: "R$ 0,32", label: "por mensagem de marketing entregue: segmentar é o que separa custo de investimento", source: "Meta, tabela de out/2026" },
					{ value: "≈ 9×", label: "mais barato um aviso de utilidade (saldo de cashback) que uma mensagem de marketing", source: "Meta, tabela de out/2026" },
				],
			},
			{
				type: "feature-highlight",
				icon: "bolt",
				title: "7+ gatilhos automáticos para cada momento do cliente",
				body: "O RecompraCRM oferece gatilhos prontos para os momentos mais importantes da jornada do cliente:\n\n• **Nova compra**: Envie uma mensagem de boas-vindas com o saldo de cashback acumulado.\n• **Cashback expirando**: Lembre o cliente que seus créditos vencem em breve — urgência que gera visita.\n• **Cliente em risco**: Identifique automaticamente quem não compra há X dias e envie um incentivo.\n• **Aniversário**: Parabenize o cliente e ofereça cashback bônus no mês do aniversário.\n• **Quantidade de compras**: Premie clientes que atingirem marcos (5ª compra, 10ª compra, etc.).\n• **Valor total de compras**: Recompense clientes que acumularem um valor total em compras.\n• **Recorrente**: Campanhas periódicas (diárias, semanais, mensais) para segmentos específicos.\n\nCada gatilho é configurado uma vez. Depois, roda no automático — para sempre.",
			},
			{
				type: "feature-highlight",
				icon: "target",
				title: "Segmentação inteligente por perfil RFM",
				body: "Não adianta enviar a mesma mensagem para todos os clientes. O RecompraCRM permite segmentar campanhas pelos 9 segmentos da análise RFM:\n\n• **Campeões e Fiéis**: Acesso VIP, lançamentos antecipados, condições exclusivas.\n• **Promissores e Novos**: Incentivos para consolidar o hábito de compra.\n• **Em Risco e Precisam de Atenção**: Reativação com cashback bônus e ofertas especiais.\n• **Hibernando e Perdidos**: Últimas tentativas com descontos agressivos — ou remoção da base.\n\nVocê escolhe para quem cada campanha vai, e o sistema envia automaticamente quando o gatilho dispara.",
			},
			{
				type: "feature-highlight",
				icon: "chart",
				title: "ROI de cada campanha — na ponta do lápis",
				body: "O RecompraCRM rastreia o funil completo de cada campanha:\n\n• **Mensagens enviadas** → entregues → lidas → clientes que voltaram à loja → vendas atribuídas.\n• **Modelos de atribuição**: Last Touch, First Touch ou Linear — você escolhe como contabilizar as conversões.\n• **ROI em reais**: veja exatamente quanto de receita cada campanha gerou em relação ao custo.\n• **Tempo de conversão**: quanto tempo levou entre a mensagem e a compra na loja.\n\nChega de achismo. Cada real investido em WhatsApp é rastreável do envio até a venda.",
			},
			{
				type: "feature-highlight",
				icon: "coins",
				title: "Cashback bônus integrado às campanhas",
				body: "Cada campanha pode incluir um bônus de cashback como incentivo extra. Por exemplo: \"Volte esta semana e ganhe 25% de cashback bônus na sua compra\" — com prazo curto de expiração para gerar urgência.\n\nO bônus é configurável por campanha: percentual, prazo de validade e valor mínimo de compra para ativar. Tudo integrado ao programa de cashback principal, sem duplicidade ou confusão para o cliente.",
			},
			{
				type: "text",
				heading: "Campanhas que escalam sem escalar a equipe",
				body: "O grande diferencial das campanhas automáticas é que elas funcionam 24/7, atendem milhares de clientes simultaneamente e não dependem de um funcionário para operar. Você configura a campanha uma vez e ela roda indefinidamente.\n\nPara lojas com múltiplas unidades, as campanhas são centralizadas e os resultados são consolidados no painel — facilitando a gestão e a tomada de decisão.\n\nNão importa se sua loja tem 100 ou 10.000 clientes cadastrados: a automação garante que cada um receba a mensagem certa, no momento certo.",
			},
		],
		faqs: [
			{
				question: "Como funcionam as campanhas automáticas no WhatsApp?",
				answer:
					"O RecompraCRM dispara mensagens no WhatsApp com base no comportamento do cliente, sem trabalho manual. Você ativa gatilhos como aniversário, cliente sumido, cashback expirando ou primeira compra, e cada pessoa recebe a mensagem certa no momento certo. As campanhas rodam sozinhas e você acompanha o retorno de cada uma pelo painel.",
			},
			{
				question: "As mensagens são enviadas manualmente ou é tudo automático?",
				answer:
					"É automático. Você configura os gatilhos e os modelos de mensagem uma vez, e o sistema envia sozinho conforme cada cliente atinge a condição definida. Também é possível disparar campanhas pontuais para um segmento específico, como clientes em risco de abandono, com poucos cliques.",
			},
			{
				question: "O que é segmentação por RFM e por que ela importa?",
				answer:
					"RFM classifica cada cliente por Recência, Frequência e Valor gasto. Com isso, você fala de forma diferente com quem comprou ontem e com quem sumiu há três meses. A segmentação evita mensagens genéricas, aumenta a taxa de resposta e concentra o esforço nos clientes com maior potencial de voltar a comprar.",
			},
			{
				question: "Consigo medir o retorno de cada campanha?",
				answer:
					"Sim. O RecompraCRM mostra quantos clientes receberam, retornaram e compraram após cada campanha, além da receita gerada e do ROI. Você para de investir no achismo e sabe exatamente quais gatilhos e mensagens trazem mais vendas de volta.",
			},
		],
		cta: {
			headline: "Comece a vender pelo WhatsApp no piloto automático",
			sub: "Agende uma demonstração gratuita e veja as campanhas funcionando ao vivo. Tire suas dúvidas com um especialista.",
			buttonText: "Agendar Demo Gratuita",
			whatsappMessage: "Olá! Quero saber mais sobre as Campanhas Automáticas de WhatsApp do RecompraCRM.",
		},
	},
	{
		slug: "ponto-de-interacao",
		title: "Ponto de Interação (PDI) para Varejo — RecompraCRM",
		headline: "Um tablet no balcão que transforma cada venda em fidelização",
		description:
			"O Ponto de Interação do RecompraCRM é um tablet no caixa da sua loja que registra vendas, acumula cashback e engaja clientes automaticamente — sem app e sem fricção.",
		cover: "feature-pdi",
		seo: {
			keywords: [
				"ponto de venda cashback",
				"totem fidelidade loja",
				"sistema pdv fidelização",
				"tablet caixa loja",
				"ponto de interação varejo",
				"totem cashback varejo",
				"sistema registro vendas fidelidade",
			],
		},
		relatedSegmentSlugs: ["padaria-e-confeitaria", "supermercado-e-mercearia", "acougue-e-peixaria"],
		relatedFeatureSlugs: ["programa-de-cashback", "campanhas-whatsapp", "business-intelligence"],
		sections: [
			{
				type: "text",
				heading: "O que é o Ponto de Interação (PDI)",
				body: "O PDI é uma interface que roda em qualquer tablet ou computador com navegador, instalado no balcão ou caixa da sua loja. Ele é o ponto de contato entre o seu negócio e o programa de fidelização — onde vendas são registradas, cashback é acumulado e resgatado, e o cliente vê seu saldo em tempo real.\n\nDiferente de sistemas tradicionais que exigem que o cliente baixe um app ou carregue um cartão, o PDI do RecompraCRM funciona apenas com o número de telefone do cliente. Sem cadastros longos, sem senhas, sem downloads. O atendente digita o telefone e pronto — o perfil aparece na tela.",
			},
			{
				type: "stats",
				items: [
					{ value: "10s", label: "Tempo médio para registrar uma venda e acumular cashback" },
					{ value: "0", label: "Apps para o cliente baixar — funciona 100% via WhatsApp" },
					{ value: "< 1 dia", label: "Para configurar o PDI e começar a usar" },
				],
			},
			{
				type: "feature-highlight",
				icon: "phone",
				title: "Fluxo em 4 passos — rápido e sem fricção",
				body: "O PDI foi desenhado para ser extremamente simples, mesmo para atendentes sem experiência com tecnologia:\n\n• **Passo 1**: O cliente informa o número de telefone. O sistema encontra o perfil automaticamente (ou cria um novo na hora).\n• **Passo 2**: O atendente digita o valor da venda.\n• **Passo 3**: O sistema calcula o cashback automaticamente e mostra na tela. Se o cliente tiver saldo, ele pode resgatar com um toque.\n• **Passo 4**: O operador confirma com sua senha — e pronto.\n\nEm 10 segundos, a venda está registrada, o cashback acumulado e o cliente sai sabendo exatamente quanto tem de crédito para a próxima visita.",
			},
			{
				type: "feature-highlight",
				icon: "lock",
				title: "Modo quiosque: tela cheia e segurança",
				body: "O PDI tem um modo quiosque dedicado que coloca a interface em tela cheia, ativa o bloqueio de tela (wake lock) e impede que o atendente saia do sistema acidentalmente.\n\nÉ ideal para totens de autoatendimento ou tablets fixos no balcão. O cliente pode até interagir diretamente com a tela para ver seu saldo, enquanto o operador confirma as operações com senha.",
			},
			{
				type: "feature-highlight",
				icon: "trophy",
				title: "Ranking de vendedores: gamificação que engaja a equipe",
				body: "O PDI exibe em tempo real o ranking dos vendedores da loja, com volume de vendas, número de clientes atendidos e progresso em relação à meta mensal.\n\nEssa gamificação natural motiva a equipe a registrar cada venda corretamente (melhorando a qualidade dos dados) e cria uma competição saudável que eleva o desempenho geral.\n\nPara o gestor, os dados de vendedores também aparecem no painel de Business Intelligence, permitindo análises mais profundas de produtividade por atendente.",
			},
			{
				type: "feature-highlight",
				icon: "gift",
				title: "Prêmios físicos e descontos: duas modalidades de resgate",
				body: "O programa de cashback integrado ao PDI suporta dois modos de resgate:\n\n• **Desconto na compra**: O saldo de cashback é abatido diretamente do valor da venda. Simples e direto.\n• **Prêmios físicos**: O cliente troca seus créditos por produtos específicos (ex.: um brinquedo para o pet, uma peça de roupa, um sorvete). Os prêmios são configurados com foto, descrição e valor em créditos.\n\nAmbos os modos podem funcionar simultaneamente, dando ao cliente a liberdade de escolher como usar seus créditos.",
			},
			{
				type: "text",
				heading: "Funciona em qualquer dispositivo com navegador",
				body: "O PDI é uma aplicação web que roda no navegador — não precisa instalar nada. Funciona em tablets Android, iPads, notebooks ou qualquer computador. Basta acessar o link da sua loja e fazer login.\n\nPara lojas com múltiplas unidades, cada unidade tem seu próprio PDI com configurações específicas, mas todos os dados são consolidados no painel central. O gestor acompanha vendas de todas as unidades em tempo real.\n\nA configuração leva menos de um dia. Nossa equipe faz o setup remoto, treina os atendentes por vídeo e você já começa a operar imediatamente.",
			},
		],
		faqs: [
			{
				question: "O que é o Ponto de Interação (PDI)?",
				answer:
					"O PDI é um tablet ou totem instalado no balcão da loja. Nele, o atendente registra a venda e o cliente informa CPF ou telefone para acumular e resgatar cashback, vendo o saldo na tela em tempo real. É o ponto de contato que transforma cada compra em um motivo para o cliente voltar.",
			},
			{
				question: "Preciso de algum equipamento especial para usar o PDI?",
				answer:
					"Não. O PDI roda em qualquer tablet ou celular com navegador de internet. Não é preciso comprar hardware específico nem instalar programas. Basta abrir o endereço no modo quiosque e o balcão já está pronto para registrar vendas e gerenciar cashback.",
			},
			{
				question: "O PDI atrapalha a fila ou deixa o atendimento mais lento?",
				answer:
					"Não. O fluxo é feito em quatro passos rápidos e o cliente resgata o cashback com um toque, sem app e sem cartão. O registro leva segundos e roda em modo quiosque de tela cheia, então o atendimento fica mais ágil, não mais lento.",
			},
			{
				question: "Como o ranking de vendedores funciona no PDI?",
				answer:
					"Cada venda registrada no PDI é atribuída ao vendedor que atendeu. O sistema gera um ranking automático por desempenho, criando gamificação que engaja a equipe e dá ao gestor uma visão clara de quem mais vende e fideliza.",
			},
		],
		cta: {
			headline: "Coloque um PDI no balcão da sua loja",
			sub: "Agende uma demonstração gratuita e veja o Ponto de Interação funcionando ao vivo. Sem compromisso.",
			buttonText: "Agendar Demo Gratuita",
			whatsappMessage: "Olá! Quero saber mais sobre o Ponto de Interação (PDI) do RecompraCRM para minha loja.",
		},
	},
	{
		slug: "business-intelligence",
		title: "Business Intelligence e Análise RFM para Varejo — RecompraCRM",
		headline: "Inteligência de dados que mostra exatamente onde investir para vender mais",
		description:
			"Dashboards em tempo real, segmentação RFM automática, ROI de campanhas e ranking de vendedores. Tome decisões baseadas em dados, não em achismo.",
		cover: "feature-bi",
		seo: {
			keywords: [
				"análise rfm varejo",
				"business intelligence varejo",
				"segmentação clientes loja",
				"dashboard vendas varejo",
				"análise dados loja física",
				"rfm matrix crm",
				"inteligência de dados varejo",
			],
		},
		relatedSegmentSlugs: ["rede-de-lojas", "varejo", "joalheria-e-acessorios"],
		relatedFeatureSlugs: ["programa-de-cashback", "campanhas-whatsapp", "ponto-de-interacao"],
		sources: [
			{
				label: "Kim, Singh e Winer — The Pareto rule for frequently purchased packaged goods (Marketing Letters, 2017)",
				url: "https://doi.org/10.1007/s11002-017-9442-5",
			},
		],
		sections: [
			{
				type: "text",
				heading: "O varejo físico tem dados — mas poucos lojistas usam",
				body: "Toda venda registrada no caixa é um dado. Toda visita de um cliente é um dado. Todo resgate de cashback, toda mensagem lida no WhatsApp, todo produto mais vendido — tudo é dado. O problema é que, sem um sistema que organize e interprete essas informações, elas ficam trancadas numa planilha ou perdidas no caderno.\n\nO RecompraCRM coleta dados automaticamente a cada interação (via PDI, WhatsApp e programa de cashback) e transforma tudo em dashboards visuais, segmentações inteligentes e insights acionáveis. Você deixa de operar no escuro e passa a tomar decisões baseadas em evidências.",
			},
			{
				type: "stats",
				items: [
					{ value: "9", label: "Segmentos RFM automáticos para classificar cada cliente" },
					{ value: "65–73%", label: "das vendas de uma marca vêm dos 20% que mais compram", source: "Kim, Singh e Winer, 2017" },
					{ value: "Tempo real", label: "Dashboards atualizados a cada venda registrada" },
				],
			},
			{
				type: "feature-highlight",
				icon: "calculator",
				title: "Matriz RFM: 9 segmentos que revelam a saúde da sua base",
				body: "A análise RFM (Recência, Frequência e Valor Monetário) é a forma mais consagrada de entender quem são seus clientes. O RecompraCRM calcula automaticamente o score RFM de cada cliente e os agrupa em 9 segmentos:\n\n• **Campeões**: Compraram recentemente, compram com frequência e gastam muito. Seus melhores clientes.\n• **Fiéis**: Alta frequência e bom valor, mas não necessariamente recentes.\n• **Potencialmente Fiéis**: Boa frequência recente — estão no caminho de se tornarem fiéis.\n• **Novos**: Primeira ou segunda compra recente. Precisam de estímulo para voltar.\n• **Precisam de Atenção**: Eram bons clientes, mas a frequência está caindo.\n• **Em Risco**: Bom histórico, mas não compram há bastante tempo.\n• **Promissores**: Poucos dados ainda, mas com sinais positivos.\n• **Hibernando**: Compras antigas e espaçadas. Quase perdidos.\n• **Perdidos**: Sem interação significativa há muito tempo.\n\nO sistema atualiza os segmentos automaticamente a cada nova venda registrada.",
			},
			{
				type: "feature-highlight",
				icon: "sparkle",
				title: "Sugestões automáticas de ação por segmento",
				body: "Para cada segmento RFM, o RecompraCRM sugere ações concretas:\n\n• **Campeões**: \"Crie um programa VIP ou ofereça acesso antecipado a promoções.\"\n• **Em Risco**: \"Envie uma campanha de reativação com cashback bônus de 15%.\"\n• **Perdidos**: \"Ofereça um desconto agressivo ou aceite a perda e foque nos segmentos promissores.\"\n\nVocê não precisa ser um cientista de dados para interpretar a matriz. O sistema traduz os números em ações que qualquer lojista pode executar — muitas delas automatizáveis via campanhas de WhatsApp.",
			},
			{
				type: "feature-highlight",
				icon: "chart",
				title: "Dashboards de receita, campanhas e equipe",
				body: "O painel de Business Intelligence reúne tudo em um só lugar:\n\n• **Receita**: Faturamento por período, ticket médio, número de vendas, comparativo mensal.\n• **Cashback**: Créditos distribuídos vs. resgatados, taxa de retorno, impacto no ticket médio.\n• **Campanhas**: Funil completo (envios → leituras → conversões → receita), ROI por campanha, tempo de conversão.\n• **Equipe**: Ranking de vendedores, volume de vendas por atendente, progresso em relação a metas.\n• **Clientes**: Distribuição por segmento RFM, ciclo de compra, produtos mais comprados por perfil.\n\nTodos os dados são atualizados em tempo real, a cada venda registrada no PDI.",
			},
			{
				type: "feature-highlight",
				icon: "plug",
				title: "Atribuição de campanhas: saiba o que realmente funciona",
				body: "O RecompraCRM rastreia o impacto de cada campanha de WhatsApp nas vendas da loja, com três modelos de atribuição configuráveis:\n\n• **Last Touch**: A conversão é atribuída à última campanha que o cliente recebeu antes de comprar.\n• **First Touch**: A conversão é atribuída à primeira campanha que iniciou o ciclo de reengajamento.\n• **Linear**: O crédito é distribuído igualmente entre todas as campanhas que o cliente recebeu.\n\nCom isso, você descobre quais campanhas realmente geram vendas — e quais estão só enchendo linguiça. Dados de conversão incluem receita atribuída, tempo até a conversão e delta de frequência.",
			},
			{
				type: "text",
				heading: "De achismo a decisão baseada em dados",
				body: "O Business Intelligence do RecompraCRM foi desenhado para lojistas, não para analistas de dados. Cada dashboard é visual, intuitivo e mostra as informações que realmente importam para quem precisa decidir rápido.\n\nNão importa se você tem uma loja ou dez. Os dados de todas as unidades são consolidados automaticamente, permitindo comparações de desempenho entre filiais, identificação de melhores práticas e alocação inteligente de recursos.\n\nO resultado: menos decisões no escuro, mais ações direcionadas e um retorno sobre investimento visível em cada painel.",
			},
		],
		faqs: [
			{
				question: "Que tipo de relatório o Business Intelligence do RecompraCRM oferece?",
				answer:
					"O painel mostra ticket médio, frequência de compra, receita por período, desempenho de cada campanha e ROI do cashback. Também identifica clientes em risco de abandono pela análise RFM. Tudo em tempo real, sem exportar planilhas nem depender de TI, para você ver onde investir para vender mais.",
			},
			{
				question: "Preciso saber de análise de dados para usar?",
				answer:
					"Não. Os relatórios são visuais e prontos para decisão: você vê quais clientes estão sumindo, quais campanhas trazem retorno e como o ticket médio evolui. A leitura é direta, pensada para o dono da loja e o gestor, não para analistas.",
			},
			{
				question: "O que é a análise RFM e como ela ajuda minha loja?",
				answer:
					"RFM avalia cada cliente por Recência, Frequência e Valor gasto, agrupando-os em perfis como fiéis, em risco e inativos. Com isso você sabe exatamente quem merece atenção agora e direciona campanhas para reativar quem está prestes a parar de comprar.",
			},
			{
				question: "Os dados ficam atualizados em tempo real?",
				answer:
					"Sim. Cada venda registrada no PDI alimenta o painel instantaneamente. Você acompanha o movimento do dia, o efeito de uma campanha recém-disparada e a evolução dos indicadores sem esperar fechamento de mês nem consolidação manual.",
			},
		],
		cta: {
			headline: "Tome decisões com base em dados, não em achismo",
			sub: "Agende uma demonstração gratuita e veja o painel de Business Intelligence ao vivo. Tire suas dúvidas com um especialista.",
			buttonText: "Agendar Demo Gratuita",
			whatsappMessage: "Olá! Quero saber mais sobre o Business Intelligence e a Análise RFM do RecompraCRM.",
		},
	},
];

export function getFeaturePage(slug: string): FeaturePage | undefined {
	return FEATURE_PAGES.find((p) => p.slug === slug);
}
