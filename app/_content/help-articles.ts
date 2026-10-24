export type THelpArticleStep = {
	number: number;
	title: string;
	description: string;
	image: {
		src: string;
		alt: string;
		width: number;
		height: number;
	};
	note?: string;
};

export type THelpArticle = {
	slug: string;
	title: string;
	description: string;
	category: "INTELIGENCIA_ARTIFICIAL";
	categoryLabel: string;
	connectorCode: "AGENT_CLAUDE";
	readingTime: string;
	stepCount: number;
	updatedAt: string;
	requirements: string[];
	// Value the reader copies during the tutorial (e.g. the MCP address), shown next to the requirements.
	connection?: { label: string; value: string };
	steps: THelpArticleStep[];
	// Closing panel after the last step: what the reader can do now.
	conclusion?: { title: string; description: string; examples: string[] };
	faqs: { question: string; answer: string }[];
};

export const HELP_ARTICLES: THelpArticle[] = [
	{
		slug: "como-conectar-recompracrm-ao-claude",
		title: "Como conectar o RecompraCRM ao Claude",
		description: "Conecte sua organização ao Claude e consulte dados do CRM diretamente nas conversas, com permissões claras para cada ação.",
		category: "INTELIGENCIA_ARTIFICIAL",
		categoryLabel: "Inteligência artificial",
		connectorCode: "AGENT_CLAUDE",
		readingTime: "2 min",
		stepCount: 6,
		updatedAt: "2026-08-30",
		requirements: ["Uma conta ativa no Claude", "Acesso ao RecompraCRM", "Permissão para acessar a organização desejada"],
		connection: { label: "Endereço MCP", value: "https://www.recompracrm.com.br/api/mcp" },
		steps: [
			{
				number: 1,
				title: "Abra a área de conectores",
				description: "No Claude, abra Personalizar, selecione Conectores e clique em Adicionar para cadastrar um conector personalizado.",
				image: {
					src: "/help/claude/01-abrir-conectores.webp",
					alt: "Tela de conectores do Claude com o botão Adicionar destacado no canto superior direito",
					width: 1449,
					height: 1085,
				},
			},
			{
				number: 2,
				title: "Informe o nome e o endereço",
				description: "Use RecompraCRM como nome. No campo de URL do servidor MCP remoto, cole o endereço canônico abaixo e clique em Continuar.",
				note: "Use o endereço com www para evitar o redirecionamento do domínio.",
				image: {
					src: "/help/claude/02-dados-conector.webp",
					alt: "Formulário do Claude preenchido com o nome RecompraCRM e a URL do servidor MCP",
					width: 1536,
					height: 1024,
				},
			},
			{
				number: 3,
				title: "Confirme a autenticação",
				description:
					"O Claude detectará automaticamente o OAuth e o registro dinâmico do cliente. Mantenha as opções marcadas como Detectado e clique em Adicionar.",
				note: "Não é necessário criar um ID de cliente ou adicionar cabeçalhos.",
				image: {
					src: "/help/claude/03-autenticacao.webp",
					alt: "Configuração de autenticação OAuth do conector RecompraCRM detectada automaticamente pelo Claude",
					width: 1536,
					height: 1024,
				},
			},
			{
				number: 4,
				title: "Vincule sua conta",
				description: "Quando o conector aparecer na lista, clique em Vincular. O RecompraCRM abrirá uma página segura para concluir a autorização.",
				image: {
					src: "/help/claude/04-vincular.webp",
					alt: "Detalhes do conector RecompraCRM no Claude com o botão Vincular",
					width: 1448,
					height: 1086,
				},
			},
			{
				number: 5,
				title: "Escolha a organização",
				description: "Selecione a organização que o Claude poderá consultar, revise as permissões exibidas e clique em Autorizar.",
				note: "A conexão fica vinculada somente à organização selecionada.",
				image: {
					src: "/help/claude/05-organizacao.webp",
					alt: "Autorização do Claude no RecompraCRM com a organização RecompraCRM selecionada",
					width: 1672,
					height: 941,
				},
			},
			{
				number: 6,
				title: "Verifique a conexão",
				description:
					"Pronto. O botão Desvincular confirma que a conta está conectada. Consultas ficam liberadas, enquanto ações que alteram dados continuam exigindo sua aprovação.",
				image: {
					src: "/help/claude/06-conexao-concluida.webp",
					alt: "Conector RecompraCRM vinculado ao Claude com as permissões de ferramentas visíveis",
					width: 1536,
					height: 1024,
				},
			},
		],
		conclusion: {
			title: "Seu Claude já pode trabalhar com o CRM",
			description: "Abra uma nova conversa e experimente uma pergunta. O Claude pedirá aprovação sempre que uma ação puder alterar sua operação.",
			examples: [
				"Quais foram os resultados comerciais deste mês?",
				"Quais clientes estão há mais tempo sem comprar?",
				"Quais produtos tiveram melhor desempenho no período?",
			],
		},
		faqs: [
			{
				question: "O Claude não conseguiu encontrar o servidor. O que fazer?",
				answer:
					"Confirme se você usou exatamente https://www.recompracrm.com.br/api/mcp. O endereço sem www redireciona e pode impedir a detecção automática.",
			},
			{
				question: "Selecionei a organização errada. Como corrigir?",
				answer:
					"Desvincule o RecompraCRM nas configurações de conectores do Claude e faça a vinculação novamente, escolhendo a organização correta na autorização.",
			},
			{
				question: "Por que o Claude pede aprovação para algumas ações?",
				answer:
					"Consultas são liberadas como somente leitura. Ações que criam, atualizam, ativam ou enviam dados exigem aprovação para proteger sua operação.",
			},
			{
				question: "Como revogar a conexão?",
				answer:
					"No Claude, abra Personalizar, Conectores, RecompraCRM e clique em Desvincular. Você também pode gerenciar conexões no RecompraCRM, em Configurações e Conexões de IA.",
			},
		],
	},
];

export function getHelpArticle(slug: string) {
	return HELP_ARTICLES.find((article) => article.slug === slug);
}
