import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { DismissHintInputSchema } from "@/schemas/ai-hints";
import { db } from "@/services/drizzle";
import { aiHints } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";

async function dismissHint(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session?.membership) {
		throw new createHttpError.Unauthorized("Você não está autenticado.");
	}

	const orgId = session.membership.organizacao.id;
	const userId = session.user.id;
	const url = new URL(request.url);

	const input = DismissHintInputSchema.parse({
		id: url.searchParams.get("id"),
	});

	// Verify hint belongs to org
	const hint = await db.query.aiHints.findFirst({
		where: and(eq(aiHints.id, input.id), eq(aiHints.organizacaoId, orgId)),
	});

	if (!hint) {
		throw new createHttpError.NotFound("Dica não encontrada.");
	}

	// Update hint status to dismissed
	await db
		.update(aiHints)
		.set({
			status: "dismissed",
			descartadaPor: userId,
			dataDescarte: new Date(),
		})
		.where(eq(aiHints.id, input.id));

	return NextResponse.json({ message: "Dica descartada com sucesso." }, { status: 200 });
}

export const POST = appApiHandler({ POST: dismissHint });
