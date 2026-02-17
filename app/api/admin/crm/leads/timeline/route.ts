import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { db } from "@/services/drizzle";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// ==================== GET - Lead Timeline ====================

const GetTimelineInputSchema = z.object({
	leadId: z.string(),
});
export type TGetTimelineInput = z.infer<typeof GetTimelineInputSchema>;

export type TTimelineEvent = {
	id: string;
	tipo: "ATIVIDADE" | "NOTA" | "MUDANCA_ETAPA";
	data: Date;
	titulo: string;
	descricao: string | null;
	autorNome: string | null;
	metadata: Record<string, unknown>;
};

async function getTimeline(input: TGetTimelineInput) {
	const [activities, notes, stageHistory] = await Promise.all([
		db.query.internalLeadActivities.findMany({
			where: (fields, { eq }) => eq(fields.leadId, input.leadId),
			with: { autor: true },
			orderBy: (fields, { desc }) => [desc(fields.dataInsercao)],
		}),
		db.query.internalLeadNotes.findMany({
			where: (fields, { eq }) => eq(fields.leadId, input.leadId),
			with: { autor: true },
			orderBy: (fields, { desc }) => [desc(fields.dataInsercao)],
		}),
		db.query.internalLeadStageHistory.findMany({
			where: (fields, { eq }) => eq(fields.leadId, input.leadId),
			with: { autor: true },
			orderBy: (fields, { desc }) => [desc(fields.dataTransicao)],
		}),
	]);

	const events: TTimelineEvent[] = [
		...activities.map((a) => ({
			id: a.id,
			tipo: "ATIVIDADE" as const,
			data: a.dataInsercao,
			titulo: `${a.tipo}: ${a.titulo}`,
			descricao: a.descricao,
			autorNome: a.autor?.nome ?? null,
			metadata: { status: a.status, dataAgendada: a.dataAgendada, tipo: a.tipo },
		})),
		...notes.map((n) => ({
			id: n.id,
			tipo: "NOTA" as const,
			data: n.dataInsercao,
			titulo: "Nota adicionada",
			descricao: n.conteudo,
			autorNome: n.autor?.nome ?? null,
			metadata: {},
		})),
		...stageHistory.map((h) => ({
			id: h.id,
			tipo: "MUDANCA_ETAPA" as const,
			data: h.dataTransicao,
			titulo: `${h.statusAnterior ?? "—"} → ${h.statusNovo}`,
			descricao: null,
			autorNome: h.autor?.nome ?? null,
			metadata: { statusAnterior: h.statusAnterior, statusNovo: h.statusNovo },
		})),
	];

	events.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

	return {
		data: { events },
		message: "Timeline obtida com sucesso.",
	};
}
export type TGetTimelineOutput = Awaited<ReturnType<typeof getTimeline>>;

async function getTimelineRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
	const input = GetTimelineInputSchema.parse(searchParams);
	const result = await getTimeline(input);
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getTimelineRoute });
