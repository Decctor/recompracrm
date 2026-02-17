import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { InternalLeadNoteSchema } from "@/schemas/internal-leads";
import { db } from "@/services/drizzle";
import { internalLeadNotes } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// ==================== GET - List Notes by Lead ====================

const GetNotesInputSchema = z.object({
	id: z
		.string({
			required_error: "ID da nota não informado.",
			invalid_type_error: "ID da nota não válido.",
		})
		.optional(),
	leadId: z
		.string({
			required_error: "ID do lead não informado.",
			invalid_type_error: "ID do lead não válido.",
		})
		.optional(),
});
export type TGetNotesInput = z.infer<typeof GetNotesInputSchema>;

async function getNotes(input: TGetNotesInput) {
	const inputId = input.id;
	const inputLeadId = input.leadId;
	if (inputId) {
		const note = await db.query.internalLeadNotes.findFirst({
			where: (fields, { eq }) => eq(fields.id, inputId),
			with: {
				autor: {
					columns: {
						id: true,
						nome: true,
						avatarUrl: true,
					},
				},
			},
		});
		if (!note) throw new createHttpError.NotFound("Nota não encontrada.");
		return {
			data: {
				byId: note,
				byLeadId: null,
				default: null,
			},
			message: "Nota obtida com sucesso.",
		};
	}
	if (inputLeadId) {
		const notes = await db.query.internalLeadNotes.findMany({
			where: (fields, { eq }) => eq(fields.leadId, inputLeadId),
			with: {
				autor: {
					columns: {
						id: true,
						nome: true,
						avatarUrl: true,
					},
				},
			},
			orderBy: (fields, { desc }) => [desc(fields.dataInsercao)],
		});
		return {
			data: { byLeadId: notes, byId: null, default: null },
			message: "Notas obtidas com sucesso.",
		};
	}

	const notes = await db.query.internalLeadNotes.findMany({
		with: {
			autor: {
				columns: {
					id: true,
					nome: true,
					avatarUrl: true,
				},
			},
		},
		orderBy: (fields, { desc }) => [desc(fields.dataInsercao)],
	});
	return {
		data: { default: notes, byLeadId: null, byId: null },
		message: "Notas obtidas com sucesso.",
	};
}
export type TGetNotesOutput = Awaited<ReturnType<typeof getNotes>>;
export type TGetNotesOutputDefault = NonNullable<TGetNotesOutput["data"]["default"]>;
export type TGetNotesOutputByLeadId = NonNullable<TGetNotesOutput["data"]["byLeadId"]>;
export type TGetNotesOutputById = NonNullable<TGetNotesOutput["data"]["byId"]>;

async function getNotesRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
	const input = GetNotesInputSchema.parse(searchParams);
	const result = await getNotes(input);
	return NextResponse.json(result);
}

// ==================== POST - Create Note ====================

const CreateNoteInputSchema = z.object({
	note: InternalLeadNoteSchema,
});
export type TCreateNoteInput = z.infer<typeof CreateNoteInputSchema>;

async function createNote({ input, autorId }: { input: TCreateNoteInput; autorId: string }) {
	const inserted = await db
		.insert(internalLeadNotes)
		.values({
			...input.note,
			autorId,
		})
		.returning({ id: internalLeadNotes.id });

	const noteId = inserted[0]?.id;
	if (!noteId) throw new createHttpError.InternalServerError("Erro ao criar nota.");

	return {
		data: { insertedId: noteId },
		message: "Nota criada com sucesso.",
	};
}
export type TCreateNoteOutput = Awaited<ReturnType<typeof createNote>>;

async function createNoteRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const payload = await request.json();
	const input = CreateNoteInputSchema.parse(payload);
	const result = await createNote({ input, autorId: session.user.id });
	return NextResponse.json(result);
}

// ==================== PUT - Update Note ====================

const UpdateNoteInputSchema = z.object({
	conteudo: z.string(),
});
export type TUpdateNoteInput = z.infer<typeof UpdateNoteInputSchema>;

async function updateNote({ id, input }: { id: string; input: TUpdateNoteInput }) {
	const existing = await db.query.internalLeadNotes.findFirst({
		where: (fields, { eq }) => eq(fields.id, id),
	});
	if (!existing) throw new createHttpError.NotFound("Nota não encontrada.");

	await db.update(internalLeadNotes).set({ conteudo: input.conteudo }).where(eq(internalLeadNotes.id, id));

	return {
		data: { updatedId: id },
		message: "Nota atualizada com sucesso.",
	};
}
export type TUpdateNoteOutput = Awaited<ReturnType<typeof updateNote>>;

async function updateNoteRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const id = request.nextUrl.searchParams.get("id");
	if (!id) throw new createHttpError.BadRequest("ID da nota não informado.");

	const payload = await request.json();
	const input = UpdateNoteInputSchema.parse(payload);
	const result = await updateNote({ id, input });
	return NextResponse.json(result);
}

// ==================== DELETE - Delete Note ====================

const DeleteNoteInputSchema = z.object({
	id: z.string({
		required_error: "ID da nota não informado.",
		invalid_type_error: "ID da nota não válido.",
	}),
});
export type TDeleteNoteInput = z.infer<typeof DeleteNoteInputSchema>;
async function deleteNote({ input }: { input: TDeleteNoteInput }) {
	const id = input.id;
	const existing = await db.query.internalLeadNotes.findFirst({
		where: (fields, { eq }) => eq(fields.id, id),
	});
	if (!existing) throw new createHttpError.NotFound("Nota não encontrada.");

	await db.delete(internalLeadNotes).where(eq(internalLeadNotes.id, id));

	return {
		data: { deletedId: id },
		message: "Nota deletada com sucesso.",
	};
}
export type TDeleteNoteOutput = Awaited<ReturnType<typeof deleteNote>>;

async function deleteNoteRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const id = request.nextUrl.searchParams.get("id");
	if (!id) throw new createHttpError.BadRequest("ID da nota não informado.");

	const input = DeleteNoteInputSchema.parse({ id });
	const result = await deleteNote({ input });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getNotesRoute });
export const POST = appApiHandler({ POST: createNoteRoute });
export const PUT = appApiHandler({ PUT: updateNoteRoute });
export const DELETE = appApiHandler({ DELETE: deleteNoteRoute });
