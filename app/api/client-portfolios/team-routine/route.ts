import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { db } from "@/services/drizzle";
import { interactions } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * A rotina das carteiras somada, não a de um vendedor: quantos contatos o time tinha para hoje,
 * quantos já saíram e quanto débito ficou para trás. É a leitura que a aba de Equipe precisa —
 * `/api/client-portfolios/stats` responde sempre por um vendedor só.
 *
 * "Atrasados" é débito real e ignora a janela do dia: uma interação PLANEJADA que venceu ontem
 * continua atrasada hoje, como no calendário da carteira.
 */
const GetTeamRoutineInputSchema = z.object({
	dayStart: z
		.string({ required_error: "Início do dia não informado.", invalid_type_error: "Tipo inválido para o início do dia." })
		.datetime({ message: "Tipo inválido para o início do dia." })
		.transform((v) => new Date(v)),
});
export type TGetTeamRoutineInput = z.infer<typeof GetTeamRoutineInputSchema>;

async function getTeamRoutine({ input, session }: { input: TGetTeamRoutineInput; session: TAuthUserSession }) {
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const dayStart = dayjs(input.dayStart);
	const dayEnd = dayStart.add(1, "day");

	const [row] = await db
		.select({
			previstos: sql<number>`count(*) filter (where ${interactions.dataInteracao} >= ${dayStart.toISOString()}::timestamp and ${interactions.dataInteracao} < ${dayEnd.toISOString()}::timestamp)`,
			feitos: sql<number>`count(*) filter (where ${interactions.status} = 'REALIZADA' and ${interactions.dataInteracao} >= ${dayStart.toISOString()}::timestamp and ${interactions.dataInteracao} < ${dayEnd.toISOString()}::timestamp)`,
			atrasados: sql<number>`count(*) filter (where ${interactions.status} = 'PLANEJADA' and ${interactions.dataInteracao} < ${dayStart.toISOString()}::timestamp)`,
		})
		.from(interactions)
		.where(
			and(
				eq(interactions.organizacaoId, organizacaoId),
				isNotNull(interactions.vendedorId),
				isNotNull(interactions.dataInteracao),
				sql`${interactions.status} in ('PLANEJADA', 'REALIZADA')`,
			),
		);

	return {
		data: {
			previstos: Number(row?.previstos ?? 0),
			feitos: Number(row?.feitos ?? 0),
			atrasados: Number(row?.atrasados ?? 0),
		},
		message: "Rotina das carteiras recuperada com sucesso.",
	};
}
export type TGetTeamRoutineOutput = Awaited<ReturnType<typeof getTeamRoutine>>;

async function getTeamRoutineRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership?.organizacao.configuracao.preferencias.carteirasClientes?.habilitado)
		throw new createHttpError.Forbidden("O módulo de carteira de clientes não está habilitado para esta organização.");
	const input = GetTeamRoutineInputSchema.parse({ dayStart: request.nextUrl.searchParams.get("dayStart") });
	const result = await getTeamRoutine({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getTeamRoutineRoute });
