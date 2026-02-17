import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { InternalLeadStatusCRMEnum, type TInternalLeadStatusCRMEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { internalLeadStageHistory, internalLeads } from "@/services/drizzle/schema";
import { InternalLeadStatusCRMOptions } from "@/utils/select-options";
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

	const grouped: Record<TInternalLeadStatusCRMEnum, typeof allLeads> = {
		NOVO: [],
		CONTATO_INICIAL: [],
		QUALIFICADO: [],
		PROPOSTA: [],
		NEGOCIACAO: [],
		GANHO: [],
		PERDIDO: [],
	};

	for (const lead of allLeads) {
		const status = lead.statusCRM as TInternalLeadStatusCRMEnum;
		if (grouped[status]) {
			grouped[status].push(lead);
		}
	}

	return {
		data: { columns: grouped, stages: InternalLeadStatusCRMOptions },
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

const MoveLeadInputSchema = z
	.object({
		leadId: z.string({
			required_error: "ID do lead não informado.",
			invalid_type_error: "Tipo inválido para ID do lead.",
		}),
		previousStatus: InternalLeadStatusCRMEnum.optional(),
		previousPosition: z.number({ invalid_type_error: "Tipo inválido para posição anterior." }).int().nonnegative().optional(),
		newStatus: InternalLeadStatusCRMEnum.optional(),
		newPosition: z.number({ invalid_type_error: "Tipo inválido para posição nova." }).int().nonnegative().optional(),
		novoStatus: InternalLeadStatusCRMEnum.optional(),
		novaPosicao: z.number({ invalid_type_error: "Tipo inválido para posição nova." }).int().nonnegative().optional(),
	})
	.transform((input) => ({
		leadId: input.leadId,
		previousStatus: input.previousStatus,
		previousPosition: input.previousPosition,
		novoStatus: input.novoStatus ?? input.newStatus,
		novaPosicao: input.novaPosicao ?? input.newPosition,
	}))
	.superRefine((input, ctx) => {
		if (!input.novoStatus) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Status novo não informado.",
				path: ["novoStatus"],
			});
		}
		if (input.novaPosicao == null) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Posição nova não informada.",
				path: ["novaPosicao"],
			});
		}
	});
export type TMoveLeadInput = z.infer<typeof MoveLeadInputSchema>;

async function moveLead({ input, autorId }: { input: TMoveLeadInput; autorId: string }) {
	console.log("[INPUT]", {
		authorId: autorId,
		input,
	});
	if (!input.novoStatus || input.novaPosicao == null) {
		throw new createHttpError.BadRequest("Status e posição de destino são obrigatórios.");
	}
	const novoStatus = input.novoStatus;
	const novaPosicao = input.novaPosicao;

	await db.transaction(async (tx) => {
		const existing = await tx.query.internalLeads.findFirst({
			where: (fields, { eq }) => eq(fields.id, input.leadId),
		});
		if (!existing) throw new createHttpError.NotFound("Lead não encontrado.");

		const statusChanged = existing.statusCRM !== novoStatus;

		if (statusChanged) {
			await tx.insert(internalLeadStageHistory).values({
				leadId: input.leadId,
				statusAnterior: existing.statusCRM,
				statusNovo: novoStatus,
				autorId,
			});
		}

		await tx
			.update(internalLeads)
			.set({
				statusCRM: novoStatus as TInternalLeadStatusCRMEnum,
				posicaoKanban: novaPosicao,
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
	console.log("[DEBUG] [PAYLOAD]", payload);
	const input = MoveLeadInputSchema.parse(payload);
	console.log("[DEBUG] [INPUT]", input);
	const result = await moveLead({ input, autorId: session.user.id });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getKanbanLeadsRoute });
export const PATCH = appApiHandler({ PATCH: moveLeadRoute });
