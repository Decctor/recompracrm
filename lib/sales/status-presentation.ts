import type { TSaleFinancialDerivedStatusEnum, TSaleFiscalDerivedStatusEnum } from "@/schemas/enums";

/**
 * Apresentacao dos status DERIVADOS (financeiro/fiscal) de uma venda. Os status em si sao
 * calculados em `./utils` — aqui mora so como cada um deles se le e se colore.
 *
 * Duas superficies consomem isso com vocabularios diferentes de proposito: a chip do historico
 * tem uma palavra de espaco (`chipLabel`), o cabecalho de um painel de detalhe tem uma frase
 * (`label`). Colapsar os dois num rotulo so deixaria a chip prolixa ou o cabecalho telegrafico.
 *
 * O icone NAO vive aqui, por dois motivos: carregar JSX obrigaria este modulo a virar `.tsx`, e
 * o icone e mais fino que o `tone` — o painel de atendimento distingue `FileClock` (pendente) de
 * `FileMinus` (nao emitida) sendo os dois neutros. Cada superficie mantem o proprio mapa de
 * icones por status, com a propria geometria (`w-3 h-3` na chip, `size-3.5` no painel).
 */
export type TSaleStatusTone = "success" | "warning" | "danger" | "neutral" | "muted";

export const SALE_STATUS_TONE_CLASSNAMES: Record<TSaleStatusTone, string> = {
	success: "border-success/25 bg-success/10 text-success",
	// `text-warning` (#ffb900) não passa contraste em fundo claro; o par surface-foreground existe
	// exatamente para texto sobre superfície âmbar clara (e troca sozinho no tema escuro).
	warning: "border-warning/40 bg-warning/10 text-warning-surface-foreground",
	danger: "border-destructive/30 bg-destructive/10 text-destructive",
	neutral: "border-border/60 bg-muted/30 text-foreground/80",
	muted: "border-border/60 bg-muted/30 text-muted-foreground",
};

export type TSaleStatusPresentation = {
	/** Rotulo curto, para chips em listagens densas. */
	chipLabel: string;
	/** Rotulo em frase, para cabecalhos de secao e paineis de detalhe. */
	label: string;
	tone: TSaleStatusTone;
	className: string;
};

function presentation(chipLabel: string, label: string, tone: TSaleStatusTone): TSaleStatusPresentation {
	return { chipLabel, label, tone, className: SALE_STATUS_TONE_CLASSNAMES[tone] };
}

// Tipado pelo enum (e nao por `Record<string, ...>`): acrescentar um status passa a ser erro de
// compilacao aqui, em vez de um lookup `undefined` silencioso em cada superficie que consome.
export const SALE_FINANCIAL_STATUS_PRESENTATION: Record<TSaleFinancialDerivedStatusEnum, TSaleStatusPresentation> = {
	NAO_GERADO: presentation("SEM RECEBIMENTO", "Pagamento não gerado", "muted"),
	PENDENTE: presentation("A RECEBER", "Pagamento pendente", "neutral"),
	// Âmbar, não neutro: meio paga não pode ler igual a não paga (PENDENTE), e fica entre o neutro
	// e o vermelho de EM_ATRASO. Azul está fora — já significa "orçamento/em aberto" no mesmo card.
	PARCIALMENTE_RECEBIDA: presentation("PARCIAL", "Pagamento parcial", "warning"),
	RECEBIDA: presentation("RECEBIDA", "Pagamento recebido", "success"),
	EM_ATRASO: presentation("EM ATRASO", "Pagamento em atraso", "danger"),
};

export const SALE_FISCAL_STATUS_PRESENTATION: Record<TSaleFiscalDerivedStatusEnum, TSaleStatusPresentation> = {
	NAO_EMITIDO: presentation("SEM NOTA", "Nota fiscal não emitida", "muted"),
	PENDENTE: presentation("NOTA PENDENTE", "Emissão fiscal pendente", "neutral"),
	EM_PROCESSAMENTO: presentation("NOTA PROCESSANDO", "Nota em processamento", "neutral"),
	AUTORIZADO: presentation("AUTORIZADA", "Nota fiscal autorizada", "success"),
	REJEITADO: presentation("NOTA REJEITADA", "Nota fiscal rejeitada", "danger"),
	CANCELADO: presentation("NOTA CANCELADA", "Nota fiscal cancelada", "muted"),
	INUTILIZADO: presentation("NOTA INUTILIZADA", "Numeração fiscal inutilizada", "muted"),
	ERRO: presentation("ERRO FISCAL", "Erro na emissão fiscal", "danger"),
};
