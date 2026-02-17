import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { CommunityCourseSchema } from "@/schemas/community";
import { db } from "@/services/drizzle";
import { communityCourses, communityCourseSections, communityLessons } from "@/services/drizzle/schema";
import { asc, eq, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// ---- GET: List all courses with section/lesson counts ----

async function getCourses() {
	const courses = await db.query.communityCourses.findMany({
		orderBy: [asc(communityCourses.ordem), asc(communityCourses.dataInsercao)],
		with: {
			autor: {
				columns: { id: true, nome: true, avatarUrl: true },
			},
			secoes: {
				orderBy: [asc(communityCourseSections.ordem)],
				columns: { id: true, titulo: true, ordem: true },
				with: {
					aulas: {
						orderBy: [asc(communityLessons.ordem)],
						columns: { id: true, titulo: true, tipoConteudo: true, muxAssetStatus: true, duracaoSegundos: true },
					},
				},
			},
		},
	});

	return { data: courses, message: "Cursos obtidos com sucesso." };
}
export type TGetAdminCoursesOutput = Awaited<ReturnType<typeof getCourses>>;

async function getCoursesRoute(_request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const result = await getCourses();
	return NextResponse.json(result);
}

// ---- POST: Create a course ----

const CreateCourseInputSchema = CommunityCourseSchema;
export type TCreateCourseInput = z.infer<typeof CreateCourseInputSchema>;

async function createCourse({ input, autorId }: { input: TCreateCourseInput; autorId: string }) {
	const maxOrdem = await db
		.select({ max: sql<number>`COALESCE(MAX(${communityCourses.ordem}), -1)` })
		.from(communityCourses);

	const inserted = await db
		.insert(communityCourses)
		.values({
			...input,
			ordem: input.ordem || (maxOrdem[0]?.max ?? -1) + 1,
			autorId,
		})
		.returning();

	return { data: inserted[0], message: "Curso criado com sucesso." };
}
export type TCreateCourseOutput = Awaited<ReturnType<typeof createCourse>>;

async function createCourseRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const payload = await request.json();
	const input = CreateCourseInputSchema.parse(payload);
	const result = await createCourse({ input, autorId: session.user.id });
	return NextResponse.json(result);
}

// ---- PUT: Update a course ----

const UpdateCourseInputSchema = z.object({
	id: z.string(),
	data: CommunityCourseSchema.partial(),
});
export type TUpdateCourseInput = z.infer<typeof UpdateCourseInputSchema>;

async function updateCourse({ input }: { input: TUpdateCourseInput }) {
	const updated = await db
		.update(communityCourses)
		.set(input.data)
		.where(eq(communityCourses.id, input.id))
		.returning();

	if (!updated[0]) throw new createHttpError.NotFound("Curso não encontrado.");
	return { data: updated[0], message: "Curso atualizado com sucesso." };
}
export type TUpdateCourseOutput = Awaited<ReturnType<typeof updateCourse>>;

async function updateCourseRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const payload = await request.json();
	const input = UpdateCourseInputSchema.parse(payload);
	const result = await updateCourse({ input });
	return NextResponse.json(result);
}

// ---- DELETE: Delete a course ----

const DeleteCourseInputSchema = z.object({ id: z.string() });

async function deleteCourse({ id }: { id: string }) {
	const deleted = await db.delete(communityCourses).where(eq(communityCourses.id, id)).returning({ id: communityCourses.id });
	if (!deleted[0]) throw new createHttpError.NotFound("Curso não encontrado.");
	return { data: deleted[0], message: "Curso excluído com sucesso." };
}

async function deleteCourseRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const { searchParams } = new URL(request.url);
	const id = searchParams.get("id");
	if (!id) throw new createHttpError.BadRequest("ID do curso não informado.");

	const result = await deleteCourse({ id });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getCoursesRoute });
export const POST = appApiHandler({ POST: createCourseRoute });
export const PUT = appApiHandler({ PUT: updateCourseRoute });
export const DELETE = appApiHandler({ DELETE: deleteCourseRoute });
