import { formatToMoney } from "@/lib/formatting";
import { resolveDiscountAuthority } from "@/lib/permissions/discounts";
import { canGrantStoreCredit } from "@/lib/permissions/finances";
import type { TActionApprovalPayload } from "@/schemas/action-approvals";
import type { TActionApprovalSummary } from "@/schemas/action-approvals";
import type { TActionApprovalTypeEnum } from "@/schemas/enums";
import type { TOrganizationMemberPermissions } from "@/schemas/organizations";
import type { TActionApprovalRequestEntity } from "@/services/drizzle/schema";
import createHttpError from "http-errors";

/** Validade da solicitação/aprovação. Default fixo por ora; configurável por organização fica para depois. */
export const ACTION_APPROVAL_EXPIRATION_MINUTES = 15;

export function getActionApprovalExpirationDate(from: Date = new Date()): Date {
	return new Date(from.getTime() + ACTION_APPROVAL_EXPIRATION_MINUTES * 60 * 1000);
}

export function isActionApprovalExpired(request: Pick<TActionApprovalRequestEntity, "dataExpiracao">, now: Date = new Date()): boolean {
	return !!request.dataExpiracao && request.dataExpiracao.getTime() < now.getTime();
}

/**
 * Registry de handlers por tipo de ação: o primitivo (tabela + rotas + fila) fica burro e estável;
 * a inteligência de cada cenário — quem pode solicitar, quem pode decidir e como montar o resumo —
 * é plugável aqui.
 */
type TActionApprovalHandler = {
	/** Valida se o solicitante pode abrir a solicitação (lança HttpError quando não). */
	validarCriacao: (args: { payload: TActionApprovalPayload; permissoes: TOrganizationMemberPermissions }) => void;
	/** Se a membership avaliada pode decidir (aprovar/rejeitar) solicitações deste tipo. */
	autorizaDecisao: (permissoes: TOrganizationMemberPermissions) => boolean;
	/** Resumo denormalizado para a fila renderizar qualquer tipo sem switch por payload. */
	montarResumo: (payload: TActionApprovalPayload) => TActionApprovalSummary;
};

export const actionApprovalHandlers: Record<TActionApprovalTypeEnum, TActionApprovalHandler> = {
	VENDA_DESCONTO: {
		validarCriacao: ({ payload, permissoes }) => {
			if (payload.tipo !== "VENDA_DESCONTO") throw new createHttpError.BadRequest("Payload não corresponde ao tipo da solicitação.");
			if (!permissoes.vendas.criar) throw new createHttpError.Forbidden("Você não tem permissão para criar vendas.");
			if (payload.descontoSolicitado <= 0) throw new createHttpError.BadRequest("O desconto solicitado deve ser maior que zero.");
			if (payload.valorBase <= 0) throw new createHttpError.BadRequest("O valor base da venda deve ser maior que zero.");
		},
		autorizaDecisao: (permissoes) => resolveDiscountAuthority(permissoes).aprovar,
		montarResumo: (payload) => {
			if (payload.tipo !== "VENDA_DESCONTO") throw new createHttpError.BadRequest("Payload não corresponde ao tipo da solicitação.");
			return {
				titulo: "Desconto acima do limite",
				descricao: `Desconto de ${payload.descontoPercentual.toFixed(1).replace(".", ",")}% sobre uma venda de R$ ${payload.valorBase.toFixed(2).replace(".", ",")}.`,
				valorPrincipal: payload.descontoSolicitado,
			};
		},
	},
	VENDA_FIADO: {
		validarCriacao: ({ payload, permissoes }) => {
			if (payload.tipo !== "VENDA_FIADO") throw new createHttpError.BadRequest("Payload não corresponde ao tipo da solicitação.");
			if (!permissoes.vendas.criar) throw new createHttpError.Forbidden("Você não tem permissão para criar vendas.");
			if (!(payload.valorSolicitado > 0)) throw new createHttpError.BadRequest("O valor do fiado solicitado deve ser maior que zero.");
		},
		autorizaDecisao: (permissoes) => canGrantStoreCredit(permissoes),
		montarResumo: (payload) => {
			if (payload.tipo !== "VENDA_FIADO") throw new createHttpError.BadRequest("Payload não corresponde ao tipo da solicitação.");
			const posicao =
				payload.motivo === "NAO_LIBERADO"
					? "O cliente não está liberado para fiado."
					: `Em aberto: ${formatToMoney(payload.saldoEmAberto)} de um limite de ${formatToMoney(payload.limite ?? 0)}.`;
			return {
				titulo: payload.motivo === "NAO_LIBERADO" ? "Fiado para cliente não liberado" : "Fiado acima do limite",
				descricao: `Fiado de ${formatToMoney(payload.valorSolicitado)} para ${payload.clienteNome}. ${posicao}`,
				valorPrincipal: payload.valorSolicitado,
			};
		},
	},
	AGENTE_ATIVAR_CAMPANHA: {
		validarCriacao: ({ payload }) => {
			if (payload.tipo !== "AGENTE_ATIVAR_CAMPANHA") throw new createHttpError.BadRequest("Payload não corresponde ao tipo da solicitação.");
		},
		autorizaDecisao: (permissoes) => permissoes.empresa.editar,
		montarResumo: (payload) => {
			if (payload.tipo !== "AGENTE_ATIVAR_CAMPANHA") throw new createHttpError.BadRequest("Payload não corresponde ao tipo da solicitação.");
			return { titulo: "Ativar campanha pelo agente", descricao: `Autorizar a ativação da campanha ${payload.campanhaId}.`, valorPrincipal: null };
		},
	},
	AGENTE_SUBMETER_TEMPLATE: {
		validarCriacao: ({ payload }) => {
			if (payload.tipo !== "AGENTE_SUBMETER_TEMPLATE") throw new createHttpError.BadRequest("Payload não corresponde ao tipo da solicitação.");
		},
		autorizaDecisao: (permissoes) => permissoes.empresa.editar,
		montarResumo: (payload) => {
			if (payload.tipo !== "AGENTE_SUBMETER_TEMPLATE") throw new createHttpError.BadRequest("Payload não corresponde ao tipo da solicitação.");
			return {
				titulo: "Submeter template à Meta",
				descricao: `Autorizar o envio do template ${payload.messageTemplateId} para análise.`,
				valorPrincipal: null,
			};
		},
	},
};

export function getActionApprovalHandler(tipo: TActionApprovalTypeEnum): TActionApprovalHandler {
	const handler = actionApprovalHandlers[tipo];
	if (!handler) throw new createHttpError.BadRequest("Tipo de solicitação de aprovação não suportado.");
	return handler;
}
