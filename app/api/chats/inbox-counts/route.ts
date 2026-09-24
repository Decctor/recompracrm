import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { assertChatAccess } from "@/lib/chats/access";
import { buildChatInboxFilterConditions, buildChatInboxQuickFilterCondition, currentChatAssignmentJoin } from "@/lib/chats/inbox-filters";
import { ChatAssignmentStatusEnum, ChatInboxPriorityFilterEnum, ChatInboxViewEnum, type TChatInboxQuickFilter } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { chatAssignments, chatMessages, chats } from "@/services/drizzle/schema/chats";
import { clients } from "@/services/drizzle/schema/clients";
import { and, eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// ============= GET - Contagens dos atalhos da inbox =============

/** Os mesmos filtros da lista, menos o atalho: cada pílula conta o próprio corte. */
const GetChatInboxCountsInputSchema = z.object({
	whatsappConexaoTelefoneId: z.string({ invalid_type_error: "Tipo inválido para o ID do telefone da conexão." }).optional().nullable(),
	view: z
		.string({ invalid_type_error: "Tipo inválido para a visão da caixa de entrada." })
		.optional()
		.nullable()
		.transform((v) => ChatInboxViewEnum.catch("MINHAS").parse(v ?? "MINHAS")),
	search: z.string({ invalid_type_error: "Tipo inválido para a busca." }).optional().nullable(),
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
});
export type TGetChatInboxCountsInput = z.infer<typeof GetChatInboxCountsInputSchema>;

async function getChatInboxCounts({ session, input }: { session: TAuthUserSession; input: TGetChatInboxCountsInput }) {
	const { organizacaoId } = assertChatAccess({ session, permission: "visualizar" });

	const countWhere = (quickFilter: TChatInboxQuickFilter) =>
		sql<number>`(count(*) filter (where ${buildChatInboxQuickFilterCondition(quickFilter)}))::int`;

	// Uma varredura só: cada atalho vira um `count(*) filter`, então o custo não cresce com o
	// número de pílulas.
	const [row] = await db
		.select({
			TODAS: sql<number>`count(*)::int`,
			NAO_LIDAS: countWhere("NAO_LIDAS"),
			AGUARDANDO_RESPOSTA: countWhere("AGUARDANDO_RESPOSTA"),
			JANELA_ABERTA: countWhere("JANELA_ABERTA"),
			PRIORITARIAS: countWhere("PRIORITARIAS"),
		})
		.from(chats)
		.leftJoin(clients, eq(chats.clienteId, clients.id))
		.leftJoin(chatMessages, eq(chats.ultimaMensagemId, chatMessages.id))
		.leftJoin(chatAssignments, currentChatAssignmentJoin)
		.where(and(...buildChatInboxFilterConditions({ ...input, userId: session.user.id, organizacaoId })));

	return {
		data: {
			TODAS: row?.TODAS ?? 0,
			NAO_LIDAS: row?.NAO_LIDAS ?? 0,
			AGUARDANDO_RESPOSTA: row?.AGUARDANDO_RESPOSTA ?? 0,
			JANELA_ABERTA: row?.JANELA_ABERTA ?? 0,
			PRIORITARIAS: row?.PRIORITARIAS ?? 0,
		} satisfies Record<TChatInboxQuickFilter, number>,
		message: "Contagens da caixa de entrada carregadas com sucesso.",
	};
}
export type TGetChatInboxCountsOutput = Awaited<ReturnType<typeof getChatInboxCounts>>;

async function getChatInboxCountsRoute(req: NextRequest) {
	const session = await getCurrentSessionUncached();
	const searchParams = req.nextUrl.searchParams;
	const input = GetChatInboxCountsInputSchema.parse({
		whatsappConexaoTelefoneId: searchParams.get("whatsappConexaoTelefoneId"),
		view: searchParams.get("view"),
		search: searchParams.get("search"),
		status: searchParams.get("status"),
		priority: searchParams.get("priority"),
	});

	const result = await getChatInboxCounts({ session: session as TAuthUserSession, input });
	return NextResponse.json(result, { status: 200 });
}

export const GET = appApiHandler({ GET: getChatInboxCountsRoute });
