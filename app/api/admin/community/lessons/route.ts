import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { deleteMuxAsset } from "@/lib/mux/upload";
import { CommunityLessonMuxMetadataSchema, CommunityLessonSchema } from "@/schemas/community";
import { db } from "@/services/drizzle";
import { communityLessons } from "@/services/drizzle/schema";
import { asc, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// ---- GET: List / fetch lessons ----

const GetCommunityLessonsInputSchema = z.object({
	id: z
		.string({
			required_error: "ID da aula não informado.",
			invalid_type_error: "Tipo não válido para o ID da aula.",
		})
		.optional(),
	courseId: z
		.string({
			required_error: "ID do curso não informado.",
			invalid_type_error: "Tipo não válido para o ID do curso.",
		})
		.optional(),
	courseSectionId: z
		.string({
			required_error: "ID da seção não informado.",
			invalid_type_error: "Tipo não válido para o ID da seção.",
		})
		.optional(),
});
export type TGetCommunityLessonsInput = z.infer<typeof GetCommunityLessonsInputSchema>;

async function getCommunityLessons({ input }: { input: TGetCommunityLessonsInput }) {
	// Mode: byId
	if (input.id) {
		const communityLesson = await db.query.communityLessons.findFirst({
			where: eq(communityLessons.id, input.id),
		});
		if (!communityLesson) throw new createHttpError.NotFound("Aula não encontrada.");
		return {
			data: { byId: communityLesson, byCourseSectionId: null, byCourseId: null, default: null },
			message: "Aula obtida com sucesso.",
		};
	}

	// Mode: byCourseSectionId
	if (input.courseSectionId) {
		const lessons = await db.query.communityLessons.findMany({
			where: eq(communityLessons.secaoId, input.courseSectionId),
			orderBy: [asc(communityLessons.ordem)],
		});
		return {
			data: { byId: null, byCourseSectionId: lessons, byCourseId: null, default: null },
			message: "Aulas da seção obtidas com sucesso.",
		};
	}

	// Mode: byCourseId — fetch all lessons from all sections of the given course
	if (input.courseId) {
		const { communityCourseSections } = await import("@/services/drizzle/schema");
		const sectionsWithLessons = await db.query.communityCourseSections.findMany({
			where: eq(communityCourseSections.cursoId, input.courseId),
			orderBy: [asc(communityCourseSections.ordem)],
			columns: { id: true },
			with: {
				aulas: {
					orderBy: [asc(communityLessons.ordem)],
				},
			},
		});
		const lessons = sectionsWithLessons.flatMap((s) => s.aulas);
		return {
			data: { byId: null, byCourseSectionId: null, byCourseId: lessons, default: null },
			message: "Aulas do curso obtidas com sucesso.",
		};
	}

	// Mode: default — all lessons
	const allLessons = await db.query.communityLessons.findMany({
		orderBy: [asc(communityLessons.ordem)],
	});
	return {
		data: { byId: null, byCourseSectionId: null, byCourseId: null, default: allLessons },
		message: "Aulas obtidas com sucesso.",
	};
}
export type TGetCommunityLessonsOutput = Awaited<ReturnType<typeof getCommunityLessons>>;
export type TGetCommunityLessonsOutputById = NonNullable<TGetCommunityLessonsOutput["data"]["byId"]>;
export type TGetCommunityLessonsOutputByCourseSectionId = NonNullable<TGetCommunityLessonsOutput["data"]["byCourseSectionId"]>;
export type TGetCommunityLessonsOutputByCourseId = NonNullable<TGetCommunityLessonsOutput["data"]["byCourseId"]>;
export type TGetCommunityLessonsOutputDefault = NonNullable<TGetCommunityLessonsOutput["data"]["default"]>;

async function getCommunityLessonsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const { searchParams } = new URL(request.url);
	const input = GetCommunityLessonsInputSchema.parse({
		id: searchParams.get("id") ?? undefined,
		courseId: searchParams.get("courseId") ?? undefined,
		courseSectionId: searchParams.get("courseSectionId") ?? undefined,
	});
	const result = await getCommunityLessons({ input });
	return NextResponse.json(result);
}

// ---- POST: Create a lesson ----

const CreateCommunityLessonInputSchema = z.object({
	communityLesson: CommunityLessonSchema,
});
export type TCreateCommunityLessonInput = z.infer<typeof CreateCommunityLessonInputSchema>;

async function createCommunityLesson({ input }: { input: TCreateCommunityLessonInput }) {
	const { communityLesson } = input;

	const inserted = await db
		.insert(communityLessons)
		.values({
			...communityLesson,
		})
		.returning({ id: communityLessons.id });

	const insertedLessonId = inserted[0]?.id;
	if (!insertedLessonId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao criar aula.");

	return { data: { insertedLessonId }, message: "Aula criada com sucesso." };
}
export type TCreateCommunityLessonOutput = Awaited<ReturnType<typeof createCommunityLesson>>;

async function createCommunityLessonRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const payload = await request.json();
	const input = CreateCommunityLessonInputSchema.parse(payload);
	const result = await createCommunityLesson({ input });
	return NextResponse.json(result);
}

// ---- PUT: Update a lesson ----

const UpdateCommunityLessonInputSchema = z.object({
	communityLessonId: z.string({
		required_error: "ID da aula não informado.",
		invalid_type_error: "Tipo não válido para o ID da aula.",
	}),
	communityLesson: CommunityLessonSchema.omit({ secaoId: true })
		.partial()
		.extend({
			muxUploadId: z.string().optional().nullable(),
			muxAssetStatus: z.enum(["AGUARDANDO", "PROCESSANDO", "PRONTO", "ERRO"]).optional().nullable(),
			muxMetadata: CommunityLessonMuxMetadataSchema.optional(),
		}),
});
export type TUpdateCommunityLessonInput = z.infer<typeof UpdateCommunityLessonInputSchema>;

async function updateCommunityLesson({ input }: { input: TUpdateCommunityLessonInput }) {
	const existingLesson = await db.query.communityLessons.findFirst({
		where: eq(communityLessons.id, input.communityLessonId),
		columns: {
			id: true,
			muxAssetId: true,
			muxUploadId: true,
			muxMetadata: true,
		},
	});
	if (!existingLesson) throw new createHttpError.NotFound("Aula não encontrada.");

	const muxMetadata = { ...(existingLesson.muxMetadata ?? {}), ...(input.communityLesson.muxMetadata ?? {}) };
	const hasNewMuxUploadId = !!input.communityLesson.muxUploadId && input.communityLesson.muxUploadId !== existingLesson.muxUploadId;
	if (hasNewMuxUploadId && existingLesson.muxAssetId) {
		muxMetadata.alteracaoMuxAssetId = existingLesson.muxAssetId;
		muxMetadata.alteracaoMuxAssetData = new Date().toISOString();
		muxMetadata.alteracaoMusAssetMotivo = "substituicao_manual";
	}

	const updated = await db
		.update(communityLessons)
		.set({
			...input.communityLesson,
			muxMetadata,
		})
		.where(eq(communityLessons.id, input.communityLessonId))
		.returning({ id: communityLessons.id });

	const updatedLessonId = updated[0]?.id;
	if (!updatedLessonId) throw new createHttpError.NotFound("Aula não encontrada.");
	return { data: { updatedLessonId }, message: "Aula atualizada com sucesso." };
}
export type TUpdateCommunityLessonOutput = Awaited<ReturnType<typeof updateCommunityLesson>>;

async function updateCommunityLessonRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const payload = await request.json();
	const input = UpdateCommunityLessonInputSchema.parse(payload);
	const result = await updateCommunityLesson({ input });
	return NextResponse.json(result);
}

// ---- DELETE: Delete a lesson ----

const DeleteCommunityLessonInputSchema = z.object({
	id: z.string({
		required_error: "ID da aula não informado.",
		invalid_type_error: "Tipo não válido para o ID da aula.",
	}),
});
export type TDeleteCommunityLessonInput = z.infer<typeof DeleteCommunityLessonInputSchema>;

async function deleteCommunityLesson({ input }: { input: TDeleteCommunityLessonInput }) {
	const lesson = await db.query.communityLessons.findFirst({
		where: eq(communityLessons.id, input.id),
		columns: { id: true, muxAssetId: true },
	});
	if (!lesson) throw new createHttpError.NotFound("Aula não encontrada.");

	if (lesson.muxAssetId) {
		try {
			await deleteMuxAsset(lesson.muxAssetId);
		} catch (err) {
			console.error("Falha ao excluir asset no Mux:", err);
		}
	}

	await db.delete(communityLessons).where(eq(communityLessons.id, input.id));
	return { data: { deletedLessonId: input.id }, message: "Aula excluída com sucesso." };
}
export type TDeleteCommunityLessonOutput = Awaited<ReturnType<typeof deleteCommunityLesson>>;

async function deleteCommunityLessonRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const { searchParams } = new URL(request.url);
	const id = searchParams.get("id");
	if (!id) throw new createHttpError.BadRequest("ID da aula não informado.");

	const input = DeleteCommunityLessonInputSchema.parse({ id });
	const result = await deleteCommunityLesson({ input });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getCommunityLessonsRoute });
export const POST = appApiHandler({ POST: createCommunityLessonRoute });
export const PUT = appApiHandler({ PUT: updateCommunityLessonRoute });
export const DELETE = appApiHandler({ DELETE: deleteCommunityLessonRoute });
