import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { HintFeedbackInputSchema } from "@/schemas/ai-hints";
import { db } from "@/services/drizzle";
import { aiHintFeedback, aiHints } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";

async function submitFeedback(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session?.membership) {
		throw new createHttpError.Unauthorized("Você não está autenticado.");
	}

	const orgId = session.membership.organizacao.id;
	const userId = session.user.id;
	const url = new URL(request.url);

	const body = await request.json();
	const input = HintFeedbackInputSchema.parse({
		id: url.searchParams.get("id"),
		tipo: body.tipo,
		comentario: body.comentario,
	});

	// Verify hint belongs to org
	const hint = await db.query.aiHints.findFirst({
		where: and(eq(aiHints.id, input.id), eq(aiHints.organizacaoId, orgId)),
	});

	if (!hint) {
		throw new createHttpError.NotFound("Dica não encontrada.");
	}

	// Check if user already gave feedback for this hint
	const existingFeedback = await db.query.aiHintFeedback.findFirst({
		where: and(eq(aiHintFeedback.hintId, input.id), eq(aiHintFeedback.usuarioId, userId)),
	});

	if (existingFeedback) {
		// Update existing feedback
		await db
			.update(aiHintFeedback)
			.set({
				tipo: input.tipo,
				comentario: input.comentario,
			})
			.where(eq(aiHintFeedback.id, existingFeedback.id));
	} else {
		// Insert new feedback
		await db.insert(aiHintFeedback).values({
			hintId: input.id,
			usuarioId: userId,
			tipo: input.tipo,
			comentario: input.comentario,
		});
	}

	return NextResponse.json({ message: "Feedback registrado com sucesso." }, { status: 200 });
}

export const POST = appApiHandler({ POST: submitFeedback });
