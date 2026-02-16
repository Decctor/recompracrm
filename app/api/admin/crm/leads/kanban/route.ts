import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { db } from "@/services/drizzle";
import { INTERNAL_LEAD_STATUS_CRM, type TInternalLeadStatusCRM, internalLeadStageHistory, internalLeads } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// ==================== GET - Kanban grouped by status ====================

async function getKanbanLeads() {
	const allLeads = await db.query.internalLeads.findMany({
		with: {
			responsavel: true,
			autor: true,
		},
		orderBy: (fields, { asc }) => [asc(fields.posicaoKanban)],
	});

	const grouped: Record<TInternalLeadStatusCRM, typeof allLeads> = {
		NOVO: [],
		CONTATO_INICIAL: [],
		QUALIFICADO: [],
		PROPOSTA: [],
		NEGOCIACAO: [],
		GANHO: [],
		PERDIDO: [],
	};

	for (const lead of allLeads) {
		const status = lead.statusCRM as TInternalLeadStatusCRM;
		if (grouped[status]) {
			grouped[status].push(lead);
		}
	}

	return {
		data: { columns: grouped, stages: INTERNAL_LEAD_STATUS_CRM },
		message: "Kanban obtido com sucesso.",
	};
}
export type TGetKanbanLeadsOutput = Awaited<ReturnType<typeof getKanbanLeads>>;

async function getKanbanLeadsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const result = await getKanbanLeads();
	return NextResponse.json(result);
}

// ==================== PATCH - Move lead (drag-and-drop) ====================

const MoveLeadInputSchema = z.object({
	leadId: z.string(),
	novoStatus: z.string(),
	novaPosicao: z.number(),
});
export type TMoveLeadInput = z.infer<typeof MoveLeadInputSchema>;

async function moveLead({ input, autorId }: { input: TMoveLeadInput; autorId: string }) {
	await db.transaction(async (tx) => {
		const existing = await tx.query.internalLeads.findFirst({
			where: (fields, { eq }) => eq(fields.id, input.leadId),
		});
		if (!existing) throw new createHttpError.NotFound("Lead não encontrado.");

		const statusChanged = existing.statusCRM !== input.novoStatus;

		if (statusChanged) {
			await tx.insert(internalLeadStageHistory).values({
				leadId: input.leadId,
				statusAnterior: existing.statusCRM,
				statusNovo: input.novoStatus,
				autorId,
			});
		}

		await tx
			.update(internalLeads)
			.set({
				statusCRM: input.novoStatus as TInternalLeadStatusCRM,
				posicaoKanban: input.novaPosicao,
				dataUltimaAtualizacao: new Date(),
			})
			.where(eq(internalLeads.id, input.leadId));
	});

	return {
		data: { movedId: input.leadId },
		message: "Lead movido com sucesso.",
	};
}
export type TMoveLeadOutput = Awaited<ReturnType<typeof moveLead>>;

async function moveLeadRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const payload = await request.json();
	const input = MoveLeadInputSchema.parse(payload);

	const result = await moveLead({ input, autorId: session.user.id });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getKanbanLeadsRoute });
export const PATCH = appApiHandler({ PATCH: moveLeadRoute });
