import { getScheduledFollowUp } from "@/lib/ai/agent/follow-ups";
import { parseJsonbWithFallback } from "@/lib/ai/shared/json";
import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { assertChatAccess } from "@/lib/chats/access";
import { AI_ASSIGNMENT_BLOCK_MESSAGES, resolveAiAssignmentAvailability } from "@/lib/chats/ai-assignment";
import { markChatAnswered } from "@/lib/chats/attendance-state";
import { buildQuotedMessageSnapshot } from "@/lib/chats/quoted-message";
import { deliverChatMessage, loadChatForSending, renderTemplatePlainContent, resolveApprovedTemplate } from "@/lib/chats/outgoing-message";
import { getChatMediaUrl, uploadChatMedia } from "@/lib/files-storage/chat-media";
import { AiAgentCapabilitiesSchema } from "@/schemas/ai-agents";
import type { TChatMessageMetadata } from "@/schemas/chats";
import { db } from "@/services/drizzle";
import { aiAgentRuns, aiAgents } from "@/services/drizzle/schema/ai-agents";
import { chatAssignments, chatMessages, chats } from "@/services/drizzle/schema/chats";
import { and, eq, lt, ne, notInArray, or } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;
const CLOSED_ASSIGNMENT_STATUSES = ["ENCERRADO", "CANCELADO"] as const;

// ============= GET - Thread paginada por cursor =============

const GetChatMessagesInputSchema = z.object({
	chatId: z.string({ required_error: "ID do chat não informado.", invalid_type_error: "Tipo inválido para o ID do chat." }),
	cursorDataEnvio: z.string({ invalid_type_error: "Tipo inválido para a data do cursor." }).optional().nullable(),
	cursorId: z.string({ invalid_type_error: "Tipo inválido para o ID do cursor." }).optional().nullable(),
	limit: z
		.string({ invalid_type_error: "Tipo inválido para o limite." })
		.optional()
		.nullable()
		.transform((v) => Math.min(Math.max(v ? Number(v) : DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)),
});
export type TGetChatMessagesInput = z.infer<typeof GetChatMessagesInputSchema>;

type TChatMessageRow = typeof chatMessages.$inferSelect & {
	autorUsuario: { id: string; nome: string; avatarUrl: string | null } | null;
	autorCliente: { id: string; nome: string } | null;
};

/** Forma da mensagem consumida pelo hub. É o contrato que o realtime também precisa produzir. */
function mapChatMessage(message: TChatMessageRow) {
	return {
		id: message.id,
		chatId: message.chatId,
		autorTipo: message.autorTipo,
		autorUsuario: message.autorUsuario,
		autorCliente: message.autorCliente,
		conteudoTexto: message.conteudoTexto,
		conteudoMidiaTipo: message.conteudoMidiaTipo,
		// A URL pública é derivada do storage id: URLs salvas em conteudoMidiaUrl envelhecem.
		conteudoMidiaUrl: message.conteudoMidiaStorageId ? getChatMediaUrl(message.conteudoMidiaStorageId) : message.conteudoMidiaUrl,
		conteudoMidiaMimeType: message.conteudoMidiaMimeType,
		conteudoMidiaArquivoNome: message.conteudoMidiaArquivoNome,
		conteudoMidiaArquivoTamanho: message.conteudoMidiaArquivoTamanho,
		conteudoMidiaTextoProcessado: message.conteudoMidiaTextoProcessado,
		conteudoMidiaTextoProcessadoResumo: message.conteudoMidiaTextoProcessadoResumo,
		statusEntrega: message.statusEntrega,
		provedorStatusDataAtualizacao: message.provedorStatusDataAtualizacao,
		dataEnvio: message.dataEnvio,
		whatsappMessageId: message.whatsappMessageId,
		whatsappEcho: message.whatsappEcho,
		clienteMensagemId: message.clienteMensagemId,
		metadados: message.metadados ?? null,
	};
}
export type TChatMessageForHub = ReturnType<typeof mapChatMessage>;

const MESSAGE_AUTHOR_WITH = {
	autorUsuario: { columns: { id: true, nome: true, avatarUrl: true } },
	autorCliente: { columns: { id: true, nome: true } },
} as const;

async function getChatMessages({ session, input }: { session: TAuthUserSession; input: TGetChatMessagesInput }) {
	const { organizacaoId } = assertChatAccess({ session, permission: "visualizar" });

	const chat = await db.query.chats.findFirst({
		where: and(eq(chats.id, input.chatId), eq(chats.organizacaoId, organizacaoId)),
		columns: {
			id: true,
			clienteId: true,
			whatsappConexaoId: true,
			whatsappConexaoTelefoneId: true,
			whatsappTelefoneId: true,
			mensagensNaoLidas: true,
			whatsappJanelaDataExpiracao: true,
			ultimaMensagemEntradaData: true,
			ultimaMensagemSaidaData: true,
			ultimaLeituraData: true,
		},
		with: {
			cliente: { columns: { id: true, nome: true, telefone: true } },
			whatsappConexao: { columns: { id: true, tipoConexao: true } },
		},
	});
	if (!chat) throw new createHttpError.NotFound("Chat não encontrado.");

	const atendimentoAtivo = await db.query.chatAssignments.findFirst({
		where: and(
			eq(chatAssignments.chatId, input.chatId),
			eq(chatAssignments.organizacaoId, organizacaoId),
			notInArray(chatAssignments.status, [...CLOSED_ASSIGNMENT_STATUSES]),
		),
		with: { responsavelUsuario: { columns: { id: true, nome: true, avatarUrl: true } } },
		orderBy: (fields, { desc: orderDesc }) => [orderDesc(fields.dataAtribuicao)],
	});

	// Disponibilidade do agente para esta conversa. Vem junto com a thread de propósito: é por
	// chat (depende do número de entrada), então uma query própria no cliente seria uma chamada
	// por conversa aberta. A rota de atribuição revalida com o mesmo resolvedor.
	const disponibilidadeIa = await resolveAiAssignmentAvailability(db, {
		organizacaoId,
		chatId: input.chatId,
		configuracao: session.membership?.organizacao.configuracao,
	});
	const atendimentoIa = disponibilidadeIa.disponivel
		? { disponivel: true as const, agenteNome: disponibilidadeIa.agenteNome, motivo: null, motivoIndisponivel: null }
		: {
				disponivel: false as const,
				agenteNome: null,
				motivo: disponibilidadeIa.motivo,
				motivoIndisponivel: AI_ASSIGNMENT_BLOCK_MESSAGES[disponibilidadeIa.motivo],
			};

	// Presença da IA na thread (`lib/chats/ai-presence.ts`): a run mais recente do chat e o
	// tempo que o agente espera antes de responder. A thread assina `ai_agent_runs` por chat e
	// mantém `aiRun` atualizado sem refetch.
	const [aiRun, agent, retomadaAgendada] = await Promise.all([
		db.query.aiAgentRuns.findFirst({
			// Runs de assistência são a IA ajudando o humano: não são "a IA respondendo".
			where: and(eq(aiAgentRuns.chatId, input.chatId), eq(aiAgentRuns.organizacaoId, organizacaoId), ne(aiAgentRuns.gatilho, "SUGESTAO_HUB")),
			orderBy: (fields, { desc: orderDesc }) => [orderDesc(fields.dataInsercao)],
			columns: { id: true, status: true, gatilho: true, erro: true, dataInicio: true, dataFim: true, dataInsercao: true },
		}),
		db.query.aiAgents.findFirst({ where: eq(aiAgents.organizacaoId, organizacaoId), columns: { capacidades: true } }),
		getScheduledFollowUp(db, { organizacaoId, chatId: input.chatId }),
	]);
	const aiCapacidades = agent
		? (() => {
				const { atendimento } = parseJsonbWithFallback(AiAgentCapabilitiesSchema, agent.capacidades);
				return { modo: atendimento.modo, atrasoRespostaMs: atendimento.atrasoRespostaMs, esperaHumanoMs: atendimento.esperaHumanoMs };
			})()
		: null;

	const cursorDate = input.cursorDataEnvio ? new Date(input.cursorDataEnvio) : null;
	const messages = await db.query.chatMessages.findMany({
		where: and(
			eq(chatMessages.chatId, input.chatId),
			eq(chatMessages.organizacaoId, organizacaoId),
			cursorDate && input.cursorId
				? or(lt(chatMessages.dataEnvio, cursorDate), and(eq(chatMessages.dataEnvio, cursorDate), lt(chatMessages.id, input.cursorId)))
				: undefined,
		),
		with: MESSAGE_AUTHOR_WITH,
		orderBy: (fields, { desc: orderDesc }) => [orderDesc(fields.dataEnvio), orderDesc(fields.id)],
		limit: input.limit + 1,
	});

	const hasMoreOlder = messages.length > input.limit;
	// A thread é servida em ordem DESC (mais recente primeiro): o ChatThread renderiza
	// em flex-col-reverse, e assim a página nova entra no fim do array sem re-ordenação.
	const items = (hasMoreOlder ? messages.slice(0, input.limit) : messages).map((message) => mapChatMessage(message as TChatMessageRow));
	const oldest = items[items.length - 1];

	return {
		data: {
			chat: {
				...chat,
				conexaoTipo: chat.whatsappConexao?.tipoConexao ?? null,
				atendimentoAtivo: atendimentoAtivo ?? null,
				atendimentoIa,
				aiRun: aiRun ?? null,
				aiCapacidades,
				retomadaAgendada: retomadaAgendada ?? null,
			},
			items,
			nextCursor: hasMoreOlder && oldest ? { dataEnvio: oldest.dataEnvio.toISOString(), id: oldest.id } : null,
			hasMoreOlder,
		},
		message: "Mensagens carregadas com sucesso.",
	};
}
export type TGetChatMessagesOutput = Awaited<ReturnType<typeof getChatMessages>>;

async function getChatMessagesRoute(req: NextRequest) {
	const session = await getCurrentSessionUncached();
	const searchParams = req.nextUrl.searchParams;
	const input = GetChatMessagesInputSchema.parse({
		chatId: searchParams.get("chatId"),
		cursorDataEnvio: searchParams.get("cursorDataEnvio"),
		cursorId: searchParams.get("cursorId"),
		limit: searchParams.get("limit"),
	});
	const result = await getChatMessages({ session: session as TAuthUserSession, input });
	return NextResponse.json(result, { status: 200 });
}

// ============= POST - Envio unificado (persiste + envia) =============

const CreateChatMessageInputSchema = z
	.object({
		chatId: z.string({ required_error: "ID do chat não informado.", invalid_type_error: "Tipo inválido para o ID do chat." }),
		clienteMensagemId: z.string({ invalid_type_error: "Tipo inválido para o ID da mensagem do cliente." }).optional().nullable(),
		texto: z
			.string({ invalid_type_error: "Tipo inválido para o texto." })
			.max(4096, "A mensagem não pode ter mais de 4096 caracteres.")
			.optional()
			.nullable(),
		assinaturaAtiva: z.boolean({ invalid_type_error: "Tipo inválido para a assinatura." }).default(false),
		midia: z
			.object({
				tipo: z.enum(["IMAGEM", "VIDEO", "AUDIO", "DOCUMENTO"], { invalid_type_error: "Tipo inválido para o tipo de mídia." }),
				base64: z.string({ required_error: "Conteúdo do arquivo não informado." }),
				mimeType: z.string({ required_error: "MIME type do arquivo não informado." }),
				arquivoNome: z.string({ invalid_type_error: "Tipo inválido para o nome do arquivo." }).optional().nullable(),
			})
			.optional()
			.nullable(),
		messageTemplateId: z.string({ invalid_type_error: "Tipo inválido para o ID do template." }).optional().nullable(),
		/** Mensagem deste chat que a nova responde (citação, como no WhatsApp). */
		replyToMessageId: z.string({ invalid_type_error: "Tipo inválido para o ID da mensagem citada." }).optional().nullable(),
	})
	.superRefine((input, ctx) => {
		if (!input.texto?.trim() && !input.midia && !input.messageTemplateId) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["texto"], message: "Informe texto, anexo ou template para enviar." });
		}
	});
export type TCreateChatMessageInput = z.infer<typeof CreateChatMessageInputSchema>;

/**
 * Persiste e envia em uma única requisição.
 *
 * Antes o fluxo era partido entre `POST /api/chats/messages` (que persistia e devolvia
 * `requiresWhatsappSend: true`) e `POST /api/chats/messages/send-whatsapp`. Se o segundo
 * request falhasse — aba fechada, rede caindo — a mensagem ficava PENDENTE para sempre,
 * sem nenhum processo para reconciliar.
 */
async function createChatMessage({ session, input }: { session: TAuthUserSession; input: TCreateChatMessageInput }) {
	const { organizacaoId } = assertChatAccess({ session, permission: "responder" });

	const { chat, atendimentoAtivo, janelaAberta } = await loadChatForSending({ organizacaoId, chatId: input.chatId });

	// Posse do atendimento é pré-requisito de envio: sem isso qualquer usuário responderia
	// por cima do dono, que era exatamente o comportamento antigo (o envio reatribuía o
	// serviço ao remetente silenciosamente).
	if (atendimentoAtivo?.responsavelTipo !== "USUARIO" || atendimentoAtivo.responsavelUsuarioId !== session.user.id) {
		throw new createHttpError.Forbidden("Assuma este atendimento antes de enviar mensagens.");
	}

	const template = input.messageTemplateId
		? await resolveApprovedTemplate({ organizacaoId, messageTemplateId: input.messageTemplateId, whatsappTelefoneId: chat.whatsappTelefoneId })
		: null;

	if (!janelaAberta && !template) {
		throw new createHttpError.PreconditionFailed("Janela de 24h expirada. Envie um template aprovado para reabrir a conversa.");
	}

	// Upload antes do insert: sem storage id não há o que persistir nem o que enviar.
	let midiaStorageId: string | null = null;
	let midiaUrl: string | null = null;
	let midiaTamanho: number | null = null;
	if (input.midia) {
		const upload = await uploadChatMedia({
			file: Buffer.from(input.midia.base64, "base64"),
			organizacaoId,
			chatId: input.chatId,
			mimeType: input.midia.mimeType,
			filename: input.midia.arquivoNome || "arquivo",
		});
		midiaStorageId = upload.storageId;
		midiaUrl = upload.publicUrl;
		midiaTamanho = upload.fileSize;
	}

	// Áudio não carrega legenda no WhatsApp; assinar um áudio geraria uma legenda invisível.
	// Para template, o texto persistido é o corpo renderizado: o payload enviado à Meta é
	// estruturado em componentes, então sem isso a thread mostraria uma bolha vazia.
	const textoBruto = template ? renderTemplatePlainContent(template) : (input.texto?.trim() ?? "");
	const texto =
		input.midia?.tipo === "AUDIO" ? "" : !template && input.assinaturaAtiva && textoBruto ? `${session.user.nome}:\n${textoBruto}` : textoBruto;

	// Citação: a mensagem-alvo precisa ser deste chat e ter wamid, senão o cliente não veria a
	// citação no aparelho. Só a Meta Cloud API leva o `context`; o Gateway Interno não.
	const quotedMessage = input.replyToMessageId
		? await db.query.chatMessages.findFirst({
				where: and(eq(chatMessages.id, input.replyToMessageId), eq(chatMessages.organizacaoId, organizacaoId), eq(chatMessages.chatId, input.chatId)),
				with: MESSAGE_AUTHOR_WITH,
			})
		: null;
	if (input.replyToMessageId) {
		if (!quotedMessage) throw new createHttpError.BadRequest("Mensagem citada não encontrada nesta conversa.");
		if (chat.whatsappConexao?.tipoConexao !== "META_CLOUD_API")
			throw new createHttpError.BadRequest("Este canal não suporta responder citando uma mensagem.");
		if (!quotedMessage.whatsappMessageId) throw new createHttpError.BadRequest("A mensagem citada ainda não foi confirmada pelo WhatsApp.");
	}
	const quoteMetadata: TChatMessageMetadata | null = quotedMessage
		? {
				whatsappContext: { quotedWhatsappMessageId: quotedMessage.whatsappMessageId },
				quotedMessage: buildQuotedMessageSnapshot({
					...quotedMessage,
					conteudoMidiaUrl: quotedMessage.conteudoMidiaStorageId ? getChatMediaUrl(quotedMessage.conteudoMidiaStorageId) : quotedMessage.conteudoMidiaUrl,
				}),
			}
		: null;

	const now = new Date();
	const [inserted] = await db
		.insert(chatMessages)
		.values({
			organizacaoId,
			chatId: input.chatId,
			clienteId: chat.clienteId,
			autorTipo: "USUÁRIO",
			autorUsuarioId: session.user.id,
			conteudoTexto: texto || null,
			conteudoMidiaTipo: input.midia?.tipo ?? "TEXTO",
			conteudoMidiaUrl: midiaUrl,
			conteudoMidiaStorageId: midiaStorageId,
			conteudoMidiaMimeType: input.midia?.mimeType ?? null,
			conteudoMidiaArquivoNome: input.midia?.arquivoNome ?? null,
			conteudoMidiaArquivoTamanho: midiaTamanho,
			clienteMensagemId: input.clienteMensagemId ?? null,
			whatsappTemplateId: template?.id ?? null,
			// Nasce PENDENTE antes do envio: uma falha do provedor deixa rastro em vez de
			// sumir, e o retry tem uma mensagem concreta para reprocessar.
			statusEntrega: "PENDENTE",
			metadados: quoteMetadata,
			dataEnvio: now,
		})
		.returning({ id: chatMessages.id });

	if (!inserted) throw new createHttpError.InternalServerError("Erro ao registrar a mensagem.");

	const delivery = await deliverChatMessage({
		messageId: inserted.id,
		chat,
		texto,
		replyToWhatsappMessageId: quotedMessage?.whatsappMessageId ?? null,
		midia: midiaStorageId
			? {
					tipo: input.midia?.tipo ?? "DOCUMENTO",
					storageId: midiaStorageId,
					mimeType: input.midia?.mimeType ?? "application/octet-stream",
					arquivoNome: input.midia?.arquivoNome ?? null,
				}
			: null,
		template,
	});

	await db
		.update(chats)
		.set({ ultimaMensagemId: inserted.id, ultimaMensagemData: now, ultimaMensagemSaidaData: now })
		.where(eq(chats.id, input.chatId));

	await markChatAnswered(db, { organizacaoId, chatId: input.chatId, responseDate: now, source: "HUB", now });

	const persisted = await db.query.chatMessages.findFirst({
		where: eq(chatMessages.id, inserted.id),
		with: MESSAGE_AUTHOR_WITH,
	});
	if (!persisted) throw new createHttpError.InternalServerError("Erro ao carregar a mensagem enviada.");

	return {
		data: mapChatMessage(persisted as TChatMessageRow),
		message: delivery.statusEntrega === "PENDENTE" ? "Mensagem enfileirada para envio." : "Mensagem enviada com sucesso.",
	};
}
export type TCreateChatMessageOutput = Awaited<ReturnType<typeof createChatMessage>>;

async function createChatMessageRoute(req: NextRequest) {
	const session = await getCurrentSessionUncached();
	const input = CreateChatMessageInputSchema.parse(await req.json());
	const result = await createChatMessage({ session: session as TAuthUserSession, input });
	return NextResponse.json(result, { status: 201 });
}

// ============= Export handlers =============

export const GET = appApiHandler({ GET: getChatMessagesRoute });
export const POST = appApiHandler({ POST: createChatMessageRoute });

export { mapChatMessage, MESSAGE_AUTHOR_WITH };
export type { TChatMessageRow };
