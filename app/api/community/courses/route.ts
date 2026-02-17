import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { db } from "@/services/drizzle";
import { communityCourses, communityCourseSections, communityLessons } from "@/services/drizzle/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

async function getPublicCoursesRoute(_request: NextRequest) {
	const session = await getCurrentSessionUncached();

	// Determine allowed access levels based on auth
	const allowedLevels: Array<"PUBLICO" | "AUTENTICADO" | "ASSINATURA"> = ["PUBLICO"];
	if (session) {
		allowedLevels.push("AUTENTICADO");
	}

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

	return NextResponse.json({ data: courses });
}
export type TGetPublicCoursesOutput = { data: Awaited<ReturnType<typeof getPublicCoursesRoute>> extends NextResponse<infer U> ? U : never };

export const GET = appApiHandler({ GET: getPublicCoursesRoute });
