import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { assertChatAccess } from "@/lib/chats/access";
import { buildChatInboxFilterConditions, buildChatInboxQuickFilterCondition, currentChatAssignmentJoin } from "@/lib/chats/inbox-filters";
import { ChatAssignmentStatusEnum, ChatInboxPriorityFilterEnum, ChatInboxQuickFilterEnum, ChatInboxViewEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { aiAgentFollowUps, aiAgentRuns } from "@/services/drizzle/schema/ai-agents";
import { chatAssignments, chatMessages, chats } from "@/services/drizzle/schema/chats";
import { clients } from "@/services/drizzle/schema/clients";
import { users } from "@/services/drizzle/schema/users";
import { whatsappConnectionPhones, whatsappConnections } from "@/services/drizzle/schema/whatsapp-connections";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// ============= GET - Inbox (lista) ou chat único (?id=) =============

const GetChatsInputSchema = z.object({
	id: z.string({ invalid_type_error: "Tipo inválido para o ID do chat." }).optional().nullable(),
	whatsappConexaoTelefoneId: z.string({ invalid_type_error: "Tipo inválido para o ID do telefone da conexão." }).optional().nullable(),
	view: z
		.string({ invalid_type_error: "Tipo inválido para a visão da caixa de entrada." })
		.optional()
		.nullable()
		.transform((v) => ChatInboxViewEnum.catch("MINHAS").parse(v ?? "MINHAS")),
	search: z.string({ invalid_type_error: "Tipo inválido para a busca." }).optional().nullable(),
	// Multi-seleção: valores separados por vírgula. Entradas fora do enum são descartadas
	// (um status removido no futuro não pode derrubar a inbox de quem o tinha persistido).
	status: z
		.string({ invalid_type_error: "Tipo inválido para o filtro de status." })
		.optional()
		.nullable()
		.transform((v) =>
			v
				? v
						.split(",")
						.map((s) => ChatAssignmentStatusEnum.safeParse(s))
						.flatMap((r) => (r.success ? [r.data] : []))
				: [],
		),
	priority: z
		.string({ invalid_type_error: "Tipo inválido para o filtro de prioridade." })
		.optional()
		.nullable()
		.transform((v) =>
			v
				? v
						.split(",")
						.map((s) => ChatInboxPriorityFilterEnum.safeParse(s))
						.flatMap((r) => (r.success ? [r.data] : []))
				: [],
		),
	quickFilter: z
		.string({ invalid_type_error: "Tipo inválido para o atalho da caixa de entrada." })
		.optional()
		.nullable()
		.transform((v) => ChatInboxQuickFilterEnum.catch("TODAS").parse(v ?? "TODAS")),
	cursor: z.string({ invalid_type_error: "Tipo inválido para o cursor." }).optional().nullable(),
	limit: z
		.string({ invalid_type_error: "Tipo inválido para o limite." })
		.optional()
		.nullable()
		.transform((v) => Math.min(Math.max(v ? Number(v) : 20, 1), 50)),
});
export type TGetChatsInput = z.infer<typeof GetChatsInputSchema>;

/**
 * Projeção de um chat da inbox.
 *
 * O `leftJoin` com `chat_assignments` filtrado por status não-terminal não duplica linhas
 * porque o índice único parcial `idx_chat_assignments_one_current_per_chat` garante no
 * máximo um atendimento ativo por chat — é a segunda razão de existir daquele índice.
 */
const chatInboxProjection = {
	id: chats.id,
	organizacaoId: chats.organizacaoId,
	clienteId: chats.clienteId,
	whatsappConexaoId: chats.whatsappConexaoId,
	whatsappConexaoTelefoneId: chats.whatsappConexaoTelefoneId,
	whatsappTelefoneId: chats.whatsappTelefoneId,
	mensagensNaoLidas: chats.mensagensNaoLidas,
	ultimaMensagemId: chats.ultimaMensagemId,
	ultimaMensagemData: chats.ultimaMensagemData,
	ultimaMensagemEntradaData: chats.ultimaMensagemEntradaData,
	ultimaMensagemSaidaData: chats.ultimaMensagemSaidaData,
	whatsappJanelaDataExpiracao: chats.whatsappJanelaDataExpiracao,
	ultimaLeituraData: chats.ultimaLeituraData,
	dataInsercao: chats.dataInsercao,
	cliente: { id: clients.id, nome: clients.nome, telefone: clients.telefone },
	ultimaMensagem: {
		id: chatMessages.id,
		autorTipo: chatMessages.autorTipo,
		conteudoTexto: chatMessages.conteudoTexto,
		conteudoMidiaTipo: chatMessages.conteudoMidiaTipo,
		conteudoMidiaTextoProcessado: chatMessages.conteudoMidiaTextoProcessado,
		conteudoMidiaArquivoNome: chatMessages.conteudoMidiaArquivoNome,
	},
	// O tipo de conexão decide se a janela de 24h se aplica; sem ele a inbox não consegue
	// distinguir "sem janela porque é gateway" de "janela expirada".
	conexaoTipo: whatsappConnections.tipoConexao,
	// Com vários números ativos e sem filtro, a conversa não diz a qual pertence.
	conexaoTelefone: { id: whatsappConnectionPhones.id, nome: whatsappConnectionPhones.nome, numero: whatsappConnectionPhones.numero },
	atendimentoAtivo: {
		id: chatAssignments.id,
		status: chatAssignments.status,
		responsavelTipo: chatAssignments.responsavelTipo,
		responsavelUsuarioId: chatAssignments.responsavelUsuarioId,
		responsavelAgenteId: chatAssignments.responsavelAgenteId,
		prioridade: chatAssignments.prioridade,
		dataAtribuicao: chatAssignments.dataAtribuicao,
		dataLiberacao: chatAssignments.dataLiberacao,
		transferenciaMotivo: chatAssignments.transferenciaMotivo,
	},
	responsavelUsuario: { id: users.id, nome: users.nome, avatarUrl: users.avatarUrl },
	// "IA respondendo" na lista: existe run em curso para o chat. Subquery correlacionada e
	// indexada (`idx_ai_agent_runs_chat`); a sidebar mantém o valor por realtime em `ai_agent_runs`.
	aiRunAtiva: sql<boolean>`exists (select 1 from ${aiAgentRuns} where ${aiAgentRuns.chatId} = ${chats.id} and ${aiAgentRuns.status} in ('PENDENTE', 'RODANDO') and ${aiAgentRuns.gatilho} <> 'SUGESTAO_HUB')`,
	// Retomada agendada pela IA para este chat (no máximo uma, pelo índice parcial).
	retomadaAgendadaPara: sql<
		string | null
	>`(select ${aiAgentFollowUps.agendadaPara} from ${aiAgentFollowUps} where ${aiAgentFollowUps.chatId} = ${chats.id} and ${aiAgentFollowUps.status} = 'AGENDADA' limit 1)`,
};

function buildChatInboxQuery() {
	return db
		.select(chatInboxProjection)
		.from(chats)
		.leftJoin(clients, eq(chats.clienteId, clients.id))
		.leftJoin(chatMessages, eq(chats.ultimaMensagemId, chatMessages.id))
		.leftJoin(chatAssignments, currentChatAssignmentJoin)
		.leftJoin(users, eq(chatAssignments.responsavelUsuarioId, users.id))
		.leftJoin(whatsappConnections, eq(chats.whatsappConexaoId, whatsappConnections.id))
		.leftJoin(whatsappConnectionPhones, eq(chats.whatsappConexaoTelefoneId, whatsappConnectionPhones.id));
}
type TChatInboxQueryRow = Awaited<ReturnType<typeof buildChatInboxQuery>>[number];

/**
 * Achata a linha do join: o Drizzle devolve os objetos aninhados com todos os campos
 * nulos quando o `leftJoin` não casa; aqui isso vira `null` de verdade, e o responsável
 * é aninhado dentro do atendimento em vez de ficar solto na raiz.
 */
function mapChatInboxRow(row: TChatInboxQueryRow) {
	const { responsavelUsuario, ...rest } = row;
	return {
		...rest,
		cliente: rest.cliente?.id ? rest.cliente : null,
		conexaoTelefone: rest.conexaoTelefone?.id ? rest.conexaoTelefone : null,
		ultimaMensagem: rest.ultimaMensagem?.id ? rest.ultimaMensagem : null,
		atendimentoAtivo: rest.atendimentoAtivo?.id
			? { ...rest.atendimentoAtivo, responsavelUsuario: responsavelUsuario?.id ? responsavelUsuario : null }
			: null,
	};
}

function parseCursor(cursor: string | null | undefined) {
	if (!cursor) return null;
	const separator = cursor.lastIndexOf("_");
	if (separator <= 0) return null;
	const timestamp = Number.parseInt(cursor.slice(0, separator), 10);
	const id = cursor.slice(separator + 1);
	if (!Number.isFinite(timestamp) || !id) return null;
	return { data: new Date(timestamp), id };
}

async function getChats({ session, input }: { session: TAuthUserSession; input: TGetChatsInput }) {
	const { organizacaoId } = assertChatAccess({ session, permission: "visualizar" });

	// Modo "byId": usado pelo header da thread e por links diretos.
	if (input.id) {
		const [row] = await buildChatInboxQuery()
			.where(and(eq(chats.organizacaoId, organizacaoId), eq(chats.id, input.id)))
			.limit(1);

		return {
			data: {
				byId: row ? mapChatInboxRow(row) : null,
				default: null,
			},
			message: "Chat carregado com sucesso.",
		};
	}

	const cursor = parseCursor(input.cursor);

	// A view entra no SQL. O módulo equivalente do Control carrega todos os chats do
	// parceiro e filtra em memória, sem limit — inviável com paginação por cursor.
	const rows = await buildChatInboxQuery()
		.where(
			and(
				...buildChatInboxFilterConditions({ ...input, userId: session.user.id, organizacaoId }),
				buildChatInboxQuickFilterCondition(input.quickFilter),
				cursor ? or(lt(chats.ultimaMensagemData, cursor.data), and(eq(chats.ultimaMensagemData, cursor.data), lt(chats.id, cursor.id))) : undefined,
			),
		)
		.orderBy(desc(chats.ultimaMensagemData), desc(chats.id))
		.limit(input.limit + 1);

	const hasMore = rows.length > input.limit;
	const items = (hasMore ? rows.slice(0, input.limit) : rows).map((row) => mapChatInboxRow(row));
	const lastItem = items[items.length - 1];

	return {
		data: {
			byId: null,
			default: {
				items,
				hasMore,
				nextCursor: hasMore && lastItem ? `${lastItem.ultimaMensagemData.getTime()}_${lastItem.id}` : null,
			},
		},
		message: "Chats carregados com sucesso.",
	};
}
export type TGetChatsOutput = Awaited<ReturnType<typeof getChats>>;

async function getChatsRoute(req: NextRequest) {
	const session = await getCurrentSessionUncached();
	const searchParams = req.nextUrl.searchParams;
	const input = GetChatsInputSchema.parse({
		id: searchParams.get("id"),
		whatsappConexaoTelefoneId: searchParams.get("whatsappConexaoTelefoneId"),
		view: searchParams.get("view"),
		search: searchParams.get("search"),
		status: searchParams.get("status"),
		priority: searchParams.get("priority"),
		quickFilter: searchParams.get("quickFilter"),
		cursor: searchParams.get("cursor"),
		limit: searchParams.get("limit"),
	});

	const result = await getChats({ session: session as TAuthUserSession, input });
	return NextResponse.json(result, { status: 200 });
}

// ============= POST - Abrir ou recuperar chat de um cliente =============

const CreateChatInputSchema = z.object({
	clienteId: z.string({ required_error: "ID do cliente não informado.", invalid_type_error: "Tipo inválido para o ID do cliente." }),
	whatsappTelefoneId: z.string({
		required_error: "ID do telefone do WhatsApp não informado.",
		invalid_type_error: "Tipo inválido para o ID do telefone do WhatsApp.",
	}),
	whatsappConexaoId: z.string({ invalid_type_error: "Tipo inválido para o ID da conexão." }).optional().nullable(),
	whatsappConexaoTelefoneId: z.string({ invalid_type_error: "Tipo inválido para o ID do telefone da conexão." }).optional().nullable(),
});
export type TCreateChatInput = z.infer<typeof CreateChatInputSchema>;

async function createChat({ session, input }: { session: TAuthUserSession; input: TCreateChatInput }) {
	const { organizacaoId } = assertChatAccess({ session, permission: "iniciar" });

	const client = await db.query.clients.findFirst({
		where: (fields, { and: andWhere, eq: eqWhere }) => andWhere(eqWhere(fields.id, input.clienteId), eqWhere(fields.organizacaoId, organizacaoId)),
		columns: { id: true },
	});
	if (!client) throw new createHttpError.NotFound("Cliente não encontrado.");

	// Upsert pela chave natural em vez de find-then-insert: sob concorrência de webhooks
	// o find-then-insert criava chats duplicados (não havia constraint até a 0052).
	const [inserted] = await db
		.insert(chats)
		.values({
			organizacaoId,
			clienteId: input.clienteId,
			whatsappTelefoneId: input.whatsappTelefoneId,
			whatsappConexaoId: input.whatsappConexaoId ?? null,
			whatsappConexaoTelefoneId: input.whatsappConexaoTelefoneId ?? null,
			ultimaMensagemData: new Date(),
		})
		.onConflictDoNothing({
			target: [chats.organizacaoId, chats.clienteId, chats.whatsappTelefoneId],
			where: sql`${chats.whatsappTelefoneId} is not null`,
		})
		.returning({ id: chats.id });

	if (inserted) {
		return { data: { chatId: inserted.id, clienteId: input.clienteId, isNew: true }, message: "Chat criado com sucesso." };
	}

	const existing = await db.query.chats.findFirst({
		where: (fields, { and: andWhere, eq: eqWhere }) =>
			andWhere(
				eqWhere(fields.organizacaoId, organizacaoId),
				eqWhere(fields.clienteId, input.clienteId),
				eqWhere(fields.whatsappTelefoneId, input.whatsappTelefoneId),
			),
		columns: { id: true },
	});
	if (!existing) throw new createHttpError.InternalServerError("Não foi possível abrir o chat.");

	return { data: { chatId: existing.id, clienteId: input.clienteId, isNew: false }, message: "Chat já existente." };
}
export type TCreateChatOutput = Awaited<ReturnType<typeof createChat>>;

async function createChatRoute(req: NextRequest) {
	const session = await getCurrentSessionUncached();
	const input = CreateChatInputSchema.parse(await req.json());
	const result = await createChat({ session: session as TAuthUserSession, input });
	return NextResponse.json(result, { status: 201 });
}

// ============= PATCH - Ações sobre o chat =============

const UpdateChatInputSchema = z.object({
	acao: z.literal("mark_as_read"),
	chatId: z.string({ required_error: "ID do chat não informado.", invalid_type_error: "Tipo inválido para o ID do chat." }),
});
export type TUpdateChatInput = z.infer<typeof UpdateChatInputSchema>;

async function updateChat({ session, input }: { session: TAuthUserSession; input: TUpdateChatInput }) {
	const { organizacaoId } = assertChatAccess({ session, permission: "visualizar" });

	const [updated] = await db
		.update(chats)
		.set({ mensagensNaoLidas: 0, ultimaLeituraData: new Date(), ultimaLeituraPorUsuarioId: session.user.id })
		.where(and(eq(chats.id, input.chatId), eq(chats.organizacaoId, organizacaoId)))
		.returning({ id: chats.id });

	if (!updated) throw new createHttpError.NotFound("Chat não encontrado.");

	return { data: { chatId: updated.id, acao: input.acao }, message: "Mensagens marcadas como lidas." };
}
export type TUpdateChatOutput = Awaited<ReturnType<typeof updateChat>>;

async function updateChatRoute(req: NextRequest) {
	const session = await getCurrentSessionUncached();
	const input = UpdateChatInputSchema.parse(await req.json());
	const result = await updateChat({ session: session as TAuthUserSession, input });
	return NextResponse.json(result, { status: 200 });
}

// ============= Export handlers =============

export const GET = appApiHandler({ GET: getChatsRoute });
export const POST = appApiHandler({ POST: createChatRoute });
export const PATCH = appApiHandler({ PATCH: updateChatRoute });
