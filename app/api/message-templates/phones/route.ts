import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { assertCanPublishCommunication } from "@/lib/communication/access";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { lockConnectedWhatsappPhone, mergeMessageTemplatePhoneMetadataSql, removeMessageTemplatePhoneMetadataSql } from "@/lib/db-utils";
import { db } from "@/services/drizzle";
import { messageTemplates } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import z from "zod";
import {
	buildWhatsappSubmissionPhoneMetadata,
	deleteMessageTemplateFromMetaPhones,
	submitMessageTemplateToWhatsappPhone,
	syncMessageTemplateFromMetaForPhone,
} from "@/lib/message-templates";
import { getOrganizationWhatsappPhones } from "@/lib/whatsapp/organization-phones";

const MessageTemplatePhoneInputSchema = z.object({
	messageTemplateId: z.string({ required_error: "ID do template não informado." }),
	telefoneId: z.string({ required_error: "ID do telefone não informado." }),
});
const DeleteMessageTemplatePhoneInputSchema = MessageTemplatePhoneInputSchema.extend({
	deleteFromMeta: z
		.string()
		.optional()
		.nullable()
		.transform((value) => value !== "false"),
});

export type TCreateMessageTemplatePhoneInput = z.infer<typeof MessageTemplatePhoneInputSchema>;
export type TSyncMessageTemplatePhoneInput = z.infer<typeof MessageTemplatePhoneInputSchema>;
export type TDeleteMessageTemplatePhoneInput = z.infer<typeof DeleteMessageTemplatePhoneInputSchema>;

async function getTemplateAndPhone({ input, organizationId }: { input: z.infer<typeof MessageTemplatePhoneInputSchema>; organizationId: string }) {
	const template = await db.query.messageTemplates.findFirst({
		where: and(eq(messageTemplates.id, input.messageTemplateId), eq(messageTemplates.organizacaoId, organizationId)),
	});
	if (!template) throw new createHttpError.NotFound("Template não encontrado.");

	const phones = await getOrganizationWhatsappPhones(organizationId);
	const phone = phones.find((item) => item.id === input.telefoneId);
	if (!phone) throw new createHttpError.NotFound("Telefone não encontrado.");

	return { organizationId, template, phone };
}

export async function createMessageTemplatePhone({ input, organizationId }: { input: TCreateMessageTemplatePhoneInput; organizationId: string }) {
	const { template, phone } = await getTemplateAndPhone({ input, organizationId });
	const result = await submitMessageTemplateToWhatsappPhone({
		template,
		phone,
		organizationId,
		mode: "create",
	});
	// A submissão à Meta acima abre uma janela entre a leitura do template e a gravação: mesclar apenas a
	// chave deste telefone, sobre o valor atual da linha, evita reintroduzir telefones desconectados nesse
	// intervalo.
	const persisted = await db.transaction(async (tx) => {
		const connected = await lockConnectedWhatsappPhone({ trx: tx, organizationId, phoneId: phone.id });
		if (!connected) return false;

		const updatedRows = await tx
			.update(messageTemplates)
			.set({
				metadados: mergeMessageTemplatePhoneMetadataSql({
					entries: { [phone.id]: buildWhatsappSubmissionPhoneMetadata(result.idExterno) },
					mode: "replace",
				}),
				dataAtualizacao: new Date(),
			})
			.where(and(eq(messageTemplates.id, template.id), eq(messageTemplates.organizacaoId, organizationId)))
			.returning({ id: messageTemplates.id });
		return updatedRows.length > 0;
	});
	if (!persisted) throw new createHttpError.Conflict("O telefone foi desconectado durante a vinculação do template.");

	return { data: result, message: "Template vinculado ao telefone com sucesso." };
}
export type TCreateMessageTemplatePhoneOutput = Awaited<ReturnType<typeof createMessageTemplatePhone>>;

async function createMessageTemplatePhoneRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	// Vincular, sincronizar ou desvincular um telefone é falar com a Meta em nome da organização: publicar.
	assertCanPublishCommunication(session);
	const input = MessageTemplatePhoneInputSchema.parse(await request.json());
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	const result = await createMessageTemplatePhone({ input, organizationId });
	return NextResponse.json(result, { status: 201 });
}

export async function syncMessageTemplatePhone({ input, organizationId }: { input: TSyncMessageTemplatePhoneInput; organizationId: string }) {
	const { template, phone } = await getTemplateAndPhone({ input, organizationId });
	const patch = await syncMessageTemplateFromMetaForPhone({ template, phone });
	const phoneMetadata = patch.metadados.porNumeroTelefone[phone.id];
	if (!phoneMetadata) throw new createHttpError.InternalServerError("Patch de sincronização não produziu metadados para o telefone.");

	const persisted = await db.transaction(async (tx) => {
		const connected = await lockConnectedWhatsappPhone({ trx: tx, organizationId, phoneId: phone.id });
		if (!connected) return false;

		const updatedRows = await tx
			.update(messageTemplates)
			.set({
				nome: patch.nome,
				categoria: patch.categoria,
				linguagem: patch.linguagem,
				conteudo: patch.conteudo,
				metadados: mergeMessageTemplatePhoneMetadataSql({ entries: { [phone.id]: phoneMetadata }, mode: "replace" }),
				alerta: patch.alerta,
				dataAtualizacao: new Date(),
			})
			.where(and(eq(messageTemplates.id, template.id), eq(messageTemplates.organizacaoId, organizationId)))
			.returning({ id: messageTemplates.id });
		return updatedRows.length > 0;
	});
	if (!persisted) throw new createHttpError.Conflict("O telefone foi desconectado durante a sincronização.");

	return { data: { synced: true as const, templateName: patch.nome }, message: "Template sincronizado com a Meta." };
}
export type TSyncMessageTemplatePhoneOutput = Awaited<ReturnType<typeof syncMessageTemplatePhone>>;

async function syncMessageTemplatePhoneRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	assertCanPublishCommunication(session);
	const input = MessageTemplatePhoneInputSchema.parse(await request.json());
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	const result = await syncMessageTemplatePhone({ input, organizationId });
	return NextResponse.json(result, { status: 200 });
}

async function deleteMessageTemplatePhone({ input, session }: { input: TDeleteMessageTemplatePhoneInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	const { template, phone } = await getTemplateAndPhone({ input, organizationId });
	const metaResults = input.deleteFromMeta ? await deleteMessageTemplateFromMetaPhones({ template, phones: [phone] }) : [];
	await db
		.update(messageTemplates)
		.set({
			metadados: removeMessageTemplatePhoneMetadataSql(phone.id),
			dataAtualizacao: new Date(),
		})
		.where(and(eq(messageTemplates.id, template.id), eq(messageTemplates.organizacaoId, organizationId)));

	return { data: { deleted: true as const, metaResults }, message: "Vínculo do template com o telefone removido." };
}
export type TDeleteMessageTemplatePhoneOutput = Awaited<ReturnType<typeof deleteMessageTemplatePhone>>;

async function deleteMessageTemplatePhoneRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	assertCanPublishCommunication(session);
	const input = DeleteMessageTemplatePhoneInputSchema.parse({
		messageTemplateId: request.nextUrl.searchParams.get("messageTemplateId") ?? undefined,
		telefoneId: request.nextUrl.searchParams.get("telefoneId") ?? undefined,
		deleteFromMeta: request.nextUrl.searchParams.get("deleteFromMeta") ?? undefined,
	});
	const result = await deleteMessageTemplatePhone({ input, session });
	return NextResponse.json(result, { status: 200 });
}

export const POST = appApiHandler({ POST: createMessageTemplatePhoneRoute });
export const PUT = appApiHandler({ PUT: syncMessageTemplatePhoneRoute });
export const DELETE = appApiHandler({ DELETE: deleteMessageTemplatePhoneRoute });
