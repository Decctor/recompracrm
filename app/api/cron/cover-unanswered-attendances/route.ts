import { appApiHandler } from "@/lib/app-api";
import { coverUnansweredAttendances } from "@/lib/chats/unanswered-attendance-coverage";
import { assertCronAuthorized } from "@/lib/cron/assert-cron-authorized";
import { db } from "@/services/drizzle";
import { type NextRequest, NextResponse } from "next/server";

/**
 * O agente assume as conversas da equipe cuja mensagem do cliente passou de
 * `capacidades.atendimento.esperaResponsavelMs` sem resposta (`lib/chats/unanswered-attendance-coverage.ts`).
 *
 * A cada 2 minutos: a espera mínima configurável é de 5, então o atraso da varredura fica
 * pequeno perto dela. Com `AI_TURN_TRANSPORT=queue` os turnos vão para a fila e a rota devolve na hora.
 */

export const maxDuration = 300;

async function coverUnansweredAttendancesSweep() {
	const result = await coverUnansweredAttendances(db);
	return { data: result, message: "Atendimentos sem resposta verificados com sucesso." };
}
export type TCoverUnansweredAttendancesOutput = Awaited<ReturnType<typeof coverUnansweredAttendancesSweep>>;

async function coverUnansweredAttendancesRoute(req: NextRequest) {
	assertCronAuthorized(req);
	const result = await coverUnansweredAttendancesSweep();
	return NextResponse.json(result, { status: 200 });
}

export const GET = appApiHandler({ GET: coverUnansweredAttendancesRoute });
