import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { CommunityLessonProgressSchema } from "@/schemas/community";
import { db } from "@/services/drizzle";
import { communityLessonProgress } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";

// GET: Get progress for authenticated user
async function getProgressRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Faça login para ver seu progresso.");

	const { searchParams } = new URL(request.url);
	const cursoId = searchParams.get("cursoId");

	let progress;
	if (cursoId) {
		// Get progress for lessons in a specific course (via sections → lessons)
		progress = await db.query.communityLessonProgress.findMany({
			where: eq(communityLessonProgress.usuarioId, session.user.id),
			with: {
				aula: {
					columns: { id: true, secaoId: true },
					with: {
						secao: {
							columns: { id: true, cursoId: true },
						},
					},
				},
			},
		});
		// Filter to only the requested course
		progress = progress.filter((p) => p.aula?.secao?.cursoId === cursoId);
	} else {
		progress = await db.query.communityLessonProgress.findMany({
			where: eq(communityLessonProgress.usuarioId, session.user.id),
		});
	}

	return NextResponse.json({ data: progress });
}

// POST: Upsert progress for a lesson
async function upsertProgressRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Faça login para registrar progresso.");

	const payload = await request.json();
	const input = CommunityLessonProgressSchema.parse(payload);

	const existing = await db.query.communityLessonProgress.findFirst({
		where: and(
			eq(communityLessonProgress.usuarioId, session.user.id),
			eq(communityLessonProgress.aulaId, input.aulaId),
		),
	});

	if (existing) {
		const updated = await db
			.update(communityLessonProgress)
			.set({
				concluido: input.concluido,
				progressoSegundos: input.progressoSegundos,
				dataConclusao: input.concluido ? new Date() : null,
				dataUltimaVisualizacao: new Date(),
			})
			.where(eq(communityLessonProgress.id, existing.id))
			.returning();
		return NextResponse.json({ data: updated[0], message: "Progresso atualizado." });
	}

	const inserted = await db
		.insert(communityLessonProgress)
		.values({
			usuarioId: session.user.id,
			aulaId: input.aulaId,
			concluido: input.concluido,
			progressoSegundos: input.progressoSegundos,
			dataConclusao: input.concluido ? new Date() : null,
		})
		.returning();

	return NextResponse.json({ data: inserted[0], message: "Progresso registrado." });
}

export const GET = appApiHandler({ GET: getProgressRoute });
export const POST = appApiHandler({ POST: upsertProgressRoute });
