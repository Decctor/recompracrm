import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { assertCanPublishCommunication } from "@/lib/communication/access";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { lockConnectedWhatsappPhone, mergeMessageTemplatePhoneMetadataSql } from "@/lib/db-utils";
import { db } from "@/services/drizzle";
import { messageTemplates } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import z from "zod";
import {
	buildRemoteTemplateIndexes,
	buildWhatsappTemplateSyncPatch,
	listMetaTemplatesForPhone,
	resolveRemoteTemplate,
} from "@/lib/message-templates";
import { getOrganizationWhatsappPhones, type TOrganizationWhatsappPhone } from "@/lib/whatsapp/organization-phones";

const SYNC_LOG_PREFIX = "[MESSAGE_TEMPLATES_SYNC]";

function formatPhoneForLog(phone: TOrganizationWhatsappPhone) {
	return `${phone.nome} (${phone.numero}) [id=${phone.id}, waba=${phone.whatsappBusinessAccountId ?? "n/a"}]`;
}

const SyncMessageTemplatesInputSchema = z.object({
	telefoneId: z.string({ invalid_type_error: "Tipo inválido para ID do telefone." }).optional().nullable(),
	messageTemplateId: z.string({ invalid_type_error: "Tipo inválido para ID do template." }).optional().nullable(),
});
export type TSyncMessageTemplatesInput = z.infer<typeof SyncMessageTemplatesInputSchema>;

async function syncMessageTemplates({ input, session }: { input: TSyncMessageTemplatesInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const phones = await getOrganizationWhatsappPhones(organizationId);
	const phonesToSync = input.telefoneId ? phones.filter((phone) => phone.id === input.telefoneId) : phones;
	if (input.telefoneId && phonesToSync.length === 0) throw new createHttpError.NotFound("Telefone não encontrado.");

	const templates = input.messageTemplateId
		? await db.query.messageTemplates.findMany({
				where: and(eq(messageTemplates.id, input.messageTemplateId), eq(messageTemplates.organizacaoId, organizationId)),
			})
		: await db.query.messageTemplates.findMany({
				where: eq(messageTemplates.organizacaoId, organizationId),
			});
	const templateStateById = new Map(templates.map((template) => [template.id, template]));

	if (input.messageTemplateId && templates.length === 0) throw new createHttpError.NotFound("Template não encontrado.");

	const details: Array<{
		telefoneId: string;
		telefoneNumero: string;
		templateName: string;
		action: "updated" | "skipped" | "error";
		error?: string;
	}> = [];
	const phoneErrors: Array<{
		telefoneId: string;
		telefoneNumero: string;
		telefoneNome: string;
		whatsappBusinessAccountId: string | null;
		error: string;
	}> = [];
	let updated = 0;
	let skipped = 0;
	let errors = 0;
	let phonesFailed = 0;

	console.log(
		`${SYNC_LOG_PREFIX} Iniciando sync para ${phonesToSync.length} telefone(s) e ${templates.length} template(s): ${phonesToSync.map((phone) => formatPhoneForLog(phone)).join("; ")}`,
	);

	for (const phone of phonesToSync) {
		let remoteIndexes: ReturnType<typeof buildRemoteTemplateIndexes>;

		try {
			const remoteTemplates = await listMetaTemplatesForPhone(phone);
			remoteIndexes = buildRemoteTemplateIndexes(remoteTemplates);
			console.log(`${SYNC_LOG_PREFIX} Templates listados com sucesso para ${formatPhoneForLog(phone)}: ${remoteTemplates.length} encontrado(s).`);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
			phonesFailed += 1;
			phoneErrors.push({
				telefoneId: phone.id,
				telefoneNumero: phone.numero,
				telefoneNome: phone.nome,
				whatsappBusinessAccountId: phone.whatsappBusinessAccountId,
				error: errorMessage,
			});
			console.error(`${SYNC_LOG_PREFIX} Falha ao listar templates na Meta para ${formatPhoneForLog(phone)}:`, error);

			for (const template of templates) {
				errors += 1;
				details.push({
					telefoneId: phone.id,
					telefoneNumero: phone.numero,
					templateName: template.nome,
					action: "error",
					error: errorMessage,
				});
			}
			continue;
		}

		for (const templateSnapshot of templates) {
			const template = templateStateById.get(templateSnapshot.id) ?? templateSnapshot;
			const metadataForPhone = template.metadados.porNumeroTelefone[phone.id];
			const remote = resolveRemoteTemplate({ indexes: remoteIndexes, template, metadataForPhone });

			if (!remote) {
				skipped += 1;
				details.push({ telefoneId: phone.id, telefoneNumero: phone.numero, templateName: template.nome, action: "skipped" });
				continue;
			}

			try {
				const patch = buildWhatsappTemplateSyncPatch({
					template,
					connectionId: phone.id,
					metaTemplate: remote,
				});
				const phoneMetadata = patch.metadados.porNumeroTelefone[phone.id];
				if (!phoneMetadata) throw new Error("Patch de sincronização não produziu metadados para o telefone.");
				const dataAtualizacao = new Date();

				// A mescla dos metadados acontece dentro do UPDATE, sobre o valor atual da linha, e a condição
				// do telefone descarta a gravação caso ele tenha sido desconectado durante a sincronização.
				const persisted = await db.transaction(async (tx) => {
					const connected = await lockConnectedWhatsappPhone({
						trx: tx,
						organizationId,
						phoneId: phone.id,
					});
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
							dataAtualizacao,
						})
						.where(and(eq(messageTemplates.id, template.id), eq(messageTemplates.organizacaoId, organizationId)))
						.returning({ id: messageTemplates.id });
					return updatedRows.length > 0;
				});

				if (!persisted) {
					skipped += 1;
					console.warn(
						`${SYNC_LOG_PREFIX} Telefone desconectado durante a sincronização; template "${template.nome}" não atualizado para ${formatPhoneForLog(phone)}.`,
					);
					details.push({ telefoneId: phone.id, telefoneNumero: phone.numero, templateName: template.nome, action: "skipped" });
					continue;
				}

				templateStateById.set(template.id, {
					...template,
					...patch,
					dataAtualizacao,
				});
				updated += 1;
				details.push({ telefoneId: phone.id, telefoneNumero: phone.numero, templateName: template.nome, action: "updated" });
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
				errors += 1;
				console.error(`${SYNC_LOG_PREFIX} Falha ao sincronizar template "${template.nome}" para ${formatPhoneForLog(phone)}:`, error);
				details.push({
					telefoneId: phone.id,
					telefoneNumero: phone.numero,
					templateName: template.nome,
					action: "error",
					error: errorMessage,
				});
			}
		}
	}

	const phonesSucceeded = phonesToSync.length - phonesFailed;
	console.log(
		`${SYNC_LOG_PREFIX} Sync finalizado: ${phonesSucceeded}/${phonesToSync.length} telefone(s) ok, ${updated} atualizado(s), ${skipped} ignorado(s), ${errors} erro(s).`,
	);
	if (phoneErrors.length > 0) {
		console.error(
			`${SYNC_LOG_PREFIX} Telefones com falha:`,
			phoneErrors.map((phoneError) => ({
				telefoneId: phoneError.telefoneId,
				telefoneNumero: phoneError.telefoneNumero,
				telefoneNome: phoneError.telefoneNome,
				whatsappBusinessAccountId: phoneError.whatsappBusinessAccountId,
				error: phoneError.error,
			})),
		);
	}

	const phoneFailureSuffix = phonesFailed > 0 ? ` ${phonesFailed} telefone(s) com falha.` : "";

	return {
		data: {
			summary: { phonesProcessed: phonesToSync.length, phonesFailed, updated, skipped, errors },
			phoneErrors,
			details,
		},
		message: `Sincronização concluída. ${updated} atualizado(s), ${skipped} ignorado(s), ${errors} erro(s).${phoneFailureSuffix}`,
	};
}
export type TSyncMessageTemplatesOutput = Awaited<ReturnType<typeof syncMessageTemplates>>;

async function syncMessageTemplatesRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	assertCanPublishCommunication(session);
	const input = SyncMessageTemplatesInputSchema.parse(await request.json());
	const result = await syncMessageTemplates({ input, session });
	return NextResponse.json(result, { status: 200 });
}

export const POST = appApiHandler({ POST: syncMessageTemplatesRoute });
