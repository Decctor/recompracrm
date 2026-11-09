import { consumeUpload, createUploadIntake } from "@/lib/files/intake";
import { buildTemplateMediaEnvelope, uploadAgentTemplateMediaContent, uploadAgentTemplateMediaFromUrl } from "@/lib/message-templates/agent-media";
import createHttpError from "http-errors";
import z from "zod";
import { resolveOrganizationScope, resolveResponsibleUser } from "../organization-scope";
import { AgentMutationControlInputSchema, defineAgentTool } from "../types";

const OrganizationInputSchema = z.object({
	organizacaoId: z.string({ invalid_type_error: "Tipo inválido para o id da organização." }).optional().nullable(),
});

/**
 * Fluxo de duas etapas sobre o primitivo de uploads (lib/files/README.md): esta ferramenta cria
 * a intenção e devolve uma URL SAME-ORIGIN (/api/uploads/[id]) + token — nunca uma URL do
 * provedor de storage, que ambientes de conector não alcançam. O agente faz o PUT dos bytes
 * crus e conclui com complete_message_template_media_upload.
 */
export const createMessageTemplateMediaUploadTool = defineAgentTool({
	name: "create_message_template_media_upload",
	title: "Preparar upload de imagem de template",
	scopes: ["agent:message-template-media:write"],
	modes: ["ORG", "PLATAFORMA"],
	requiresResponsibleUser: true,
	mutates: true,
	externalEffect: false,
	inputSchema: OrganizationInputSchema.merge(AgentMutationControlInputSchema).extend({
		nomeArquivo: z.string({ invalid_type_error: "Tipo inválido para o nome do arquivo." }).optional().nullable(),
		tamanhoBytes: z
			.number({ required_error: "Tamanho do arquivo não informado.", invalid_type_error: "Tipo inválido para o tamanho do arquivo." })
			.int()
			.positive()
			.describe("Tamanho exato do arquivo em bytes. O PUT é recusado se os bytes recebidos não baterem."),
		sha256: z
			.string({ invalid_type_error: "Tipo inválido para o SHA-256." })
			.optional()
			.nullable()
			.describe("SHA-256 hex do arquivo. Opcional; com ele, corrupção no caminho é detectada."),
	}),
	describe: (actor) =>
		`Prepara o upload de uma imagem JPEG/PNG (até 4 MB) a partir de um arquivo local: devolve uma \`uploadUrl\` neste mesmo domínio e um \`token\`. O upload é um PUT dos bytes crus na \`uploadUrl\` com o cabeçalho \`Authorization: Bearer <token>\`, concluído por complete_message_template_media_upload com o \`uploadId\`. Imagens já hospedadas têm o caminho mais curto em upload_message_template_media com \`conteudoUrl\`. ${actor.mode === "PLATAFORMA" ? "`organizacaoId` (id ou slug) escolhe a organização." : ""}`,
	execute: async (input, actor) => {
		const organizationId = await resolveOrganizationScope(actor, input.organizacaoId);
		const responsibleUserId = await resolveResponsibleUser(actor, organizationId);
		const intake = await createUploadIntake({
			organizacaoId: organizationId,
			proposito: "MIDIA_TEMPLATE_MENSAGEM",
			nomeArquivo: input.nomeArquivo,
			tamanhoEsperadoBytes: input.tamanhoBytes,
			sha256Esperado: input.sha256,
			criadoPorId: responsibleUserId,
			contexto: { origem: "AGENTE_MCP", principalId: actor.principalId, clientId: actor.clientId },
		});
		return {
			...intake,
			instrucoes: `Envie os bytes crus do arquivo: curl -X PUT -H "Authorization: Bearer ${intake.token}" --data-binary @<arquivo> ${intake.uploadUrl} — depois chame complete_message_template_media_upload com o uploadId.`,
		};
	},
});

export const completeMessageTemplateMediaUploadTool = defineAgentTool({
	name: "complete_message_template_media_upload",
	title: "Concluir upload de imagem de template",
	scopes: ["agent:message-template-media:write"],
	modes: ["ORG", "PLATAFORMA"],
	requiresResponsibleUser: true,
	mutates: true,
	externalEffect: false,
	inputSchema: OrganizationInputSchema.merge(AgentMutationControlInputSchema).extend({
		uploadId: z.string({ required_error: "ID do upload não informado." }).min(1),
	}),
	describe: (actor) =>
		`Conclui o upload iniciado por create_message_template_media_upload (após o PUT dos bytes na \`uploadUrl\`) e devolve o \`conteudoMidiaCaminho\` validado, pronto para usar no cabeçalho de um template. Não é necessário depois de upload_message_template_media, que já devolve o caminho validado. ${actor.mode === "PLATAFORMA" ? "`organizacaoId` (id ou slug) escolhe a organização." : ""}`,
	execute: async (input, actor) => {
		const organizationId = await resolveOrganizationScope(actor, input.organizacaoId);
		await resolveResponsibleUser(actor, organizationId);
		const { arquivo } = await consumeUpload({
			uploadId: input.uploadId,
			organizacaoId: organizationId,
			proposito: "MIDIA_TEMPLATE_MENSAGEM",
			consumo: { finalidade: "MIDIA_TEMPLATE_MENSAGEM" },
		});
		return buildTemplateMediaEnvelope(arquivo);
	},
});

/**
 * Upload em uma etapa, com duas entradas: `conteudoUrl` (o servidor baixa; preferida) ou
 * `conteudoBase64` (os bytes vêm na chamada; só para arquivos pequenos).
 *
 * `conteudoUrl` é preferida sobre o base64 porque argumentos de ferramenta são texto que o
 * modelo gera token a token: uma URL custa dezenas de tokens; uma imagem de 1 MB em base64 custa
 * centenas de milhares e estoura o timeout do cliente antes de a chamada chegar ao servidor.
 * Para arquivo local acima de ~200 KB, o caminho certo é o fluxo de duas etapas
 * (create_message_template_media_upload), que envia bytes crus por PUT same-origin.
 */
export const uploadMessageTemplateMediaTool = defineAgentTool({
	name: "upload_message_template_media",
	title: "Enviar imagem de template",
	scopes: ["agent:message-template-media:write"],
	modes: ["ORG", "PLATAFORMA"],
	requiresResponsibleUser: true,
	mutates: true,
	externalEffect: false,
	inputSchema: OrganizationInputSchema.merge(AgentMutationControlInputSchema).extend({
		conteudoUrl: z
			.string({ invalid_type_error: "Tipo inválido para a URL da imagem." })
			.optional()
			.nullable()
			.describe("URL https pública da imagem. O servidor baixa os bytes — caminho preferido, muito mais rápido que base64."),
		conteudoBase64: z
			.string({ invalid_type_error: "Tipo inválido para o conteúdo da imagem." })
			.optional()
			.nullable()
			.describe("Bytes da imagem em base64. Só para arquivos pequenos (até ~200 KB) que não estão hospedados em lugar nenhum."),
		nomeArquivo: z.string({ invalid_type_error: "Tipo inválido para o nome do arquivo." }).optional().nullable(),
		mimeType: z.enum(["image/jpeg", "image/png"]).optional().nullable(),
	}),
	describe: (actor) =>
		`Envia uma imagem JPEG/PNG (até 5 MB) e devolve o \`conteudoMidiaCaminho\` já validado, pronto para usar no cabeçalho de um template. Aceita \`conteudoUrl\` de uma imagem pública https (o servidor baixa os bytes) ou \`conteudoBase64\` com o arquivo; base64 fica lento acima de ~200 KB, e arquivos locais maiores têm o fluxo de create_message_template_media_upload. ${actor.mode === "PLATAFORMA" ? "`organizacaoId` (id ou slug) escolhe a organização." : ""}`,
	execute: async (input, actor) => {
		const organizationId = await resolveOrganizationScope(actor, input.organizacaoId);
		await resolveResponsibleUser(actor, organizationId);
		if (input.conteudoUrl && input.conteudoBase64) {
			throw new createHttpError.BadRequest("Informe `conteudoUrl` OU `conteudoBase64`, não os dois.");
		}
		if (input.conteudoUrl) {
			return uploadAgentTemplateMediaFromUrl({ organizationId, fileName: input.nomeArquivo, url: input.conteudoUrl });
		}
		if (!input.conteudoBase64) {
			throw new createHttpError.BadRequest("Informe `conteudoUrl` (imagem hospedada) ou `conteudoBase64` (bytes do arquivo).");
		}
		return uploadAgentTemplateMediaContent({
			organizationId,
			fileName: input.nomeArquivo?.trim() || "imagem",
			mimeType: input.mimeType,
			conteudoBase64: input.conteudoBase64,
		});
	},
});
