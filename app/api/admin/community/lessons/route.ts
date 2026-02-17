import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { deleteMuxAsset } from "@/lib/mux/upload";
import { CommunityLessonMuxMetadataSchema, CommunityLessonSchema } from "@/schemas/community";
import { db } from "@/services/drizzle";
import { communityLessons } from "@/services/drizzle/schema";
import { eq, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// ---- POST: Create a lesson ----

const CreateLessonInputSchema = CommunityLessonSchema;
export type TCreateLessonInput = z.infer<typeof CreateLessonInputSchema>;

async function createLesson({ input }: { input: TCreateLessonInput }) {
	const maxOrdem = await db
		.select({ max: sql<number>`COALESCE(MAX(${communityLessons.ordem}), -1)` })
		.from(communityLessons)
		.where(eq(communityLessons.secaoId, input.secaoId));

	const inserted = await db
		.insert(communityLessons)
		.values({
			...input,
			ordem: input.ordem || (maxOrdem[0]?.max ?? -1) + 1,
		})
		.returning();

	return { data: inserted[0], message: "Aula criada com sucesso." };
}
export type TCreateLessonOutput = Awaited<ReturnType<typeof createLesson>>;

async function createLessonRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const payload = await request.json();
	const input = CreateLessonInputSchema.parse(payload);
	const result = await createLesson({ input });
	return NextResponse.json(result);
}

// ---- GET: Get a lesson by ID ----

const GetLessonInputSchema = z.object({
	id: z.string({
		required_error: "ID da aula não informado.",
		invalid_type_error: "Tipo não válido para o ID da aula.",
	}),
});
export type TGetLessonInput = z.infer<typeof GetLessonInputSchema>;

async function getLesson({ input }: { input: TGetLessonInput }) {
	const lesson = await db.query.communityLessons.findFirst({
		where: eq(communityLessons.id, input.id),
	});
	if (!lesson) throw new createHttpError.NotFound("Aula não encontrada.");
	return { data: lesson, message: "Aula obtida com sucesso." };
}
export type TGetLessonOutput = Awaited<ReturnType<typeof getLesson>>;

async function getLessonRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const { searchParams } = new URL(request.url);
	const input = GetLessonInputSchema.parse({
		id: searchParams.get("id"),
	});
	const result = await getLesson({ input });
	return NextResponse.json(result);
}

// ---- PUT: Update a lesson ----

const UpdateLessonInputSchema = z.object({
	id: z.string(),
	data: CommunityLessonSchema.omit({ secaoId: true }).partial().extend({
		muxUploadId: z.string().optional().nullable(),
		muxAssetStatus: z.enum(["AGUARDANDO", "PROCESSANDO", "PRONTO", "ERRO"]).optional().nullable(),
		muxMetadata: CommunityLessonMuxMetadataSchema.optional(),
	}),
});
export type TUpdateLessonInput = z.infer<typeof UpdateLessonInputSchema>;

async function updateLesson({ input }: { input: TUpdateLessonInput }) {
	const existingLesson = await db.query.communityLessons.findFirst({
		where: eq(communityLessons.id, input.id),
		columns: {
			id: true,
			muxAssetId: true,
			muxUploadId: true,
			muxMetadata: true,
		},
	});
	if (!existingLesson) throw new createHttpError.NotFound("Aula não encontrada.");

	const muxMetadata = { ...(existingLesson.muxMetadata ?? {}), ...(input.data.muxMetadata ?? {}) };
	const hasNewMuxUploadId = !!input.data.muxUploadId && input.data.muxUploadId !== existingLesson.muxUploadId;
	if (hasNewMuxUploadId && existingLesson.muxAssetId) {
		muxMetadata.alteracaoMuxAssetId = existingLesson.muxAssetId;
		muxMetadata.alteracaoMuxAssetData = new Date().toISOString();
		muxMetadata.alteracaoMusAssetMotivo = "substituicao_manual";
	}

	const updated = await db
		.update(communityLessons)
		.set({
			...input.data,
			muxMetadata,
		})
		.where(eq(communityLessons.id, input.id))
		.returning();

	if (!updated[0]) throw new createHttpError.NotFound("Aula não encontrada.");
	return { data: updated[0], message: "Aula atualizada com sucesso." };
}
export type TUpdateLessonOutput = Awaited<ReturnType<typeof updateLesson>>;

async function updateLessonRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const payload = await request.json();
	const input = UpdateLessonInputSchema.parse(payload);
	const result = await updateLesson({ input });
	return NextResponse.json(result);
}

// ---- DELETE: Delete a lesson ----

async function deleteLessonRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const { searchParams } = new URL(request.url);
	const id = searchParams.get("id");
	if (!id) throw new createHttpError.BadRequest("ID da aula não informado.");

	// Get the lesson to check for Mux asset
	const lesson = await db.query.communityLessons.findFirst({
		where: eq(communityLessons.id, id),
		columns: { id: true, muxAssetId: true },
	});

	if (!lesson) throw new createHttpError.NotFound("Aula não encontrada.");

	// Delete Mux asset if exists
	if (lesson.muxAssetId) {
		try {
			await deleteMuxAsset(lesson.muxAssetId);
		} catch (err) {
			console.error("Failed to delete Mux asset:", err);
		}
	}

	await db.delete(communityLessons).where(eq(communityLessons.id, id));

	return NextResponse.json({ data: { id }, message: "Aula excluída com sucesso." });
}

export const GET = appApiHandler({ GET: getLessonRoute });
export const POST = appApiHandler({ POST: createLessonRoute });
export const PUT = appApiHandler({ PUT: updateLessonRoute });
export const DELETE = appApiHandler({ DELETE: deleteLessonRoute });
