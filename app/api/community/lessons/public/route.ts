import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { db } from "@/services/drizzle";
import { communityLessons } from "@/services/drizzle/schema";
import { asc, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const GetPublicCommunityLessonsInputSchema = z.object({
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
export type TGetPublicCommunityLessonsInput = z.infer<typeof GetPublicCommunityLessonsInputSchema>;

type TPublicLessonCourse = {
	id: string;
	titulo: string;
	nivelAcesso: "PUBLICO" | "AUTENTICADO" | "ASSINATURA";
	status: "RASCUNHO" | "PUBLICADO" | "ARQUIVADO";
};

function buildAllowedLevels(session: Awaited<ReturnType<typeof getCurrentSessionUncached>>) {
	const allowedLevels: Array<TPublicLessonCourse["nivelAcesso"]> = ["PUBLICO"];
	if (session) allowedLevels.push("AUTENTICADO", "ASSINATURA");
	return allowedLevels;
}

function mapLessonOutput(lesson: {
	id: string;
	titulo: string;
	descricao: string | null;
	tipoConteudo: "VIDEO" | "TEXTO" | "VIDEO_TEXTO";
	conteudoTexto: string | null;
	duracaoSegundos: number | null;
	muxPlaybackId: string | null;
	muxAssetStatus: "AGUARDANDO" | "PROCESSANDO" | "PRONTO" | "ERRO" | null;
	secaoId: string;
	secao: {
		titulo: string;
		curso: TPublicLessonCourse;
	};
}) {
	return {
		id: lesson.id,
		titulo: lesson.titulo,
		descricao: lesson.descricao,
		tipoConteudo: lesson.tipoConteudo,
		conteudoTexto: lesson.conteudoTexto,
		duracaoSegundos: lesson.duracaoSegundos,
		muxPlaybackId: lesson.muxPlaybackId,
		muxAssetStatus: lesson.muxAssetStatus,
		secaoId: lesson.secaoId,
		secaoTitulo: lesson.secao.titulo,
		cursoId: lesson.secao.curso.id,
		cursoTitulo: lesson.secao.curso.titulo,
	};
}

async function getPublicCommunityLessons({ input }: { input: TGetPublicCommunityLessonsInput }) {
	const session = await getCurrentSessionUncached();
	const allowedLevels = buildAllowedLevels(session);

	if (input.id) {
		const lesson = await db.query.communityLessons.findFirst({
			where: eq(communityLessons.id, input.id),
			with: {
				secao: {
					columns: { titulo: true },
					with: {
						curso: {
							columns: { id: true, titulo: true, nivelAcesso: true, status: true },
						},
					},
				},
			},
		});

		if (!lesson) throw new createHttpError.NotFound("Aula não encontrada.");
		const course = lesson.secao.curso;
		if (course.status !== "PUBLICADO") throw new createHttpError.NotFound("Curso não disponível.");
		if (course.nivelAcesso === "AUTENTICADO" && !session) {
			throw new createHttpError.Unauthorized("Faça login para acessar esta aula.");
		}
		if (course.nivelAcesso === "ASSINATURA") {
			if (!session) throw new createHttpError.Unauthorized("Faça login para acessar esta aula.");
			throw new createHttpError.Forbidden("Este curso requer uma assinatura ativa.");
		}

		return {
			data: {
				byId: mapLessonOutput(lesson),
				byCourseId: null,
				byCourseSectionId: null,
				default: null,
			},
			message: "Aula obtida com sucesso.",
		};
	}

	const allLessons = await db.query.communityLessons.findMany({
		orderBy: [asc(communityLessons.ordem), asc(communityLessons.dataInsercao)],
		with: {
			secao: {
				columns: { titulo: true, cursoId: true },
				with: {
					curso: {
						columns: { id: true, titulo: true, nivelAcesso: true, status: true },
					},
				},
			},
		},
	});

	const filtered = allLessons.filter((lesson) => {
		const course = lesson.secao.curso;
		if (course.status !== "PUBLICADO") return false;
		return allowedLevels.includes(course.nivelAcesso);
	});

	const mapped = filtered.map(mapLessonOutput);

	if (input.courseSectionId) {
		return {
			data: {
				byId: null,
				byCourseId: null,
				byCourseSectionId: mapped.filter((lesson) => lesson.secaoId === input.courseSectionId),
				default: null,
			},
			message: "Aulas da seção obtidas com sucesso.",
		};
	}

	if (input.courseId) {
		return {
			data: {
				byId: null,
				byCourseId: mapped.filter((lesson) => lesson.cursoId === input.courseId),
				byCourseSectionId: null,
				default: null,
			},
			message: "Aulas do curso obtidas com sucesso.",
		};
	}

	return {
		data: {
			byId: null,
			byCourseId: null,
			byCourseSectionId: null,
			default: mapped,
		},
		message: "Aulas obtidas com sucesso.",
	};
}
export type TGetPublicCommunityLessonsOutput = Awaited<ReturnType<typeof getPublicCommunityLessons>>;
export type TGetPublicCommunityLessonsOutputDefault = NonNullable<TGetPublicCommunityLessonsOutput["data"]["default"]>;
export type TGetPublicCommunityLessonsOutputById = NonNullable<TGetPublicCommunityLessonsOutput["data"]["byId"]>;
export type TGetPublicCommunityLessonsOutputByCourseId = NonNullable<TGetPublicCommunityLessonsOutput["data"]["byCourseId"]>;
export type TGetPublicCommunityLessonsOutputByCourseSectionId = NonNullable<TGetPublicCommunityLessonsOutput["data"]["byCourseSectionId"]>;

async function getPublicCommunityLessonsRoute(request: NextRequest) {
	const input = GetPublicCommunityLessonsInputSchema.parse({
		id: request.nextUrl.searchParams.get("id") ?? undefined,
		courseId: request.nextUrl.searchParams.get("courseId") ?? undefined,
		courseSectionId: request.nextUrl.searchParams.get("courseSectionId") ?? undefined,
	});
	const result = await getPublicCommunityLessons({ input });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getPublicCommunityLessonsRoute });
