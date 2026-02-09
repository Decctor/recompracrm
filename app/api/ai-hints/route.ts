import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { GetHintsInputSchema } from "@/schemas/ai-hints";
import { db } from "@/services/drizzle";
import { aiHints } from "@/services/drizzle/schema";
import { and, desc, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";

async function getHints(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session?.membership) {
		throw new createHttpError.Unauthorized("Você não está autenticado.");
	}

	const orgId = session.membership.organizacao.id;
	const url = new URL(request.url);

	const input = GetHintsInputSchema.parse({
		assunto: url.searchParams.get("assunto") || undefined,
		status: url.searchParams.get("status") || "active",
		limite: url.searchParams.get("limite") || 5,
	});

	const conditions = [eq(aiHints.organizacaoId, orgId), eq(aiHints.status, input.status)];

	if (input.assunto) {
		conditions.push(eq(aiHints.assunto, input.assunto));
	}

	const hints = await db.query.aiHints.findMany({
		where: and(...conditions),
		orderBy: [desc(aiHints.relevancia), desc(aiHints.dataInsercao)],
		limit: input.limite,
	});

	return NextResponse.json({ data: hints }, { status: 200 });
}

export const GET = appApiHandler({ GET: getHints });
