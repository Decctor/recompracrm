import { naiveUtcParam, nowAsNaiveUtc, secondsBetween, durationStatsSelection, toDurationStats } from "@/lib/chats/analytics";
import { currentChatAssignmentJoin } from "@/lib/chats/inbox-filters";
import { isWhatsappWindowOpen } from "@/lib/chats/whatsapp-window-status";
import { createSimplifiedSearchCondition } from "@/lib/search";
import { ChatAssignmentPriorityEnum, ChatAssignmentResponsibleTypeEnum, ChatAssignmentStatusEnum, ChatMessageAuthorTypeEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { aiAgents } from "@/services/drizzle/schema/ai-agents";
import { chatAssignments, chatMessages, chats } from "@/services/drizzle/schema/chats";
import { clients } from "@/services/drizzle/schema/clients";
import { users } from "@/services/drizzle/schema/users";
import { whatsappConnectionPhones, whatsappConnections } from "@/services/drizzle/schema/whatsapp-connections";
import dayjs from "dayjs";
import { and, asc, between, desc, eq, gt, inArray, isNotNull, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import createHttpError from "http-errors";
import z from "zod";
import {
	CHAT_MESSAGE_TEXT_MAX_CHARS,
	CHAT_PREVIEW_MAX_CHARS,
	buildMatchSnippet,
	decodeKeysetCursor,
	decodeOffsetCursor,
	durationStatsToMinutes,
	encodeKeysetCursor,
	encodeOffsetCursor,
	resolveLastDirection,
	secondsToMinutes,
	textContainsTerm,
	truncateText,
} from "../chat-content";
import { canReadClientPii, maskSensitiveValue, resolveOrganizationScope } from "../organization-scope";
import { PERIOD_DESCRIPTION, PeriodInputSchema, resolvePeriod } from "../period";
import { defineAgentTool } from "../types";
import {
	CHAT_AUTHOR_DESCRIPTION,
	CHAT_CONTENT_DISCLAIMER,
	ChatConnectionPhoneInputSchema,
	OrganizationInputSchema,
	assertChatHubEnabled,
	platformOrganizationHint,
} from "./chats-shared";

const CLOSED_ASSIGNMENT_STATUSES = ["ENCERRADO", "CANCELADO"] as const;
const MAX_LIST_LIMIT = 50;
const DEFAULT_LIST_LIMIT = 20;
const MAX_MESSAGES_LIMIT = 100;
const DEFAULT_MESSAGES_LIMIT = 50;
const MAX_SEARCH_PERIOD_DAYS = 93;

/**
 * Carimbos truncados em milissegundos para ordenar e paginar. O Postgres guarda microssegundos e
 * o cursor carrega um `Date` do JavaScript: comparar a coluna crua com o cursor pularia linhas do
 * mesmo milissegundo. Ordenação e cursor usam a mesma expressão, então não há como divergirem.
 */
function msPrecision(column: SQL | unknown): SQL {
	return sql`date_trunc('milliseconds', ${column})`;
}

/** "O cliente falou por último" — mesma regra do atalho AGUARDANDO_RESPOSTA da inbox. */
const waitingForReply = and(
	isNotNull(chats.ultimaMensagemEntradaData),
	or(isNull(chats.ultimaMensagemSaidaData), gt(chats.ultimaMensagemEntradaData, chats.ultimaMensagemSaidaData)),
);

/**
 * Início da janela de mensagens de um atendimento.
 *
 * A mensagem do cliente é gravada **antes** de o atendimento ser aberto (`persistIncomingClientMessage`
 * vem primeiro), então começar exatamente em `dataInsercao` deixaria de fora justamente a mensagem
 * que abriu o ticket. A janela recua 10 minutos, mas nunca para antes do encerramento do
 * atendimento anterior do mesmo chat — senão o "obrigado" do ticket anterior entraria neste.
 *
 * O alias é escrito à mão: um `alias()` do Drizzle dentro de um template `sql` cru renderiza só o
 * nome do alias, sem o `from tabela as alias`, e o Postgres não encontra a relação.
 */
const attendanceWindowStart = sql`greatest(
	${chatAssignments.dataInsercao} - interval '10 minutes',
	coalesce(
		(select max(atendimento_anterior.data_encerramento) from ${chatAssignments} as atendimento_anterior
			where atendimento_anterior.chat_id = ${chatAssignments.chatId} and atendimento_anterior.data_insercao < ${chatAssignments.dataInsercao}),
		'-infinity'::timestamp
	)
)`;
const attendanceWindowEnd = sql`coalesce(${chatAssignments.dataEncerramento}, ${nowAsNaiveUtc()})`;

function maskPhone(phone: string | null | undefined, showPii: boolean) {
	return showPii ? phone : maskSensitiveValue(phone);
}

// ============================================================================
// search_chats — a conversa como unidade: estado atual, quem está com ela, quem deve resposta
// ============================================================================

const ChatListOrderEnum = z.enum(["ATIVIDADE_RECENTE", "ESPERA_MAIS_LONGA"]);

const SearchChatsInputSchema = z.object({
	periodo: PeriodInputSchema.describe("Filtra pela data da última mensagem da conversa. Omitido = sem filtro de data (útil para a fila atual)."),
	aguardandoResposta: z
		.boolean({ invalid_type_error: "Tipo inválido para aguardando resposta." })
		.optional()
		.nullable()
		.describe("Só conversas em que a última mensagem foi do cliente."),
	aguardandoHaMaisDeMinutos: z
		.number({ invalid_type_error: "Tipo inválido para minutos aguardando." })
		.int()
		.positive()
		.optional()
		.nullable()
		.describe("Só conversas em que o cliente espera resposta há mais de N minutos."),
	statusAtendimento: z.array(ChatAssignmentStatusEnum).optional().nullable().describe("Status do atendimento corrente."),
	semAtendimentoAtivo: z
		.boolean({ invalid_type_error: "Tipo inválido para sem atendimento ativo." })
		.optional()
		.nullable()
		.describe("Só conversas sem atendimento aberto (nunca atendidas ou com o último atendimento encerrado)."),
	responsavelTipo: ChatAssignmentResponsibleTypeEnum.optional().nullable(),
	responsavelUsuarioId: z.string({ invalid_type_error: "Tipo inválido para o id do responsável." }).optional().nullable(),
	prioridade: ChatAssignmentPriorityEnum.optional().nullable(),
	categoria: z.string({ invalid_type_error: "Tipo inválido para a categoria." }).optional().nullable(),
	clienteId: z.string({ invalid_type_error: "Tipo inválido para o id do cliente." }).optional().nullable(),
	whatsappConexaoTelefoneId: ChatConnectionPhoneInputSchema,
	ordenacao: ChatListOrderEnum.optional().nullable(),
	limite: z.number({ invalid_type_error: "Tipo inválido para o limite." }).int().positive().max(MAX_LIST_LIMIT).optional().nullable(),
	cursor: z
		.string({ invalid_type_error: "Tipo inválido para o cursor." })
		.optional()
		.nullable()
		.describe("`proximoCursor` da chamada anterior, com os mesmos filtros."),
	organizacaoId: OrganizationInputSchema,
});

export const searchChatsTool = defineAgentTool({
	name: "search_chats",
	title: "Buscar conversas",
	scopes: ["agent:chats:read"],
	modes: ["ORG", "PLATAFORMA"],
	inputSchema: SearchChatsInputSchema,
	describe: (actor) =>
		[
			"Lista conversas do hub de atendimentos com o estado atual de cada uma: atendimento corrente (status, responsável, prioridade, categoria),",
			"quem falou por último, há quanto tempo o cliente espera resposta, se a janela de 24h do WhatsApp está aberta, total de mensagens e uma prévia da última mensagem.",
			"Não traz o conteúdo da conversa: escolha as conversas aqui e leia com `get_chat_messages`.",
			"`ordenacao: ESPERA_MAIS_LONGA` lista só quem aguarda resposta, do mais antigo para o mais novo — é a fila de quem está sendo ignorado.",
			"`ultimaDirecao` é sinal de transporte: SAIDA depois de um 'obrigado' do cliente não é pendência de ninguém.",
			`Devolve até ${MAX_LIST_LIMIT} conversas por chamada com \`total\`; continue com \`proximoCursor\` mantendo os filtros.`,
			canReadClientPii(actor) ? "O telefone do cliente vem completo." : "O telefone do cliente vem mascarado nesta conexão.",
			CHAT_CONTENT_DISCLAIMER,
			platformOrganizationHint(actor.mode),
		]
			.filter(Boolean)
			.join(" "),
	execute: async (input, actor) => {
		const organizacaoId = await resolveOrganizationScope(actor, input.organizacaoId);
		await assertChatHubEnabled(organizacaoId);
		const showPii = canReadClientPii(actor);
		const limite = input.limite ?? DEFAULT_LIST_LIMIT;
		const ordenacao = input.ordenacao ?? "ATIVIDADE_RECENTE";
		const byWait = ordenacao === "ESPERA_MAIS_LONGA";

		const conditions: (SQL | undefined)[] = [eq(chats.organizacaoId, organizacaoId), eq(chats.origem, "WHATSAPP")];
		if (input.periodo) {
			const periodo = resolvePeriod(input.periodo);
			conditions.push(between(chats.ultimaMensagemData, periodo.after, periodo.before));
		}
		if (input.aguardandoResposta || input.aguardandoHaMaisDeMinutos || byWait) conditions.push(waitingForReply);
		if (input.aguardandoHaMaisDeMinutos) {
			conditions.push(lte(chats.ultimaMensagemEntradaData, dayjs().subtract(input.aguardandoHaMaisDeMinutos, "minutes").toDate()));
		}
		if (input.statusAtendimento?.length) conditions.push(inArray(chatAssignments.status, input.statusAtendimento));
		if (input.semAtendimentoAtivo) conditions.push(isNull(chatAssignments.id));
		if (input.responsavelTipo === "NAO_ATRIBUIDO") {
			conditions.push(or(isNull(chatAssignments.id), eq(chatAssignments.responsavelTipo, "NAO_ATRIBUIDO")));
		} else if (input.responsavelTipo) {
			conditions.push(eq(chatAssignments.responsavelTipo, input.responsavelTipo));
		}
		if (input.responsavelUsuarioId) conditions.push(eq(chatAssignments.responsavelUsuarioId, input.responsavelUsuarioId));
		if (input.prioridade) conditions.push(eq(chatAssignments.prioridade, input.prioridade));
		if (input.categoria?.trim()) conditions.push(eq(chatAssignments.categoria, input.categoria.trim()));
		if (input.clienteId) conditions.push(eq(chats.clienteId, input.clienteId));
		if (input.whatsappConexaoTelefoneId) conditions.push(eq(chats.whatsappConexaoTelefoneId, input.whatsappConexaoTelefoneId));

		const where = and(...conditions);
		const sortExpression = msPrecision(byWait ? chats.ultimaMensagemEntradaData : chats.ultimaMensagemData);
		const cursor = decodeKeysetCursor(input.cursor);
		const cursorCondition = cursor
			? byWait
				? sql`(${sortExpression} > ${naiveUtcParam(cursor.value)} or (${sortExpression} = ${naiveUtcParam(cursor.value)} and ${chats.id} > ${cursor.id}))`
				: sql`(${sortExpression} < ${naiveUtcParam(cursor.value)} or (${sortExpression} = ${naiveUtcParam(cursor.value)} and ${chats.id} < ${cursor.id}))`
			: undefined;

		const lastMessage = alias(chatMessages, "ultima_mensagem");

		const [rows, totalResult] = await Promise.all([
			db
				.select({
					id: chats.id,
					ultimaMensagemData: chats.ultimaMensagemData,
					ultimaMensagemEntradaData: chats.ultimaMensagemEntradaData,
					ultimaMensagemSaidaData: chats.ultimaMensagemSaidaData,
					mensagensNaoLidas: chats.mensagensNaoLidas,
					whatsappJanelaDataExpiracao: chats.whatsappJanelaDataExpiracao,
					dataInsercao: chats.dataInsercao,
					conexaoTipo: whatsappConnections.tipoConexao,
					cliente: { id: clients.id, nome: clients.nome, telefone: clients.telefone },
					conexaoTelefone: { id: whatsappConnectionPhones.id, nome: whatsappConnectionPhones.nome },
					atendimento: {
						id: chatAssignments.id,
						status: chatAssignments.status,
						responsavelTipo: chatAssignments.responsavelTipo,
						prioridade: chatAssignments.prioridade,
						categoria: chatAssignments.categoria,
						dataInsercao: chatAssignments.dataInsercao,
						dataPrimeiraResposta: chatAssignments.dataPrimeiraResposta,
					},
					responsavelUsuario: { id: users.id, nome: users.nome },
					responsavelAgente: { id: aiAgents.id, nome: aiAgents.nome },
					ultimaMensagem: {
						id: lastMessage.id,
						autorTipo: lastMessage.autorTipo,
						conteudoMidiaTipo: lastMessage.conteudoMidiaTipo,
						conteudoTexto: lastMessage.conteudoTexto,
						conteudoMidiaTextoProcessado: lastMessage.conteudoMidiaTextoProcessado,
					},
					totalMensagens: sql<number>`(select count(*)::int from ${chatMessages} where ${chatMessages.chatId} = ${chats.id})`,
					sortValue: sql<Date>`${sortExpression}`.mapWith(chats.ultimaMensagemData),
				})
				.from(chats)
				.leftJoin(clients, eq(chats.clienteId, clients.id))
				.leftJoin(chatAssignments, currentChatAssignmentJoin)
				.leftJoin(users, eq(chatAssignments.responsavelUsuarioId, users.id))
				.leftJoin(aiAgents, eq(chatAssignments.responsavelAgenteId, aiAgents.id))
				.leftJoin(lastMessage, eq(chats.ultimaMensagemId, lastMessage.id))
				.leftJoin(whatsappConnections, eq(chats.whatsappConexaoId, whatsappConnections.id))
				.leftJoin(whatsappConnectionPhones, eq(chats.whatsappConexaoTelefoneId, whatsappConnectionPhones.id))
				.where(and(where, cursorCondition))
				.orderBy(byWait ? asc(sortExpression) : desc(sortExpression), byWait ? asc(chats.id) : desc(chats.id))
				.limit(limite + 1),
			db
				.select({ total: sql<number>`count(*)::int` })
				.from(chats)
				.leftJoin(chatAssignments, currentChatAssignmentJoin)
				.where(where),
		]);

		const hasMore = rows.length > limite;
		const page = hasMore ? rows.slice(0, limite) : rows;
		const last = page.at(-1);
		const now = new Date();

		return {
			total: totalResult[0]?.total ?? 0,
			exibindo: page.length,
			truncado: hasMore || cursor !== null,
			proximoCursor: hasMore && last ? encodeKeysetCursor({ value: last.sortValue, id: last.id }) : undefined,
			conversas: page.map((row) => {
				const ultimaDirecao = resolveLastDirection({ entrada: row.ultimaMensagemEntradaData, saida: row.ultimaMensagemSaidaData });
				const aguardandoDesde = ultimaDirecao === "ENTRADA" ? row.ultimaMensagemEntradaData : null;
				const preview = row.ultimaMensagem?.id
					? truncateText(row.ultimaMensagem.conteudoTexto || row.ultimaMensagem.conteudoMidiaTextoProcessado, CHAT_PREVIEW_MAX_CHARS, {
							collapseWhitespace: true,
						})
					: null;
				return {
					chatId: row.id,
					cliente: row.cliente?.id ? { id: row.cliente.id, nome: row.cliente.nome, telefone: maskPhone(row.cliente.telefone, showPii) } : undefined,
					telefoneConexao: row.conexaoTelefone?.id ? row.conexaoTelefone : undefined,
					conversaIniciadaEm: row.dataInsercao,
					ultimaMensagemData: row.ultimaMensagemData,
					ultimaDirecao,
					aguardandoRespostaDesde: aguardandoDesde,
					minutosAguardando: aguardandoDesde ? Math.round((now.getTime() - aguardandoDesde.getTime()) / 60000) : undefined,
					mensagensNaoLidas: row.mensagensNaoLidas,
					totalMensagens: row.totalMensagens,
					janelaWhatsappAberta: isWhatsappWindowOpen({ expiracao: row.whatsappJanelaDataExpiracao, tipoConexao: row.conexaoTipo, now }),
					// Ausente = sem atendimento aberto agora (nunca atendida ou último encerrado).
					atendimentoAtivo: row.atendimento?.id
						? {
								id: row.atendimento.id,
								status: row.atendimento.status,
								responsavelTipo: row.atendimento.responsavelTipo,
								responsavel: row.responsavelUsuario?.id ? row.responsavelUsuario : row.responsavelAgente?.id ? row.responsavelAgente : undefined,
								prioridade: row.atendimento.prioridade,
								categoria: row.atendimento.categoria,
								abertoEm: row.atendimento.dataInsercao,
								primeiraRespostaEm: row.atendimento.dataPrimeiraResposta,
							}
						: undefined,
					ultimaMensagem: row.ultimaMensagem?.id
						? { autorTipo: row.ultimaMensagem.autorTipo, conteudoMidiaTipo: row.ultimaMensagem.conteudoMidiaTipo, previa: preview?.texto }
						: undefined,
				};
			}),
		};
	},
});

// ============================================================================
// list_chat_attendances — o atendimento (ticket) como unidade: é onde mora o benchmark
// ============================================================================

const AttendanceOrderEnum = z.enum(["ABERTURA_RECENTE", "PRIMEIRA_RESPOSTA_MAIS_LENTA", "RESOLUCAO_MAIS_LENTA", "MAIS_MENSAGENS"]);

const ListChatAttendancesInputSchema = z.object({
	periodo: PeriodInputSchema.describe("Filtra pela ABERTURA do atendimento. Padrão: últimos 30 dias."),
	status: z.array(ChatAssignmentStatusEnum).optional().nullable(),
	responsavelTipo: ChatAssignmentResponsibleTypeEnum.optional().nullable(),
	responsavelUsuarioId: z.string({ invalid_type_error: "Tipo inválido para o id do responsável." }).optional().nullable(),
	prioridade: ChatAssignmentPriorityEnum.optional().nullable(),
	categoria: z.string({ invalid_type_error: "Tipo inválido para a categoria." }).optional().nullable(),
	resultado: z
		.string({ invalid_type_error: "Tipo inválido para o resultado." })
		.optional()
		.nullable()
		.describe("Resultado gravado no encerramento. HUMAN_HANDOFF = a IA passou para um humano."),
	semPrimeiraResposta: z
		.boolean({ invalid_type_error: "Tipo inválido para sem primeira resposta." })
		.optional()
		.nullable()
		.describe("Só atendimentos que nunca receberam resposta."),
	primeiraRespostaAcimaDeMinutos: z
		.number({ invalid_type_error: "Tipo inválido para minutos de primeira resposta." })
		.positive()
		.optional()
		.nullable()
		.describe("Só atendimentos cuja primeira resposta demorou mais que N minutos."),
	chatId: z.string({ invalid_type_error: "Tipo inválido para o id do chat." }).optional().nullable(),
	clienteId: z.string({ invalid_type_error: "Tipo inválido para o id do cliente." }).optional().nullable(),
	whatsappConexaoTelefoneId: ChatConnectionPhoneInputSchema,
	ordenacao: AttendanceOrderEnum.optional().nullable(),
	limite: z.number({ invalid_type_error: "Tipo inválido para o limite." }).int().positive().max(MAX_LIST_LIMIT).optional().nullable(),
	cursor: z
		.string({ invalid_type_error: "Tipo inválido para o cursor." })
		.optional()
		.nullable()
		.describe("`proximoCursor` da chamada anterior, com os mesmos filtros."),
	organizacaoId: OrganizationInputSchema,
});

const firstResponseSeconds = secondsBetween(chatAssignments.dataInsercao, chatAssignments.dataPrimeiraResposta);
const resolutionSeconds = secondsBetween(chatAssignments.dataInsercao, chatAssignments.dataResolucao);
const durationSeconds = secondsBetween(chatAssignments.dataInsercao, chatAssignments.dataEncerramento);

export const listChatAttendancesTool = defineAgentTool({
	name: "list_chat_attendances",
	title: "Listar atendimentos",
	scopes: ["agent:chats:read"],
	modes: ["ORG", "PLATAFORMA"],
	inputSchema: ListChatAttendancesInputSchema,
	describe: (actor) =>
		[
			"Lista atendimentos (tickets) abertos no período, cada um com suas métricas: tempo até a primeira resposta, até a resolução e duração total (minutos),",
			"responsável, status, prioridade, categoria, resumo, resultado e as mensagens trocadas dentro do atendimento por autor (cliente, equipe, IA).",
			"É a ferramenta para auditoria por amostragem: ache os casos que puxam a mediana (`ordenacao: PRIMEIRA_RESPOSTA_MAIS_LENTA`), os sem resposta (`semPrimeiraResposta`),",
			"os que a IA passou para humano (`resultado: HUMAN_HANDOFF`), e então leia cada um com `get_chat_messages` passando `atendimentoId`.",
			"`resumoDoFiltro` traz contagem e mediana do conjunto filtrado inteiro, não só da página — use-o para comparar atendentes ou números.",
			"O responsável é o ATUAL do atendimento: transferências não deixam histórico, então o tempo de resposta é creditado ao último dono.",
			`Devolve até ${MAX_LIST_LIMIT} atendimentos por chamada; continue com \`proximoCursor\` mantendo os filtros.`,
			CHAT_CONTENT_DISCLAIMER,
			PERIOD_DESCRIPTION,
			platformOrganizationHint(actor.mode),
		]
			.filter(Boolean)
			.join(" "),
	execute: async (input, actor) => {
		const organizacaoId = await resolveOrganizationScope(actor, input.organizacaoId);
		await assertChatHubEnabled(organizacaoId);
		const periodo = resolvePeriod(input.periodo);
		const limite = input.limite ?? DEFAULT_LIST_LIMIT;
		const offset = decodeOffsetCursor(input.cursor);

		const conditions: (SQL | undefined)[] = [
			eq(chatAssignments.organizacaoId, organizacaoId),
			eq(chats.origem, "WHATSAPP"),
			between(chatAssignments.dataInsercao, periodo.after, periodo.before),
		];
		if (input.status?.length) conditions.push(inArray(chatAssignments.status, input.status));
		if (input.responsavelTipo) conditions.push(eq(chatAssignments.responsavelTipo, input.responsavelTipo));
		if (input.responsavelUsuarioId) conditions.push(eq(chatAssignments.responsavelUsuarioId, input.responsavelUsuarioId));
		if (input.prioridade) conditions.push(eq(chatAssignments.prioridade, input.prioridade));
		if (input.categoria?.trim()) conditions.push(eq(chatAssignments.categoria, input.categoria.trim()));
		if (input.resultado?.trim()) conditions.push(eq(chatAssignments.resultado, input.resultado.trim()));
		if (input.semPrimeiraResposta) conditions.push(isNull(chatAssignments.dataPrimeiraResposta));
		if (input.primeiraRespostaAcimaDeMinutos) conditions.push(sql`${firstResponseSeconds} > ${input.primeiraRespostaAcimaDeMinutos * 60}`);
		if (input.chatId) conditions.push(eq(chatAssignments.chatId, input.chatId));
		if (input.clienteId) conditions.push(eq(chats.clienteId, input.clienteId));
		if (input.whatsappConexaoTelefoneId) conditions.push(eq(chats.whatsappConexaoTelefoneId, input.whatsappConexaoTelefoneId));
		const where = and(...conditions);

		// Mensagens dentro da janela do atendimento, por autor. BUSINESS-APP conta como equipe:
		// é alguém da loja respondendo pelo celular, fora do hub.
		const messageCounts = sql<{ cliente: number; equipe: number; ia: number }>`(
			select json_build_object(
				'cliente', count(*) filter (where ${chatMessages.autorTipo} = 'CLIENTE'),
				'equipe', count(*) filter (where ${chatMessages.autorTipo} in ('USUÁRIO', 'BUSINESS-APP')),
				'ia', count(*) filter (where ${chatMessages.autorTipo} = 'AI')
			)
			from ${chatMessages}
			where ${chatMessages.chatId} = ${chatAssignments.chatId}
				and ${chatMessages.dataEnvio} >= ${attendanceWindowStart}
				and ${chatMessages.dataEnvio} <= ${attendanceWindowEnd}
		)`;
		const totalMessages = sql<number>`((${messageCounts})->>'cliente')::int + ((${messageCounts})->>'equipe')::int + ((${messageCounts})->>'ia')::int`;

		const orderBy =
			input.ordenacao === "PRIMEIRA_RESPOSTA_MAIS_LENTA"
				? [sql`${firstResponseSeconds} desc nulls last`, desc(chatAssignments.id)]
				: input.ordenacao === "RESOLUCAO_MAIS_LENTA"
					? [sql`${resolutionSeconds} desc nulls last`, desc(chatAssignments.id)]
					: input.ordenacao === "MAIS_MENSAGENS"
						? [sql`${totalMessages} desc`, desc(chatAssignments.id)]
						: [desc(chatAssignments.dataInsercao), desc(chatAssignments.id)];

		const [rows, summaryResult] = await Promise.all([
			db
				.select({
					id: chatAssignments.id,
					chatId: chatAssignments.chatId,
					status: chatAssignments.status,
					responsavelTipo: chatAssignments.responsavelTipo,
					prioridade: chatAssignments.prioridade,
					categoria: chatAssignments.categoria,
					resumo: chatAssignments.resumo,
					resultado: chatAssignments.resultado,
					transferenciaMotivo: chatAssignments.transferenciaMotivo,
					dataInsercao: chatAssignments.dataInsercao,
					dataPrimeiraResposta: chatAssignments.dataPrimeiraResposta,
					dataResolucao: chatAssignments.dataResolucao,
					dataEncerramento: chatAssignments.dataEncerramento,
					primeiraRespostaSegundos: firstResponseSeconds,
					resolucaoSegundos: resolutionSeconds,
					duracaoSegundos: durationSeconds,
					mensagens: messageCounts,
					cliente: { id: clients.id, nome: clients.nome },
					responsavelUsuario: { id: users.id, nome: users.nome },
					responsavelAgente: { id: aiAgents.id, nome: aiAgents.nome },
				})
				.from(chatAssignments)
				.innerJoin(chats, eq(chatAssignments.chatId, chats.id))
				.leftJoin(clients, eq(chats.clienteId, clients.id))
				.leftJoin(users, eq(chatAssignments.responsavelUsuarioId, users.id))
				.leftJoin(aiAgents, eq(chatAssignments.responsavelAgenteId, aiAgents.id))
				.where(where)
				.orderBy(...orderBy)
				.limit(limite + 1)
				.offset(offset),
			db
				.select({
					total: sql<number>`count(*)::int`,
					semPrimeiraResposta: sql<number>`count(*) filter (where ${chatAssignments.dataPrimeiraResposta} is null)::int`,
					encerrados: sql<number>`count(*) filter (where ${chatAssignments.status} in ('ENCERRADO', 'CANCELADO'))::int`,
					...durationStatsSelection(firstResponseSeconds),
				})
				.from(chatAssignments)
				.innerJoin(chats, eq(chatAssignments.chatId, chats.id))
				.where(where),
		]);

		const hasMore = rows.length > limite;
		const page = hasMore ? rows.slice(0, limite) : rows;
		const summary = summaryResult[0];

		return {
			periodo: { inicio: periodo.inicio, fim: periodo.fim },
			total: summary?.total ?? 0,
			exibindo: page.length,
			truncado: hasMore || offset > 0,
			proximoCursor: hasMore ? encodeOffsetCursor(offset + limite) : undefined,
			resumoDoFiltro: {
				atendimentos: summary?.total ?? 0,
				semPrimeiraResposta: summary?.semPrimeiraResposta ?? 0,
				encerrados: summary?.encerrados ?? 0,
				primeiraResposta: durationStatsToMinutes(toDurationStats(summary ?? { media: null, mediana: null, p90: null, amostra: 0 })),
			},
			atendimentos: page.map((row) => ({
				atendimentoId: row.id,
				chatId: row.chatId,
				cliente: row.cliente?.id ? row.cliente : undefined,
				status: row.status,
				responsavelTipo: row.responsavelTipo,
				responsavel: row.responsavelUsuario?.id ? row.responsavelUsuario : row.responsavelAgente?.id ? row.responsavelAgente : undefined,
				prioridade: row.prioridade,
				categoria: row.categoria,
				resumo: truncateText(row.resumo, 400)?.texto,
				resultado: row.resultado,
				motivoTransferencia: row.transferenciaMotivo,
				abertoEm: row.dataInsercao,
				primeiraRespostaEm: row.dataPrimeiraResposta,
				resolvidoEm: row.dataResolucao,
				encerradoEm: row.dataEncerramento,
				primeiraRespostaMinutos: secondsToMinutes(row.primeiraRespostaSegundos),
				resolucaoMinutos: secondsToMinutes(row.resolucaoSegundos),
				duracaoMinutos: secondsToMinutes(row.duracaoSegundos),
				mensagens: row.mensagens
					? { doCliente: Number(row.mensagens.cliente), daEquipe: Number(row.mensagens.equipe), daIA: Number(row.mensagens.ia) }
					: undefined,
			})),
		};
	},
});

// ============================================================================
// get_chat_messages — ler a conversa, inteira ou recortada a um atendimento
// ============================================================================

const GetChatMessagesInputSchema = z.object({
	chatId: z.string({ required_error: "Informe o id do chat.", invalid_type_error: "Tipo inválido para o id do chat." }),
	atendimentoId: z
		.string({ invalid_type_error: "Tipo inválido para o id do atendimento." })
		.optional()
		.nullable()
		.describe("Recorta a leitura às mensagens daquele atendimento (ticket)."),
	periodo: PeriodInputSchema.describe("Recorta por data de envio. Omitido = sem recorte."),
	ordem: z
		.enum(["RECENTES", "DO_INICIO"])
		.optional()
		.nullable()
		.describe("RECENTES (padrão) começa pelas últimas mensagens e pagina para trás; DO_INICIO começa pela primeira e pagina para frente."),
	limite: z.number({ invalid_type_error: "Tipo inválido para o limite." }).int().positive().max(MAX_MESSAGES_LIMIT).optional().nullable(),
	cursor: z
		.string({ invalid_type_error: "Tipo inválido para o cursor." })
		.optional()
		.nullable()
		.describe("`proximoCursor` da chamada anterior, com os mesmos filtros."),
	organizacaoId: OrganizationInputSchema,
});

export const getChatMessagesTool = defineAgentTool({
	name: "get_chat_messages",
	title: "Ler conversa",
	scopes: ["agent:chats:read"],
	modes: ["ORG", "PLATAFORMA"],
	inputSchema: GetChatMessagesInputSchema,
	describe: (actor) =>
		[
			"Lê as mensagens de uma conversa, sempre em ordem cronológica dentro da página, com autor, horário, texto, transcrição de áudio e status de entrega.",
			"Na primeira página (sem cursor) traz também o cabeçalho: cliente, número da loja, janela de 24h e os últimos atendimentos da conversa com suas métricas.",
			"Com `atendimentoId`, recorta às mensagens daquele atendimento — o jeito certo de auditar um ticket de `list_chat_attendances`.",
			CHAT_AUTHOR_DESCRIPTION,
			"`conteudoMidiaTextoProcessado` é a transcrição (áudio) ou a descrição gerada (imagem, vídeo, documento) — leia-o como o conteúdo da mídia.",
			`Cada campo de texto é cortado em ${CHAT_MESSAGE_TEXT_MAX_CHARS} caracteres (\`textoCortado\`).`,
			`Até ${MAX_MESSAGES_LIMIT} mensagens por página; \`totalNoRecorte\` diz quantas existem e \`proximoCursor\` continua a leitura.`,
			"Datas em UTC (ISO 8601); a operação da loja é em America/Sao_Paulo.",
			CHAT_CONTENT_DISCLAIMER,
			platformOrganizationHint(actor.mode),
		]
			.filter(Boolean)
			.join(" "),
	execute: async (input, actor) => {
		const organizacaoId = await resolveOrganizationScope(actor, input.organizacaoId);
		await assertChatHubEnabled(organizacaoId);
		const showPii = canReadClientPii(actor);
		const limite = input.limite ?? DEFAULT_MESSAGES_LIMIT;
		const fromStart = input.ordem === "DO_INICIO";

		const chat = await db.query.chats.findFirst({
			where: and(eq(chats.id, input.chatId), eq(chats.organizacaoId, organizacaoId), eq(chats.origem, "WHATSAPP")),
			columns: {
				id: true,
				dataInsercao: true,
				whatsappJanelaDataExpiracao: true,
				ultimaMensagemEntradaData: true,
				ultimaMensagemSaidaData: true,
				mensagensNaoLidas: true,
			},
			with: {
				cliente: { columns: { id: true, nome: true, telefone: true } },
				whatsappConexao: { columns: { tipoConexao: true } },
				whatsappConexaoTelefone: { columns: { id: true, nome: true } },
			},
		});
		if (!chat) throw new createHttpError.NotFound("Conversa não encontrada nesta organização.");

		// Recorte: atendimento (janela calculada no banco, mesma regra de `list_chat_attendances`) ou período.
		const windowConditions: SQL[] = [];
		if (input.atendimentoId) {
			const [window] = await db
				.select({
					inicio: sql<Date>`${attendanceWindowStart}`.mapWith(chatAssignments.dataInsercao),
					fim: sql<Date>`${attendanceWindowEnd}`.mapWith(chatAssignments.dataInsercao),
				})
				.from(chatAssignments)
				.where(and(eq(chatAssignments.id, input.atendimentoId), eq(chatAssignments.chatId, chat.id), eq(chatAssignments.organizacaoId, organizacaoId)));
			if (!window) throw new createHttpError.NotFound("Atendimento não encontrado nesta conversa.");
			windowConditions.push(between(chatMessages.dataEnvio, window.inicio, window.fim));
		}
		if (input.periodo?.inicio || input.periodo?.fim) {
			const periodo = resolvePeriod(input.periodo);
			windowConditions.push(between(chatMessages.dataEnvio, periodo.after, periodo.before));
		}

		const baseWhere = and(eq(chatMessages.chatId, chat.id), eq(chatMessages.organizacaoId, organizacaoId), ...windowConditions);
		const sortExpression = msPrecision(chatMessages.dataEnvio);
		const cursor = decodeKeysetCursor(input.cursor);
		const cursorCondition = cursor
			? fromStart
				? sql`(${sortExpression} > ${naiveUtcParam(cursor.value)} or (${sortExpression} = ${naiveUtcParam(cursor.value)} and ${chatMessages.id} > ${cursor.id}))`
				: sql`(${sortExpression} < ${naiveUtcParam(cursor.value)} or (${sortExpression} = ${naiveUtcParam(cursor.value)} and ${chatMessages.id} < ${cursor.id}))`
			: undefined;

		const [rows, totalResult, atendimentos] = await Promise.all([
			db
				.select({
					id: chatMessages.id,
					dataEnvio: chatMessages.dataEnvio,
					autorTipo: chatMessages.autorTipo,
					autorUsuarioNome: users.nome,
					conteudoMidiaTipo: chatMessages.conteudoMidiaTipo,
					conteudoTexto: chatMessages.conteudoTexto,
					conteudoMidiaTextoProcessado: chatMessages.conteudoMidiaTextoProcessado,
					conteudoMidiaArquivoNome: chatMessages.conteudoMidiaArquivoNome,
					whatsappTemplateId: chatMessages.whatsappTemplateId,
					statusEntrega: chatMessages.statusEntrega,
					sortValue: sql<Date>`${sortExpression}`.mapWith(chatMessages.dataEnvio),
				})
				.from(chatMessages)
				.leftJoin(users, eq(chatMessages.autorUsuarioId, users.id))
				.where(and(baseWhere, cursorCondition))
				.orderBy(fromStart ? asc(sortExpression) : desc(sortExpression), fromStart ? asc(chatMessages.id) : desc(chatMessages.id))
				.limit(limite + 1),
			db
				.select({ total: sql<number>`count(*)::int` })
				.from(chatMessages)
				.where(baseWhere),
			// O cabeçalho só vai na primeira página: repeti-lo a cada página gastaria contexto à toa.
			cursor
				? null
				: db
						.select({
							id: chatAssignments.id,
							status: chatAssignments.status,
							responsavelTipo: chatAssignments.responsavelTipo,
							responsavelUsuarioNome: users.nome,
							responsavelAgenteNome: aiAgents.nome,
							prioridade: chatAssignments.prioridade,
							categoria: chatAssignments.categoria,
							resultado: chatAssignments.resultado,
							dataInsercao: chatAssignments.dataInsercao,
							dataEncerramento: chatAssignments.dataEncerramento,
							primeiraRespostaSegundos: firstResponseSeconds,
							resolucaoSegundos: resolutionSeconds,
						})
						.from(chatAssignments)
						.leftJoin(users, eq(chatAssignments.responsavelUsuarioId, users.id))
						.leftJoin(aiAgents, eq(chatAssignments.responsavelAgenteId, aiAgents.id))
						.where(and(eq(chatAssignments.chatId, chat.id), eq(chatAssignments.organizacaoId, organizacaoId)))
						.orderBy(desc(chatAssignments.dataInsercao))
						.limit(10),
		]);

		const hasMore = rows.length > limite;
		const page = hasMore ? rows.slice(0, limite) : rows;
		const last = page.at(-1);
		// RECENTES busca de trás para frente; a página sempre sai em ordem cronológica.
		const chronological = fromStart ? page : [...page].reverse();

		return {
			chatId: chat.id,
			conversa: atendimentos
				? {
						cliente: chat.cliente ? { id: chat.cliente.id, nome: chat.cliente.nome, telefone: maskPhone(chat.cliente.telefone, showPii) } : undefined,
						telefoneConexao: chat.whatsappConexaoTelefone ?? undefined,
						iniciadaEm: chat.dataInsercao,
						ultimaDirecao: resolveLastDirection({ entrada: chat.ultimaMensagemEntradaData, saida: chat.ultimaMensagemSaidaData }),
						janelaWhatsappAberta: isWhatsappWindowOpen({ expiracao: chat.whatsappJanelaDataExpiracao, tipoConexao: chat.whatsappConexao?.tipoConexao }),
						mensagensNaoLidas: chat.mensagensNaoLidas,
						atendimentos: atendimentos.map((atendimento) => ({
							atendimentoId: atendimento.id,
							status: atendimento.status,
							ativo: !(CLOSED_ASSIGNMENT_STATUSES as readonly string[]).includes(atendimento.status),
							responsavelTipo: atendimento.responsavelTipo,
							responsavel: atendimento.responsavelUsuarioNome ?? atendimento.responsavelAgenteNome,
							prioridade: atendimento.prioridade,
							categoria: atendimento.categoria,
							resultado: atendimento.resultado,
							abertoEm: atendimento.dataInsercao,
							encerradoEm: atendimento.dataEncerramento,
							primeiraRespostaMinutos: secondsToMinutes(atendimento.primeiraRespostaSegundos),
							resolucaoMinutos: secondsToMinutes(atendimento.resolucaoSegundos),
						})),
					}
				: undefined,
			totalNoRecorte: totalResult[0]?.total ?? 0,
			exibindo: page.length,
			proximoCursor: hasMore && last ? encodeKeysetCursor({ value: last.sortValue, id: last.id }) : undefined,
			mensagens: chronological.map((message) => {
				const texto = truncateText(message.conteudoTexto, CHAT_MESSAGE_TEXT_MAX_CHARS);
				const processado = truncateText(message.conteudoMidiaTextoProcessado, CHAT_MESSAGE_TEXT_MAX_CHARS);
				const isOutgoing = message.autorTipo !== "CLIENTE";
				return {
					mensagemId: message.id,
					dataEnvio: message.dataEnvio,
					autorTipo: message.autorTipo,
					autorNome: message.autorTipo === "USUÁRIO" ? message.autorUsuarioNome : undefined,
					conteudoMidiaTipo: message.conteudoMidiaTipo === "TEXTO" ? undefined : message.conteudoMidiaTipo,
					conteudoTexto: texto?.texto,
					conteudoMidiaTextoProcessado: processado?.texto,
					conteudoMidiaArquivoNome: message.conteudoMidiaArquivoNome,
					textoCortado: texto?.truncado || processado?.truncado ? true : undefined,
					// Template = mensagem de campanha ou reabertura de janela, não resposta digitada.
					viaTemplate: message.whatsappTemplateId ? true : undefined,
					statusEntrega: isOutgoing ? message.statusEntrega : undefined,
				};
			}),
		};
	},
});

// ============================================================================
// search_chat_messages — busca literal para achar evidência (reclamação, palavra-chave)
// ============================================================================

const SearchChatMessagesInputSchema = z.object({
	termo: z
		.string({ required_error: "Informe o termo de busca.", invalid_type_error: "Tipo inválido para o termo de busca." })
		.trim()
		.min(3, "O termo precisa ter ao menos 3 caracteres."),
	periodo: PeriodInputSchema.describe(`Período de envio. Padrão: últimos 30 dias; máximo de ${MAX_SEARCH_PERIOD_DAYS} dias.`),
	autorTipo: ChatMessageAuthorTypeEnum.optional().nullable(),
	chatId: z.string({ invalid_type_error: "Tipo inválido para o id do chat." }).optional().nullable(),
	clienteId: z.string({ invalid_type_error: "Tipo inválido para o id do cliente." }).optional().nullable(),
	whatsappConexaoTelefoneId: ChatConnectionPhoneInputSchema,
	limite: z.number({ invalid_type_error: "Tipo inválido para o limite." }).int().positive().max(MAX_LIST_LIMIT).optional().nullable(),
	cursor: z
		.string({ invalid_type_error: "Tipo inválido para o cursor." })
		.optional()
		.nullable()
		.describe("`proximoCursor` da chamada anterior, com os mesmos filtros."),
	organizacaoId: OrganizationInputSchema,
});

export const searchChatMessagesTool = defineAgentTool({
	name: "search_chat_messages",
	title: "Buscar nas mensagens",
	scopes: ["agent:chats:read"],
	modes: ["ORG", "PLATAFORMA"],
	inputSchema: SearchChatMessagesInputSchema,
	describe: (actor) =>
		[
			"Busca um trecho literal no texto e nas transcrições das mensagens, ignorando maiúsculas e acentos ('nao' encontra 'não').",
			"Devolve trechos curtos com `mensagemId` e `chatId`, do mais recente ao mais antigo, mais as contagens do período inteiro: ocorrências por autor e conversas distintas.",
			"Use para localizar evidência (reclamações, 'cancelar', 'demora', o nome de um produto) e depois confirme o contexto com `get_chat_messages`.",
			"Não é busca semântica: zero ocorrências de uma palavra não prova ausência do problema — tente sinônimos.",
			CHAT_AUTHOR_DESCRIPTION,
			`Período padrão: últimos 30 dias; máximo ${MAX_SEARCH_PERIOD_DAYS} dias. Até ${MAX_LIST_LIMIT} trechos por chamada; continue com \`proximoCursor\`.`,
			CHAT_CONTENT_DISCLAIMER,
			platformOrganizationHint(actor.mode),
		]
			.filter(Boolean)
			.join(" "),
	execute: async (input, actor) => {
		const organizacaoId = await resolveOrganizationScope(actor, input.organizacaoId);
		await assertChatHubEnabled(organizacaoId);
		const periodo = resolvePeriod(input.periodo);
		if (dayjs(periodo.before).diff(periodo.after, "day") > MAX_SEARCH_PERIOD_DAYS) {
			throw new createHttpError.BadRequest(`O período da busca pode ter no máximo ${MAX_SEARCH_PERIOD_DAYS} dias. Divida a busca em períodos menores.`);
		}
		const limite = input.limite ?? DEFAULT_LIST_LIMIT;

		const termCondition = or(
			createSimplifiedSearchCondition(chatMessages.conteudoTexto, input.termo),
			createSimplifiedSearchCondition(chatMessages.conteudoMidiaTextoProcessado, input.termo),
		);
		const conditions: (SQL | undefined)[] = [
			eq(chatMessages.organizacaoId, organizacaoId),
			eq(chats.origem, "WHATSAPP"),
			between(chatMessages.dataEnvio, periodo.after, periodo.before),
			termCondition,
		];
		if (input.autorTipo) conditions.push(eq(chatMessages.autorTipo, input.autorTipo));
		if (input.chatId) conditions.push(eq(chatMessages.chatId, input.chatId));
		if (input.clienteId) conditions.push(eq(chats.clienteId, input.clienteId));
		if (input.whatsappConexaoTelefoneId) conditions.push(eq(chats.whatsappConexaoTelefoneId, input.whatsappConexaoTelefoneId));
		const where = and(...conditions);

		const sortExpression = msPrecision(chatMessages.dataEnvio);
		const cursor = decodeKeysetCursor(input.cursor);
		const cursorCondition = cursor
			? sql`(${sortExpression} < ${naiveUtcParam(cursor.value)} or (${sortExpression} = ${naiveUtcParam(cursor.value)} and ${chatMessages.id} < ${cursor.id}))`
			: undefined;

		const [rows, summaryResult] = await Promise.all([
			db
				.select({
					id: chatMessages.id,
					chatId: chatMessages.chatId,
					dataEnvio: chatMessages.dataEnvio,
					autorTipo: chatMessages.autorTipo,
					conteudoTexto: chatMessages.conteudoTexto,
					conteudoMidiaTextoProcessado: chatMessages.conteudoMidiaTextoProcessado,
					cliente: { id: clients.id, nome: clients.nome },
					sortValue: sql<Date>`${sortExpression}`.mapWith(chatMessages.dataEnvio),
				})
				.from(chatMessages)
				.innerJoin(chats, eq(chatMessages.chatId, chats.id))
				.leftJoin(clients, eq(chats.clienteId, clients.id))
				.where(and(where, cursorCondition))
				.orderBy(desc(sortExpression), desc(chatMessages.id))
				.limit(limite + 1),
			db
				.select({
					total: sql<number>`count(*)::int`,
					conversasDistintas: sql<number>`count(distinct ${chatMessages.chatId})::int`,
					doCliente: sql<number>`count(*) filter (where ${chatMessages.autorTipo} = 'CLIENTE')::int`,
					daEquipe: sql<number>`count(*) filter (where ${chatMessages.autorTipo} in ('USUÁRIO', 'BUSINESS-APP'))::int`,
					daIA: sql<number>`count(*) filter (where ${chatMessages.autorTipo} = 'AI')::int`,
				})
				.from(chatMessages)
				.innerJoin(chats, eq(chatMessages.chatId, chats.id))
				.where(where),
		]);

		const hasMore = rows.length > limite;
		const page = hasMore ? rows.slice(0, limite) : rows;
		const last = page.at(-1);
		const summary = summaryResult[0];

		return {
			periodo: { inicio: periodo.inicio, fim: periodo.fim },
			termo: input.termo,
			total: summary?.total ?? 0,
			conversasDistintas: summary?.conversasDistintas ?? 0,
			porAutor: { doCliente: summary?.doCliente ?? 0, daEquipe: summary?.daEquipe ?? 0, daIA: summary?.daIA ?? 0 },
			exibindo: page.length,
			truncado: hasMore || cursor !== null,
			proximoCursor: hasMore && last ? encodeKeysetCursor({ value: last.sortValue, id: last.id }) : undefined,
			ocorrencias: page.map((row) => {
				// O banco casou em um dos dois campos; o trecho sai daquele que contém o termo.
				const matchedText = !!row.conteudoTexto && textContainsTerm(row.conteudoTexto, input.termo);
				const source = (matchedText ? row.conteudoTexto : row.conteudoMidiaTextoProcessado) ?? row.conteudoTexto ?? "";
				return {
					mensagemId: row.id,
					chatId: row.chatId,
					dataEnvio: row.dataEnvio,
					autorTipo: row.autorTipo,
					cliente: row.cliente?.id ? row.cliente : undefined,
					campo: matchedText ? "TEXTO" : "MIDIA_PROCESSADA",
					trecho: buildMatchSnippet(source, input.termo),
				};
			}),
		};
	},
});
