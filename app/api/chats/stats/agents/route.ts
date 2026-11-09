import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { assertChatAccess } from "@/lib/chats/access";
import { getChatAgentsRanking } from "@/lib/chats/stats/agents";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// ============= GET - Ranking de atendentes =============

const dateField = (label: string) =>
	z
		.string({ invalid_type_error: `Tipo inválido para ${label}.` })
		.datetime({ message: `Tipo inválido para ${label}.` })
		.optional()
		.nullable()
		.transform((v) => (v ? new Date(v) : null));

const GetChatsStatsAgentsInputSchema = z.object({
	startDate: dateField("período"),
	endDate: dateField("período"),
	whatsappConexaoTelefoneId: z.string({ invalid_type_error: "Tipo inválido para o ID do telefone da conexão." }).optional().nullable(),
});
export type TGetChatsStatsAgentsInput = z.infer<typeof GetChatsStatsAgentsInputSchema>;

async function getChatsStatsAgents({ session, input }: { session: TAuthUserSession; input: TGetChatsStatsAgentsInput }) {
	// Ranking nominal de atendentes é dado de gestão: exige a permissão de gerenciar.
	const { organizacaoId } = assertChatAccess({ session, permission: "finalizar" });
	const data = await getChatAgentsRanking({ organizacaoId, input });
	return { data, message: "Ranking de atendentes carregado com sucesso." };
}
export type TGetChatsStatsAgentsOutput = Awaited<ReturnType<typeof getChatsStatsAgents>>;

async function getChatsStatsAgentsRoute(req: NextRequest) {
	const session = await getCurrentSessionUncached();
	const searchParams = req.nextUrl.searchParams;
	const input = GetChatsStatsAgentsInputSchema.parse({
		startDate: searchParams.get("startDate"),
		endDate: searchParams.get("endDate"),
		whatsappConexaoTelefoneId: searchParams.get("whatsappConexaoTelefoneId"),
	});

	const result = await getChatsStatsAgents({ session: session as TAuthUserSession, input });
	return NextResponse.json(result, { status: 200 });
}

// ============= Export handlers =============

export const GET = appApiHandler({ GET: getChatsStatsAgentsRoute });
