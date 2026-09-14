import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";
import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getStoreCreditStats } from "@/lib/finances/store-credit/queries";
import { canViewFinances } from "@/lib/permissions/finances";

const GetStoreCreditStatsInputSchema = z.object({
	periodAfter: z
		.string({ required_error: "Período não informado.", invalid_type_error: "Tipo inválido para período." })
		.datetime({ message: "Tipo inválido para período." })
		.transform((value) => new Date(value)),
	periodBefore: z
		.string({ required_error: "Período não informado.", invalid_type_error: "Tipo inválido para período." })
		.datetime({ message: "Tipo inválido para período." })
		.transform((value) => new Date(value)),
});
export type TGetStoreCreditStatsInput = z.infer<typeof GetStoreCreditStatsInputSchema>;

async function getStoreCreditStatsService({ input, session }: { input: TGetStoreCreditStatsInput; session: TAuthUserSession }) {
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const stats = await getStoreCreditStats({ organizacaoId, periodAfter: input.periodAfter, periodBefore: input.periodBefore });
	return { data: stats, message: "Indicadores de fiado calculados com sucesso." };
}
export type TGetStoreCreditStatsOutput = Awaited<ReturnType<typeof getStoreCreditStatsService>>;

async function getStoreCreditStatsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session?.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	if (!canViewFinances(session.membership.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para visualizar o módulo financeiro.");

	const searchParams = request.nextUrl.searchParams;
	const input = GetStoreCreditStatsInputSchema.parse({
		periodAfter: searchParams.get("periodAfter"),
		periodBefore: searchParams.get("periodBefore"),
	});

	const result = await getStoreCreditStatsService({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getStoreCreditStatsRoute });
