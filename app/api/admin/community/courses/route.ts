import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { handleAdminSimpleChildRowsProcessing } from "@/lib/db-utils";
import { createSimplifiedSearchCondition } from "@/lib/search";
import { CommunityCourseSchema, CommunityCourseSectionSchema } from "@/schemas/community";
import { db } from "@/services/drizzle";
import { communityCourseSections, communityCourses, communityLessons } from "@/services/drizzle/schema";
import { and, asc, count, eq, gte, inArray, lte, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// ---- GET: List all courses with section/lesson counts ----

const GetCommunityCoursesInputSchema = z.object({
	id: z
		.string({
			required_error: "ID do curso não informado.",
			invalid_type_error: "Tipo não válido para ID do curso.",
		})
		.optional(),
	page: z.number({
		required_error: "Página não informada.",
		invalid_type_error: "Tipo não válido para página.",
	}),
	search: z
		.string({
			required_error: "Busca não informada.",
			invalid_type_error: "Tipo não válido para busca.",
		})
		.optional(),
	status: z
		.string({
			invalid_type_error: "Tipo não válido para status.",
		})
		.optional()
		.transform((v) => (v ? v.split(",") : [])),
	periodFilter: z.enum(["dataPublicacao", "dataInsercao"]).optional().nullable(),
	periodAfter: z
		.string({
			required_error: "Período depois não informado.",
			invalid_type_error: "Tipo não válido para período depois.",
		})
		.datetime({ message: "Tipo não válido para período depois." })
		.optional()
		.nullable()
		.transform((v) => (v ? new Date(v) : null)),
	periodBefore: z
		.string({
			required_error: "Período antes não informado.",
			invalid_type_error: "Tipo não válido para período antes.",
		})
		.datetime({ message: "Tipo não válido para período antes." })
		.optional()
		.nullable()
		.transform((v) => (v ? new Date(v) : null)),
});
export type TGetCommunityCoursesInput = z.infer<typeof GetCommunityCoursesInputSchema>;
async function getCommunityCourses({ input }: { input: TGetCommunityCoursesInput }) {
	if (input.id) {
		const communityCourse = await db.query.communityCourses.findFirst({
			where: eq(communityCourses.id, input.id),
			with: {
				autor: {
					columns: { id: true, nome: true, avatarUrl: true },
				},
				secoes: {
					orderBy: [asc(communityCourseSections.ordem)],
					columns: { id: true, titulo: true, ordem: true },
					with: {
						aulas: true,
					},
				},
			},
		});
		if (!communityCourse) throw new createHttpError.NotFound("Curso não encontrado.");
		return { data: { byId: communityCourse, default: null }, message: "Curso obtido com sucesso." };
	}
	const PAGE_SIZE = 25;
	const { page, search, status, periodFilter, periodAfter, periodBefore } = input;

	const conditions = [];
	if (search && search.trim().length > 0) {
		conditions.push(createSimplifiedSearchCondition(communityCourses.titulo, search));
	}
	if (status && status.length > 0) {
		conditions.push(inArray(communityCourses.status, status as ("RASCUNHO" | "PUBLICADO" | "ARQUIVADO")[]));
	}
	if (periodFilter && periodAfter && periodBefore) {
		if (periodFilter === "dataPublicacao") {
			conditions.push(and(gte(communityCourses.dataPublicacao, periodAfter), lte(communityCourses.dataPublicacao, periodBefore)));
		}
		if (periodFilter === "dataInsercao") {
			conditions.push(and(gte(communityCourses.dataInsercao, periodAfter), lte(communityCourses.dataInsercao, periodBefore)));
		}
	}

	const [{ communityCoursesMatched }] = await db
		.select({ communityCoursesMatched: count() })
		.from(communityCourses)
		.where(and(...conditions));

	if (communityCoursesMatched === 0) {
		return {
			data: {
				default: { communityCourses: [], communityCoursesMatched: 0, totalPages: 0 },
				byId: null,
			},
			message: "Nenhum curso encontrado.",
		};
	}

	const totalPages = Math.ceil(communityCoursesMatched / PAGE_SIZE);

	const communityCoursesResult = await db.query.communityCourses.findMany({
		where: and(...conditions),
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
		offset: PAGE_SIZE * (page - 1),
		limit: PAGE_SIZE,
	});

	return {
		data: { default: { communityCourses: communityCoursesResult, communityCoursesMatched, totalPages }, byId: null },
		message: "Cursos obtidos com sucesso.",
	};
}
export type TGetCommunityCoursesOutput = Awaited<ReturnType<typeof getCommunityCourses>>;
export type TGetCommunityCoursesOutputDefault = NonNullable<TGetCommunityCoursesOutput["data"]["default"]>;
export type TGetCommunityCoursesOutputById = NonNullable<TGetCommunityCoursesOutput["data"]["byId"]>;

async function getCommunityCoursesRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const searchParams = await request.nextUrl.searchParams;
	const input = GetCommunityCoursesInputSchema.parse({
		id: searchParams.get("id") ?? undefined,
		page: searchParams.get("page") ?? 1,
		search: searchParams.get("search") ?? undefined,
		status: searchParams.get("status") ?? undefined,
		periodFilter: searchParams.get("periodFilter") ?? undefined,
		periodAfter: searchParams.get("periodAfter") ?? undefined,
		periodBefore: searchParams.get("periodBefore") ?? undefined,
	});
	const result = await getCommunityCourses({ input });
	return NextResponse.json(result);
}

// ---- POST: Create a course ----

const CreateCommunityCourseInputSchema = z.object({
	communityCourse: CommunityCourseSchema.omit({ dataInsercao: true, autorId: true }),
	communityCourseSections: z.array(CommunityCourseSectionSchema.omit({ dataInsercao: true, cursoId: true })),
});
export type TCreateCommunityCourseInput = z.infer<typeof CreateCommunityCourseInputSchema>;

async function createCommunityCourse({ input, autorId }: { input: TCreateCommunityCourseInput; autorId: string }) {
	const maxOrdem = await db.select({ max: sql<number>`COALESCE(MAX(${communityCourses.ordem}), -1)` }).from(communityCourses);

	const inserted = await db
		.insert(communityCourses)
		.values({
			...input.communityCourse,
			ordem: input.communityCourse.ordem || (maxOrdem[0]?.max ?? -1) + 1,
			autorId,
		})
		.returning({
			id: communityCourses.id,
		});

	const insertedCourseId = inserted[0]?.id;
	if (!insertedCourseId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao criar curso.");

	if (input.communityCourseSections.length > 0) {
		await db.insert(communityCourseSections).values(
			input.communityCourseSections.map((section) => ({
				...section,
				cursoId: insertedCourseId,
			})),
		);
	}
	return { data: { insertedCourseId }, message: "Curso criado com sucesso." };
}
export type TCreateCommunityCourseOutput = Awaited<ReturnType<typeof createCommunityCourse>>;

async function createCommunityCourseRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const payload = await request.json();
	const input = CreateCommunityCourseInputSchema.parse(payload);
	const result = await createCommunityCourse({ input, autorId: session.user.id });
	return NextResponse.json(result);
}

// ---- PUT: Update a course ----

const UpdateCommunityCourseInputSchema = z.object({
	communityCourseId: z.string({
		required_error: "ID do curso não informado.",
		invalid_type_error: "Tipo não válido para ID do curso.",
	}),
	communityCourse: CommunityCourseSchema.omit({ dataInsercao: true, autorId: true }).partial(),
	communityCourseSections: z.array(
		CommunityCourseSectionSchema.omit({ dataInsercao: true, cursoId: true }).extend({
			id: z
				.string({
					required_error: "ID da seção do curso não informado.",
					invalid_type_error: "Tipo não válido para ID da seção do curso.",
				})
				.optional(),
			deletar: z
				.boolean({
					required_error: "Deletar seção do curso não informado.",
					invalid_type_error: "Tipo não válido para deletar seção do curso.",
				})
				.optional(),
		}),
	),
});
export type TUpdateCommunityCourseInput = z.infer<typeof UpdateCommunityCourseInputSchema>;

async function updateCommunityCourse({ input }: { input: TUpdateCommunityCourseInput; session: TAuthUserSession }) {
	return await db.transaction(async (tx) => {
		const updated = await tx.update(communityCourses).set(input.communityCourse).where(eq(communityCourses.id, input.communityCourseId)).returning({
			id: communityCourses.id,
		});

		const updatedCourseId = updated[0]?.id;
		if (!updatedCourseId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao atualizar curso.");

		await handleAdminSimpleChildRowsProcessing({
			trx: tx,
			table: communityCourseSections,
			entities: input.communityCourseSections,
			fatherEntityKey: "cursoId",
			fatherEntityId: updatedCourseId,
		});
		return {
			data: {
				updatedCourseId,
			},
			message: "Curso atualizado com sucesso.",
		};
	});
}
export type TUpdateCommunityCourseOutput = Awaited<ReturnType<typeof updateCommunityCourse>>;

async function updateCommunityCourseRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const payload = await request.json();
	const input = UpdateCommunityCourseInputSchema.parse(payload);
	const result = await updateCommunityCourse({ input, session: session });
	return NextResponse.json(result);
}

// ---- DELETE: Delete a course ----

const DeleteCommunityCourseInputSchema = z.object({
	id: z.string({
		required_error: "ID do curso não informado.",
		invalid_type_error: "Tipo não válido para ID do curso.",
	}),
});
export type TDeleteCommunityCourseInput = z.infer<typeof DeleteCommunityCourseInputSchema>;
async function deleteCommunityCourse({ input }: { input: TDeleteCommunityCourseInput }) {
	const deleted = await db.delete(communityCourses).where(eq(communityCourses.id, input.id)).returning({ id: communityCourses.id });
	const deletedCourseId = deleted[0]?.id;
	if (!deletedCourseId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao deletar curso.");

	return { data: { deletedCourseId }, message: "Curso excluído com sucesso." };
}
export type TDeleteCommunityCourseOutput = Awaited<ReturnType<typeof deleteCommunityCourse>>;

async function deleteCommunityCourseRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const { searchParams } = new URL(request.url);
	const id = searchParams.get("id");
	if (!id) throw new createHttpError.BadRequest("ID do curso não informado.");

	const input = DeleteCommunityCourseInputSchema.parse({ id });
	const result = await deleteCommunityCourse({ input });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getCommunityCoursesRoute });
export const POST = appApiHandler({ POST: createCommunityCourseRoute });
export const PUT = appApiHandler({ PUT: updateCommunityCourseRoute });
export const DELETE = appApiHandler({ DELETE: deleteCommunityCourseRoute });
