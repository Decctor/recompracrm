import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { assertChatAccess } from "@/lib/chats/access";
import { isWhatsappWindowOpen } from "@/lib/chats/whatsapp-window-status";
import { db } from "@/services/drizzle";
import { chatAssignments, chats } from "@/services/drizzle/schema/chats";
import { clients } from "@/services/drizzle/schema/clients";
import { users } from "@/services/drizzle/schema/users";
import { whatsappConnections } from "@/services/drizzle/schema/whatsapp-connections";
import { and, desc, eq, ilike, isNotNull, ne, notInArray, or, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;
const MIN_SEARCH_LENGTH = 2;

// ============= GET - Conversas candidatas a receber um encaminhamento =============

const GetForwardTargetsInputSchema = z.object({
	sourceChatId: z.string({ required_error: "Conversa de origem não informada.", invalid_type_error: "Tipo inválido para a conversa de origem." }),
	search: z
		.string({ invalid_type_error: "Tipo inválido para a busca." })
		.optional()
		.nullable()
		.transform((v) => {
			const term = v?.trim() ?? "";
			return term.length >= MIN_SEARCH_LENGTH ? term : null;
		}),
	limit: z
		.string({ invalid_type_error: "Tipo inválido para o limite." })
		.optional()
		.nullable()
		.transform((v) => Math.min(Math.max(v ? Number(v) || DEFAULT_LIMIT : DEFAULT_LIMIT, 1), MAX_LIMIT)),
});
export type TGetForwardTargetsInput = z.infer<typeof GetForwardTargetsInputSchema>;

/**
 * Conversas recentes do mesmo número da conversa de origem, com o que o diálogo de
 * encaminhamento precisa para dizer de antemão se cada uma aceita a mensagem: quem atende e
 * se a janela de 24h está aberta. A rota de encaminhamento revalida tudo no envio.
 *
 * O escopo é o número de origem porque o encaminhamento sai pelo número de cada destino:
 * misturar números faria o cliente receber a mensagem de um WhatsApp que não é o da conversa.
 */
async function getForwardTargets({ session, input }: { session: TAuthUserSession; input: TGetForwardTargetsInput }) {
	const { organizacaoId } = assertChatAccess({ session, permission: "responder" });

	const sourceChat = await db.query.chats.findFirst({
		where: and(eq(chats.id, input.sourceChatId), eq(chats.organizacaoId, organizacaoId)),
		columns: { id: true, whatsappConexaoTelefoneId: true },
	});
	if (!sourceChat) throw new createHttpError.NotFound("Conversa de origem não encontrada.");

	const searchDigits = input.search?.replace(/\D/g, "") ?? "";
	const searchCondition = input.search
		? or(
				ilike(clients.nome, `%${input.search}%`),
				ilike(clients.telefone, `%${input.search}%`),
				// Telefone digitado com máscara ou sem ela casa com o cadastro em qualquer formato.
				searchDigits.length >= MIN_SEARCH_LENGTH ? sql`regexp_replace(${clients.telefone}, '\\D', '', 'g') like ${`%${searchDigits}%`}` : undefined,
			)
		: undefined;

	const rows = await db
		.select({
			chatId: chats.id,
			clienteId: chats.clienteId,
			clienteNome: clients.nome,
			clienteTelefone: clients.telefone,
			whatsappJanelaDataExpiracao: chats.whatsappJanelaDataExpiracao,
			conexaoTipo: whatsappConnections.tipoConexao,
			responsavelTipo: chatAssignments.responsavelTipo,
			responsavelUsuarioId: chatAssignments.responsavelUsuarioId,
			responsavelUsuarioNome: users.nome,
		})
		.from(chats)
		.innerJoin(clients, eq(chats.clienteId, clients.id))
		.leftJoin(whatsappConnections, eq(chats.whatsappConexaoId, whatsappConnections.id))
		// No máximo um atendimento corrente por chat (índice único parcial): o join não duplica linhas.
		.leftJoin(chatAssignments, and(eq(chatAssignments.chatId, chats.id), notInArray(chatAssignments.status, ["ENCERRADO", "CANCELADO"])))
		.leftJoin(users, eq(chatAssignments.responsavelUsuarioId, users.id))
		.where(
			and(
				eq(chats.organizacaoId, organizacaoId),
				// Chats de teste do agente de IA não são atendimento real.
				eq(chats.origem, "WHATSAPP"),
				ne(chats.id, sourceChat.id),
				sourceChat.whatsappConexaoTelefoneId ? eq(chats.whatsappConexaoTelefoneId, sourceChat.whatsappConexaoTelefoneId) : undefined,
				// Sem telefone o envio é recusado de qualquer forma; não vale oferecer.
				isNotNull(clients.telefone),
				searchCondition,
			),
		)
		.orderBy(desc(chats.ultimaMensagemData), desc(chats.id))
		.limit(input.limit);

	const now = new Date();
	const items = rows.map((row) => {
		const estado: "LIVRE" | "MINHA" | "OUTRO" =
			!row.responsavelTipo || row.responsavelTipo === "NAO_ATRIBUIDO"
				? "LIVRE"
				: row.responsavelTipo === "USUARIO" && row.responsavelUsuarioId === session.user.id
					? "MINHA"
					: "OUTRO";
		const responsavelNome =
			estado !== "OUTRO"
				? null
				: row.responsavelTipo === "AGENTE"
					? "a IA"
					: row.responsavelTipo === "EXTERNO"
						? "o telefone"
						: (row.responsavelUsuarioNome ?? "outro atendente");

		return {
			chatId: row.chatId,
			clienteId: row.clienteId,
			clienteNome: row.clienteNome,
			clienteTelefone: row.clienteTelefone,
			janelaAberta: isWhatsappWindowOpen({ expiracao: row.whatsappJanelaDataExpiracao, tipoConexao: row.conexaoTipo, now }),
			conexaoTipo: row.conexaoTipo,
			atendimento: { estado, responsavelNome },
		};
	});

	return { data: { items }, message: "Conversas carregadas com sucesso." };
}
export type TGetForwardTargetsOutput = Awaited<ReturnType<typeof getForwardTargets>>;

async function getForwardTargetsRoute(req: NextRequest) {
	const session = await getCurrentSessionUncached();
	const searchParams = req.nextUrl.searchParams;
	const input = GetForwardTargetsInputSchema.parse({
		sourceChatId: searchParams.get("sourceChatId"),
		search: searchParams.get("search"),
		limit: searchParams.get("limit"),
	});
	const result = await getForwardTargets({ session: session as TAuthUserSession, input });
	return NextResponse.json(result, { status: 200 });
}

// ============= Export handlers =============

export const GET = appApiHandler({ GET: getForwardTargetsRoute });
