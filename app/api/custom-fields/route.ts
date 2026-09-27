import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { resolveNativeCustomField } from "@/lib/custom-fields/native-catalog";
import { assertCustomFieldNotUsedByActiveSurvey, assertCustomFieldOptionsNotFrozen } from "@/lib/message-templates/survey-guards";
import { CustomFieldSchema } from "@/schemas/custom-fields";
import { CustomFieldEntityEnum, CustomFieldTypeEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { clientCustomFieldValues, customFields } from "@/services/drizzle/schema";
import { type SQL, and, count, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

/** Campos de escolha só fazem sentido com opções; os demais não devem carregar nenhuma. */
const CHOICE_FIELD_TYPES = ["ESCOLHA_UNICA", "ESCOLHA_MULTIPLA"];

function getSessionOrganizationId(session: TAuthUserSession) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	return organizationId;
}

const GetCustomFieldsInputSchema = z.object({
	id: z.string({ invalid_type_error: "Tipo inválido para o ID do campo personalizado." }).optional().nullable(),
	entidade: CustomFieldEntityEnum.optional().nullable(),
	ativoOnly: z
		.string({ invalid_type_error: "Tipo inválido para ativo." })
		.optional()
		.nullable()
		.transform((value) => value === "true"),
});
export type TGetCustomFieldsInput = z.infer<typeof GetCustomFieldsInputSchema>;

async function getCustomFields({ input, session }: { input: TGetCustomFieldsInput; session: TAuthUserSession }) {
	const organizationId = getSessionOrganizationId(session);

	if (input.id) {
		const customField = await db.query.customFields.findFirst({
			where: and(eq(customFields.id, input.id), eq(customFields.organizacaoId, organizationId)),
		});
		if (!customField) throw new createHttpError.NotFound("Campo personalizado não encontrado.");

		return {
			data: { byId: customField, default: null },
			message: "Campo personalizado encontrado com sucesso.",
		};
	}

	const conditions: SQL[] = [eq(customFields.organizacaoId, organizationId)];
	if (input.entidade) conditions.push(eq(customFields.entidade, input.entidade));
	if (input.ativoOnly) conditions.push(eq(customFields.ativo, true));

	const customFieldsResult = await db.query.customFields.findMany({
		where: and(...conditions),
		orderBy: (fields, { asc }) => asc(fields.dataInsercao),
	});

	return {
		data: { byId: null, default: { customFields: customFieldsResult } },
		message: "Campos personalizados encontrados com sucesso.",
	};
}
export type TGetCustomFieldsOutput = Awaited<ReturnType<typeof getCustomFields>>;
export type TGetCustomFieldsOutputById = Exclude<TGetCustomFieldsOutput["data"]["byId"], null>;
export type TGetCustomFieldsOutputDefault = Exclude<TGetCustomFieldsOutput["data"]["default"], null>;

async function getCustomFieldsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const input = GetCustomFieldsInputSchema.parse({
		id: request.nextUrl.searchParams.get("id") ?? undefined,
		entidade: request.nextUrl.searchParams.get("entidade") ?? undefined,
		ativoOnly: request.nextUrl.searchParams.get("ativoOnly") ?? undefined,
	});
	const result = await getCustomFields({ input, session });
	return NextResponse.json(result, { status: 200 });
}

/**
 * `titulo` e `tipo` são opcionais na entrada porque um campo nativo os herda do catálogo — para
 * campos próprios da organização eles voltam a ser obrigatórios, validado no serviço.
 */
const CreateCustomFieldInputSchema = z.object({
	customField: CustomFieldSchema.omit({
		organizacaoId: true,
		dataInsercao: true,
		dataAtualizacao: true,
		titulo: true,
		tipo: true,
	}).extend({
		titulo: z
			.string({ invalid_type_error: "Tipo não válido para o título do campo personalizado." })
			.optional()
			.nullable(),
		tipo: CustomFieldTypeEnum.optional().nullable(),
	}),
});
export type TCreateCustomFieldInput = z.infer<typeof CreateCustomFieldInputSchema>;

async function createCustomField({ input, session }: { input: TCreateCustomFieldInput; session: TAuthUserSession }) {
	const organizationId = getSessionOrganizationId(session);
	const { customField } = input;

	const nativeField = customField.chaveNativa ? resolveNativeCustomField(customField.chaveNativa) : null;
	if (customField.chaveNativa && !nativeField) {
		throw new createHttpError.BadRequest("Chave nativa desconhecida para campo personalizado.");
	}

	// O catálogo é a autoridade sobre o `tipo` de um campo nativo: é o que dá sentido à
	// segmentação pronta e ao write-through. Título e opções são apenas semeados.
	const titulo = customField.titulo?.trim() || nativeField?.titulo;
	const tipo = nativeField?.tipo ?? customField.tipo;
	if (!titulo) throw new createHttpError.BadRequest("Título do campo personalizado não informado.");
	if (!tipo) throw new createHttpError.BadRequest("Tipo do campo personalizado não informado.");

	const opcoes = CHOICE_FIELD_TYPES.includes(tipo) ? (customField.opcoes ?? nativeField?.opcoes ?? []) : null;
	if (opcoes && opcoes.length === 0) throw new createHttpError.BadRequest("Campos de escolha precisam de ao menos uma opção.");

	if (customField.chaveNativa) {
		const existingNativeField = await db.query.customFields.findFirst({
			where: and(eq(customFields.organizacaoId, organizationId), eq(customFields.chaveNativa, customField.chaveNativa)),
			columns: { id: true },
		});
		if (existingNativeField) throw new createHttpError.BadRequest("Esse campo já está ativado para a sua organização.");
	}

	const insertedCustomFields = await db
		.insert(customFields)
		.values({
			organizacaoId: organizationId,
			entidade: customField.entidade,
			chaveNativa: customField.chaveNativa ?? null,
			titulo,
			descricao: customField.descricao ?? null,
			tipo,
			opcoes,
			ativo: customField.ativo,
		})
		.returning({ id: customFields.id });
	const insertedId = insertedCustomFields[0]?.id;
	if (!insertedId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao criar o campo personalizado.");

	return {
		data: { insertedId },
		message: "Campo personalizado criado com sucesso.",
	};
}
export type TCreateCustomFieldOutput = Awaited<ReturnType<typeof createCustomField>>;

async function createCustomFieldRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const payload = await request.json();
	const input = CreateCustomFieldInputSchema.parse(payload);
	const result = await createCustomField({ input, session });
	return NextResponse.json(result, { status: 200 });
}

/**
 * `entidade` e `chaveNativa` são imutáveis: mudá-las reescreveria o significado dos valores já
 * gravados. `tipo` só muda em campo próprio e sem valores — ver o serviço.
 */
const UpdateCustomFieldInputSchema = z.object({
	customFieldId: z.string({
		required_error: "ID do campo personalizado não informado.",
		invalid_type_error: "Tipo não válido para o ID do campo personalizado.",
	}),
	customField: CustomFieldSchema.pick({ titulo: true, descricao: true, opcoes: true, ativo: true }).extend({
		tipo: CustomFieldTypeEnum.optional().nullable(),
	}),
});
export type TUpdateCustomFieldInput = z.infer<typeof UpdateCustomFieldInputSchema>;

async function updateCustomField({ input, session }: { input: TUpdateCustomFieldInput; session: TAuthUserSession }) {
	const organizationId = getSessionOrganizationId(session);
	const { customField } = input;

	const existingCustomField = await db.query.customFields.findFirst({
		where: and(eq(customFields.id, input.customFieldId), eq(customFields.organizacaoId, organizationId)),
	});
	if (!existingCustomField) throw new createHttpError.NotFound("Campo personalizado não encontrado.");

	let tipo = existingCustomField.tipo;
	if (customField.tipo && customField.tipo !== existingCustomField.tipo) {
		if (existingCustomField.chaveNativa) {
			throw new createHttpError.BadRequest("O tipo de um campo nativo é definido pela plataforma e não pode ser alterado.");
		}
		// Trocar o tipo com valores gravados os tornaria ilegíveis (uma escolha vira texto solto).
		const storedValuesResult = await db
			.select({ total: count() })
			.from(clientCustomFieldValues)
			.where(eq(clientCustomFieldValues.campoId, existingCustomField.id));
		if ((storedValuesResult[0]?.total ?? 0) > 0) {
			throw new createHttpError.BadRequest("Esse campo já possui respostas registradas e não pode ter o tipo alterado.");
		}
		tipo = customField.tipo;
	}

	const opcoes = CHOICE_FIELD_TYPES.includes(tipo) ? (customField.opcoes ?? []) : null;
	if (opcoes && opcoes.length === 0) throw new createHttpError.BadRequest("Campos de escolha precisam de ao menos uma opção.");

	// Guardas das pesquisas: opções que são botões de template não somem, e um campo que recebe
	// respostas de uma pesquisa ativa não é desativado (lib/message-templates/survey-guards.ts).
	await assertCustomFieldOptionsNotFrozen({
		organizationId,
		fieldId: existingCustomField.id,
		currentOptions: existingCustomField.opcoes,
		nextOptions: opcoes,
	});
	if (existingCustomField.ativo && !customField.ativo) {
		await assertCustomFieldNotUsedByActiveSurvey({ organizationId, fieldId: existingCustomField.id });
	}

	const updatedCustomFields = await db
		.update(customFields)
		.set({
			titulo: customField.titulo,
			descricao: customField.descricao ?? null,
			tipo,
			opcoes,
			ativo: customField.ativo,
			dataAtualizacao: new Date(),
		})
		.where(and(eq(customFields.id, input.customFieldId), eq(customFields.organizacaoId, organizationId)))
		.returning({ id: customFields.id });
	const updatedId = updatedCustomFields[0]?.id;
	if (!updatedId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao atualizar o campo personalizado.");

	return {
		data: { updatedId },
		message: "Campo personalizado atualizado com sucesso.",
	};
}
export type TUpdateCustomFieldOutput = Awaited<ReturnType<typeof updateCustomField>>;

async function updateCustomFieldRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const payload = await request.json();
	const input = UpdateCustomFieldInputSchema.parse(payload);
	const result = await updateCustomField({ input, session });
	return NextResponse.json(result, { status: 200 });
}

const DeleteCustomFieldInputSchema = z.object({
	id: z.string({
		required_error: "ID do campo personalizado não informado.",
		invalid_type_error: "Tipo não válido para o ID do campo personalizado.",
	}),
});
export type TDeleteCustomFieldInput = z.infer<typeof DeleteCustomFieldInputSchema>;

/**
 * Desativação, nunca exclusão física: as respostas gravadas referenciam a definição, e apagá-la
 * levaria junto o histórico que alimenta a segmentação e a análise.
 */
async function deleteCustomField({ input, session }: { input: TDeleteCustomFieldInput; session: TAuthUserSession }) {
	const organizationId = getSessionOrganizationId(session);
	await assertCustomFieldNotUsedByActiveSurvey({ organizationId, fieldId: input.id });

	const deactivatedCustomFields = await db
		.update(customFields)
		.set({ ativo: false, dataAtualizacao: new Date() })
		.where(and(eq(customFields.id, input.id), eq(customFields.organizacaoId, organizationId)))
		.returning({ id: customFields.id });
	const deactivatedId = deactivatedCustomFields[0]?.id;
	if (!deactivatedId) throw new createHttpError.NotFound("Campo personalizado não encontrado.");

	return {
		data: { deactivatedId },
		message: "Campo personalizado desativado com sucesso.",
	};
}
export type TDeleteCustomFieldOutput = Awaited<ReturnType<typeof deleteCustomField>>;

async function deleteCustomFieldRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const input = DeleteCustomFieldInputSchema.parse({ id: request.nextUrl.searchParams.get("id") ?? undefined });
	const result = await deleteCustomField({ input, session });
	return NextResponse.json(result, { status: 200 });
}

export const GET = appApiHandler({ GET: getCustomFieldsRoute });
export const POST = appApiHandler({ POST: createCustomFieldRoute });
export const PUT = appApiHandler({ PUT: updateCustomFieldRoute });
export const DELETE = appApiHandler({ DELETE: deleteCustomFieldRoute });
