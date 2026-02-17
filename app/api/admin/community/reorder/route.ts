import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { db } from "@/services/drizzle";
import { communityCourseSections, communityLessons } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// ---- PUT: Reorder sections or lessons ----

const ReorderItemsSchema = z.array(
	z.object({
		id: z.string({
			required_error: "ID do item não informado.",
			invalid_type_error: "Tipo não válido para o ID do item.",
		}),
		ordem: z
			.number({
				required_error: "Ordem do item não informada.",
				invalid_type_error: "Tipo não válido para a ordem do item.",
			})
			.int(),
	}),
);

const ReorderCommunityCourseSectionsInputSchema = z.object({
	communityCourseSectionReorder: z.object({
		itens: ReorderItemsSchema,
	}),
});
export type TReorderCommunityCourseSectionsInput = z.infer<typeof ReorderCommunityCourseSectionsInputSchema>;

const ReorderCommunityLessonsInputSchema = z.object({
	communityLessonReorder: z.object({
		itens: ReorderItemsSchema,
	}),
});
export type TReorderCommunityLessonsInput = z.infer<typeof ReorderCommunityLessonsInputSchema>;

const ReorderCommunityInputSchema = z.union([
	ReorderCommunityCourseSectionsInputSchema,
	ReorderCommunityLessonsInputSchema,
]);
export type TReorderCommunityInput = z.infer<typeof ReorderCommunityInputSchema>;

async function reorderCommunity({ input }: { input: TReorderCommunityInput }) {
	return await db.transaction(async (tx) => {
		if ("communityCourseSectionReorder" in input) {
			for (const item of input.communityCourseSectionReorder.itens) {
				await tx.update(communityCourseSections).set({ ordem: item.ordem }).where(eq(communityCourseSections.id, item.id));
			}
			return { data: null, message: "Ordem das seções atualizada com sucesso." };
		}

		for (const item of input.communityLessonReorder.itens) {
			await tx.update(communityLessons).set({ ordem: item.ordem }).where(eq(communityLessons.id, item.id));
		}
		return { data: null, message: "Ordem das aulas atualizada com sucesso." };
	});
}
export type TReorderCommunityOutput = Awaited<ReturnType<typeof reorderCommunity>>;

async function reorderCommunityRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const payload = await request.json();
	const input = ReorderCommunityInputSchema.parse(payload);
	const result = await reorderCommunity({ input });
	return NextResponse.json(result);
}

export const PUT = appApiHandler({ PUT: reorderCommunityRoute });
