import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { InternalLeadActivityTemplateSchema } from "@/schemas/internal-leads";
import { db } from "@/services/drizzle";
import { internalLeadActivityTemplates } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// ==================== GET - List Templates ====================

async function getTemplates() {
	const templates = await db.query.internalLeadActivityTemplates.findMany({
		with: { autor: true },
		orderBy: (fields, { asc }) => [asc(fields.nome)],
	});

	return {
		data: { templates },
		message: "Templates obtidos com sucesso.",
	};
}
export type TGetTemplatesOutput = Awaited<ReturnType<typeof getTemplates>>;

async function getTemplatesRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const result = await getTemplates();
	return NextResponse.json(result);
}

// ==================== POST - Create Template ====================

const CreateTemplateInputSchema = z.object({
	template: InternalLeadActivityTemplateSchema,
});
export type TCreateTemplateInput = z.infer<typeof CreateTemplateInputSchema>;

async function createTemplate({ input, autorId }: { input: TCreateTemplateInput; autorId: string }) {
	const inserted = await db
		.insert(internalLeadActivityTemplates)
		.values({
			...input.template,
			autorId,
		})
		.returning({ id: internalLeadActivityTemplates.id });

	const templateId = inserted[0]?.id;
	if (!templateId) throw new createHttpError.InternalServerError("Erro ao criar template.");

	return {
		data: { insertedId: templateId },
		message: "Template criado com sucesso.",
	};
}
export type TCreateTemplateOutput = Awaited<ReturnType<typeof createTemplate>>;

async function createTemplateRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const payload = await request.json();
	const input = CreateTemplateInputSchema.parse(payload);
	const result = await createTemplate({ input, autorId: session.user.id });
	return NextResponse.json(result);
}

// ==================== PUT - Update Template ====================

const UpdateTemplateInputSchema = z.object({
	template: InternalLeadActivityTemplateSchema.partial(),
});
export type TUpdateTemplateInput = z.infer<typeof UpdateTemplateInputSchema>;

async function updateTemplate({ id, input }: { id: string; input: TUpdateTemplateInput }) {
	const existing = await db.query.internalLeadActivityTemplates.findFirst({
		where: (fields, { eq }) => eq(fields.id, id),
	});
	if (!existing) throw new createHttpError.NotFound("Template não encontrado.");

	await db.update(internalLeadActivityTemplates).set(input.template).where(eq(internalLeadActivityTemplates.id, id));

	return {
		data: { updatedId: id },
		message: "Template atualizado com sucesso.",
	};
}
export type TUpdateTemplateOutput = Awaited<ReturnType<typeof updateTemplate>>;

async function updateTemplateRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const id = request.nextUrl.searchParams.get("id");
	if (!id) throw new createHttpError.BadRequest("ID do template não informado.");

	const payload = await request.json();
	const input = UpdateTemplateInputSchema.parse(payload);
	const result = await updateTemplate({ id, input });
	return NextResponse.json(result);
}

// ==================== DELETE - Delete Template ====================

async function deleteTemplate({ id }: { id: string }) {
	const existing = await db.query.internalLeadActivityTemplates.findFirst({
		where: (fields, { eq }) => eq(fields.id, id),
	});
	if (!existing) throw new createHttpError.NotFound("Template não encontrado.");

	await db.delete(internalLeadActivityTemplates).where(eq(internalLeadActivityTemplates.id, id));

	return {
		data: { deletedId: id },
		message: "Template deletado com sucesso.",
	};
}
export type TDeleteTemplateOutput = Awaited<ReturnType<typeof deleteTemplate>>;

async function deleteTemplateRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const id = request.nextUrl.searchParams.get("id");
	if (!id) throw new createHttpError.BadRequest("ID do template não informado.");

	const result = await deleteTemplate({ id });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getTemplatesRoute });
export const POST = appApiHandler({ POST: createTemplateRoute });
export const PUT = appApiHandler({ PUT: updateTemplateRoute });
export const DELETE = appApiHandler({ DELETE: deleteTemplateRoute });
