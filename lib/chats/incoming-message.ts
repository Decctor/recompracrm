import { markChatAnswered, markChatAttendedExternally, markChatNeedsResponse } from "@/lib/chats/attendance-state";
import type { TChatMessageMetadata } from "@/schemas/chats";
import type { TChatMessageContentTypeEnum, TChatMessageDeliveryStatus } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { chatMessages, chats } from "@/services/drizzle/schema";
import { and, eq, notInArray, sql } from "drizzle-orm";

/**
 * Persistência de mensagens que chegam pelos webhooks de WhatsApp.
 *
 * Os dois webhooks (Meta Cloud API e Gateway Interno) repetiam este miolo quase linha a
 * linha — a maior fonte de divergência do módulo. Aqui ele existe uma vez, e toda mudança
 * de estado de atendimento passa por `lib/chats/attendance-state.ts`.
 */

/** A janela de 24h só existe na Meta Cloud API; o Gateway Interno não tem esse conceito. */
const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Mídia de uma mensagem persistida.
 *
 * `publicUrl` é o único campo garantido: o anexo enviado pelo agente de IA é uma URL externa que
 * nunca passou pelo nosso storage, então não tem `storageId`, nem mime sniffado, nem tamanho.
 * A leitura no hub já cobre esse caso — `mapChatMessage` cai no `conteudoMidiaUrl` quando não há
 * `storageId`.
 */
export type TIncomingMedia = {
	storageId?: string | null;
	publicUrl: string;
	mimeType?: string | null;
	fileSize?: number | null;
	arquivoNome?: string | null;
	whatsappMediaId?: string | null;
};

/**
 * Encontra ou cria o chat pela chave natural `(organizacao, cliente, telefone)`.
 *
 * Upsert em vez de find-then-insert: webhooks concorrentes disputavam esse caminho e
 * criavam chats duplicados — não havia constraint até a migration 0052.
 */
export async function resolveIncomingChat(input: {
	organizacaoId: string;
	clienteId: string;
	whatsappTelefoneId: string;
	whatsappConexaoId: string;
	whatsappConexaoTelefoneId: string;
	now?: Date;
}) {
	const [inserted] = await db
		.insert(chats)
		.values({
			organizacaoId: input.organizacaoId,
			clienteId: input.clienteId,
			whatsappTelefoneId: input.whatsappTelefoneId,
			whatsappConexaoId: input.whatsappConexaoId,
			whatsappConexaoTelefoneId: input.whatsappConexaoTelefoneId,
			ultimaMensagemData: input.now ?? new Date(),
		})
		.onConflictDoNothing({
			target: [chats.organizacaoId, chats.clienteId, chats.whatsappTelefoneId],
			where: sql`${chats.whatsappTelefoneId} is not null`,
		})
		.returning({ id: chats.id });

	if (inserted) return { chatId: inserted.id, isNew: true };

	const existing = await db.query.chats.findFirst({
		where: and(
			eq(chats.organizacaoId, input.organizacaoId),
			eq(chats.clienteId, input.clienteId),
			eq(chats.whatsappTelefoneId, input.whatsappTelefoneId),
		),
		columns: { id: true },
	});
	if (!existing) throw new Error("Não foi possível resolver o chat da mensagem recebida.");
	return { chatId: existing.id, isNew: false };
}

type TPersistIncomingParams = {
	organizacaoId: string;
	chatId: string;
	clienteId: string;
	tipoConexao: "META_CLOUD_API" | "INTERNAL_GATEWAY";
	whatsappMessageId: string | null;
	conteudoTexto: string | null;
	conteudoMidiaTipo: TChatMessageContentTypeEnum;
	midia: TIncomingMedia | null;
	metadados?: TChatMessageMetadata | null;
	now?: Date;
};

/**
 * Mensagem recebida do cliente: persiste, atualiza a denormalização do chat, renova a
 * janela de 24h e reabre a pendência do atendimento.
 *
 * Devolve `null` quando a mensagem já existe (reentrega do provedor, índice 0057): nesse
 * caso todo o efeito colateral já aconteceu na primeira entrega e nada downstream deve rodar.
 */
export async function persistIncomingClientMessage(input: TPersistIncomingParams) {
	const now = input.now ?? new Date();

	const [inserted] = await db
		.insert(chatMessages)
		.values({
			organizacaoId: input.organizacaoId,
			chatId: input.chatId,
			clienteId: input.clienteId,
			autorTipo: "CLIENTE",
			autorClienteId: input.clienteId,
			conteudoTexto: input.conteudoTexto || null,
			conteudoMidiaTipo: input.conteudoMidiaTipo,
			conteudoMidiaUrl: input.midia?.publicUrl ?? null,
			conteudoMidiaStorageId: input.midia?.storageId ?? null,
			conteudoMidiaMimeType: input.midia?.mimeType ?? null,
			conteudoMidiaArquivoTamanho: input.midia?.fileSize ?? null,
			conteudoMidiaWhatsappId: input.midia?.whatsappMediaId ?? null,
			whatsappMessageId: input.whatsappMessageId,
			// Uma mensagem que chegou pelo webhook já foi entregue a nós por definição.
			statusEntrega: "ENTREGUE",
			provedorStatusDataAtualizacao: now,
			metadados: input.metadados ?? null,
			dataEnvio: now,
		})
		.onConflictDoNothing({
			target: [chatMessages.whatsappMessageId, chatMessages.organizacaoId],
			where: sql`${chatMessages.whatsappMessageId} is not null`,
		})
		.returning({ id: chatMessages.id, dataEnvio: chatMessages.dataEnvio });

	if (!inserted) return null;

	await db
		.update(chats)
		.set({
			ultimaMensagemId: inserted.id,
			ultimaMensagemData: inserted.dataEnvio,
			ultimaMensagemEntradaData: inserted.dataEnvio,
			// Incremento no SQL, não a partir do valor lido: webhooks concorrentes
			// sobrescreviam o contador um do outro no código antigo.
			mensagensNaoLidas: sql`${chats.mensagensNaoLidas} + 1`,
			whatsappJanelaDataExpiracao: input.tipoConexao === "META_CLOUD_API" ? new Date(now.getTime() + WHATSAPP_WINDOW_MS) : null,
		})
		.where(eq(chats.id, input.chatId));

	await markChatNeedsResponse(db, {
		organizacaoId: input.organizacaoId,
		chatId: input.chatId,
		messageDate: inserted.dataEnvio,
		now,
	});

	return { messageId: inserted.id, dataEnvio: inserted.dataEnvio };
}

type TPersistOutboundParams = Omit<TPersistIncomingParams, "tipoConexao"> & {
	/** `WHATSAPP_ECHO` = respondido pelo app no celular (Coexistence). */
	origem: "WHATSAPP_ECHO" | "AI";
	autorUsuarioId?: string | null;
};

/**
 * Mensagem que saiu por fora do hub: echo do celular ou resposta da IA.
 *
 * No caso do echo, o atendimento passa a `EXTERNO` — mas apenas se ainda não houver um
 * humano do hub como dono, que é o que `markChatAttendedExternally` garante.
 *
 * Devolve `null` quando o wamid já existe (reentrega de echo, ou echo de uma mensagem que
 * outra via já persistiu): o skip silencioso é o comportamento correto.
 */
export async function persistOutboundNonHubMessage(input: TPersistOutboundParams) {
	const now = input.now ?? new Date();
	const isEcho = input.origem === "WHATSAPP_ECHO";

	const [inserted] = await db
		.insert(chatMessages)
		.values({
			organizacaoId: input.organizacaoId,
			chatId: input.chatId,
			clienteId: input.clienteId,
			autorTipo: isEcho ? "BUSINESS-APP" : "AI",
			autorUsuarioId: input.autorUsuarioId ?? null,
			conteudoTexto: input.conteudoTexto || null,
			conteudoMidiaTipo: input.conteudoMidiaTipo,
			conteudoMidiaUrl: input.midia?.publicUrl ?? null,
			conteudoMidiaStorageId: input.midia?.storageId ?? null,
			conteudoMidiaMimeType: input.midia?.mimeType ?? null,
			conteudoMidiaArquivoNome: input.midia?.arquivoNome ?? null,
			conteudoMidiaArquivoTamanho: input.midia?.fileSize ?? null,
			conteudoMidiaWhatsappId: input.midia?.whatsappMediaId ?? null,
			whatsappMessageId: input.whatsappMessageId,
			whatsappEcho: isEcho,
			statusEntrega: input.whatsappMessageId ? "ENVIADA" : "PENDENTE",
			provedorStatusDataAtualizacao: now,
			metadados: input.metadados ?? null,
			dataEnvio: now,
		})
		.onConflictDoNothing({
			target: [chatMessages.whatsappMessageId, chatMessages.organizacaoId],
			where: sql`${chatMessages.whatsappMessageId} is not null`,
		})
		.returning({ id: chatMessages.id, dataEnvio: chatMessages.dataEnvio });

	if (!inserted) return null;

	await db
		.update(chats)
		.set({
			ultimaMensagemId: inserted.id,
			ultimaMensagemData: inserted.dataEnvio,
			ultimaMensagemSaidaData: inserted.dataEnvio,
		})
		.where(eq(chats.id, input.chatId));

	if (isEcho) {
		await markChatAttendedExternally(db, {
			organizacaoId: input.organizacaoId,
			chatId: input.chatId,
			responseDate: inserted.dataEnvio,
			now,
		});
	} else {
		await markChatAnswered(db, {
			organizacaoId: input.organizacaoId,
			chatId: input.chatId,
			responseDate: inserted.dataEnvio,
			source: "AI",
			now,
		});
	}

	return { messageId: inserted.id, dataEnvio: inserted.dataEnvio };
}

/**
 * Ordem de progressão do status de entrega. Um webhook atrasado não pode rebaixar uma
 * mensagem já lida — a Meta entrega eventos fora de ordem com frequência.
 */
const DELIVERY_STATUS_RANK: Record<TChatMessageDeliveryStatus, number> = {
	PENDENTE: 0,
	ENVIADA: 1,
	ENTREGUE: 2,
	LIDA: 3,
	FALHA: 4,
	CANCELADA: 4,
};

const TERMINAL_DELIVERY_STATUSES: TChatMessageDeliveryStatus[] = ["FALHA", "CANCELADA"];

export function mapProviderStatusToDeliveryStatus(providerStatus: string): TChatMessageDeliveryStatus | null {
	switch (providerStatus) {
		case "pending":
			return "PENDENTE";
		case "sent":
			return "ENVIADA";
		case "delivered":
			return "ENTREGUE";
		case "read":
			return "LIDA";
		case "failed":
		case "error":
			return "FALHA";
		default:
			return null;
	}
}

/**
 * Aplica o status do provedor sem regredir. `FALHA` sempre passa: uma falha reportada
 * depois de um "entregue" é informação nova e acionável, não um evento atrasado.
 */
export async function applyProviderDeliveryStatus(input: {
	statusEntrega: TChatMessageDeliveryStatus;
	whatsappMessageId?: string | null;
	chatMessageId?: string | null;
	now?: Date;
}) {
	const target = input.chatMessageId
		? eq(chatMessages.id, input.chatMessageId)
		: input.whatsappMessageId
			? eq(chatMessages.whatsappMessageId, input.whatsappMessageId)
			: null;
	if (!target) return;

	const rank = DELIVERY_STATUS_RANK[input.statusEntrega];
	const isTerminal = TERMINAL_DELIVERY_STATUSES.includes(input.statusEntrega);
	// Só avança: os status que já estão à frente do que chegou ficam de fora do WHERE.
	const outranked = (Object.keys(DELIVERY_STATUS_RANK) as TChatMessageDeliveryStatus[]).filter((status) => DELIVERY_STATUS_RANK[status] >= rank);

	await db
		.update(chatMessages)
		.set({ statusEntrega: input.statusEntrega, provedorStatusDataAtualizacao: input.now ?? new Date() })
		.where(isTerminal || outranked.length === 0 ? target : and(target, notInArray(chatMessages.statusEntrega, outranked)));
}
