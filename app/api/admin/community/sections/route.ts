import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { handleAdminSimpleChildRowsProcessing } from "@/lib/db-utils";
import { CommunityCourseSectionSchema, CommunityLessonSchema } from "@/schemas/community";
import { db } from "@/services/drizzle";
import { communityCourseSections, communityLessons } from "@/services/drizzle/schema";
import { asc, eq, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// ---- GET: List / fetch sections ----

const GetCommunityCourseSectionsInputSchema = z.object({
	id: z
		.string({
			required_error: "ID da seção não informado.",
			invalid_type_error: "Tipo não válido para o ID da seção.",
		})
		.optional(),
	courseId: z
		.string({
			required_error: "ID do curso não informado.",
			invalid_type_error: "Tipo não válido para o ID do curso.",
		})
		.optional(),
});
export type TGetCommunityCourseSectionsInput = z.infer<typeof GetCommunityCourseSectionsInputSchema>;

async function getCommunityCourseSections({ input }: { input: TGetCommunityCourseSectionsInput }) {
	// Mode: byId
	if (input.id) {
		const communityCourseSection = await db.query.communityCourseSections.findFirst({
			where: eq(communityCourseSections.id, input.id),
			with: {
				aulas: {
					orderBy: [asc(communityLessons.ordem)],
				},
			},
		});
		if (!communityCourseSection) throw new createHttpError.NotFound("Seção não encontrada.");
		return {
			data: { byId: communityCourseSection, byCourseId: null, default: null },
			message: "Seção obtida com sucesso.",
		};
	}

	// Mode: byCourseId
	if (input.courseId) {
		const sections = await db.query.communityCourseSections.findMany({
			where: eq(communityCourseSections.cursoId, input.courseId),
			orderBy: [asc(communityCourseSections.ordem)],
		});
		return {
			data: { byId: null, byCourseId: sections, default: null },
			message: "Seções do curso obtidas com sucesso.",
		};
	}

	// Mode: default — all sections
	const allSections = await db.query.communityCourseSections.findMany({
		orderBy: [asc(communityCourseSections.ordem)],
	});
	return {
		data: { byId: null, byCourseId: null, default: allSections },
		message: "Seções obtidas com sucesso.",
	};
}
export type TGetCommunityCourseSectionsOutput = Awaited<ReturnType<typeof getCommunityCourseSections>>;
export type TGetCommunityCourseSectionsOutputById = NonNullable<TGetCommunityCourseSectionsOutput["data"]["byId"]>;
export type TGetCommunityCourseSectionsOutputByCourseId = NonNullable<TGetCommunityCourseSectionsOutput["data"]["byCourseId"]>;
export type TGetCommunityCourseSectionsOutputDefault = NonNullable<TGetCommunityCourseSectionsOutput["data"]["default"]>;

async function getCommunityCourseSectionsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const { searchParams } = new URL(request.url);
	const input = GetCommunityCourseSectionsInputSchema.parse({
		id: searchParams.get("id") ?? undefined,
		courseId: searchParams.get("courseId") ?? undefined,
	});
	const result = await getCommunityCourseSections({ input });
	return NextResponse.json(result);
}

// ---- POST: Create a section ----

const CreateCommunityCourseSectionInputSchema = z.object({
	communityCourseSection: CommunityCourseSectionSchema.omit({ dataInsercao: true }),
	communityCourseSectionLessons: z
		.array(
			CommunityLessonSchema.omit({
				secaoId: true,
			}),
		)
		.default([]),
});
export type TCreateCommunityCourseSectionInput = z.infer<typeof CreateCommunityCourseSectionInputSchema>;

async function createCommunityCourseSection({ input }: { input: TCreateCommunityCourseSectionInput }) {
	const { communityCourseSection, communityCourseSectionLessons } = input;

	return await db.transaction(async (tx) => {
		const maxOrdem = await tx
			.select({ max: sql<number>`COALESCE(MAX(${communityCourseSections.ordem}), -1)` })
			.from(communityCourseSections)
			.where(eq(communityCourseSections.cursoId, communityCourseSection.cursoId));

		const inserted = await tx
			.insert(communityCourseSections)
			.values({
				...communityCourseSection,
				ordem: communityCourseSection.ordem || (maxOrdem[0]?.max ?? -1) + 1,
			})
			.returning({ id: communityCourseSections.id });

		const insertedSectionId = inserted[0]?.id;
		if (!insertedSectionId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao criar seção.");

		if (communityCourseSectionLessons.length > 0) {
			await tx.insert(communityLessons).values(
				communityCourseSectionLessons.map((lesson) => ({
					...lesson,
					secaoId: insertedSectionId,
				})),
			);
		}
		return { data: { insertedSectionId }, message: "Seção criada com sucesso." };
	});
}
export type TCreateCommunityCourseSectionOutput = Awaited<ReturnType<typeof createCommunityCourseSection>>;

async function createCommunityCourseSectionRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const payload = await request.json();
	const input = CreateCommunityCourseSectionInputSchema.parse(payload);
	const result = await createCommunityCourseSection({ input });
	return NextResponse.json(result);
}

// ---- PUT: Update a section ----

const UpdateCommunityCourseSectionInputSchema = z.object({
	communityCourseSectionId: z.string({
		required_error: "ID da seção não informado.",
		invalid_type_error: "Tipo não válido para o ID da seção.",
	}),
	communityCourseSection: CommunityCourseSectionSchema.omit({ dataInsercao: true, cursoId: true }).partial(),
	communityCourseSectionLessons: z.array(
		CommunityLessonSchema.omit({
			secaoId: true,
		}).extend({
			id: z
				.string({
					invalid_type_error: "Tipo não válido para o ID da aula.",
				})
				.optional(),
			deletar: z
				.boolean({
					invalid_type_error: "Tipo não válido para deletar a aula.",
				})
				.optional(),
		}),
	),
});
export type TUpdateCommunityCourseSectionInput = z.infer<typeof UpdateCommunityCourseSectionInputSchema>;

async function updateCommunityCourseSection({ input }: { input: TUpdateCommunityCourseSectionInput }) {
	return await db.transaction(async (tx) => {
		const updated = await tx
			.update(communityCourseSections)
			.set(input.communityCourseSection)
			.where(eq(communityCourseSections.id, input.communityCourseSectionId))
			.returning({ id: communityCourseSections.id });

		const updatedSectionId = updated[0]?.id;
		if (!updatedSectionId) throw new createHttpError.NotFound("Seção não encontrada.");

		await handleAdminSimpleChildRowsProcessing({
			trx: tx,
			table: communityLessons,
			entities: input.communityCourseSectionLessons,
			fatherEntityKey: "secaoId",
			fatherEntityId: updatedSectionId,
		});
		return { data: { updatedSectionId }, message: "Seção atualizada com sucesso." };
	});
}
export type TUpdateCommunityCourseSectionOutput = Awaited<ReturnType<typeof updateCommunityCourseSection>>;

async function updateCommunityCourseSectionRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const payload = await request.json();
	const input = UpdateCommunityCourseSectionInputSchema.parse(payload);
	const result = await updateCommunityCourseSection({ input });
	return NextResponse.json(result);
}

// ---- DELETE: Delete a section ----

const DeleteCommunityCourseSectionInputSchema = z.object({
	id: z.string({
		required_error: "ID da seção não informado.",
		invalid_type_error: "Tipo não válido para o ID da seção.",
	}),
});
export type TDeleteCommunityCourseSectionInput = z.infer<typeof DeleteCommunityCourseSectionInputSchema>;

async function deleteCommunityCourseSection({ input }: { input: TDeleteCommunityCourseSectionInput }) {
	const deleted = await db
		.delete(communityCourseSections)
		.where(eq(communityCourseSections.id, input.id))
		.returning({ id: communityCourseSections.id });

	const deletedSectionId = deleted[0]?.id;
	if (!deletedSectionId) throw new createHttpError.NotFound("Seção não encontrada.");
	return { data: { deletedSectionId }, message: "Seção excluída com sucesso." };
}
export type TDeleteCommunityCourseSectionOutput = Awaited<ReturnType<typeof deleteCommunityCourseSection>>;

async function deleteCommunityCourseSectionRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const { searchParams } = new URL(request.url);
	const id = searchParams.get("id");
	if (!id) throw new createHttpError.BadRequest("ID da seção não informado.");

	const input = DeleteCommunityCourseSectionInputSchema.parse({ id });
	const result = await deleteCommunityCourseSection({ input });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getCommunityCourseSectionsRoute });
export const POST = appApiHandler({ POST: createCommunityCourseSectionRoute });
export const PUT = appApiHandler({ PUT: updateCommunityCourseSectionRoute });
export const DELETE = appApiHandler({ DELETE: deleteCommunityCourseSectionRoute });
