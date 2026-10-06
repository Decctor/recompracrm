import type { TCampaignDispatchInterruptionReasonEnum, TCampaignDispatchInterruptionScopeEnum } from "@/schemas/enums";

/**
 * Regras puras de interrupção de disparos — sem I/O, seguras no cliente (o painel usa os textos).
 *
 * Um erro da Meta interrompe o disparo na primeira ocorrência quando se repetiria para todo
 * destinatário. Continuar enviando só consome a audiência (cada falha devolve a quota e abre vaga
 * para o próximo cliente) e, nos limites de spam, piora a reputação do número. Erros do
 * destinatário (sem WhatsApp, opt-out de marketing, retido pela Meta) nunca interrompem.
 *
 * Códigos: https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
 */

export type TCampaignDispatchInterruptionRule = {
	escopo: TCampaignDispatchInterruptionScopeEnum;
	motivo: TCampaignDispatchInterruptionReasonEnum;
};

const NUMBER_RULES: Record<number, TCampaignDispatchInterruptionReasonEnum> = {
	131042: "PAGAMENTO_PENDENTE",
	368: "CONTA_RESTRITA",
	131031: "CONTA_RESTRITA",
	33: "NUMERO_INDISPONIVEL",
	131037: "NUMERO_INDISPONIVEL",
	131045: "NUMERO_INDISPONIVEL",
	131057: "NUMERO_INDISPONIVEL",
	133010: "NUMERO_INDISPONIVEL",
	0: "CREDENCIAL_INVALIDA",
	3: "CREDENCIAL_INVALIDA",
	10: "CREDENCIAL_INVALIDA",
	190: "CREDENCIAL_INVALIDA",
	131005: "CREDENCIAL_INVALIDA",
};

// Só estados do template na Meta. 132000/132005/132012 (parâmetros) ficam de fora: dependem do
// conteúdo renderizado para cada cliente e podem falhar para um e não para os outros.
const TEMPLATE_CODES = new Set([132001, 132007, 132015, 132016]);

const DISPATCH_RULES: Record<number, TCampaignDispatchInterruptionReasonEnum> = {
	131048: "LIMITE_SPAM",
	131064: "LIMITE_SPAM",
	130429: "LIMITE_ENVIO",
	80007: "LIMITE_ENVIO",
	4: "LIMITE_ENVIO",
};

export function classifyWhatsappSendErrorCode(code: number | null | undefined): TCampaignDispatchInterruptionRule | null {
	if (code == null || !Number.isFinite(code)) return null;
	const numberReason = NUMBER_RULES[code] ?? (code >= 200 && code < 300 ? "CREDENCIAL_INVALIDA" : undefined);
	if (numberReason) return { escopo: "NUMERO", motivo: numberReason };
	if (TEMPLATE_CODES.has(code)) return { escopo: "TEMPLATE", motivo: "TEMPLATE_INDISPONIVEL" };
	const dispatchReason = DISPATCH_RULES[code];
	if (dispatchReason) return { escopo: "DISPARO", motivo: dispatchReason };
	return null;
}

export type TWhatsappSendErrorLike = { code?: number | null; title?: string | null; message?: string | null; details?: string | null };

/** Primeiro erro da lista que interrompe envios, com a regra aplicada. */
export function findInterruptingWhatsappError<T extends TWhatsappSendErrorLike>(
	errors: readonly T[] | null | undefined,
): { error: T; rule: TCampaignDispatchInterruptionRule } | null {
	for (const error of errors ?? []) {
		const rule = classifyWhatsappSendErrorCode(error.code);
		if (rule) return { error, rule };
	}
	return null;
}

export type TCampaignDispatchInterruptionCopy = {
	titulo: string;
	explicacao: string;
	acao: string;
	acaoUrl: string | null;
	acaoUrlTexto: string | null;
};

const WHATSAPP_MANAGER_URL = "https://business.facebook.com/wa/manage/home/";

export const CAMPAIGN_DISPATCH_INTERRUPTION_COPY: Record<TCampaignDispatchInterruptionReasonEnum, TCampaignDispatchInterruptionCopy> = {
	PAGAMENTO_PENDENTE: {
		titulo: "Pendência de pagamento no WhatsApp Business",
		explicacao: "A Meta recusou os envios porque a conta do WhatsApp Business está com pagamento pendente ou sem forma de pagamento válida.",
		acao: "Regularize a forma de pagamento no Gerenciador do WhatsApp e depois retome o envio.",
		acaoUrl: "https://business.facebook.com/billing_hub/payment_settings",
		acaoUrlTexto: "Abrir pagamentos da Meta",
	},
	CONTA_RESTRITA: {
		titulo: "Conta do WhatsApp Business restrita pela Meta",
		explicacao: "A Meta restringiu a conta ou o número por violação de política ou falha na verificação da empresa.",
		acao: "Veja o motivo da restrição no Gerenciador do WhatsApp. O envio só volta a funcionar depois que a Meta liberar a conta.",
		acaoUrl: WHATSAPP_MANAGER_URL,
		acaoUrlTexto: "Abrir Gerenciador do WhatsApp",
	},
	NUMERO_INDISPONIVEL: {
		titulo: "Número do WhatsApp indisponível",
		explicacao: "O número de envio não está registrado na Meta, foi removido, aguarda aprovação do nome de exibição ou está em manutenção.",
		acao: "Confira a situação do número no Gerenciador do WhatsApp e na conexão do WhatsApp antes de retomar.",
		acaoUrl: WHATSAPP_MANAGER_URL,
		acaoUrlTexto: "Abrir Gerenciador do WhatsApp",
	},
	CREDENCIAL_INVALIDA: {
		titulo: "Acesso à Meta expirado ou revogado",
		explicacao: "A conexão do WhatsApp perdeu o acesso à Meta: o token expirou ou as permissões foram removidas.",
		acao: "Reconecte o WhatsApp nas configurações de integração e depois retome o envio.",
		acaoUrl: null,
		acaoUrlTexto: null,
	},
	TEMPLATE_INDISPONIVEL: {
		titulo: "Template indisponível para envio",
		explicacao:
			"A Meta recusou o template desta campanha: ele foi pausado ou desabilitado por baixa qualidade, rejeitado, ou não existe no idioma configurado.",
		acao: "Revise o template (ou troque por outro aprovado) e depois retome o envio.",
		acaoUrl: null,
		acaoUrlTexto: null,
	},
	LIMITE_SPAM: {
		titulo: "Envios limitados pela Meta por qualidade",
		explicacao: "Muitas mensagens deste número foram bloqueadas ou denunciadas como spam, e a Meta passou a limitar os envios.",
		acao: "Aguarde pelo menos 24 horas, reduza o volume (um limite semanal menor ajuda) e revise o conteúdo antes de retomar.",
		acaoUrl: WHATSAPP_MANAGER_URL,
		acaoUrlTexto: "Ver qualidade do número",
	},
	LIMITE_ENVIO: {
		titulo: "Limite de velocidade de envio da Meta",
		explicacao: "O número atingiu o limite de mensagens por segundo ou de chamadas permitido pela Meta.",
		acao: "Aguarde alguns minutos e retome o envio.",
		acaoUrl: null,
		acaoUrlTexto: null,
	},
};

/** Texto curto gravado em `erro` do disparo e dos destinatários pulados. */
export function getCampaignDispatchInterruptionMessage({
	motivo,
	codigo,
}: {
	motivo: TCampaignDispatchInterruptionReasonEnum;
	codigo: number | null;
}) {
	const { titulo } = CAMPAIGN_DISPATCH_INTERRUPTION_COPY[motivo];
	return codigo != null ? `Envio interrompido: ${titulo} (código ${codigo}).` : `Envio interrompido: ${titulo}.`;
}
