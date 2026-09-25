import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { assertChatAccess, hasChatPermission } from "@/lib/chats/access";
import {
	CHAT_BOARD_CLOSED_WINDOW_DEFAULT_DAYS,
	CHAT_BOARD_CLOSED_WINDOW_MAX_DAYS,
	CHAT_BOARD_COLUMN_LIMIT,
	CHAT_BOARD_STATUSES,
	type TChatBoardStatus,
} from "@/lib/chats/board";
import { ChatAssignmentPriorityEnum, ChatInboxViewEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { aiAgentFollowUps } from "@/services/drizzle/schema/ai-agents";
import { chatAssignments, chatMessages, chats } from "@/services/drizzle/schema/chats";
import { clients } from "@/services/drizzle/schema/clients";
import { users } from "@/services/drizzle/schema/users";
import { whatsappConnections } from "@/services/drizzle/schema/whatsapp-connections";
import { and, count, desc, eq, gte, ilike, or, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// ============= GET - Quadro (kanban) de atendimentos =============

const GetChatBoardInputSchema = z.object({
	view: z
		.string({ invalid_type_error: "Tipo inválido para a visão do quadro." })
		.optional()
		.nullable()
		.transform((v) => ChatInboxViewEnum.catch("TODAS").parse(v ?? "TODAS")),
	whatsappConexaoTelefoneId: z.string({ invalid_type_error: "Tipo inválido para o ID do telefone da conexão." }).optional().nullable(),
	prioridade: z
		.string({ invalid_type_error: "Tipo inválido para a prioridade." })
		.optional()
		.nullable()
		.transform((v) => (v ? ChatAssignmentPriorityEnum.catch("MEDIA").parse(v) : null)),
	search: z.string({ invalid_type_error: "Tipo inválido para a busca." }).optional().nullable(),
	// Sem enum: o valor é um número, e um `z.enum(["1","3","7"])` só existiria para negar 5.
	encerradosDias: z
		.string({ invalid_type_error: "Tipo inválido para a janela de encerrados." })
		.optional()
		.nullable()
		.transform((v) => {
			const parsed = v ? Number(v) : CHAT_BOARD_CLOSED_WINDOW_DEFAULT_DAYS;
			if (!Number.isFinite(parsed)) return CHAT_BOARD_CLOSED_WINDOW_DEFAULT_DAYS;
			return Math.min(Math.max(Math.trunc(parsed), 1), CHAT_BOARD_CLOSED_WINDOW_MAX_DAYS);
		}),
});
export type TGetChatBoardInput = z.infer<typeof GetChatBoardInputSchema>;

/**
 * Projeção de um card do quadro.
 *
 * O card é o **atendimento**, não o chat: um chat sem ticket é um chat sem atendimento e
 * não pertence a um pipeline de atendimentos. Por isso a query parte de `chat_assignments`
 * e faz `innerJoin` com `chats` — o inverso do que a inbox faz.
 */
const chatBoardProjection = {
	id: chatAssignments.id,
	chatId: chatAssignments.chatId,
	status: chatAssignments.status,
	responsavelTipo: chatAssignments.responsavelTipo,
	responsavelUsuarioId: chatAssignments.responsavelUsuarioId,
	prioridade: chatAssignments.prioridade,
	categoria: chatAssignments.categoria,
	resumo: chatAssignments.resumo,
	// Abertura do atendimento. `dataAtribuicao` é reescrita a cada assumir/atribuir/
	// transferir, então significa "o dono atual é dono desde" — não serve como abertura.
	dataInsercao: chatAssignments.dataInsercao,
	dataAtribuicao: chatAssignments.dataAtribuicao,
	dataPrimeiraResposta: chatAssignments.dataPrimeiraResposta,
	dataEncerramento: chatAssignments.dataEncerramento,
	mensagensNaoLidas: chats.mensagensNaoLidas,
	ultimaMensagemData: chats.ultimaMensagemData,
	ultimaMensagemEntradaData: chats.ultimaMensagemEntradaData,
	ultimaMensagemSaidaData: chats.ultimaMensagemSaidaData,
	whatsappJanelaDataExpiracao: chats.whatsappJanelaDataExpiracao,
	conexaoTipo: whatsappConnections.tipoConexao,
	cliente: { id: clients.id, nome: clients.nome, telefone: clients.telefone },
	ultimaMensagem: {
		id: chatMessages.id,
		autorTipo: chatMessages.autorTipo,
		conteudoTexto: chatMessages.conteudoTexto,
		conteudoMidiaTipo: chatMessages.conteudoMidiaTipo,
		conteudoMidiaTextoProcessado: chatMessages.conteudoMidiaTextoProcessado,
		conteudoMidiaArquivoNome: chatMessages.conteudoMidiaArquivoNome,
	},
	responsavelUsuario: { id: users.id, nome: users.nome, avatarUrl: users.avatarUrl },
	// Retomada agendada pela IA para este atendimento: o card mostra "retoma 14:00".
	retomadaAgendadaPara: sql<
		string | null
	>`(select ${aiAgentFollowUps.agendadaPara} from ${aiAgentFollowUps} where ${aiAgentFollowUps.atendimentoId} = ${chatAssignments.id} and ${aiAgentFollowUps.status} = 'AGENDADA' limit 1)`,
};

function buildChatBoardQuery() {
	return db
		.select(chatBoardProjection)
		.from(chatAssignments)
		.innerJoin(chats, eq(chatAssignments.chatId, chats.id))
		.leftJoin(clients, eq(chats.clienteId, clients.id))
		.leftJoin(chatMessages, eq(chats.ultimaMensagemId, chatMessages.id))
		.leftJoin(users, eq(chatAssignments.responsavelUsuarioId, users.id))
		.leftJoin(whatsappConnections, eq(chats.whatsappConexaoId, whatsappConnections.id));
}
type TChatBoardQueryRow = Awaited<ReturnType<typeof buildChatBoardQuery>>[number];

function mapChatBoardRow(row: TChatBoardQueryRow, { canManageAny, currentUserId }: { canManageAny: boolean; currentUserId: string }) {
	const { responsavelUsuario, ultimaMensagemEntradaData, ultimaMensagemSaidaData, ...rest } = row;

	return {
		...rest,
		cliente: rest.cliente?.id ? rest.cliente : null,
		ultimaMensagem: rest.ultimaMensagem?.id ? rest.ultimaMensagem : null,
		responsavelUsuario: responsavelUsuario?.id ? responsavelUsuario : null,
		// Pendência do cliente: a última entrada é mais recente que a última saída. Mesma
		// regra que `getChatPendingState` aplica ao decidir entre ABERTO e EM_ATENDIMENTO.
		aguardandoResposta: !!ultimaMensagemEntradaData && (!ultimaMensagemSaidaData || ultimaMensagemEntradaData > ultimaMensagemSaidaData),
		// Espelha `mayManageAssignment`: a UI não reimplementa a regra de posse, só obedece.
		// Sem isso, o quadro ofereceria um arraste que a rota de atendimentos recusaria.
		podeGerenciar: canManageAny || row.responsavelUsuarioId === currentUserId,
	};
}
export type TChatBoardCard = ReturnType<typeof mapChatBoardRow>;

async function getChatBoard({ session, input }: { session: TAuthUserSession; input: TGetChatBoardInput }) {
	const { organizacaoId } = assertChatAccess({ session, permission: "visualizar" });
	const canManageAny = hasChatPermission({ session, permission: "finalizar" });
	const currentUserId = session.user.id;

	const viewCondition =
		input.view === "MINHAS"
			? eq(chatAssignments.responsavelUsuarioId, currentUserId)
			: input.view === "NAO_ATRIBUIDAS"
				? eq(chatAssignments.responsavelTipo, "NAO_ATRIBUIDO")
				: input.view === "COM_AGENTE"
					? eq(chatAssignments.responsavelTipo, "AGENTE")
					: undefined;

	const searchTerm = input.search?.trim();
	// A busca do quadro cobre só o cliente. Procurar no texto da última mensagem obrigaria a
	// varrer `chat_messages` uma vez por coluna — e quem procura por conteúdo usa a inbox.
	const searchCondition = searchTerm ? or(ilike(clients.nome, `%${searchTerm}%`), ilike(clients.telefone, `%${searchTerm}%`)) : undefined;

	const closedCutoff = new Date(Date.now() - input.encerradosDias * 24 * 60 * 60 * 1000);

	const baseConditions = [
		eq(chatAssignments.organizacaoId, organizacaoId),
		// Chats de teste do agente de IA não entram no quadro de atendimentos.
		eq(chats.origem, "WHATSAPP"),
		input.whatsappConexaoTelefoneId ? eq(chats.whatsappConexaoTelefoneId, input.whatsappConexaoTelefoneId) : undefined,
		input.prioridade ? eq(chatAssignments.prioridade, input.prioridade) : undefined,
		viewCondition,
		searchCondition,
	];

	/** `ENCERRADO` recortado por janela; os demais estados são todos os vivos. */
	function statusCondition(status: TChatBoardStatus) {
		return status === "ENCERRADO"
			? and(eq(chatAssignments.status, status), gte(chatAssignments.dataEncerramento, closedCutoff))
			: eq(chatAssignments.status, status);
	}

	// Uma query por coluna, em paralelo. A alternativa — uma query só com `row_number()
	// over (partition by status)` — economiza round trips, mas cada coluna aqui já é uma
	// varredura curta sobre idx_chat_assignments_org_status com LIMIT pequeno.
	const columns = await Promise.all(
		CHAT_BOARD_STATUSES.map(async (status) => {
			const [rows, [totalRow]] = await Promise.all([
				buildChatBoardQuery()
					.where(and(...baseConditions, statusCondition(status)))
					.orderBy(desc(chats.ultimaMensagemData), desc(chatAssignments.id))
					.limit(CHAT_BOARD_COLUMN_LIMIT),
				db
					.select({ total: count() })
					.from(chatAssignments)
					.innerJoin(chats, eq(chatAssignments.chatId, chats.id))
					.leftJoin(clients, eq(chats.clienteId, clients.id))
					.where(and(...baseConditions, statusCondition(status))),
			]);

			return {
				status,
				itens: rows.map((row) => mapChatBoardRow(row, { canManageAny, currentUserId })),
				total: totalRow?.total ?? 0,
			};
		}),
	);

	// Totais do cabeçalho: contam a operação viva, então ignoram a coluna de encerrados.
	const activeColumns = columns.filter((column) => column.status !== "ENCERRADO");
	const cards = activeColumns.flatMap((column) => column.itens);

	return {
		data: {
			colunas: columns,
			totais: {
				abertos: activeColumns.reduce((sum, column) => sum + column.total, 0),
				naFila: cards.filter((card) => card.responsavelTipo === "NAO_ATRIBUIDO").length,
				pendentes: cards.filter((card) => card.aguardandoResposta).length,
			},
			// A UI precisa saber se algum total ficou acima do teto para anunciar o excedente.
			limitePorColuna: CHAT_BOARD_COLUMN_LIMIT,
		},
		message: "Quadro de atendimentos carregado com sucesso.",
	};
}
export type TGetChatBoardOutput = Awaited<ReturnType<typeof getChatBoard>>;

async function getChatBoardRoute(req: NextRequest) {
	const session = await getCurrentSessionUncached();
	const searchParams = req.nextUrl.searchParams;
	const input = GetChatBoardInputSchema.parse({
		view: searchParams.get("view"),
		whatsappConexaoTelefoneId: searchParams.get("whatsappConexaoTelefoneId"),
		prioridade: searchParams.get("prioridade"),
		search: searchParams.get("search"),
		encerradosDias: searchParams.get("encerradosDias"),
	});

	const result = await getChatBoard({ session: session as TAuthUserSession, input });
	return NextResponse.json(result, { status: 200 });
}

// ============= Export handlers =============

export const GET = appApiHandler({ GET: getChatBoardRoute });
