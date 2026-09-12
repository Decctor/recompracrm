import type { TAgentActorContext } from "./types";

/**
 * Prompts MCP — roteiros que o usuário escolhe no cliente (no Claude aparecem como comandos de
 * barra). São o mesmo artefato que um dia vira Agent Skill no bundle de distribuição.
 *
 * Cada um descreve **a sequência de ferramentas** e o formato da resposta. Sem isso o modelo
 * improvisa a ordem, chama `get_campaign_results` sem ter o id, e devolve uma tabela de números
 * crus onde o lojista queria saber o que fazer na segunda-feira.
 */

type TAgentPromptArgument = {
	name: string;
	description: string;
	required?: boolean;
};

type TAgentPromptDefinition = {
	name: string;
	title: string;
	description: string;
	arguments: TAgentPromptArgument[];
	modes: TAgentActorContext["mode"][];
	build: (args: Record<string, string | undefined>) => string;
};

const AGENT_PROMPTS: TAgentPromptDefinition[] = [
	{
		name: "revisao-comercial",
		title: "Revisão comercial do período",
		description: "Diagnóstico do resultado comercial: o que aconteceu, por que, e o que fazer a seguir.",
		modes: ["ORG", "PLATAFORMA"],
		arguments: [
			{ name: "periodo", description: "Período em linguagem natural ou datas ISO. Padrão: últimos 30 dias." },
			{ name: "organizacaoId", description: "Obrigatório em conexões de plataforma: id ou slug da organização." },
		],
		build: (args) =>
			[
				`Faça a revisão comercial${args.periodo ? ` do período: ${args.periodo}` : " dos últimos 30 dias"}.`,
				args.organizacaoId ? `Organização: ${args.organizacaoId}.` : "",
				"",
				"Siga esta ordem:",
				"1. `get_commercial_results` para o retrato do período com comparação ao anterior.",
				"2. `get_product_performance` para ver o que puxou o resultado para cima e para baixo.",
				"3. `list_segments` e depois `search_clients` se a composição do faturamento (recorrentes × novos) tiver mudado.",
				"4. `list_campaigns` e `get_campaign_results` nas campanhas ativas do período.",
				"",
				"Escreva em português do Brasil, para o dono da loja e não para um analista. Comece pelo veredito em uma frase.",
				"Cite número só quando ele sustentar uma afirmação. Termine com no máximo três ações concretas para a próxima semana,",
				"cada uma justificada por algo que você viu nos dados.",
				"Se uma métrica vier ausente, diga que não há dado — nunca a trate como zero.",
			]
				.filter(Boolean)
				.join("\n"),
	},
	{
		name: "clientes-em-risco",
		title: "Diagnóstico de clientes em risco",
		description: "Quem está prestes a parar de comprar, por que, e o que oferecer a cada grupo.",
		modes: ["ORG", "PLATAFORMA"],
		arguments: [
			{ name: "diasSemCompra", description: "Quantos dias sem comprar caracterizam risco nesta operação. Padrão: 60." },
			{ name: "organizacaoId", description: "Obrigatório em conexões de plataforma: id ou slug da organização." },
		],
		build: (args) =>
			[
				`Diagnostique os clientes em risco de abandono (sem comprar há ${args.diasSemCompra ?? "60"} dias ou mais).`,
				args.organizacaoId ? `Organização: ${args.organizacaoId}.` : "",
				"",
				"Siga esta ordem:",
				"1. `list_segments` para saber quais categorias RFM existem nesta organização — não presuma nomes.",
				"2. `search_clients` com `semCompraHaDias` para dimensionar o grupo e ver quem tem mais valor acumulado.",
				"3. `get_client_context` nos poucos clientes de maior valor, para entender o padrão de compra de cada um.",
				"4. `search_products` ou `get_product_performance` para escolher o que oferecer.",
				"",
				"Entregue: o tamanho do problema em faturamento em risco, dois ou três grupos com característica comum,",
				"e uma abordagem por grupo. Respeite `comunicacaoPausadaAte` — cliente com comunicação pausada não entra em campanha.",
				"Não invente contato: se o telefone vier mascarado, diga que a lista precisa ser aberta no painel.",
			]
				.filter(Boolean)
				.join("\n"),
	},
	{
		name: "conferencia-de-recebimentos",
		title: "Conferência de recebimentos contra extrato",
		description: "Cruza os comprovantes enviados pelo lojista (prints de banco/maquininha) com as transações registradas e aponta as divergências.",
		modes: ["ORG", "PLATAFORMA"],
		arguments: [
			{ name: "periodo", description: "Dia ou período conferido, em linguagem natural ou datas ISO." },
			{ name: "metodo", description: "Método conferido (ex.: PIX, DINHEIRO). Opcional — sem ele, confere tudo." },
			{ name: "organizacaoId", description: "Obrigatório em conexões de plataforma: id ou slug da organização." },
		],
		build: (args) =>
			[
				`Faça a conferência dos recebimentos${args.metodo ? ` de ${args.metodo}` : ""}${args.periodo ? ` do período: ${args.periodo}` : ""} contra os comprovantes enviados pelo usuário.`,
				args.organizacaoId ? `Organização: ${args.organizacaoId}.` : "",
				"",
				"Siga esta ordem:",
				"1. `get_financial_accounts` para descobrir as contas. Contas com `ehClearingDeCanal` (ex.: iFood) guardam dinheiro em posse do canal — recebimentos ali NUNCA aparecem no extrato da loja e não são divergência.",
				"2. Transcreva cada comprovante fielmente: valor exato, hora local e o nome do pagador na descrição. Some e confira contra o total impresso no próprio comprovante antes de seguir — linha duplicada por crop de imagem é comum.",
				"3. `create_statement_import` com as linhas transcritas na conta correspondente (é idempotente; reenviar não duplica).",
				"4. `get_statement_transactions` (status PENDENTE) e `get_financial_transactions` (com `apenasSemConciliacao`) do mesmo período.",
				"5. Case por valor + proximidade de horário, EXECUTANDO CÓDIGO: com valores repetidos, atribua globalmente pelo menor delta de horário — parear na ordem do extrato erra o par. O pagador quase nunca é o cliente cadastrado (paga-se pela mesa, pelo cônjuge); nome é confirmação, não critério.",
				"6. `suggest_reconciliation_matches` só para os pares de que você tem convicção, com `confianca`.",
				"",
				"Entregue três blocos: conciliado; registrado sem comprovante; comprovante sem registro. Para cada divergência, uma hipótese:",
				"transação com `origem: 'TROCO'` contra pagamento em PIX/cartão sugere método digitado errado no PDV; recebimento em conta clearing explica ausência no extrato.",
				"Lembre o usuário de confirmar as sugestões na tela Financeiro > Conciliação — nada foi conciliado automaticamente.",
			]
				.filter(Boolean)
				.join("\n"),
	},
];

export function listPromptsForActor(actor: TAgentActorContext) {
	return AGENT_PROMPTS.filter((prompt) => prompt.modes.includes(actor.mode)).map((prompt) => ({
		name: prompt.name,
		title: prompt.title,
		description: prompt.description,
		arguments: prompt.arguments,
	}));
}

export function findPromptForActor(actor: TAgentActorContext, name: string): TAgentPromptDefinition | null {
	const prompt = AGENT_PROMPTS.find((candidate) => candidate.name === name);
	if (!prompt) return null;
	return prompt.modes.includes(actor.mode) ? prompt : null;
}

export function listAllAgentPrompts() {
	return [...AGENT_PROMPTS];
}
