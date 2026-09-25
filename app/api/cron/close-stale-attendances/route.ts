import { appApiHandler } from "@/lib/app-api";
import { closeStaleChatAttendances } from "@/lib/chats/attendance-state";
import { assertCronAuthorized } from "@/lib/cron/assert-cron-authorized";
import { handOffAbandonedAttendancesToSellers } from "@/lib/ai/triage/abandoned-attendances";
import { db } from "@/services/drizzle";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Encerra os atendimentos sem atividade no chat há mais de 36h.
 *
 * O caso motivador: atendimentos feitos pelo telefone (EXTERNO) nunca são encerrados pelo
 * hub e ficariam ativos para sempre. O UPDATE em lote dispara realtime — o quadro reflete
 * sem refetch, como no cron de janelas de 24h.
 *
 * Depois do encerramento, os atendimentos que a IA (ou ninguém) conduzia passam por uma
 * classificação barata: "o cliente sumiu com pendência?". Os que sim viram um follow-up na agenda
 * do vendedor da carteira — a IA entregando a pendência a quem pode ligar.
 */

export const maxDuration = 300;

/**
 * 36h sem qualquer mensagem no chat: o atendimento não está mais em curso. Curto o bastante
 * para o quadro refletir a realidade no dia seguinte; longo o bastante para atravessar uma
 * madrugada sem encerrar uma conversa que a equipe responderia de manhã.
 * Constante por enquanto; candidata natural a configuração por organização.
 */
const STALE_ATTENDANCE_INACTIVITY_MS = 36 * 60 * 60 * 1000;

async function closeStaleAttendances() {
	const now = new Date();
	const closed = await closeStaleChatAttendances(db, {
		inactiveSince: new Date(now.getTime() - STALE_ATTENDANCE_INACTIVITY_MS),
		now,
	});

	console.log(`[INFO] [CLOSE_STALE_ATTENDANCES] ${closed.length} atendimento(s) encerrado(s) por inatividade.`);

	const handedOff = await handOffAbandonedAttendancesToSellers(db, { closed, now });

	return {
		data: { atendimentosEncerrados: closed.length, pendenciasParaVendedores: handedOff },
		message: "Atendimentos inativos encerrados com sucesso.",
	};
}
export type TCloseStaleAttendancesOutput = Awaited<ReturnType<typeof closeStaleAttendances>>;

async function closeStaleAttendancesRoute(req: NextRequest) {
	assertCronAuthorized(req);
	const result = await closeStaleAttendances();
	return NextResponse.json(result, { status: 200 });
}

export const GET = appApiHandler({ GET: closeStaleAttendancesRoute });
