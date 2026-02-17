import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { InternalLeadActivitySchema } from "@/schemas/internal-leads";
import { db } from "@/services/drizzle";
import { internalLeadActivities } from "@/services/drizzle/schema";
import { and, count, eq, gte, lte } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// ==================== GET - List Activities ====================

const GetActivitiesInputSchema = z.object({
	id: z.string().optional(),
	leadId: z.string().optional(),
	tipo: z.string().optional(),
	status: z.string().optional(),
	dataAfter: z.string().optional(),
	dataBefore: z.string().optional(),
	page: z.coerce.number().default(1),
	pageSize: z.coerce.number().default(25),
});
export type TGetActivitiesInput = z.infer<typeof GetActivitiesInputSchema>;

async function getActivities(input: TGetActivitiesInput) {
	if (input.id) {
		const activity = await db.query.internalLeadActivities.findFirst({
			where: (fields, { eq }) => eq(fields.id, input.id!),
			with: { lead: true, autor: true, template: true },
		});
		if (!activity) throw new createHttpError.NotFound("Atividade não encontrada.");
		return {
			data: { byId: activity, default: null },
			message: "Atividade obtida com sucesso.",
		};
	}

	const conditions = [];
	if (input.leadId) conditions.push(eq(internalLeadActivities.leadId, input.leadId));
	if (input.tipo) conditions.push(eq(internalLeadActivities.tipo, input.tipo as any));
	if (input.status) conditions.push(eq(internalLeadActivities.status, input.status as any));
	if (input.dataAfter) conditions.push(gte(internalLeadActivities.dataAgendada, new Date(input.dataAfter)));
	if (input.dataBefore) conditions.push(lte(internalLeadActivities.dataAgendada, new Date(input.dataBefore)));

	const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

	const [activities, totalCount] = await Promise.all([
		db.query.internalLeadActivities.findMany({
			where: whereClause,
			with: { lead: true, autor: true },
			orderBy: (fields, { asc }) => [asc(fields.dataAgendada)],
			limit: input.pageSize,
			offset: (input.page - 1) * input.pageSize,
		}),
		db.select({ count: count() }).from(internalLeadActivities).where(whereClause),
	]);

	return {
		data: {
			default: {
				activities,
				totalCount: totalCount[0]?.count ?? 0,
				page: input.page,
				pageSize: input.pageSize,
			},
			byId: null,
		},
		message: "Atividades obtidas com sucesso.",
	};
}
export type TGetActivitiesOutput = Awaited<ReturnType<typeof getActivities>>;
export type TGetActivitiesOutputDefault = NonNullable<TGetActivitiesOutput["data"]["default"]>;
export type TGetActivitiesOutputById = NonNullable<TGetActivitiesOutput["data"]["byId"]>;

async function getActivitiesRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
	const input = GetActivitiesInputSchema.parse(searchParams);
	const result = await getActivities(input);
	return NextResponse.json(result);
}

// ==================== POST - Create Activity ====================

const CreateActivityInputSchema = z.object({
	activity: InternalLeadActivitySchema,
});
export type TCreateActivityInput = z.infer<typeof CreateActivityInputSchema>;

async function createActivity({ input, autorId }: { input: TCreateActivityInput; autorId: string }) {
	const { dataAgendada, recorrencia, lembrete, ...restActivity } = input.activity;
	const inserted = await db
		.insert(internalLeadActivities)
		.values({
			...restActivity,
			dataAgendada: new Date(dataAgendada),
			recorrencia: recorrencia ?? undefined,
			lembrete: lembrete ?? undefined,
			autorId,
		})
		.returning({ id: internalLeadActivities.id });

	const activityId = inserted[0]?.id;
	if (!activityId) throw new createHttpError.InternalServerError("Erro ao criar atividade.");

	return {
		data: { insertedId: activityId },
		message: "Atividade criada com sucesso.",
	};
}
export type TCreateActivityOutput = Awaited<ReturnType<typeof createActivity>>;

async function createActivityRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const payload = await request.json();
	const input = CreateActivityInputSchema.parse(payload);
	const result = await createActivity({ input, autorId: session.user.id });
	return NextResponse.json(result);
}

// ==================== PUT - Update / Complete Activity ====================

const UpdateActivityInputSchema = z.object({
	activityId: z.string({
		invalid_type_error: "Tipo não válido para o ID da atividade.",
		required_error: "ID da atividade não informado.",
	}),
	activity: InternalLeadActivitySchema.partial(),
});
export type TUpdateActivityInput = z.infer<typeof UpdateActivityInputSchema>;

async function updateActivity({ input }: { input: TUpdateActivityInput }) {
	const existing = await db.query.internalLeadActivities.findFirst({
		where: (fields, { eq }) => eq(fields.id, input.activityId),
	});
	if (!existing) throw new createHttpError.NotFound("Atividade não encontrada.");

	const updateData: Record<string, unknown> = { ...input.activity };

	// If marking as completed, set dataConclusao
	if (input.activity.status === "CONCLUIDA" && existing.status !== "CONCLUIDA") {
		updateData.dataConclusao = new Date();
	}
	// If concluded and now there set to PENDENTE or CANCELADA, set dataConclusao
	if (existing.status === "CONCLUIDA" && input.activity.status !== "CONCLUIDA") {
		updateData.dataConclusao = null;
	}
	await db.update(internalLeadActivities).set(updateData).where(eq(internalLeadActivities.id, input.activityId));

	return {
		data: { updatedId: input.activityId },
		message: "Atividade atualizada com sucesso.",
	};
}
export type TUpdateActivityOutput = Awaited<ReturnType<typeof updateActivity>>;

async function updateActivityRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const payload = await request.json();
	const input = UpdateActivityInputSchema.parse(payload);
	const result = await updateActivity({ input });
	return NextResponse.json(result);
}

// ==================== DELETE - Delete Activity ====================

async function deleteActivity({ id }: { id: string }) {
	const existing = await db.query.internalLeadActivities.findFirst({
		where: (fields, { eq }) => eq(fields.id, id),
	});
	if (!existing) throw new createHttpError.NotFound("Atividade não encontrada.");

	await db.delete(internalLeadActivities).where(eq(internalLeadActivities.id, id));

	return {
		data: { deletedId: id },
		message: "Atividade deletada com sucesso.",
	};
}
export type TDeleteActivityOutput = Awaited<ReturnType<typeof deleteActivity>>;

async function deleteActivityRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const id = request.nextUrl.searchParams.get("id");
	if (!id) throw new createHttpError.BadRequest("ID da atividade não informado.");

	const result = await deleteActivity({ id });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getActivitiesRoute });
export const POST = appApiHandler({ POST: createActivityRoute });
export const PUT = appApiHandler({ PUT: updateActivityRoute });
export const DELETE = appApiHandler({ DELETE: deleteActivityRoute });
