import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { CommunityCourseSectionSchema } from "@/schemas/community";
import { db } from "@/services/drizzle";
import { communityCourseSections } from "@/services/drizzle/schema";
import { eq, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// ---- POST: Create a section ----

const CreateSectionInputSchema = CommunityCourseSectionSchema;
export type TCreateSectionInput = z.infer<typeof CreateSectionInputSchema>;

async function createSection({ input }: { input: TCreateSectionInput }) {
	const maxOrdem = await db
		.select({ max: sql<number>`COALESCE(MAX(${communityCourseSections.ordem}), -1)` })
		.from(communityCourseSections)
		.where(eq(communityCourseSections.cursoId, input.cursoId));

	const inserted = await db
		.insert(communityCourseSections)
		.values({
			...input,
			ordem: input.ordem || (maxOrdem[0]?.max ?? -1) + 1,
		})
		.returning();

	return { data: inserted[0], message: "Seção criada com sucesso." };
}
export type TCreateSectionOutput = Awaited<ReturnType<typeof createSection>>;

async function createSectionRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const payload = await request.json();
	const input = CreateSectionInputSchema.parse(payload);
	const result = await createSection({ input });
	return NextResponse.json(result);
}

// ---- PUT: Update a section ----

const UpdateSectionInputSchema = z.object({
	id: z.string(),
	data: CommunityCourseSectionSchema.omit({ cursoId: true }).partial(),
});
export type TUpdateSectionInput = z.infer<typeof UpdateSectionInputSchema>;

async function updateSection({ input }: { input: TUpdateSectionInput }) {
	const updated = await db
		.update(communityCourseSections)
		.set(input.data)
		.where(eq(communityCourseSections.id, input.id))
		.returning();

	if (!updated[0]) throw new createHttpError.NotFound("Seção não encontrada.");
	return { data: updated[0], message: "Seção atualizada com sucesso." };
}
export type TUpdateSectionOutput = Awaited<ReturnType<typeof updateSection>>;

async function updateSectionRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const payload = await request.json();
	const input = UpdateSectionInputSchema.parse(payload);
	const result = await updateSection({ input });
	return NextResponse.json(result);
}

// ---- DELETE: Delete a section ----

async function deleteSectionRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const { searchParams } = new URL(request.url);
	const id = searchParams.get("id");
	if (!id) throw new createHttpError.BadRequest("ID da seção não informado.");

	const deleted = await db
		.delete(communityCourseSections)
		.where(eq(communityCourseSections.id, id))
		.returning({ id: communityCourseSections.id });

	if (!deleted[0]) throw new createHttpError.NotFound("Seção não encontrada.");
	return NextResponse.json({ data: deleted[0], message: "Seção excluída com sucesso." });
}

export const POST = appApiHandler({ POST: createSectionRoute });
export const PUT = appApiHandler({ PUT: updateSectionRoute });
export const DELETE = appApiHandler({ DELETE: deleteSectionRoute });
