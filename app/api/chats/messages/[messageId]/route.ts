import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { db } from "@/services/drizzle";
import { chatMessages } from "@/services/drizzle/schema/chats";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { NextApiRequestCookies } from "next/dist/server/api-utils";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// ============= PATCH - Update message status =============

const updateMessageBodySchema = z.object({
	status: z.enum(["CANCELADO", "ENVIADO", "RECEBIDO", "LIDO"]).optional(),
	whatsappMessageStatus: z.enum(["PENDENTE", "ENVIADO", "ENTREGUE", "LIDO", "FALHOU"]).optional(),
	whatsappMessageId: z.string().optional(),
});

export type TUpdateMessageInput = z.infer<typeof updateMessageBodySchema>;

async function updateMessage({ session, messageId, input }: { session: TAuthUserSession; messageId: string; input: TUpdateMessageInput }) {
	const organizacaoId = session.membership?.organizacao.id;

	if (!organizacaoId) {
		throw new createHttpError.BadRequest("Você precisa estar vinculado a uma organização.");
	}

	// Verify message belongs to organization
	const message = await db.query.chatMessages.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, messageId), eq(fields.organizacaoId, organizacaoId)),
	});

	if (!message) {
		throw new createHttpError.NotFound("Mensagem não encontrada.");
	}

	// Build update object
	const updateData: Partial<typeof chatMessages.$inferInsert> = {};

	if (input.status) {
		updateData.status = input.status;
	}

	if (input.whatsappMessageStatus) {
		updateData.whatsappMessageStatus = input.whatsappMessageStatus;
	}

	if (input.whatsappMessageId) {
		updateData.whatsappMessageId = input.whatsappMessageId;
	}

	if (Object.keys(updateData).length === 0) {
		throw new createHttpError.BadRequest("Nenhum campo para atualizar.");
	}

	await db.update(chatMessages).set(updateData).where(eq(chatMessages.id, messageId));

	return {
		data: { messageId, ...updateData },
		message: "Mensagem atualizada com sucesso.",
	};
}

export type TUpdateMessageOutput = Awaited<ReturnType<typeof updateMessage>>;

async function updateMessageRoute(req: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado.");

	const messageId = req.nextUrl.searchParams.get("messageId");

	if (!messageId) {
		throw new createHttpError.BadRequest("ID da mensagem é obrigatório.");
	}

	const body = await req.json();
	const input = updateMessageBodySchema.parse(body);

	const result = await updateMessage({ session, messageId, input });
	return NextResponse.json(result, { status: 200 });
}

// ============= Export handlers =============

export const PATCH = appApiHandler({
	PATCH: updateMessageRoute,
});
