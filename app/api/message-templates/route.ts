import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { lockConnectedWhatsappPhone, mergeMessageTemplatePhoneMetadataSql } from "@/lib/db-utils";
import { MessageTemplateSchema } from "@/schemas/message-templates";
import { db } from "@/services/drizzle";
import { messageTemplates } from "@/services/drizzle/schema";
import { and, count, eq, or, type SQL, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import z from "zod";
import {
	applyWhatsappSubmissionResultToMetadata,
	assertMessageTemplateValidForWhatsapp,
	buildWhatsappSubmissionPhoneMetadata,
	createEmptyMessageTemplateMetadata,
	deleteMessageTemplateFromMetaPhones,
	normalizeMessageTemplateContentParameters,
	submitMessageTemplateToWhatsappPhone,
	withComputedMessageTemplateStatus,
} from "@/lib/message-templates";
import { getOrganizationWhatsappPhoneIds, getOrganizationWhatsappPhones } from "@/lib/whatsapp/organization-phones";
import { createSimplifiedSearchCondition } from "@/lib/search";

// `metadados` é derivado das submissões à Meta e dos webhooks, nunca do cliente: aceitá-lo no payload
// permitiria que uma aba aberta antes de uma desconexão regravasse entradas de telefones já removidos.
export const CreateMessageTemplateInputSchema = z.object({
	messageTemplate: MessageTemplateSchema.omit({ autorId: true, dataInsercao: true, metadados: true }),
	submitWhatsapp: z.boolean().optional().default(true),
});
export type TCreateMessageTemplateInput = z.infer<typeof CreateMessageTemplateInputSchema>;

async function persistWhatsappSubmissionPhoneMetadata({
	templateId,
	organizationId,
	phoneId,
	idExterno,
}: {
	templateId: string;
	organizationId: string;
	phoneId: string;
	idExterno: string | null;
}) {
	return db.transaction(async (tx) => {
		const connected = await lockConnectedWhatsappPhone({ trx: tx, organizationId, phoneId });
		if (!connected) return false;

		const updatedRows = await tx
			.update(messageTemplates)
			.set({
				metadados: mergeMessageTemplatePhoneMetadataSql({
					entries: { [phoneId]: buildWhatsappSubmissionPhoneMetadata(idExterno) },
					mode: "replace",
				}),
				dataAtualizacao: new Date(),
			})
			.where(and(eq(messageTemplates.id, templateId), eq(messageTemplates.organizacaoId, organizationId)))
			.returning({ id: messageTemplates.id });

		return updatedRows.length > 0;
	});
}

export async function createMessageTemplate({
	input,
	organizationId,
	authorId,
}: {
	input: TCreateMessageTemplateInput;
	organizationId: string;
	authorId: string;
}) {
	const content = normalizeMessageTemplateContentParameters(input.messageTemplate.conteudo);
	assertMessageTemplateValidForWhatsapp(content);

	const [insertedTemplate] = await db
		.insert(messageTemplates)
		.values({
			...input.messageTemplate,
			organizacaoId: organizationId,
			nome: input.messageTemplate.nome,
			status: input.messageTemplate.status,
			alerta: input.messageTemplate.alerta,
			metadados: createEmptyMessageTemplateMetadata(),
			conteudo: content,
			linguagem: input.messageTemplate.linguagem,
			categoria: input.messageTemplate.categoria,
			autorId: authorId,
		})
		.returning();

	if (!input.submitWhatsapp) {
		return {
			data: { insertedId: insertedTemplate.id, phoneResults: null },
			message: "Template criado com sucesso.",
		};
	}

	const phones = await getOrganizationWhatsappPhones(organizationId);
	// if (phones.length === 0) throw new createHttpError.NotFound("Nenhum telefone cadastrado na conexão WhatsApp.");

	let nextMetadata = insertedTemplate.metadados;
	const phoneResults = [];

	for (const phone of phones) {
		try {
			const result = await submitMessageTemplateToWhatsappPhone({
				template: { ...insertedTemplate, metadados: nextMetadata },
				phone,
				organizationId,
				mode: "create",
			});
			nextMetadata = applyWhatsappSubmissionResultToMetadata({
				metadata: nextMetadata,
				phoneId: phone.id,
				idExterno: result.idExterno,
			});
			const persisted = await persistWhatsappSubmissionPhoneMetadata({
				templateId: insertedTemplate.id,
				organizationId,
				phoneId: phone.id,
				idExterno: result.idExterno,
			});
			if (!persisted) {
				phoneResults.push({
					...result,
					success: false as const,
					message: "O telefone foi desconectado durante a criação do template.",
				});
				continue;
			}
			phoneResults.push(result);
		} catch (error) {
			phoneResults.push({ phoneId: phone.id, success: false, idExterno: null, message: error instanceof Error ? error.message : "Erro desconhecido" });
		}
	}

	const successful = phoneResults.filter((result) => result.success).length;
	const failed = phoneResults.length - successful;
	if (successful === 0 && failed > 0) throw new createHttpError.BadRequest(phoneResults[0]?.message || "Erro ao criar template na Meta.");

	return {
		data: {
			insertedId: insertedTemplate.id,
			phoneResults: { successful, failed, details: phoneResults },
		},
		message: failed > 0 ? `Template criado com ${successful} telefone(s) e ${failed} falha(s).` : "Template criado com sucesso em todos os telefones.",
	};
}
export type TCreateMessageTemplateOutput = Awaited<ReturnType<typeof createMessageTemplate>>;

async function createMessageTemplateRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const payload = await request.json();
	const input = CreateMessageTemplateInputSchema.parse(payload);
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	const result = await createMessageTemplate({ input, organizationId, authorId: session.user.id });
	return NextResponse.json(result, { status: 201 });
}

export const UpdateMessageTemplateInputSchema = z.object({
	messageTemplateId: z.string({ required_error: "ID do template não informado." }),
	messageTemplate: MessageTemplateSchema.omit({ autorId: true, dataInsercao: true, metadados: true }).partial(),
	submitWhatsapp: z.boolean().optional().default(true),
});
export type TUpdateMessageTemplateInput = z.infer<typeof UpdateMessageTemplateInputSchema>;

export async function updateMessageTemplate({ input, organizationId }: { input: TUpdateMessageTemplateInput; organizationId: string }) {
	const existingTemplate = await db.query.messageTemplates.findFirst({
		where: and(eq(messageTemplates.id, input.messageTemplateId), eq(messageTemplates.organizacaoId, organizationId)),
	});
	if (!existingTemplate) throw new createHttpError.NotFound("Template não encontrado.");

	console.log("[UPDATE_MESSAGE_TEMPLATE] Content pre-normalization:", JSON.stringify(input.messageTemplate.conteudo, null, 2));

	const content = input.messageTemplate.conteudo
		? normalizeMessageTemplateContentParameters(input.messageTemplate.conteudo)
		: existingTemplate.conteudo;
	assertMessageTemplateValidForWhatsapp(content);
	console.log("[UPDATE_MESSAGE_TEMPLATE] Content post-normalization:", JSON.stringify(content, null, 2));

	const updateSet = {
		nome: input.messageTemplate.nome ?? existingTemplate.nome,
		status: input.messageTemplate.status ?? existingTemplate.status,
		alerta: input.messageTemplate.alerta === undefined ? existingTemplate.alerta : input.messageTemplate.alerta,
		conteudo: content,
		linguagem: input.messageTemplate.linguagem ?? existingTemplate.linguagem,
		categoria: input.messageTemplate.categoria ?? existingTemplate.categoria,
		dataAtualizacao: new Date(),
	};
	const updatedLocal = { ...existingTemplate, ...updateSet };

	await db
		.update(messageTemplates)
		.set(updateSet)
		.where(and(eq(messageTemplates.id, existingTemplate.id), eq(messageTemplates.organizacaoId, organizationId)));

	if (!input.submitWhatsapp || (!input.messageTemplate.conteudo && !input.messageTemplate.categoria)) {
		return {
			data: { updatedId: existingTemplate.id, phoneResults: null },
			message: "Template atualizado com sucesso.",
		};
	}

	const phones = await getOrganizationWhatsappPhones(organizationId);
	let nextMetadata = updatedLocal.metadados;
	const phoneResults = [];

	for (const phone of phones) {
		try {
			const result = await submitMessageTemplateToWhatsappPhone({
				template: { ...updatedLocal, metadados: nextMetadata },
				phone,
				organizationId,
				mode: "upsert",
			});
			nextMetadata = applyWhatsappSubmissionResultToMetadata({ metadata: nextMetadata, phoneId: phone.id, idExterno: result.idExterno });
			const persisted = await persistWhatsappSubmissionPhoneMetadata({
				templateId: existingTemplate.id,
				organizationId,
				phoneId: phone.id,
				idExterno: result.idExterno,
			});
			if (!persisted) {
				phoneResults.push({
					...result,
					success: false as const,
					message: "O telefone foi desconectado durante a atualização do template.",
				});
				continue;
			}
			phoneResults.push(result);
		} catch (error) {
			phoneResults.push({ phoneId: phone.id, success: false, idExterno: null, message: error instanceof Error ? error.message : "Erro desconhecido" });
		}
	}

	const successful = phoneResults.filter((result) => result.success).length;
	const failed = phoneResults.length - successful;
	if (successful === 0 && failed > 0) throw new createHttpError.BadRequest(phoneResults[0]?.message || "Erro ao atualizar template na Meta.");

	return {
		data: { updatedId: existingTemplate.id, phoneResults: { successful, failed, details: phoneResults } },
		message:
			failed > 0 ? `Template atualizado com ${successful} telefone(s) e ${failed} falha(s).` : "Template atualizado com sucesso em todos os telefones.",
	};
}
export type TUpdateMessageTemplateOutput = Awaited<ReturnType<typeof updateMessageTemplate>>;

async function updateMessageTemplateRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const input = UpdateMessageTemplateInputSchema.parse(await request.json());
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	const result = await updateMessageTemplate({ input, organizationId });
	return NextResponse.json(result, { status: 200 });
}

const DeleteMessageTemplateInputSchema = z.object({
	id: z.string({ required_error: "ID do template não informado." }),
	deleteFromMeta: z
		.string()
		.optional()
		.nullable()
		.transform((value) => value !== "false"),
});
export type TDeleteMessageTemplateInput = z.infer<typeof DeleteMessageTemplateInputSchema>;

async function deleteMessageTemplate({ input, session }: { input: TDeleteMessageTemplateInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	const template = await db.query.messageTemplates.findFirst({
		where: and(eq(messageTemplates.id, input.id), eq(messageTemplates.organizacaoId, organizationId)),
	});
	if (!template) throw new createHttpError.NotFound("Template não encontrado.");

	const phones = input.deleteFromMeta ? await getOrganizationWhatsappPhones(organizationId) : [];
	const metaResults = input.deleteFromMeta ? await deleteMessageTemplateFromMetaPhones({ template, phones }) : [];
	await db.delete(messageTemplates).where(eq(messageTemplates.id, template.id));

	return {
		data: { deleted: true as const, metaResults },
		message: "Template excluído com sucesso.",
	};
}
export type TDeleteMessageTemplateOutput = Awaited<ReturnType<typeof deleteMessageTemplate>>;

async function deleteMessageTemplateRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const input = DeleteMessageTemplateInputSchema.parse({
		id: request.nextUrl.searchParams.get("id") ?? undefined,
		deleteFromMeta: request.nextUrl.searchParams.get("deleteFromMeta") ?? undefined,
	});
	const result = await deleteMessageTemplate({ input, session });
	return NextResponse.json(result, { status: 200 });
}

const DEFAULT_PAGE_SIZE = 25;
/** Teto da janela que um consumidor pode pedir de uma vez. */
const MAX_PAGE_SIZE = 100;

export const GetMessageTemplatesInputSchema = z.object({
	id: z
		.string({
			invalid_type_error: "Tipo inválido para ID do template.",
		})
		.optional()
		.nullable(),
	page: z
		.string()
		.optional()
		.nullable()
		.transform((value) => (value ? Number(value) : 1)),
	search: z
		.string({
			invalid_type_error: "Tipo inválido para busca.",
		})
		.optional()
		.nullable(),
	pageSize: z
		.union([z.string(), z.number()])
		.nullable()
		.transform((value) => {
			const parsed = value === null || value === "" ? DEFAULT_PAGE_SIZE : Number(value);
			if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PAGE_SIZE;
			return Math.min(Math.trunc(parsed), MAX_PAGE_SIZE);
		})
		// `.optional()` por último mantém a CHAVE opcional no tipo inferido — com o `.transform()`
		// por fora, todo consumidor existente passaria a ser obrigado a informar `pageSize`.
		.optional(),
});
export type TGetMessageTemplatesInput = z.infer<typeof GetMessageTemplatesInputSchema>;

export async function getMessageTemplates({ input, organizationId }: { input: TGetMessageTemplatesInput; organizationId: string }) {
	if (input.id) {
		const [template, connectedPhoneIds] = await Promise.all([
			db.query.messageTemplates.findFirst({
				where: and(eq(messageTemplates.id, input.id), eq(messageTemplates.organizacaoId, organizationId)),
				with: { autor: { columns: { id: true, nome: true, avatarUrl: true } } },
			}),
			getOrganizationWhatsappPhoneIds(organizationId),
		]);
		if (!template) throw new createHttpError.NotFound("Template não encontrado.");
		return {
			data: { byId: withComputedMessageTemplateStatus(template, connectedPhoneIds), default: null },
			message: "Template encontrado com sucesso.",
		};
	}

	const PAGE_SIZE = input.pageSize ?? DEFAULT_PAGE_SIZE;
	const page = input.page || 1;
	const conditions: SQL[] = [eq(messageTemplates.organizacaoId, organizationId)];
	if (input.search?.trim()) {
		// Busca por nome OU pelo corpo da mensagem. O corpo guarda as variáveis como `{{clientName}}`,
		// então procurar pelo identificador de uma variável também cai aqui.
		const term = input.search;
		conditions.push(
			or(
				createSimplifiedSearchCondition(messageTemplates.nome, term),
				createSimplifiedSearchCondition(sql`${messageTemplates.conteudo}->'corpo'->>'conteudo'`, term),
			) as SQL,
		);
	}

	const [templatesMatchedResult, templates, connectedPhoneIds] = await Promise.all([
		db
			.select({ count: count() })
			.from(messageTemplates)
			.where(and(...conditions)),
		db.query.messageTemplates.findMany({
			where: and(...conditions),
			with: { autor: { columns: { id: true, nome: true, avatarUrl: true } } },
			orderBy: (fields, { desc }) => desc(fields.dataInsercao),
			offset: PAGE_SIZE * (page - 1),
			limit: PAGE_SIZE,
		}),
		getOrganizationWhatsappPhoneIds(organizationId),
	]);
	const templatesMatchedCount = templatesMatchedResult[0].count as number;

	return {
		data: {
			byId: null,
			default: {
				messageTemplates: templates.map((template) => withComputedMessageTemplateStatus(template, connectedPhoneIds)),
				messageTemplatesMatched: templatesMatchedCount,
				totalPages: Math.ceil(templatesMatchedCount / PAGE_SIZE),
			},
		},
		message: "Templates encontrados com sucesso.",
	};
}
export type TGetMessageTemplatesOutput = Awaited<ReturnType<typeof getMessageTemplates>>;
export type TGetMessageTemplatesOutputDefault = Exclude<TGetMessageTemplatesOutput["data"]["default"], null>;
export type TGetMessageTemplatesOutputById = Exclude<TGetMessageTemplatesOutput["data"]["byId"], null>;

async function getMessageTemplatesRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const input = GetMessageTemplatesInputSchema.parse({
		id: request.nextUrl.searchParams.get("id") ?? undefined,
		search: request.nextUrl.searchParams.get("search") ?? undefined,
		page: request.nextUrl.searchParams.get("page") ?? undefined,
		pageSize: request.nextUrl.searchParams.get("pageSize") ?? undefined,
	});
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	const result = await getMessageTemplates({ input, organizationId });
	return NextResponse.json(result, { status: 200 });
}

export const GET = appApiHandler({ GET: getMessageTemplatesRoute });
export const POST = appApiHandler({ POST: createMessageTemplateRoute });
export const PUT = appApiHandler({ PUT: updateMessageTemplateRoute });
export const DELETE = appApiHandler({ DELETE: deleteMessageTemplateRoute });
