import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { InternalLeadSchema } from "@/schemas/internal-leads";
import { db } from "@/services/drizzle";
import { internalLeadStageHistory, internalLeads } from "@/services/drizzle/schema";
import { and, count, eq, ilike, or, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// ==================== GET - List / Get by ID ====================

const GetLeadsInputSchema = z.object({
	id: z.string().optional(),
	search: z.string().optional(),
	statusCRM: z.string().optional(),
	responsavelId: z.string().optional(),
	page: z.coerce.number().default(1),
	pageSize: z.coerce.number().default(25),
});
export type TGetLeadsInput = z.infer<typeof GetLeadsInputSchema>;

async function getLeads(input: TGetLeadsInput) {
	if (input.id) {
		const lead = await db.query.internalLeads.findFirst({
			where: (fields, { eq }) => eq(fields.id, input.id!),
			with: {
				responsavel: true,
				autor: true,
			},
		});
		if (!lead) throw new createHttpError.NotFound("Lead não encontrado.");
		return {
			data: { byId: lead, default: null },
			message: "Lead obtido com sucesso.",
		};
	}

	const conditions = [];
	if (input.search) {
		conditions.push(
			or(
				ilike(internalLeads.organizacaoNome, `%${input.search}%`),
				ilike(internalLeads.contatoNome, `%${input.search}%`),
				ilike(internalLeads.contatoEmail, `%${input.search}%`),
				ilike(internalLeads.organizacaoCnpj, `%${input.search}%`),
				ilike(internalLeads.titulo, `%${input.search}%`),
			),
		);
	}
	if (input.statusCRM) {
		conditions.push(eq(internalLeads.statusCRM, input.statusCRM as any));
	}
	if (input.responsavelId) {
		conditions.push(eq(internalLeads.responsavelId, input.responsavelId));
	}

	const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

	const [leads, totalCount] = await Promise.all([
		db.query.internalLeads.findMany({
			where: whereClause,
			with: {
				responsavel: true,
				autor: true,
			},
			orderBy: (fields, { desc }) => [desc(fields.dataInsercao)],
			limit: input.pageSize,
			offset: (input.page - 1) * input.pageSize,
		}),
		db.select({ count: count() }).from(internalLeads).where(whereClause),
	]);

	return {
		data: {
			default: {
				leads,
				totalCount: totalCount[0]?.count ?? 0,
				page: input.page,
				pageSize: input.pageSize,
			},
			byId: null,
		},
		message: "Leads obtidos com sucesso.",
	};
}
export type TGetLeadsOutput = Awaited<ReturnType<typeof getLeads>>;
export type TGetLeadsOutputDefault = NonNullable<TGetLeadsOutput["data"]["default"]>;
export type TGetLeadsOutputById = NonNullable<TGetLeadsOutput["data"]["byId"]>;

async function getLeadsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
	const input = GetLeadsInputSchema.parse(searchParams);

	const result = await getLeads(input);
	return NextResponse.json(result);
}

// ==================== POST - Create Lead ====================

const CreateLeadInputSchema = z.object({
	lead: InternalLeadSchema,
});
export type TCreateLeadInput = z.infer<typeof CreateLeadInputSchema>;

async function createLead({ input, autorId }: { input: TCreateLeadInput; autorId: string }) {
	const insertedId = await db.transaction(async (tx) => {
		const inserted = await tx
			.insert(internalLeads)
			.values({
				...input.lead,
				posicaoKanban: input.lead.posicaoKanban ?? 0,
				autorId,
			})
			.returning({ id: internalLeads.id });

		const leadId = inserted[0]?.id;
		if (!leadId) throw new createHttpError.InternalServerError("Erro ao criar lead.");

		// Record initial stage in history
		await tx.insert(internalLeadStageHistory).values({
			leadId,
			statusAnterior: null,
			statusNovo: input.lead.statusCRM ?? "NOVO",
			autorId,
		});

		return leadId;
	});

	return {
		data: { insertedId },
		message: "Lead criado com sucesso.",
	};
}
export type TCreateLeadOutput = Awaited<ReturnType<typeof createLead>>;

async function createLeadRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const payload = await request.json();
	const input = CreateLeadInputSchema.parse(payload);

	const result = await createLead({ input, autorId: session.user.id });
	return NextResponse.json(result);
}

// ==================== PUT - Update Lead ====================

const UpdateLeadInputSchema = z.object({
	leadId: z.string({
		invalid_type_error: "Tipo não válido para o ID do lead.",
		required_error: "ID do lead não informado.",
	}),
	lead: InternalLeadSchema.partial(),
});
export type TUpdateLeadInput = z.infer<typeof UpdateLeadInputSchema>;

async function updateLead({ id, input, autorId }: { id: string; input: TUpdateLeadInput; autorId: string }) {
	await db.transaction(async (tx) => {
		const existing = await tx.query.internalLeads.findFirst({
			where: (fields, { eq }) => eq(fields.id, id),
		});
		if (!existing) throw new createHttpError.NotFound("Lead não encontrado.");

		// Check if status changed → record in history
		if (input.lead.statusCRM && input.lead.statusCRM !== existing.statusCRM) {
			await tx.insert(internalLeadStageHistory).values({
				leadId: id,
				statusAnterior: existing.statusCRM,
				statusNovo: input.lead.statusCRM,
				autorId,
			});
		}

		const { posicaoKanban, ...restLead } = input.lead;
		await tx
			.update(internalLeads)
			.set({
				...restLead,
				...(posicaoKanban != null ? { posicaoKanban } : {}),
				dataUltimaAtualizacao: new Date(),
			})
			.where(eq(internalLeads.id, id));
	});

	return {
		data: { updatedId: id },
		message: "Lead atualizado com sucesso.",
	};
}
export type TUpdateLeadOutput = Awaited<ReturnType<typeof updateLead>>;

async function updateLeadRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const id = request.nextUrl.searchParams.get("id");
	if (!id) throw new createHttpError.BadRequest("ID do lead não informado.");

	const payload = await request.json();
	const input = UpdateLeadInputSchema.parse(payload);

	const result = await updateLead({ id, input, autorId: session.user.id });
	return NextResponse.json(result);
}

// ==================== DELETE - Delete Lead ====================

async function deleteLead({ id }: { id: string }) {
	const existing = await db.query.internalLeads.findFirst({
		where: (fields, { eq }) => eq(fields.id, id),
	});
	if (!existing) throw new createHttpError.NotFound("Lead não encontrado.");

	await db.delete(internalLeads).where(eq(internalLeads.id, id));

	return {
		data: { deletedId: id },
		message: "Lead deletado com sucesso.",
	};
}
export type TDeleteLeadOutput = Awaited<ReturnType<typeof deleteLead>>;

async function deleteLeadRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const id = request.nextUrl.searchParams.get("id");
	if (!id) throw new createHttpError.BadRequest("ID do lead não informado.");

	const result = await deleteLead({ id });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getLeadsRoute });
export const POST = appApiHandler({ POST: createLeadRoute });
export const PUT = appApiHandler({ PUT: updateLeadRoute });
export const DELETE = appApiHandler({ DELETE: deleteLeadRoute });
