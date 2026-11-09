import {
	CreateMessageTemplateInputSchema,
	UpdateMessageTemplateInputSchema,
	createMessageTemplate,
	getMessageTemplates,
	updateMessageTemplate,
} from "@/app/api/message-templates/route";
import { db } from "@/services/drizzle";
import { messageTemplates } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { validateAgentTemplateMedia } from "@/lib/message-templates/agent-media";
import z from "zod";
import { resolveOrganizationScope, resolveResponsibleUser } from "../organization-scope";
import { AgentMutationControlInputSchema, defineAgentTool } from "../types";
import { createMessageTemplatePhone, syncMessageTemplatePhone } from "@/app/api/message-templates/phones/route";
import { getOrganizationWhatsappPhones } from "@/lib/whatsapp/organization-phones";
import { hashAgentOperationInput } from "@/lib/ai/operations/hash";
import { consumeAgentMutationApproval, createAgentMutationApproval, requireAgentMutationApproval } from "../mutation-approvals";

const OrganizationInputSchema = z.object({
	organizacaoId: z.string({ invalid_type_error: "Tipo inválido para o id da organização." }).optional().nullable(),
});
const TemplateMediaReferenceInputSchema = OrganizationInputSchema.extend({
	conteudoMidiaCaminho: z.string({ invalid_type_error: "Tipo inválido para o caminho da mídia." }).optional().nullable(),
});

async function mapAgentMediaPath<T extends { conteudo?: { cabecalho?: unknown } | null }>({
	messageTemplate,
	organizationId,
	storagePath,
}: {
	messageTemplate: T;
	organizationId: string;
	storagePath?: string | null;
}): Promise<T> {
	const header = messageTemplate.conteudo?.cabecalho;
	const currentUrl = header && typeof header === "object" && "conteudoMidiaUrl" in header ? header.conteudoMidiaUrl : null;
	if (currentUrl && !storagePath) {
		throw new createHttpError.BadRequest("Não informe `conteudoMidiaUrl` diretamente. Envie a imagem e use `conteudoMidiaCaminho`.");
	}
	if (!storagePath) return messageTemplate;
	if (!header || typeof header !== "object" || !("tipo" in header) || !["IMAGEM", "VIDEO", "DOCUMENTO"].includes(String(header.tipo))) {
		throw new createHttpError.BadRequest("O caminho de mídia exige um cabeçalho de mídia no conteúdo do template.");
	}
	const media = await validateAgentTemplateMedia({ organizationId, storagePath });
	return {
		...messageTemplate,
		conteudo: {
			...messageTemplate.conteudo,
			cabecalho: { ...header, conteudoMidiaUrl: media.conteudoMidiaUrl, conteudoMidiaHandle: null },
		},
	} as T;
}

export const listMessageTemplatesTool = defineAgentTool({
	name: "list_message_templates",
	title: "Listar templates de mensagem",
	scopes: ["agent:message-templates:read"],
	modes: ["ORG", "PLATAFORMA"],
	inputSchema: OrganizationInputSchema.extend({
		busca: z.string({ invalid_type_error: "Tipo inválido para a busca." }).optional().nullable(),
		pagina: z.number({ invalid_type_error: "Tipo inválido para a página." }).int().positive().optional().nullable(),
	}),
	describe: (actor) =>
		`Lista templates locais com status de aprovação e qualidade calculados por telefone conectado. ${actor.mode === "PLATAFORMA" ? "`organizacaoId` (id ou slug) escolhe a organização." : ""}`,
	execute: async (input, actor) => {
		const organizationId = await resolveOrganizationScope(actor, input.organizacaoId);
		return getMessageTemplates({ input: { id: null, search: input.busca, page: input.pagina ?? 1 }, organizationId });
	},
});

export const getMessageTemplateTool = defineAgentTool({
	name: "get_message_template",
	title: "Consultar template de mensagem",
	scopes: ["agent:message-templates:read"],
	modes: ["ORG", "PLATAFORMA"],
	inputSchema: OrganizationInputSchema.extend({
		messageTemplateId: z.string({ required_error: "ID do template não informado.", invalid_type_error: "Tipo inválido para o ID do template." }),
	}),
	describe: (actor) =>
		`Retorna conteúdo, alerta, status e qualidade por telefone de um template. ${actor.mode === "PLATAFORMA" ? "`organizacaoId` (id ou slug) escolhe a organização." : ""}`,
	execute: async (input, actor) => {
		const organizationId = await resolveOrganizationScope(actor, input.organizacaoId);
		return getMessageTemplates({ input: { id: input.messageTemplateId, search: null, page: 1 }, organizationId });
	},
});

export const createMessageTemplateDraftTool = defineAgentTool({
	name: "create_message_template_draft",
	title: "Criar rascunho de template",
	scopes: ["agent:message-templates:write"],
	modes: ["ORG", "PLATAFORMA"],
	requiresResponsibleUser: true,
	mutates: true,
	inputSchema: CreateMessageTemplateInputSchema.omit({ submitWhatsapp: true })
		.merge(TemplateMediaReferenceInputSchema)
		.merge(AgentMutationControlInputSchema),
	describe: (actor) =>
		`Cria somente um rascunho local; não envia nada à Meta. O cabeçalho de mídia aceita apenas um \`conteudoMidiaCaminho\` devolvido pelas ferramentas de mídia; URLs são recusadas. ${actor.mode === "PLATAFORMA" ? "`organizacaoId` (id ou slug) escolhe a organização." : ""}`,
	execute: async (input, actor) => {
		const organizationId = await resolveOrganizationScope(actor, input.organizacaoId);
		const authorId = await resolveResponsibleUser(actor, organizationId);
		const messageTemplate = await mapAgentMediaPath({
			messageTemplate: input.messageTemplate,
			organizationId,
			storagePath: input.conteudoMidiaCaminho,
		});
		return createMessageTemplate({
			input: { messageTemplate: { ...messageTemplate, status: "RASCUNHO" }, submitWhatsapp: false },
			organizationId,
			authorId,
		});
	},
});

export const updateMessageTemplateDraftTool = defineAgentTool({
	name: "update_message_template_draft",
	title: "Atualizar rascunho de template",
	scopes: ["agent:message-templates:write"],
	modes: ["ORG", "PLATAFORMA"],
	requiresResponsibleUser: true,
	mutates: true,
	inputSchema: UpdateMessageTemplateInputSchema.omit({ submitWhatsapp: true })
		.merge(TemplateMediaReferenceInputSchema)
		.merge(AgentMutationControlInputSchema),
	describe: (actor) =>
		`Atualiza somente um template ainda não submetido à Meta; não cria nem altera recursos remotos. A mídia é trocada por um novo \`conteudoMidiaCaminho\`; URLs são recusadas. ${actor.mode === "PLATAFORMA" ? "`organizacaoId` (id ou slug) escolhe a organização." : ""}`,
	execute: async (input, actor) => {
		const organizationId = await resolveOrganizationScope(actor, input.organizacaoId);
		await resolveResponsibleUser(actor, organizationId);
		const existing = await db.query.messageTemplates.findFirst({
			where: and(eq(messageTemplates.id, input.messageTemplateId), eq(messageTemplates.organizacaoId, organizationId)),
			columns: { id: true, metadados: true },
		});
		if (!existing) throw new createHttpError.NotFound("Template não encontrado.");
		if (Object.keys(existing.metadados.porNumeroTelefone).length > 0) {
			throw new createHttpError.Conflict("O template já foi submetido à Meta e não pode ser alterado como rascunho pelo agente.");
		}
		const messageTemplate = await mapAgentMediaPath({
			messageTemplate: input.messageTemplate,
			organizationId,
			storagePath: input.conteudoMidiaCaminho,
		});
		return updateMessageTemplate({
			input: {
				messageTemplateId: input.messageTemplateId,
				messageTemplate: { ...messageTemplate, status: "RASCUNHO" },
				submitWhatsapp: false,
			},
			organizationId,
		});
	},
});

export const listWhatsappTemplateDestinationsTool = defineAgentTool({
	name: "list_whatsapp_template_destinations",
	title: "Listar destinos de template do WhatsApp",
	scopes: ["agent:message-templates:read"],
	modes: ["ORG", "PLATAFORMA"],
	inputSchema: OrganizationInputSchema,
	describe: (actor) =>
		`Lista os números de WhatsApp conectados que podem receber a submissão de um template. ${actor.mode === "PLATAFORMA" ? "`organizacaoId` (id ou slug) escolhe a organização." : ""}`,
	execute: async (input, actor) => {
		const organizationId = await resolveOrganizationScope(actor, input.organizacaoId);
		const phones = await getOrganizationWhatsappPhones(organizationId);
		return {
			total: phones.length,
			telefones: phones.map(({ id, numero, nome, whatsappBusinessAccountId }) => ({ id, numero, nome, whatsappBusinessAccountId })),
		};
	},
});

export const submitMessageTemplateForApprovalTool = defineAgentTool({
	name: "submit_message_template_for_approval",
	title: "Submeter template para aprovação da Meta",
	scopes: ["agent:message-templates:submit"],
	modes: ["ORG", "PLATAFORMA"],
	requiresResponsibleUser: true,
	mutates: true,
	externalEffect: true,
	inputSchema: OrganizationInputSchema.merge(AgentMutationControlInputSchema).extend({
		messageTemplateId: z.string({ required_error: "ID do template não informado." }),
		telefoneId: z.string({ required_error: "ID do telefone não informado." }),
		aprovacaoId: z.string({ invalid_type_error: "Tipo inválido para o ID da aprovação." }).optional().nullable(),
	}),
	describe: (actor) =>
		`Solicita aprovação humana ou, com \`aprovacaoId\` já aprovado, submete um template a um telefone/WABA da Meta. A submissão inicia análise; não significa aprovação. ${actor.mode === "PLATAFORMA" ? "`organizacaoId` (id ou slug) escolhe a organização." : ""}`,
	execute: async (input, actor) => {
		const organizationId = await resolveOrganizationScope(actor, input.organizacaoId);
		const requesterId = await resolveResponsibleUser(actor, organizationId);
		const template = await db.query.messageTemplates.findFirst({
			where: and(eq(messageTemplates.id, input.messageTemplateId), eq(messageTemplates.organizacaoId, organizationId)),
		});
		if (!template) throw new createHttpError.NotFound("Template não encontrado.");
		if (template.metadados.porNumeroTelefone[input.telefoneId]) {
			return {
				submetido: true,
				mensagem: "O template já possui vínculo com este telefone.",
				metadados: template.metadados.porNumeroTelefone[input.telefoneId],
			};
		}
		const configurationHash = hashAgentOperationInput({
			nome: template.nome,
			linguagem: template.linguagem,
			categoria: template.categoria,
			conteudo: template.conteudo,
			telefoneId: input.telefoneId,
		});
		if (!input.aprovacaoId) {
			const request = await createAgentMutationApproval({
				organizationId,
				requesterId,
				payload: {
					tipo: "AGENTE_SUBMETER_TEMPLATE",
					messageTemplateId: template.id,
					telefoneId: input.telefoneId,
					configuracaoHash: configurationHash,
					principalId: actor.principalId,
				},
			});
			return { submetido: false, aprovacaoNecessaria: true, aprovacaoId: request.id, status: request.status, expiraEm: request.dataExpiracao };
		}
		const approval = await db.transaction((tx) =>
			requireAgentMutationApproval({
				tx,
				approvalId: input.aprovacaoId!,
				organizationId,
				type: "AGENTE_SUBMETER_TEMPLATE",
				principalId: actor.principalId,
				configurationHash,
			}),
		);
		if (
			approval.payload.tipo !== "AGENTE_SUBMETER_TEMPLATE" ||
			approval.payload.messageTemplateId !== template.id ||
			approval.payload.telefoneId !== input.telefoneId
		) {
			throw new createHttpError.Forbidden("A aprovação pertence a outro template ou telefone.");
		}
		const result = await createMessageTemplatePhone({
			input: { messageTemplateId: template.id, telefoneId: input.telefoneId },
			organizationId,
		});
		await db.transaction((tx) => consumeAgentMutationApproval({ tx, approvalId: approval.id, consumption: { messageTemplateId: template.id } }));
		return { submetido: true, analiseMeta: "PENDENTE", ...result };
	},
});

export const syncMessageTemplateStatusTool = defineAgentTool({
	name: "sync_message_template_status",
	title: "Sincronizar status do template",
	scopes: ["agent:message-templates:read"],
	modes: ["ORG", "PLATAFORMA"],
	mutates: true,
	externalEffect: true,
	inputSchema: OrganizationInputSchema.merge(AgentMutationControlInputSchema).extend({
		messageTemplateId: z.string({ required_error: "ID do template não informado." }),
		telefoneId: z.string({ required_error: "ID do telefone não informado." }),
	}),
	describe: (actor) =>
		`Consulta a Meta e atualiza localmente o status, a qualidade e o conteúdo retornado para um telefone. ${actor.mode === "PLATAFORMA" ? "`organizacaoId` (id ou slug) escolhe a organização." : ""}`,
	execute: async (input, actor) => {
		const organizationId = await resolveOrganizationScope(actor, input.organizacaoId);
		await syncMessageTemplatePhone({ input: { messageTemplateId: input.messageTemplateId, telefoneId: input.telefoneId }, organizationId });
		return getMessageTemplates({ input: { id: input.messageTemplateId, search: null, page: 1 }, organizationId });
	},
});
