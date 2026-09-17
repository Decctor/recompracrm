import { OPERATION_TIMEZONE } from "@/lib/operation-timezone";
import { db } from "@/services/drizzle";
import { organizations } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { resolveOrganizationScope } from "./organization-scope";
import type { TAgentActorContext } from "./types";

/**
 * Recursos MCP — contexto que o modelo lê para se orientar, em vez de gastar uma chamada de
 * ferramenta perguntando "esta loja tem cashback?" ou "que moeda é essa?".
 *
 * Só existe em modo ORG: em PLATAFORMA não há uma "organização atual" para descrever, e forjar
 * uma escolha aqui seria pior que não oferecer o recurso.
 */

export const CURRENT_ORGANIZATION_RESOURCE_URI = "recompracrm://organization/current";

export function listResourcesForActor(actor: TAgentActorContext) {
	if (actor.mode !== "ORG") return [];
	return [
		{
			uri: CURRENT_ORGANIZATION_RESOURCE_URI,
			name: "organizacao-atual",
			title: "Organização desta conexão",
			description:
				"Identidade da organização, moeda, fuso horário de operação e quais módulos estão habilitados (campanhas, cashback, ERP, atendimento). Leia antes de sugerir uma ação que dependa de um módulo.",
			mimeType: "application/json",
		},
	];
}

export async function readResourceForActor(actor: TAgentActorContext, uri: string) {
	if (uri !== CURRENT_ORGANIZATION_RESOURCE_URI) throw new createHttpError.NotFound(`Recurso não encontrado: ${uri}.`);
	if (actor.mode !== "ORG") {
		throw new createHttpError.BadRequest("Esta conexão é de plataforma e não tem uma organização atual. Use as ferramentas `platform_*`.");
	}

	const organizacaoId = await resolveOrganizationScope(actor, null);
	const organization = await db.query.organizations.findFirst({
		where: eq(organizations.id, organizacaoId),
		columns: { id: true, nome: true, slug: true, atuacaoNicho: true, assinaturaPlano: true, configuracao: true },
	});
	if (!organization) throw new createHttpError.NotFound("Organização não encontrada.");

	const { recursos, preferencias } = organization.configuracao;

	return {
		organizacao: {
			id: organization.id,
			nome: organization.nome,
			slug: organization.slug,
			nicho: organization.atuacaoNicho,
			plano: organization.assinaturaPlano,
		},
		// Fixos hoje, mas declarados em vez de presumidos: o modelo formata dinheiro e datas com
		// isto, e adivinhar produz "R$" em cima de um número que não é real, ou o dia errado.
		moeda: "BRL",
		fusoHorario: OPERATION_TIMEZONE,
		// Módulo desligado não é "sem dados": é uma sugestão que o agente não deve fazer.
		modulos: {
			campanhas: recursos.campanhas.acesso,
			programasCashback: recursos.programasCashback.acesso,
			hubAtendimentos: recursos.hubAtendimentos.acesso,
			integracoes: recursos.integracoes.acesso,
			analytics: recursos.analytics.acesso,
			erp: recursos.erp?.acesso ?? false,
		},
		preferencias: {
			rastreamentoEstoque: preferencias.rastreamentoEstoque,
			limiteMensagensSemanaisViaCampanhas: preferencias.limiteMensagensSemanaisViaCampanhas,
			limiteMensagensDiariasViaCampanhas: preferencias.limiteMensagensDiariasViaCampanhas,
		},
	};
}
