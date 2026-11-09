import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { assertChatAccess } from "@/lib/chats/access";
import { getChatStatsOverview } from "@/lib/chats/stats/overview";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// ============= GET - Visão geral das estatísticas de atendimento =============

const dateField = (label: string) =>
	z
		.string({ invalid_type_error: `Tipo inválido para ${label}.` })
		.datetime({ message: `Tipo inválido para ${label}.` })
		.optional()
		.nullable()
		.transform((v) => (v ? new Date(v) : null));

const GetChatsStatsOverviewInputSchema = z.object({
	startDate: dateField("período"),
	endDate: dateField("período"),
	comparingStartDate: dateField("período de comparação"),
	comparingEndDate: dateField("período de comparação"),
	whatsappConexaoTelefoneId: z.string({ invalid_type_error: "Tipo inválido para o ID do telefone da conexão." }).optional().nullable(),
});
export type TGetChatsStatsOverviewInput = z.infer<typeof GetChatsStatsOverviewInputSchema>;

async function getChatsStatsOverview({ session, input }: { session: TAuthUserSession; input: TGetChatsStatsOverviewInput }) {
	const { organizacaoId } = assertChatAccess({ session, permission: "visualizar" });
	const data = await getChatStatsOverview({ organizacaoId, input });
	return { data, message: "Estatísticas de atendimento carregadas com sucesso." };
}
export type TGetChatsStatsOverviewOutput = Awaited<ReturnType<typeof getChatsStatsOverview>>;

async function getChatsStatsOverviewRoute(req: NextRequest) {
	const session = await getCurrentSessionUncached();
	const searchParams = req.nextUrl.searchParams;
	const input = GetChatsStatsOverviewInputSchema.parse({
		startDate: searchParams.get("startDate"),
		endDate: searchParams.get("endDate"),
		comparingStartDate: searchParams.get("comparingStartDate"),
		comparingEndDate: searchParams.get("comparingEndDate"),
		whatsappConexaoTelefoneId: searchParams.get("whatsappConexaoTelefoneId"),
	});

	const result = await getChatsStatsOverview({ session: session as TAuthUserSession, input });
	return NextResponse.json(result, { status: 200 });
}

// ============= Export handlers =============

export const GET = appApiHandler({ GET: getChatsStatsOverviewRoute });
