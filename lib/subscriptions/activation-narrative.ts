import type { TActivation } from "@/lib/onboarding/activation";

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
	const items = [
		item(counts.clientes, "cliente na base", "clientes na base"),
		item(counts.recomprasAtribuidas, "compra de quem recebeu campanha", "compras de quem recebeu campanha"),
		...sales,
		item(counts.mensagensEntregues, "mensagem de campanha entregue", "mensagens de campanha entregues"),
		item(counts.clientesComCashback, "cliente com cashback para usar", "clientes com cashback para usar"),
		item(counts.campanhasAtivas, "campanha ligada", "campanhas ligadas"),
	];
	return items.filter((entry): entry is TBuiltSummaryItem => entry !== null).slice(0, maximo);
}
