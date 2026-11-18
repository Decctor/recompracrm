import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { assertCanEditCommunication } from "@/lib/communication/access";
import { EmailTemplate, sendEmailWithResend } from "@/lib/email";
import {
	buildWhatsappTemplateSendPayload,
	getDefaultAppOrigin,
	replaceMessageTemplateVariables,
	type TMessageTemplateRuntimeValues,
	validateMessageTemplateForEmail,
} from "@/lib/message-templates";
import { sendTemplateWhatsappMessage } from "@/lib/whatsapp";
import { MessageTemplateVariableExampleValues } from "@/lib/message-templates/variables";
import { db } from "@/services/drizzle";
import { clients, messageTemplates, organizations } from "@/services/drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";
import { getOrganizationWhatsappPhones } from "@/lib/whatsapp/organization-phones";

const TestMessageTemplateInputSchema = z.object({
	messageTemplateId: z.string({
		required_error: "ID do template não informado.",
		invalid_type_error: "Tipo não válido para o ID do template.",
	}),
	clientIds: z
		.array(
			z.string({
				required_error: "ID do cliente não informado.",
				invalid_type_error: "Tipo não válido para o ID do cliente.",
			}),
		)
		.min(1, "Selecione pelo menos um cliente para o teste."),
});
export type TTestMessageTemplateInput = z.infer<typeof TestMessageTemplateInputSchema>;

function buildRuntimeVariables(client: {
	nome: string;
	telefone: string;
	email: string | null;
	analiseRFMTitulo: string | null;
	metadataGrupoProdutoMaisComprado: string | null;
}): TMessageTemplateRuntimeValues {
	return {
		...MessageTemplateVariableExampleValues,
		clientName: client.nome,
		clientPhoneNumber: client.telefone,
		clientEmail: client.email ?? "",
		clientSegmentation: client.analiseRFMTitulo ?? "",
		clientFavoriteProductGroup: client.metadataGrupoProdutoMaisComprado ?? "",
	};
}

async function testMessageTemplate({ input, organizationId }: { input: TTestMessageTemplateInput; organizationId: string }) {
	const [template, organization, selectedClients, phones] = await Promise.all([
		db.query.messageTemplates.findFirst({
			where: and(eq(messageTemplates.id, input.messageTemplateId), eq(messageTemplates.organizacaoId, organizationId)),
		}),
		db.query.organizations.findFirst({
			where: eq(organizations.id, organizationId),
			columns: {
				id: true,
				nome: true,
				logoUrl: true,
				corPrimaria: true,
				corPrimariaForeground: true,
			},
		}),
		db.query.clients.findMany({
			where: and(eq(clients.organizacaoId, organizationId), inArray(clients.id, input.clientIds)),
			columns: {
				id: true,
				nome: true,
				telefone: true,
				email: true,
				analiseRFMTitulo: true,
				metadataGrupoProdutoMaisComprado: true,
			},
		}),
		getOrganizationWhatsappPhones(organizationId),
	]);

	if (!template) throw new createHttpError.NotFound("Template não encontrado.");
	if (!organization) throw new createHttpError.NotFound("Organização não encontrada.");
	if (selectedClients.length === 0) throw new createHttpError.BadRequest("Nenhum cliente válido encontrado.");

	const emailValidation = validateMessageTemplateForEmail(template.conteudo);
	const approvedPhones = phones.filter((phone) => {
		const metadata = template.metadados.porNumeroTelefone[phone.id];
		return metadata?.status === "APROVADO" && phone.conexao.tipoConexao === "META_CLOUD_API" && phone.conexao.token && phone.whatsappTelefoneId;
	});
	const whatsappPhone = approvedPhones[0] ?? null;
	const origin = getDefaultAppOrigin();

	console.log("[TEST_MESSAGE_TEMPLATE] Debug:", {
		templateMetadata: template.metadados,
		organizationPhones: phones,
	});
	const results: Array<{
		clientId: string;
		clientName: string;
		whatsapp: { skipped: boolean; success: boolean; error?: string };
		email: { skipped: boolean; success: boolean; error?: string };
	}> = [];

	for (const client of selectedClients) {
		console.log("[TEST_MESSAGE_TEMPLATE] Sending test to client:", client.nome);
		const variables = buildRuntimeVariables(client);
		const clientResult = {
			clientId: client.id,
			clientName: client.nome,
			whatsapp: { skipped: false, success: false, error: undefined as string | undefined },
			email: { skipped: false, success: false, error: undefined as string | undefined },
		};

		if (!client.telefone) {
			clientResult.whatsapp = { skipped: true, success: false, error: "Cliente não possui telefone." };
		} else if (!whatsappPhone?.conexao.token || !whatsappPhone.whatsappTelefoneId) {
			clientResult.whatsapp = { skipped: true, success: false, error: "Nenhum telefone aprovado na Meta para este template." };
		} else {
			try {
				const payload = buildWhatsappTemplateSendPayload({
					template,
					toPhoneNumber: client.telefone,
					runtimeContext: {
						origin,
						organizacaoId: organizationId,
						clienteId: client.id,
						variaveis: variables,
					},
				});
				await sendTemplateWhatsappMessage({
					fromPhoneNumberId: whatsappPhone.whatsappTelefoneId,
					templatePayload: payload,
					whatsappToken: whatsappPhone.conexao.token,
				});
				clientResult.whatsapp = { skipped: false, success: true, error: undefined };
			} catch (error) {
				clientResult.whatsapp = { skipped: false, success: false, error: error instanceof Error ? error.message : "Erro desconhecido no WhatsApp." };
			}
		}

		if (!client.email) {
			clientResult.email = { skipped: true, success: false, error: "Cliente não possui email." };
		} else if (!emailValidation.valid) {
			clientResult.email = {
				skipped: true,
				success: false,
				error: emailValidation.issues
					.filter((issue) => issue.severity === "error")
					.map((issue) => issue.message)
					.join(", "),
			};
		} else {
			try {
				await sendEmailWithResend(
					client.email,
					EmailTemplate.MessageTemplate,
					{
						content: {
							...template.conteudo,
							assunto: replaceMessageTemplateVariables(template.conteudo.assunto, variables),
						},
						variables,
						organization: {
							id: organization.id,
							name: organization.nome,
							logoUrl: organization.logoUrl,
							primaryColor: organization.corPrimaria,
							primaryForeground: organization.corPrimariaForeground,
						},
						clientId: client.id,
						origin,
					},
					{
						from: {
							name: organization.nome,
							prefix: organization.nome,
						},
					},
				);
				clientResult.email = { skipped: false, success: true, error: undefined };
			} catch (error) {
				clientResult.email = { skipped: false, success: false, error: error instanceof Error ? error.message : "Erro desconhecido no email." };
			}
		}

		console.log("[TEST_MESSAGE_TEMPLATE] Client result:", JSON.stringify(clientResult, null, 2));

		results.push(clientResult);
	}

	const whatsappSuccessCount = results.filter((result) => result.whatsapp.success).length;
	const emailSuccessCount = results.filter((result) => result.email.success).length;
	const successCount = whatsappSuccessCount + emailSuccessCount;
	const failureCount = results
		.flatMap((result) => [result.whatsapp, result.email])
		.filter((channelResult) => !channelResult.skipped && !channelResult.success).length;

	return {
		data: { results, whatsappSuccessCount, emailSuccessCount, failureCount },
		message:
			failureCount === 0
				? `Teste enviado com sucesso: ${whatsappSuccessCount} WhatsApp e ${emailSuccessCount} email(s).`
				: `${successCount} envio(s) concluído(s), ${failureCount} falha(s).`,
	};
}
export type TTestMessageTemplateOutput = Awaited<ReturnType<typeof testMessageTemplate>>;

async function testMessageTemplateRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	assertCanEditCommunication(session);

	const input = TestMessageTemplateInputSchema.parse(await request.json());
	const result = await testMessageTemplate({ input, organizationId });
	return NextResponse.json(result, { status: 200 });
}

export const POST = appApiHandler({ POST: testMessageTemplateRoute });
