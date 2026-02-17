import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { db } from "@/services/drizzle";
import { communityCourses, communityCourseSections, communityLessons } from "@/services/drizzle/schema";
import { asc, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";

async function getCourseDetailRoute(request: NextRequest, { params }: { params: Promise<{ courseId: string }> }) {
	const { courseId } = await params;
	const session = await getCurrentSessionUncached();

	const course = await db.query.communityCourses.findFirst({
		where: eq(communityCourses.id, courseId),
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
	if (course.status !== "PUBLICADO") throw new createHttpError.NotFound("Curso não disponível.");

	// Access level check
	if (course.nivelAcesso === "AUTENTICADO" && !session) {
		throw new createHttpError.Unauthorized("Faça login para acessar este curso.");
	}
	if (course.nivelAcesso === "ASSINATURA") {
		if (!session) throw new createHttpError.Unauthorized("Faça login para acessar este curso.");
		// Future: check subscription status
		throw new createHttpError.Forbidden("Este curso requer uma assinatura ativa.");
	}

	return NextResponse.json({ data: course });
}

export const GET = appApiHandler({ GET: getCourseDetailRoute });
