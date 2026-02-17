import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { db } from "@/services/drizzle";
import { communityCourses, communityCourseSections, communityLessons } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";

async function getLessonRoute(request: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
	const { lessonId } = await params;
	const session = await getCurrentSessionUncached();

	const lesson = await db.query.communityLessons.findFirst({
		where: eq(communityLessons.id, lessonId),
		with: {
			secao: {
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

	// Access level check
	if (course.nivelAcesso === "AUTENTICADO" && !session) {
		throw new createHttpError.Unauthorized("Faça login para acessar esta aula.");
	}
	if (course.nivelAcesso === "ASSINATURA") {
		if (!session) throw new createHttpError.Unauthorized("Faça login para acessar esta aula.");
		throw new createHttpError.Forbidden("Este curso requer uma assinatura ativa.");
	}

	return NextResponse.json({
		data: {
			id: lesson.id,
			titulo: lesson.titulo,
			descricao: lesson.descricao,
			tipoConteudo: lesson.tipoConteudo,
			conteudoTexto: lesson.conteudoTexto,
			duracaoSegundos: lesson.duracaoSegundos,
			muxPlaybackId: lesson.muxPlaybackId,
			muxAssetStatus: lesson.muxAssetStatus,
			secaoId: lesson.secaoId,
			cursoId: course.id,
			cursoTitulo: course.titulo,
		},
	});
}

export const GET = appApiHandler({ GET: getLessonRoute });
