import {
	CreateCampaignInputSchema,
	UpdateCampaignInputSchema,
	createCampaign,
	updateCampaign,
	validateCampaignConfiguration,
} from "@/app/api/campaigns/route";
import { assertWhatsappPhoneCanSendCampaigns } from "@/lib/campaigns/dispatch/interruption";
import { db } from "@/services/drizzle";
import { campaigns } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import z from "zod";
import { resolveOrganizationScope, resolveResponsibleUser } from "../organization-scope";
import { AgentMutationControlInputSchema, defineAgentTool } from "../types";
import { hashAgentOperationInput } from "@/lib/ai/operations/hash";
import { consumeAgentMutationApproval, createAgentMutationApproval, requireAgentMutationApproval } from "../mutation-approvals";

const OrganizationInputSchema = z.object({
	organizacaoId: z.string({ invalid_type_error: "Tipo inválido para o id da organização." }).optional().nullable(),
});

export const getCampaignConfigurationTool = defineAgentTool({
	name: "get_campaign_configuration",
	title: "Consultar configuração da campanha",
	scopes: ["agent:campaigns:read"],
	modes: ["ORG", "PLATAFORMA"],
	inputSchema: OrganizationInputSchema.extend({
		campanhaId: z.string({ required_error: "ID da campanha não informado.", invalid_type_error: "Tipo inválido para o ID da campanha." }),
	}),
	describe: (actor) =>
		`Retorna a configuração completa e as segmentações de uma campanha. ${actor.mode === "PLATAFORMA" ? "Informe `organizacaoId` (id ou slug)." : ""}`,
	execute: async (input, actor) => {
		const organizacaoId = await resolveOrganizationScope(actor, input.organizacaoId);
		const campaign = await db.query.campaigns.findFirst({
			where: and(eq(campaigns.id, input.campanhaId), eq(campaigns.organizacaoId, organizacaoId)),
			with: { segmentacoes: true, whatsappTemplate: { columns: { id: true, nome: true, status: true } } },
		});
		if (!campaign) throw new createHttpError.NotFound("Campanha não encontrada.");
		return { campanha: campaign };
	},
});

export const createCampaignDraftTool = defineAgentTool({
	name: "create_campaign_draft",
	title: "Criar rascunho de campanha",
	scopes: ["agent:campaigns:write"],
	modes: ["ORG", "PLATAFORMA"],
	requiresResponsibleUser: true,
	mutates: true,
	inputSchema: CreateCampaignInputSchema.merge(OrganizationInputSchema).merge(AgentMutationControlInputSchema),
	describe: (actor) =>
		`Cria uma campanha obrigatoriamente inativa. Valida gatilho, template, limites, cashback, cupom e segmentações. ${actor.mode === "PLATAFORMA" ? "Informe `organizacaoId` (id ou slug)." : ""}`,
	execute: async (input, actor) => {
		const organizacaoId = await resolveOrganizationScope(actor, input.organizacaoId);
		const authorId = await resolveResponsibleUser(actor, organizacaoId);
		return createCampaign({
			input: { campaign: { ...input.campaign, ativo: false }, segmentations: input.segmentations },
			organizationId: organizacaoId,
			authorId,
		});
	},
});

export const validateCampaignDraftTool = defineAgentTool({
	name: "validate_campaign_draft",
	title: "Validar rascunho de campanha",
	scopes: ["agent:campaigns:write"],
	modes: ["ORG", "PLATAFORMA"],
	inputSchema: CreateCampaignInputSchema.merge(OrganizationInputSchema),
	describe: (actor) =>
		`Valida uma configuração de campanha sem persistir nem ativar nada. ${actor.mode === "PLATAFORMA" ? "Informe `organizacaoId` (id ou slug)." : ""}`,
	execute: async (input, actor) => {
		const organizationId = await resolveOrganizationScope(actor, input.organizacaoId);
		// Validacao pura: autor e data nao sao persistidos, so completam o formato da campanha.
		await validateCampaignConfiguration({
			campaign: { ...input.campaign, ativo: false, dataInsercao: new Date(), autorId: actor.responsibleUserId ?? actor.principalId },
			organizationId,
		});
		return { valida: true, segmentacoes: input.segmentations.length };
	},
});

export const updateCampaignDraftTool = defineAgentTool({
	name: "update_campaign_draft",
	title: "Atualizar rascunho de campanha",
	scopes: ["agent:campaigns:write"],
	modes: ["ORG", "PLATAFORMA"],
	requiresResponsibleUser: true,
	mutates: true,
	inputSchema: UpdateCampaignInputSchema.merge(OrganizationInputSchema).merge(AgentMutationControlInputSchema),
	describe: (actor) =>
		`Atualiza somente uma campanha inativa e não pode ativá-la. ${actor.mode === "PLATAFORMA" ? "Informe `organizacaoId` (id ou slug)." : ""}`,
	execute: async (input, actor) => {
		const organizacaoId = await resolveOrganizationScope(actor, input.organizacaoId);
		await resolveResponsibleUser(actor, organizacaoId);
		const existing = await db.query.campaigns.findFirst({
			where: and(eq(campaigns.id, input.campaignId), eq(campaigns.organizacaoId, organizacaoId)),
			columns: { id: true, ativo: true },
		});
		if (!existing) throw new createHttpError.NotFound("Campanha não encontrada.");
		if (existing.ativo) throw new createHttpError.Conflict("A campanha está ativa. Desative-a no painel antes de editar o rascunho pelo agente.");
		return updateCampaign({
			input: { campaignId: input.campaignId, campaign: { ...input.campaign, ativo: false }, segmentations: input.segmentations },
			organizationId: organizacaoId,
		});
	},
});

export const activateCampaignTool = defineAgentTool({
	name: "activate_campaign",
	title: "Ativar campanha",
	scopes: ["agent:campaigns:activate"],
	modes: ["ORG", "PLATAFORMA"],
	requiresResponsibleUser: true,
	mutates: true,
	externalEffect: true,
	inputSchema: OrganizationInputSchema.merge(AgentMutationControlInputSchema).extend({
		campanhaId: z.string({ required_error: "ID da campanha não informado." }),
		aprovacaoId: z.string({ invalid_type_error: "Tipo inválido para o ID da aprovação." }).optional().nullable(),
	}),
	describe: (actor) =>
		`Solicita aprovação humana para ativar uma campanha ou consome uma aprovação já concedida. Sem \`aprovacaoId\`, apenas cria a solicitação e não ativa nada. ${actor.mode === "PLATAFORMA" ? "Informe `organizacaoId` (id ou slug)." : ""}`,
	execute: async (input, actor) => {
		const organizationId = await resolveOrganizationScope(actor, input.organizacaoId);
		const requesterId = await resolveResponsibleUser(actor, organizationId);
		const campaign = await db.query.campaigns.findFirst({
			where: and(eq(campaigns.id, input.campanhaId), eq(campaigns.organizacaoId, organizationId)),
			with: { segmentacoes: true },
		});
		if (!campaign) throw new createHttpError.NotFound("Campanha não encontrada.");
		if (campaign.ativo) return { ativada: true, campanhaId: campaign.id, mensagem: "A campanha já está ativa." };
		await validateCampaignConfiguration({ campaign, organizationId });
		await assertWhatsappPhoneCanSendCampaigns(campaign.whatsappConexaoTelefoneId);
		const configurationHash = hashAgentOperationInput({ campaign, segmentacoes: campaign.segmentacoes });
		if (!input.aprovacaoId) {
			const request = await createAgentMutationApproval({
				organizationId,
				requesterId,
				payload: { tipo: "AGENTE_ATIVAR_CAMPANHA", campanhaId: campaign.id, configuracaoHash: configurationHash, principalId: actor.principalId },
			});
			return { ativada: false, aprovacaoNecessaria: true, aprovacaoId: request.id, status: request.status, expiraEm: request.dataExpiracao };
		}
		await db.transaction(async (tx) => {
			const approval = await requireAgentMutationApproval({
				tx,
				approvalId: input.aprovacaoId!,
				organizationId,
				type: "AGENTE_ATIVAR_CAMPANHA",
				principalId: actor.principalId,
				configurationHash,
			});
			if (approval.payload.tipo !== "AGENTE_ATIVAR_CAMPANHA" || approval.payload.campanhaId !== campaign.id) {
				throw new createHttpError.Forbidden("A aprovação pertence a outra campanha.");
			}
			const [updated] = await tx
				.update(campaigns)
				.set({ ativo: true })
				.where(and(eq(campaigns.id, campaign.id), eq(campaigns.organizacaoId, organizationId), eq(campaigns.ativo, false)))
				.returning({ id: campaigns.id });
			if (!updated) throw new createHttpError.Conflict("A campanha foi alterada durante a ativação.");
			await consumeAgentMutationApproval({ tx, approvalId: approval.id, consumption: { campanhaId: campaign.id } });
		});
		return { ativada: true, campanhaId: campaign.id };
	},
});
