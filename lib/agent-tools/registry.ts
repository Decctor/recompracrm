import type { TAgentActorContext, TAgentToolDefinitionErased } from "./types";
import { campaignResultsTool } from "./tools/campaign-results";
import {
	activateCampaignTool,
	createCampaignDraftTool,
	getCampaignConfigurationTool,
	updateCampaignDraftTool,
	validateCampaignDraftTool,
} from "./tools/campaign-mutations";
import { clientContextTool } from "./tools/client-context";
import { commercialResultsTool } from "./tools/commercial-results";
import { listCampaignsTool } from "./tools/campaigns";
import { listSegmentsTool } from "./tools/segments";
import { listMembersTool } from "./tools/members";
import {
	createMessageTemplateDraftTool,
	getMessageTemplateTool,
	listMessageTemplatesTool,
	updateMessageTemplateDraftTool,
	listWhatsappTemplateDestinationsTool,
	submitMessageTemplateForApprovalTool,
	syncMessageTemplateStatusTool,
} from "./tools/message-templates";
import {
	completeMessageTemplateMediaUploadTool,
	createMessageTemplateMediaUploadTool,
	uploadMessageTemplateMediaTool,
} from "./tools/message-template-media";
import { platformAggregateMetricsTool, platformOrganizationHealthTool, platformSearchOrganizationsTool } from "./tools/platform";
import { productPerformanceTool } from "./tools/product-performance";
import { searchClientsTool } from "./tools/clients";
import { searchProductsTool } from "./tools/products";
import { getSalesTool } from "./tools/sales";
import { getFinancialAccountsTool, getFinancialTransactionsTool, getStatementTransactionsTool } from "./tools/finances";
import { createStatementImportTool, suggestReconciliationMatchesTool } from "./tools/finances-reconciliation";

/**
 * Registro único das ferramentas expostas via MCP.
 *
 * Poucas e largas, de propósito — a mesma lição que `lib/ai/tools/products.ts` já tinha
 * aprendido ao substituir quatro ferramentas de catálogo por uma consulta unificada. Espelhar as
 * ~300 rotas da API aqui faria o modelo escolher mal e gastar o contexto só com o manifesto.
 *
 * Este registro NÃO se confunde com `lib/ai/tools/`, que serve o agente de WhatsApp falando com
 * o **cliente final**. Aqui o interlocutor é o lojista ou o time da plataforma: outro público,
 * outro envelope de segurança. O que os dois compartilham são os primitivos de baixo nível
 * (`lib/search`, `lib/products/*`, `lib/sales/*`), não a definição das ferramentas.
 */
const AGENT_TOOLS = [
	// Organização — visíveis nos dois modos, com `organizacaoId` obrigatório em PLATAFORMA.
	commercialResultsTool,
	getSalesTool,
	getFinancialAccountsTool,
	getFinancialTransactionsTool,
	getStatementTransactionsTool,
	createStatementImportTool,
	suggestReconciliationMatchesTool,
	searchClientsTool,
	clientContextTool,
	listSegmentsTool,
	searchProductsTool,
	productPerformanceTool,
	listCampaignsTool,
	campaignResultsTool,
	getCampaignConfigurationTool,
	createCampaignDraftTool,
	validateCampaignDraftTool,
	updateCampaignDraftTool,
	activateCampaignTool,
	listMembersTool,
	listMessageTemplatesTool,
	getMessageTemplateTool,
	createMessageTemplateDraftTool,
	updateMessageTemplateDraftTool,
	listWhatsappTemplateDestinationsTool,
	submitMessageTemplateForApprovalTool,
	syncMessageTemplateStatusTool,
	uploadMessageTemplateMediaTool,
	createMessageTemplateMediaUploadTool,
	completeMessageTemplateMediaUploadTool,
	// Plataforma — atravessam organizações e por isso não existem em modo ORG.
	platformSearchOrganizationsTool,
	platformOrganizationHealthTool,
	platformAggregateMetricsTool,
] as unknown as TAgentToolDefinitionErased[];

function isToolAvailableToActor(tool: TAgentToolDefinitionErased, actor: TAgentActorContext) {
	if (!tool.modes.includes(actor.mode)) return false;
	if (tool.requiresResponsibleUser && !actor.responsibleUserId) return false;
	// Igualdade exata, sem wildcards — mesma regra dos grants de dispositivo (§9.4 do plano de acesso).
	return tool.scopes.every((scope) => actor.scopes.has(scope));
}

/**
 * A lista que o ator enxerga.
 *
 * Filtrar em `tools/list` — em vez de expor tudo e recusar na chamada — é uma decisão de
 * comportamento, não só de segurança: modelos lidam bem com uma ferramenta ausente e mal com uma
 * proibida, repetindo a chamada e reformulando até gastar o turno. O 403 continua existindo em
 * `findToolForActor` como segunda barreira, para o cliente que tenha cacheado uma lista antiga.
 */
export function listToolsForActor(actor: TAgentActorContext): TAgentToolDefinitionErased[] {
	return AGENT_TOOLS.filter((tool) => isToolAvailableToActor(tool, actor));
}

export function findToolForActor(actor: TAgentActorContext, name: string): TAgentToolDefinitionErased | null {
	const tool = AGENT_TOOLS.find((candidate) => candidate.name === name);
	if (!tool) return null;
	return isToolAvailableToActor(tool, actor) ? tool : null;
}

/** Todas as ferramentas, sem filtro — para testes e para a tela de permissões. */
export function listAllAgentTools(): TAgentToolDefinitionErased[] {
	return [...AGENT_TOOLS];
}
