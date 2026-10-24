// Estimador de custo da API do WhatsApp Business (/tools/whatsapp-cost). A Meta cobra por
// mensagem entregue; desde 1º/10/2026 as respostas de atendimento também são cobradas.
// Tabela do Brasil: a mesma do artigo "whatsapp-api-precos-outubro-2026-varejo"
// (app/_content/blog-posts/posts/whatsapp-precos-2026.ts). Ao mudar um preço, atualize os dois.

export type TWhatsappCategory = "MARKETING" | "UTILIDADE" | "AUTENTICACAO" | "ATENDIMENTO";

/** Preço por mensagem entregue no Brasil, em reais (e em dólar, quando a Meta publica). */
export const WHATSAPP_PRICES: Record<TWhatsappCategory, { brl: number; usd: number | null }> = {
	MARKETING: { brl: 0.3217, usd: 0.0625 },
	UTILIDADE: { brl: 0.035, usd: 0.0068 },
	AUTENTICACAO: { brl: 0.035, usd: 0.0068 },
	ATENDIMENTO: { brl: 0.035, usd: null },
};

/** Início da vigência da tabela acima (cobrança das respostas de atendimento). */
export const WHATSAPP_PRICES_EFFECTIVE_DATE = "2026-10-01";

/** Alcance sugerido na dica de economia: só a parte da base com mais motivo para voltar. */
export const WHATSAPP_SUGGESTED_REACH = 30;

export type TWhatsappCostInput = {
	/** Clientes com permissão (opt-in). */
	base: number;
	/** Campanhas de marketing por mês. */
	campaigns: number;
	/** Parte da base em cada campanha, em %. */
	reach: number;
	/** Avisos de utilidade por cliente no mês. */
	utility: number;
	/** Conversas de atendimento por mês. */
	conversations: number;
	/** Respostas da loja por conversa. */
	replies: number;
};

export const WHATSAPP_COST_DEFAULTS: TWhatsappCostInput = { base: 2000, campaigns: 2, reach: 100, utility: 1, conversations: 300, replies: 10 };

function marketingMessages(base: number, campaigns: number, reach: number) {
	return Math.round((base * campaigns * reach) / 100);
}

export function computeWhatsappCost(input: TWhatsappCostInput) {
	const messages = {
		marketing: marketingMessages(input.base, input.campaigns, input.reach),
		utility: input.base * input.utility,
		service: input.conversations * input.replies,
	};
	const costs = {
		marketing: messages.marketing * WHATSAPP_PRICES.MARKETING.brl,
		utility: messages.utility * WHATSAPP_PRICES.UTILIDADE.brl,
		service: messages.service * WHATSAPP_PRICES.ATENDIMENTO.brl,
	};
	const total = costs.marketing + costs.utility + costs.service;

	// Dica de economia: a mesma frequência de campanhas, mas só para parte da base.
	const canSave = input.reach > WHATSAPP_SUGGESTED_REACH && input.campaigns > 0;
	const saving = canSave
		? {
				reach: WHATSAPP_SUGGESTED_REACH,
				amount: costs.marketing - marketingMessages(input.base, input.campaigns, WHATSAPP_SUGGESTED_REACH) * WHATSAPP_PRICES.MARKETING.brl,
			}
		: null;

	return {
		messages,
		costs,
		total,
		totalMessages: messages.marketing + messages.utility + messages.service,
		costPerClient: input.base > 0 ? total / input.base : 0,
		saving,
	};
}

export type TWhatsappCostResult = ReturnType<typeof computeWhatsappCost>;
