import type { TActivation } from "@/lib/onboarding/activation";
import type { TErpChannel } from "@/lib/onboarding/erp-channels";
import type { TSubscriptionAddonEnum } from "@/schemas/enums";

/**
 * O que o selo de assinatura e o paywall dizem a uma loja em teste, decidido sem I/O.
 *
 * A regra do teste continua manual (15 dias + carência; extensões pelo time). O que muda é a
 * conversa: a mediana até a primeira campanha passava do fim do teste, e a loja ouvia "regularize"
 * antes de ver o produto funcionando. Enquanto ela não ativou, o selo fala do próximo passo dela, não
 * do relógio; quando o passo espera a Meta, diz isso. Depois de ativada, o texto de cobrança de sempre.
 *
 * Ver docs/onboarding/activation-by-segment.md §6 (item 3).
 */

export type TTrialNarrativeInput = {
	reason: "TRIAL" | "TRIAL_GRACE";
	/** Dias até o fim do teste (TRIAL) ou da carência (TRIAL_GRACE). */
	daysRemaining: number;
	trialEnd: Date;
	activation: Pick<TActivation, "segmento" | "ativado" | "proximaAcao">;
};

export type TTrialNarrative = {
	status: string;
	mensagem: string;
	/** O selo leva direto ao passo, em vez de abrir os planos. */
	proximoPasso: { rotulo: string; href: string } | null;
};

const ACTIVATION_GOAL: Record<TActivation["segmento"], string> = {
	CRM_INTEGRACAO: "a primeira campanha sair",
	CRM_BALCAO: "a primeira campanha sair",
	CRM_ERP: "a primeira campanha sair",
	ERP: "as vendas pelo sistema firmarem",
	SEM_FONTE: "a primeira venda entrar",
};

const shortDate = (date: Date) => date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
const days = (count: number) => `${count} dia${count === 1 ? "" : "s"}`;

/** Null = a loja já ativou (ou não há passo conhecido): vale o texto de cobrança de sempre. */
export function resolveTrialNarrative({ reason, daysRemaining, trialEnd, activation }: TTrialNarrativeInput): TTrialNarrative | null {
	if (activation.ativado || !activation.proximaAcao) return null;
	const step = activation.proximaAcao;
	const waitingOnMeta = step.href === null;
	const proximoPasso = step.href ? { rotulo: step.rotulo, href: step.href } : null;

	if (reason === "TRIAL") {
		return {
			status: waitingOnMeta ? "Aguardando a Meta" : step.rotulo,
			mensagem: waitingOnMeta
				? `${step.descricao} Seu teste vai até ${shortDate(trialEnd)}; se a aprovação atrasar, fale com a gente.`
				: `${step.descricao} Seu teste vai até ${shortDate(trialEnd)}.`,
			proximoPasso,
		};
	}
	return {
		status: "Teste encerrado",
		mensagem: `Seu teste terminou antes de ${ACTIVATION_GOAL[activation.segmento]}. Próximo passo: ${step.rotulo.charAt(0).toLowerCase()}${step.rotulo.slice(1)}. O acesso continua por ${days(daysRemaining)}; se precisar de mais tempo para ativar, fale com a gente.`,
		proximoPasso,
	};
}

export type TBuiltSummaryCounts = {
	clientes: number;
	campanhasAtivas: number;
	mensagensEntregues: number;
	recomprasAtribuidas: number;
	clientesComCashback: number;
	vendasBalcao: number;
	vendasErp: number;
	/** Conversas do Hub de atendimentos em que a equipe ou o agente de IA respondeu, desde o início do teste. */
	conversasHub: number;
};

export type TBuiltSummaryItem = { valor: string; rotulo: string };

const count = (value: number) => value.toLocaleString("pt-BR");

/**
 * O que a loja já construiu, com números exatos e na ordem do que mais pesa: a base, as compras de
 * quem recebeu campanha (a prova mais forte), as vendas do canal do segmento. Zero não entra: "0
 * campanhas" não é algo que alguém perde. Três itens por padrão: o paywall precisa caber numa tela de
 * notebook com o preço à vista.
 */
export function resolveBuiltSummary({
	segmento,
	counts,
	maximo = 3,
}: {
	segmento: TActivation["segmento"];
	counts: TBuiltSummaryCounts;
	maximo?: number;
}): TBuiltSummaryItem[] {
	const item = (value: number, singular: string, plural: string): TBuiltSummaryItem | null =>
		value > 0 ? { valor: count(value), rotulo: value === 1 ? singular : plural } : null;
	const sales =
		segmento === "ERP" || segmento === "CRM_ERP"
			? [item(counts.vendasErp, "venda feita pelo sistema", "vendas feitas pelo sistema")]
			: segmento === "CRM_BALCAO"
				? [item(counts.vendasBalcao, "venda registrada no balcão", "vendas registradas no balcão")]
				: [];
	const hub = item(counts.conversasHub, "conversa respondida no Hub de atendimentos", "conversas respondidas no Hub de atendimentos");
	const items = [
		item(counts.clientes, "cliente na base", "clientes na base"),
		item(counts.recomprasAtribuidas, "compra de quem recebeu campanha", "compras de quem recebeu campanha"),
		...sales,
		item(counts.mensagensEntregues, "mensagem de campanha entregue", "mensagens de campanha entregues"),
		item(counts.clientesComCashback, "cliente com cashback para usar", "clientes com cashback para usar"),
		item(counts.campanhasAtivas, "campanha ligada", "campanhas ligadas"),
	];
	const present = items.filter((entry): entry is TBuiltSummaryItem => entry !== null);
	// O Hub é um adicional: quem o usou precisa vê-lo aqui, porque o checkout já o traz marcado.
	// Fica com o último lugar, sem tirar a base nem as compras atribuídas.
	if (hub) return [...present.slice(0, Math.max(0, maximo - 1)), hub].slice(0, maximo);
	return present.slice(0, maximo);
}

// ------------------------------------------------------------------ sugestão do checkout

export type TPlanSuggestionInput = {
	segmento: TActivation["segmento"];
	/** Vendas feitas pelos canais do ERP desde o cadastro. */
	vendasErp: Record<TErpChannel, number>;
	conversasHub: number;
};

export type TPlanSuggestion = {
	planoBase: "CRM" | "CRM_ERP";
	/** Por que este plano vem marcado. Null quando é o CRM: não há o que explicar. */
	motivo: string | null;
	adicionais: { chave: TSubscriptionAddonEnum; motivo: string }[];
};

const ERP_CHANNEL_PHRASE: Record<TErpChannel, string> = {
	BALCAO: "vende pelo PDV",
	CATALOGO: "vende pelo catálogo digital",
	MESAS: "atende por mesas e comandas",
};

/**
 * O que o checkout traz marcado para quem ainda não assina, pelo que a loja de fato usou no teste
 * — nunca pelo que o teste liberou, que é tudo. Usa o ERP quem está num segmento de ERP (escolheu
 * a jornada ou vendeu por um canal do sistema, a mesma regra de "Primeiros passos"); usa o Hub quem
 * respondeu conversas nele. É só o ponto de partida: o total aparece antes de pagar, e a pessoa
 * desmarca o que não quiser.
 */
export function resolvePlanSuggestion({ segmento, vendasErp, conversasHub }: TPlanSuggestionInput): TPlanSuggestion {
	const usesErp = segmento === "ERP" || segmento === "CRM_ERP";
	const busiest = (Object.keys(vendasErp) as TErpChannel[]).filter((channel) => vendasErp[channel] > 0).sort((a, b) => vendasErp[b] - vendasErp[a])[0];
	return {
		planoBase: usesErp ? "CRM_ERP" : "CRM",
		motivo: usesErp
			? busiest
				? `Sugerido porque sua loja ${ERP_CHANNEL_PHRASE[busiest]}.`
				: "Sugerido porque você começou pelo ERP no cadastro."
			: null,
		adicionais:
			conversasHub > 0
				? [
						{
							chave: "HUB_ATENDIMENTOS",
							// Sem "no teste": uma loja de contrato (deal) também chega aqui, e o número vale para as duas.
							motivo: `Sua equipe já respondeu ${count(conversasHub)} ${conversasHub === 1 ? "conversa" : "conversas"} pelo Hub.`,
						},
					]
				: [],
	};
}
