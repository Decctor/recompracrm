// O lado ERP de cada página de segmento: a seção "Sistema para …" e a pergunta do FAQ que mira as
// buscas "sistema para restaurante", "sistema para loja de roupas" etc. (DataForSEO, Brasil,
// nov/2026: restaurante 1.600/mês, loja de roupas 1.300, ótica 480, delivery 390, pet shop 320…).
//
// `fit` diz o quanto o ERP cobre o segmento, e a página fala com essa honestidade:
// - "COMPLETO": a venda do segmento roda inteira no ERP (PDV, nota, estoque, financeiro).
// - "COM_SISTEMA_DO_SETOR": o segmento exige algo que o ERP não faz (SNGPC na farmácia, ordem de
//   serviço com receita na ótica, catálogo por veículo em autopeças, estoque por filial em redes).
//   A página diz o que fica no sistema atual da loja e o que o RecompraCRM faz junto com ele.
//
// Só entram recursos que existem no produto: PDV com leitor e balança (lib/pos), NFC-e e NF-e,
// mesas e comandas, loja digital com retirada e entrega, integração iFood, lotes com validade,
// entrada por XML, variações e adicionais, orçamento e condicional, fiado, financeiro.

export type SegmentErpFit = "COMPLETO" | "COM_SISTEMA_DO_SETOR";

export type SegmentErp = {
	fit: SegmentErpFit;
	/** Busca que a seção mira, como o lojista digita (vai para as keywords da página). */
	keyword: string;
	headline: string;
	intro: string;
	/** O que o ERP faz por esse segmento, em itens curtos. */
	modules: string[];
	/** Só em COM_SISTEMA_DO_SETOR: o que continua no sistema que a loja já usa. */
	staysInCurrentSystem?: string;
};

export const SEGMENT_ERP: Record<string, SegmentErp> = {
	restaurantes: {
		fit: "COMPLETO",
		keyword: "sistema para restaurante",
		headline: "Sistema para restaurante e lanchonete, com cashback no caixa.",
		intro:
			"Balcão, salão e pedido online no mesmo cadastro. O garçom lança na comanda, o caixa fecha a conta, a NFC-e sai na hora e o cliente já leva o crédito da próxima refeição.",
		modules: [
			"Mesas e comandas, com destaque para pedido atrasado",
			"Cardápio digital com retirada e entrega",
			"Pedidos do iFood entram sem nota nem baixa de estoque em dobro",
			"Adicionais e variações montados em uma tela",
		],
	},
	delivery: {
		fit: "COMPLETO",
		keyword: "sistema para delivery",
		headline: "Sistema para delivery com loja própria e iFood no mesmo lugar.",
		intro:
			"Os pedidos da sua loja digital e do iFood caem na mesma fila. O cliente que pede pelo seu link entra na base e acumula cashback, e o próximo pedido pode vir sem a taxa do marketplace.",
		modules: [
			"Loja digital com link próprio, prazo e pedido mínimo",
			"Retirada e entrega, com o pagamento ajustado para receber na entrega",
			"Integração com o iFood, sem lançamento duplicado",
			"NFC-e emitida a partir do pedido",
		],
	},
	"padaria-e-confeitaria": {
		fit: "COMPLETO",
		keyword: "sistema para padaria",
		headline: "Sistema para padaria e confeitaria, do pão por peso à encomenda.",
		intro:
			"O caixa pesa o pão na balança ou lê a etiqueta da balança da vitrine, e a encomenda de bolo fica salva como orçamento até a retirada. Tudo com NFC-e e o cashback da próxima visita.",
		modules: [
			"Balança no caixa e leitura de etiqueta de balança",
			"Encomendas salvas como orçamento e confirmadas na retirada",
			"Insumos com lote e validade no estoque",
			"Loja digital para pedidos de encomenda",
		],
	},
	sorveteria: {
		fit: "COMPLETO",
		keyword: "sistema para sorveteria",
		headline: "Sistema para sorveteria e açaiteria, com sabores e adicionais.",
		intro:
			"Sabor, tamanho e cobertura viram variações e adicionais com preço próprio, montados pelo caixa em uma tela. Picolé por código de barras, açaí por peso na balança, e o crédito de cashback para a próxima tarde quente.",
		modules: [
			"Variações e adicionais, sem cadastrar cada combinação",
			"Balança para açaí e sorvete por peso",
			"Pedidos do iFood e da loja digital na mesma fila",
			"Estoque de potes e insumos com validade",
		],
	},
	"acougue-e-peixaria": {
		fit: "COMPLETO",
		keyword: "sistema para açougue",
		headline: "Sistema para açougue e peixaria, com balança e etiqueta.",
		intro:
			"O caixa lê a etiqueta impressa pela balança do balcão e a venda já entra com o peso e o preço certos. O fiado do cliente de sempre fica registrado, e o cashback traz ele de volta no fim de semana.",
		modules: [
			"Leitura de etiqueta de balança e balança no caixa",
			"Fiado registrado por cliente",
			"Estoque com lote e validade",
			"Entrada de nota do fornecedor por XML",
		],
	},
	"supermercado-e-mercearia": {
		fit: "COMPLETO",
		keyword: "sistema para supermercado",
		headline: "Sistema para mercado e mercearia, com a fila andando.",
		intro:
			"Leitor de código de barras, etiqueta de balança do hortifrúti e pagamento dividido em uma tela só. A nota do fornecedor entra por XML e o estoque se ajusta sozinho.",
		modules: [
			"Leitor de código de barras e etiqueta de balança",
			"Entrada de nota por XML, com custo atualizado",
			"Lotes com validade e aviso do que está para vencer",
			"Dinheiro, Pix, cartão e fiado na mesma venda",
		],
	},
	"pet-shop": {
		fit: "COMPLETO",
		keyword: "sistema para pet shop",
		headline: "Sistema para pet shop, com o lembrete da próxima ração.",
		intro:
			"A venda de ração e acessórios roda no PDV com nota e estoque. Como a ração acaba em ciclos previsíveis, o cashback e o WhatsApp avisam o tutor antes de ele comprar no concorrente.",
		modules: [
			"PDV com leitor de código de barras e NFC-e",
			"Ração por peso na balança do caixa",
			"Estoque com lote e validade",
			"Variações por tamanho e sabor",
		],
		staysInCurrentSystem: "A agenda de banho e tosa não faz parte do ERP.",
	},
	"farmacia-e-drogaria": {
		fit: "COM_SISTEMA_DO_SETOR",
		keyword: "sistema para farmácia",
		headline: "Já usa o sistema da farmácia? O cashback roda junto.",
		intro:
			"Farmácia tem exigências próprias, como a escrituração de controlados. O RecompraCRM recebe as vendas pelo Ponto de Interação do balcão ou por planilha e cuida do que o seu sistema não faz: cashback, campanhas de recompra e a lista de quem está sumindo.",
		modules: [
			"Vendas registradas no Ponto de Interação ou importadas por planilha",
			"Cashback e resgate no balcão pelo Ponto de Interação",
			"Lembrete de recompra de uso contínuo no WhatsApp",
			"Análise RFM dos clientes",
		],
		staysInCurrentSystem: "O ERP do RecompraCRM não faz SNGPC nem a gestão de medicamentos controlados.",
	},
	"perfumaria-e-cosmeticos": {
		fit: "COMPLETO",
		keyword: "sistema para loja de cosméticos",
		headline: "Sistema para perfumaria e loja de cosméticos.",
		intro:
			"Variações por fragrância, tamanho e cor, lotes com validade e nota de cada venda. A cliente que comprou o hidratante recebe o lembrete quando ele está acabando, com o cashback para usar.",
		modules: [
			"Variações por fragrância, tamanho e cor",
			"Lotes com validade e aviso do que vence",
			"Condicional para levar e testar em casa",
			"Loja digital com retirada e entrega",
		],
	},
	"loja-de-roupas": {
		fit: "COMPLETO",
		keyword: "sistema para loja de roupas",
		headline: "Sistema para loja de roupas, com grade e condicional.",
		intro:
			"Tamanho e cor viram variações do mesmo produto, a peça que vai para casa em condicional fica com o estoque reservado, e a cliente volta para a próxima coleção com cashback na mão.",
		modules: [
			"Grade de tamanho e cor como variações",
			"Condicional com estoque reservado até a decisão",
			"Leitor de código de barras e NFC-e",
			"Desconto com limite por vendedora e aprovação",
		],
	},
	"loja-de-calcados": {
		fit: "COMPLETO",
		keyword: "sistema para loja de calçados",
		headline: "Sistema para loja de calçados, numeração por numeração.",
		intro:
			"Cada numeração e cor é uma variação com estoque próprio. O caixa bipa a caixa do calçado, emite a nota, e o cliente sai com crédito para a próxima troca de estação.",
		modules: [
			"Numeração e cor como variações com estoque",
			"Condicional para levar e provar em casa",
			"Entrada de nota do fornecedor por XML",
			"Leitor de código de barras e NFC-e",
		],
	},
	"joalheria-e-acessorios": {
		fit: "COMPLETO",
		keyword: "sistema para joalheria",
		headline: "Sistema para joalheria e loja de acessórios.",
		intro:
			"Peça de valor pede controle: desconto com limite e aprovação, condicional registrada e a NF-e quando o cliente precisa. O cashback e as datas especiais trazem o cliente de volta no próximo presente.",
		modules: [
			"Condicional registrada por cliente",
			"Desconto com limite e aprovação de gestor",
			"NFC-e e NF-e",
			"Variações por tamanho, cor e material",
		],
	},
	otica: {
		fit: "COM_SISTEMA_DO_SETOR",
		keyword: "sistema para ótica",
		headline: "Sua ótica já tem sistema? O RecompraCRM traz o cliente de volta.",
		intro:
			"Ótica trabalha com receita e ordem de serviço do laboratório, o que pede um sistema do setor. O RecompraCRM cuida do que vem depois: o lembrete da revisão anual, o cashback para a próxima armação e a venda de óculos de sol e acessórios no PDV.",
		modules: [
			"Lembrete de revisão e troca de lente no WhatsApp",
			"Cashback e resgate no balcão",
			"PDV com NFC-e para armações de pronta entrega e acessórios",
			"Análise RFM dos clientes",
		],
		staysInCurrentSystem: "O ERP do RecompraCRM não faz ordem de serviço com receita nem o pedido ao laboratório.",
	},
	"eletronicos-e-eletrodomesticos": {
		fit: "COMPLETO",
		keyword: "sistema para loja de eletrônicos",
		headline: "Sistema para loja de eletrônicos e eletrodomésticos.",
		intro:
			"Ticket alto pede orçamento salvo, pagamento dividido e NF-e para quem compra pela empresa. O cashback e o contato no momento certo trazem o cliente de volta para o acessório e para o próximo aparelho.",
		modules: [
			"Orçamento salvo e confirmado depois",
			"Pagamento dividido entre Pix, cartão e dinheiro",
			"NFC-e e NF-e para pessoa jurídica",
			"Entrada de nota do fornecedor por XML",
		],
	},
	"casa-e-decoracao": {
		fit: "COMPLETO",
		keyword: "sistema para loja de decoração",
		headline: "Sistema para loja de casa, decoração e utilidades.",
		intro:
			"Milhares de itens pequenos, variações de cor e tamanho e entrega para o que não cabe no carro. A nota do fornecedor entra por XML e o estoque se atualiza sozinho.",
		modules: [
			"Entrada de nota por XML com custo atualizado",
			"Variações por cor, tamanho e acabamento",
			"Venda com entrega e pagamento na entrega",
			"Orçamento para projetos e listas de presente",
		],
	},
	"esportes-e-lazer": {
		fit: "COMPLETO",
		keyword: "sistema para loja de esportes",
		headline: "Sistema para loja de artigos esportivos.",
		intro:
			"Numeração, cor e tamanho em variações, condicional para provar o tênis em casa e nota de cada venda. O cashback traz o cliente de volta para a reposição e para a próxima temporada.",
		modules: [
			"Variações por numeração, cor e tamanho",
			"Condicional com estoque reservado",
			"Leitor de código de barras e NFC-e",
			"Loja digital com retirada e entrega",
		],
	},
	"brinquedos-e-infantil": {
		fit: "COMPLETO",
		keyword: "sistema para loja de brinquedos",
		headline: "Sistema para loja de brinquedos e produtos infantis.",
		intro:
			"Picos no Dia das Crianças e no Natal pedem caixa rápido e estoque certo. O PDV lê o código de barras, a nota do fornecedor entra por XML, e o cashback dessas datas traz a família de volta no aniversário.",
		modules: ["Leitor de código de barras e NFC-e", "Entrada de nota por XML", "Variações por tamanho e idade", "Loja digital com retirada e entrega"],
	},
	"papelaria-e-presentes": {
		fit: "COMPLETO",
		keyword: "sistema para papelaria",
		headline: "Sistema para papelaria e loja de presentes.",
		intro:
			"Volta às aulas é a lista inteira em uma venda, e o resto do ano é presente e reposição. O PDV aguenta a lista com leitor de código de barras, e o cashback traz o cliente de volta nas datas que importam.",
		modules: [
			"Leitor de código de barras para listas grandes",
			"Orçamento da lista de material salvo para o cliente",
			"Entrada de nota por XML",
			"NFC-e e NF-e para escolas e empresas",
		],
	},
	"materiais-de-construcao": {
		fit: "COMPLETO",
		keyword: "sistema para loja de material de construção",
		headline: "Sistema para loja de material de construção.",
		intro:
			"A obra começa no orçamento e volta à loja várias vezes. O orçamento fica salvo para confirmar depois, a NF-e sai para o empreiteiro, a entrega fica registrada e o cashback puxa a próxima etapa da obra.",
		modules: [
			"Orçamento salvo e convertido em venda",
			"NF-e para empreiteiro e construtora",
			"Venda com entrega e fiado registrado",
			"Entrada de nota por XML com custo atualizado",
		],
	},
	"materiais-eletricos-e-hidraulicos": {
		fit: "COMPLETO",
		keyword: "sistema para loja de material elétrico",
		headline: "Sistema para loja de materiais elétricos e hidráulicos.",
		intro:
			"Muitos itens, eletricista e encanador comprando toda semana e cliente final em reforma. O PDV bipa rápido, o orçamento fica salvo e a NF-e atende quem compra pela empresa.",
		modules: ["Leitor de código de barras e NFC-e", "Orçamento salvo para o profissional", "NF-e para pessoa jurídica", "Entrada de nota por XML"],
	},
	autopecas: {
		fit: "COM_SISTEMA_DO_SETOR",
		keyword: "sistema para autopeças",
		headline: "Sua loja de autopeças já tem sistema? O cashback roda junto.",
		intro:
			"Autopeças vende por aplicação no veículo, o que pede um catálogo do setor. O RecompraCRM registra as vendas no balcão ou por planilha e cuida da recorrência: o mecânico que compra toda semana, o cliente da revisão e a campanha de quem sumiu.",
		modules: [
			"Vendas registradas no Ponto de Interação ou importadas por planilha",
			"Cashback para mecânico e cliente final",
			"Lembrete de revisão e troca de óleo no WhatsApp",
			"PDV com NFC-e para a venda de balcão, se quiser",
		],
		staysInCurrentSystem: "O ERP do RecompraCRM não tem catálogo de peças por aplicação no veículo.",
	},
	"rede-de-lojas": {
		fit: "COM_SISTEMA_DO_SETOR",
		keyword: "sistema para rede de lojas",
		headline: "Rede de lojas: o cashback vale em todas, com o sistema que vocês já usam.",
		intro:
			"Redes costumam ter o ERP da matriz integrado às filiais. O RecompraCRM recebe as vendas desse sistema, por integração ou planilha, e entrega o que ele não faz: um programa de cashback único, campanhas de recompra e a visão de quem está sumindo.",
		modules: [
			"Vendas do ERP da rede por integração ou planilha",
			"Cashback e resgate no balcão de qualquer unidade",
			"Campanhas automáticas no WhatsApp",
			"Ranking de vendedores e metas",
		],
		staysInCurrentSystem: "O ERP do RecompraCRM ainda não separa estoque e caixa por filial.",
	},
	varejo: {
		fit: "COMPLETO",
		keyword: "sistema para loja",
		headline: "Sistema para loja física, com fidelização no caixa.",
		intro:
			"PDV, nota fiscal, estoque e financeiro para a loja que quer tudo em um lugar. A venda nasce no mesmo sistema do cashback, então o cliente acumula e resgata na hora, sem digitar nada duas vezes.",
		modules: [
			"PDV com leitor de código de barras e balança",
			"NFC-e e NF-e emitidas a partir da venda",
			"Estoque com entrada de nota por XML",
			"Financeiro com o resultado do mês",
		],
	},
};
