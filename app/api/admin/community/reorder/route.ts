import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { CommunityReorderSchema } from "@/schemas/community";
import { db } from "@/services/drizzle";
import { communityCourseSections, communityLessons } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";

async function reorderRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const payload = await request.json();
	const input = CommunityReorderSchema.parse(payload);

	const table = input.tipo === "secao" ? communityCourseSections : communityLessons;

	await db.transaction(async (tx) => {
		for (const item of input.itens) {
			await tx.update(table).set({ ordem: item.ordem }).where(eq(table.id, item.id));
		}
	});

	return NextResponse.json({ message: "Ordem atualizada com sucesso." });
}

export const PUT = appApiHandler({ PUT: reorderRoute });
