import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { db } from "@/services/drizzle";
import { communityCourses, communityCourseSections, communityLessons } from "@/services/drizzle/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const GetPublicCommunityCoursesInputSchema = z.object({
	id: z
		.string({
			required_error: "ID do curso não informado.",
			invalid_type_error: "Tipo não válido para o ID do curso.",
		})
		.optional(),
});
export type TGetPublicCommunityCoursesInput = z.infer<typeof GetPublicCommunityCoursesInputSchema>;

async function getPublicCommunityCourses({ input }: { input: TGetPublicCommunityCoursesInput }) {
	const session = await getCurrentSessionUncached();

	// Allowed access levels depend on auth state.
	const allowedLevels: Array<"PUBLICO" | "AUTENTICADO" | "ASSINATURA"> = ["PUBLICO"];
	if (session) allowedLevels.push("AUTENTICADO", "ASSINATURA");

	// Mode: byId
	if (input.id) {
		const course = await db.query.communityCourses.findFirst({
			where: and(
				eq(communityCourses.id, input.id),
				eq(communityCourses.status, "PUBLICADO"),
				inArray(communityCourses.nivelAcesso, allowedLevels),
			),
			with: {
				autor: {
					columns: { id: true, nome: true, avatarUrl: true },
				},
				secoes: {
					orderBy: [asc(communityCourseSections.ordem)],
					with: {
						aulas: {
							orderBy: [asc(communityLessons.ordem)],
							columns: {
								id: true,
								titulo: true,
								descricao: true,
								tipoConteudo: true,
								duracaoSegundos: true,
								muxAssetStatus: true,
							},
						},
					},
				},
			},
		});

		if (!course) throw new createHttpError.NotFound("Curso não encontrado.");
		if (course.nivelAcesso === "ASSINATURA") {
			throw new createHttpError.Forbidden("Este curso requer uma assinatura ativa.");
		}

		return { data: { byId: course, default: null }, message: "Curso obtido com sucesso." };
	}

	// Mode: default
	const courses = await db.query.communityCourses.findMany({
		where: and(
			eq(communityCourses.status, "PUBLICADO"),
			inArray(communityCourses.nivelAcesso, allowedLevels),
		),
		orderBy: [asc(communityCourses.ordem)],
		columns: {
			id: true,
			titulo: true,
			descricao: true,
			thumbnailUrl: true,
			nivelAcesso: true,
			dataPublicacao: true,
		},
		with: {
			autor: {
				columns: { id: true, nome: true, avatarUrl: true },
			},
			secoes: {
				orderBy: [asc(communityCourseSections.ordem)],
				columns: { id: true, titulo: true },
				with: {
					aulas: {
						orderBy: [asc(communityLessons.ordem)],
						columns: { id: true, titulo: true, tipoConteudo: true, duracaoSegundos: true },
					},
				},
			},
		},
	});

	return { data: { byId: null, default: courses }, message: "Cursos obtidos com sucesso." };
}
export type TGetPublicCommunityCoursesOutput = Awaited<ReturnType<typeof getPublicCommunityCourses>>;
export type TGetPublicCommunityCoursesOutputById = NonNullable<TGetPublicCommunityCoursesOutput["data"]["byId"]>;
export type TGetPublicCommunityCoursesOutputDefault = NonNullable<TGetPublicCommunityCoursesOutput["data"]["default"]>;

async function getPublicCommunityCoursesRoute(request: NextRequest) {
	const input = GetPublicCommunityCoursesInputSchema.parse({
		id: request.nextUrl.searchParams.get("id") ?? undefined,
	});
	const result = await getPublicCommunityCourses({ input });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getPublicCommunityCoursesRoute });
