import { ClientTagSchema } from "@/schemas/clients";
import { db } from "@/services/drizzle";
import { clientTags } from "@/services/drizzle/schema/clients";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import z from "zod";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { assertCanManageClientBase } from "@/lib/clients/access";
import { appApiHandler } from "@/lib/app-api";
import { TAuthUserSession } from "@/lib/authentication/types";

async function getClientTagsService({ session }: { session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const tags = await db.query.clientTags.findMany({
		where: eq(clientTags.organizacaoId, userOrgId),
	});

	return {
		data: {
			default: tags,
		},
		message: "Tags encontradas com sucesso.",
	};
}
export type TGetClientTagsOutput = Awaited<ReturnType<typeof getClientTagsService>>;

async function getClientTagsRoute() {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const result = await getClientTagsService({ session: sessionUser });
	return NextResponse.json(result);
}
export const GET = appApiHandler({ GET: getClientTagsRoute });

const CreateClientTagInputSchema = ClientTagSchema.omit({
	organizacaoId: true,
	autorId: true,
	dataInsercao: true,
});
export type TCreateClientTagInput = z.infer<typeof CreateClientTagInputSchema>;

async function createClientTagService({ input, session }: { input: TCreateClientTagInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const insertResponse = await db
		.insert(clientTags)
		.values({
			...input,
			organizacaoId: userOrgId,
			autorId: session.user.id,
		})
		.returning({ id: clientTags.id });

	const insertedId = insertResponse[0]?.id;
	if (!insertedId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao criar tag.");
	return {
		data: {
			insertedId: insertedId,
		},
		message: "Tag criada com sucesso.",
	};
}
export type TCreateClientTagOutput = Awaited<ReturnType<typeof createClientTagService>>;

async function createClientTagRoute(req: NextRequest) {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");
	// Criar e renomear tags muda o vocabulário da base inteira: clientes.gerenciarBase. Aplicar uma tag
	// existente a um cliente é edição do cliente (PUT /api/clients).
	assertCanManageClientBase(sessionUser);

	const input = await req.json();
	const validatedInput = CreateClientTagInputSchema.parse(input);

	const result = await createClientTagService({ input: validatedInput, session: sessionUser });
	return NextResponse.json(result);
}
export const POST = appApiHandler({ POST: createClientTagRoute });

const UpdateClientTagInputSchema = z.object({
	clientTagId: z.string({ invalid_type_error: "Tipo não válido para o ID da tag." }),
	clientTag: ClientTagSchema.omit({
		organizacaoId: true,
		autorId: true,
		dataInsercao: true,
	}),
});
export type TUpdateClientTagInput = z.infer<typeof UpdateClientTagInputSchema>;

async function updateClientTagService({ input, session }: { input: TUpdateClientTagInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const updatedResponse = await db
		.update(clientTags)
		.set({ ...input.clientTag, organizacaoId: userOrgId })
		.where(and(eq(clientTags.id, input.clientTagId), eq(clientTags.organizacaoId, userOrgId)))
		.returning({ id: clientTags.id });
	const updatedId = updatedResponse[0]?.id;
	if (!updatedId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao atualizar tag.");
	return {
		data: {
			updatedId: updatedId,
		},
		message: "Tag atualizada com sucesso.",
	};
}
export type TUpdateClientTagOutput = Awaited<ReturnType<typeof updateClientTagService>>;

async function updateClientTagRoute(req: NextRequest) {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");
	assertCanManageClientBase(sessionUser);

	const input = await req.json();
	const validatedInput = UpdateClientTagInputSchema.parse(input);

	const result = await updateClientTagService({ input: validatedInput, session: sessionUser });
	return NextResponse.json(result);
}
export const PUT = appApiHandler({ PUT: updateClientTagRoute });
