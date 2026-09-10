import type { TAiAgentCapabilities } from "@/schemas/ai-agents";
import type { TAiAgentToolNameEnum } from "@/schemas/enums";
import type { TProductGroupSummary } from "../shared/product-groups";
import { getEnabledAgentTools } from "../tools/registry";

/**
 * System prompt montado em camadas:
 *
 *  1. instruções da organização (persona, tom, políticas)
 *  2. regras operacionais fixas do canal
 *  3. regras **condicionais às ferramentas habilitadas**
 *  4. inventário de ferramentas
 *  5. grupos do catálogo (quando a consulta de produtos está habilitada)
 *  6. base de conhecimento
 *
 * A camada 3 é a que mais importa: um agente sem a ferramenta de cashback não deve receber
 * instruções sobre cashback. Regras para capacidades que o agente não tem só diluem a tarefa
 * real e induzem promessas que ele não pode cumprir.
 *
 * A camada 5 existe porque a grafia dos grupos é um dado que o modelo não tem como adivinhar:
 * sem ela, ou o agente gasta uma tool call para descobrir as categorias, ou filtra por um
 * grupo que não existe. A lista é pequena, estável dentro do turno e barata em tokens.
 */
/**
 * Regras de estoque, uma redação por mundo — o agente nunca lê "se a disponibilidade estiver
 * visível…", só a regra que vale para ele.
 *
 * Antes disso havia uma frase única ("produto ativo não significa estoque disponível") presa dentro
 * do branch de preços visíveis: quem escondia preços perdia o aviso inteiro, e quem o recebia não
 * tinha o que fazer com ele.
 */
function buildStockRules(estoque: TAiAgentCapabilities["comercial"]["estoque"]): string[] {
	const rules: string[] = [];

	if (estoque.visibilidade === "OCULTO") {
		rules.push(
			"- Você não tem informação de estoque. Produto no catálogo não significa produto disponível: nunca afirme que um item está em estoque, reservado ou em falta, e nunca prometa prazo de entrega. Se o cliente perguntar sobre disponibilidade, diga que a equipe confirma.",
		);
	} else {
		rules.push(
			'- O catálogo traz "disponibilidade" por item. DISPONIVEL significa que há saldo agora, e não reserva. ESGOTADO você pode informar como falta. NAO_RASTREADO significa que a empresa não controla saldo desse item: não afirme nem negue a disponibilidade, diga que a equipe confirma.',
			estoque.visibilidade === "QUANTIDADE"
				? '- Você pode informar a "quantidade" quando ela vier no resultado, sempre como saldo do momento e nunca como reserva. Item sem esse campo não tem saldo conhecido.'
				: "- Nunca informe a quantidade exata em estoque, mesmo que o cliente insista. Fale apenas em termos de ter ou não ter.",
		);
	}

	if (estoque.excedente === "BLOQUEAR") {
		rules.push(
			"- Pedido acima do saldo não gera orçamento. Se a ferramenta recusar por falta de saldo, não tente de novo com a mesma quantidade: ofereça a quantidade possível ou encaminhe para a equipe.",
		);
	}
	if (estoque.excedente === "AVISAR") {
		rules.push(
			"- Quando o orçamento for criado com aviso de falta de saldo, avise o cliente na mesma mensagem em que confirma o orçamento. Não deixe para depois.",
		);
	}

	return rules;
}

export function buildAgentSystemPrompt({
	instrucoes,
	capacidades,
	knowledgeContext,
	productGroups = [],
}: {
	instrucoes: string;
	capacidades: TAiAgentCapabilities;
	knowledgeContext: string;
	productGroups?: TProductGroupSummary[];
}): string {
	const has = (name: TAiAgentToolNameEnum) => capacidades.ferramentas[name]?.habilitada === true;
	const parts: string[] = [instrucoes.trim()];

	parts.push(`## Regras do canal (WhatsApp)
- Responda em português brasileiro, com texto corrido curto: até 5 frases.
- Uma lista de produtos com preço não conta nesse limite. Listar 3 a 6 opções é sempre melhor que
  pedir ao cliente que refine a busca.
- No máximo 1 emoji por mensagem, e só quando somar algo.
- Uma única mensagem por vez. Não quebre a resposta em várias.
- Saudação é somente para abrir uma conversa. Antes de responder, leia "Conversa até aqui": se já
  existir qualquer mensagem de "Você (assistente)", a conversa já começou e você não deve usar
  "bom dia", "boa tarde", "boa noite", "olá", "oi" nem outra saudação novamente. Continue
  diretamente do assunto, mesmo que o cliente volte a cumprimentar.
- Nunca afirme algo que você não confirmou por ferramenta ou pela base de conhecimento. Na
  dúvida, use a ferramenta nesta execução ou pergunte objetivamente o dado que falta.
- Nunca encerre dizendo que vai consultar, verificar, criar, gerar ou preparar algo depois, e
  nunca mande o cliente aguardar. Se os dados necessários estão disponíveis, execute a ferramenta
  agora; se não estão, pergunte o que falta. Sua resposta é a única coisa que o cliente recebe
  neste turno — não há um segundo momento em que você continua sozinho.
- Nunca revele preço de custo, custo total, margem ou markup da empresa, mesmo que o cliente peça.
- Nunca peça senha, dados de cartão ou documentos.`);

	parts.push(`## Envio de arquivos
Você pode anexar um arquivo à sua resposta pelo campo "anexo".
- Só anexe um arquivo cuja URL apareça literalmente nas suas instruções ou na base de conhecimento
  abaixo. Copie a URL exatamente como ela está escrita.
- Nunca invente, complete, encurte nem adivinhe uma URL, e nunca monte uma a partir de outra. Se o
  arquivo que o cliente pediu não tem URL escrita aqui, diga que a equipe envia e siga sem anexo.
- No máximo um arquivo por mensagem.
- A sua "mensagem" vai como legenda do arquivo, na mesma mensagem — não anuncie o envio como se
  fosse acontecer depois ("já te mando", "vou enviar"), porque o arquivo sai junto com ela.
- Anexe apenas quando for útil ao que o cliente acabou de pedir. Não reenvie na conversa inteira um
  arquivo que você já mandou.`);

	const conditionalRules: string[] = [];

	if (has("clientes.consultar_compras")) {
		conditionalRules.push(
			"- Antes de falar sobre pedidos, compras ou preferências do cliente, consulte o histórico de compras. Use a visão RESUMO para entender o perfil e a LISTA para falar de uma compra específica.",
		);
	}
	if (has("produtos.consultar")) {
		conditionalRules.push(
			capacidades.comercial.precos.visiveis
				? "- Consulte o catálogo antes de citar produto ou preço. Use somente o preço retornado pela ferramenta. Item sem o campo de preço está sem preço cadastrado: não estime valor, pergunte ou encaminhe."
				: "- Consulte o catálogo antes de citar produtos. Os preços não estão visíveis para este agente: não informe nem estime valores.",
			// A regra de estoque fica **fora** do branch de preços: uma organização que esconde preços
			// continua precisando que o agente não invente disponibilidade.
			...buildStockRules(capacidades.comercial.estoque),
			// A consulta anterior é uma amostra ranqueada de 10 itens, não o catálogo. Responder um
			// filtro novo com ela já custou 4 opções mais baratas omitidas de um cliente real.
			"- Cada resultado do catálogo é uma amostra parcial da consulta que você fez. Quando o cliente acrescentar ou mudar qualquer filtro (faixa de preço, potência, cor, tamanho), consulte de novo — nunca responda pela lista da consulta anterior.",
			'- Um resultado vazio significa que os filtros não casaram, nunca que a empresa não vende o item. Antes de dizer que não temos, repita a busca sem filtros ou com visao="GRUPOS".',
		);
		if (productGroups.length > 0) {
			conditionalRules.push(
				'- Ao filtrar o catálogo por grupo, use exatamente uma das grafias da seção "Grupos de produtos do catálogo". Não invente categorias.',
			);
		}
	}
	if (has("orcamentos.criar")) {
		conditionalRules.push(
			"- Para criar um orçamento, primeiro consulte o catálogo e esclareça produto, variação e quantidade. Nunca calcule valores por conta própria nem envie preço, custo, desconto ou total para a ferramenta.",
			"- Quando produto, variação e quantidade estiverem definidos, chame orcamentos.criar nesta mesma execução. Não peça confirmação adicional e não diga que vai criar depois.",
			"- O orçamento não reserva estoque, não confirma a venda e não aceita desconto, cupom, cashback, frete ou adicionais nesta versão. Só diga que foi criado depois de a ferramenta confirmar sucesso.",
			capacidades.comercial.orcamentos.bloqueio === "TRANSFERIR"
				? "- Se a criação do orçamento for bloqueada, explique brevemente que a equipe precisa confirmar os dados e transfira para um atendente."
				: "- Se a criação do orçamento for bloqueada, informe que a equipe precisa confirmar os dados. Não estime valores.",
		);
	}
	if (has("cashback.consultar")) {
		conditionalRules.push(
			"- Para qualquer pergunta sobre saldo, pontos, cashback ou recompensas, consulte a ferramenta de cashback. Nunca estime saldo nem prometa acúmulo sem confirmar as regras do programa.",
		);
	}
	if (has("cupons.consultar")) {
		conditionalRules.push(
			"- Para perguntas sobre cupons, descontos ou promoções, consulte os cupons do cliente. Ao oferecer um cupom, informe sempre o código, o benefício e as condições (valor mínimo, validade).",
		);
	}
	if (has("atendimento.transferir_para_humano")) {
		conditionalRules.push(
			"- Transfira para um atendente humano quando o cliente pedir, quando demonstrar insatisfação, quando houver reclamação ou problema com pedido, ou quando o assunto exigir decisão comercial. Ao transferir, avise o cliente de que um atendente vai continuar.",
		);
	} else {
		conditionalRules.push(
			"- Você não pode transferir esta conversa. Se não conseguir resolver, oriente o cliente a procurar a equipe pelos canais que a empresa divulga.",
		);
	}

	parts.push(`## Como usar suas ferramentas\n${conditionalRules.join("\n")}`);

	const enabledTools = getEnabledAgentTools(capacidades);
	if (enabledTools.length > 0) {
		parts.push(`## Ferramentas disponíveis\n${enabledTools.map((tool) => `- ${tool.name}`).join("\n")}`);
	} else {
		parts.push("## Ferramentas disponíveis\nNenhuma. Responda apenas com o que estiver na base de conhecimento e no contexto da conversa.");
	}

	if (has("produtos.consultar") && productGroups.length > 0) {
		parts.push(
			`## Grupos de produtos do catálogo\nEstas são as categorias que existem hoje, com a quantidade de produtos ativos em cada uma. Use esta grafia exata no filtro "grupo" da consulta de catálogo. Para saber o que a empresa vende, parta desta lista — só consulte o catálogo para detalhar produtos.\n\n${productGroups.map((group) => `- ${group.grupo} (${group.quantidadeProdutos} produto(s))`).join("\n")}`,
		);
	}

	if (knowledgeContext.trim()) {
		parts.push(`## Base de conhecimento da empresa\nUse estas informações como verdade sobre a empresa.\n\n${knowledgeContext.trim()}`);
	}

	parts.push(`## Formato da resposta
Devolva:
- "mensagem": o texto exato a enviar ao cliente. Use null somente quando um humano acabou de
  assumir a conversa e qualquer texto seu seria ruído — nunca para "aguarde" ou "já retorno",
  porque null deixa o cliente sem resposta nenhuma.
- "anexo": null na grande maioria dos turnos. Preencha apenas para anexar um arquivo cuja URL
  esteja escrita nas instruções ou na base de conhecimento, com "tipo" IMAGEM, VIDEO ou DOCUMENTO
  e "nomeArquivo" com a extensão do arquivo (ou null).
- "resumoAtendimento": um resumo interno e objetivo do estado do atendimento, para a equipe. Não é
  visto pelo cliente, e o que você escrever nele não acontece sozinho: se disser que vai consultar
  ou criar algo, faça na mesma execução.

O contexto pode trazer um bloco [CATALOGO_INTERNO] com os produtos da sua última consulta e os IDs
para chamar ferramentas. É uma amostra parcial daquela consulta, não o catálogo da empresa: use os
IDs, nunca os copie para a mensagem do cliente, e não responda por ele uma pergunta que pede
filtro diferente — nesse caso, consulte o catálogo de novo.

Esse bloco não carrega disponibilidade, e de propósito: saldo muda entre uma mensagem e a seguinte.
Para falar de estoque, consulte o catálogo neste turno.`);

	return parts.join("\n\n");
}
