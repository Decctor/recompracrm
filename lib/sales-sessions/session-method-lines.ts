import type { TPaymentMethodEnum } from "@/schemas/enums";
import type { TSessionExpectedByMethod } from "./summarize-session-transactions";

/**
 * Visão por método de uma sessão de caixa, client-safe (sem banco): o fechamento e o detalhe
 * histórico leem a mesma régua.
 */

// Métodos que têm dinheiro físico na gaveta e exigem contagem no fechamento.
// Os demais métodos são resumo de movimento/recebível (sem contagem física).
export function isCashDrawerMethod(metodo: string): boolean {
	return metodo === "DINHEIRO";
}

/**
 * Como o esperado de um método se formou ao longo do turno.
 * `saldoInicial` só é diferente de zero na gaveta (fundo de troco da abertura).
 */
export type TSessionMethodComposition = {
	saldoInicial: number;
	entradas: number;
	troco: number;
	outrasSaidas: number;
};

/**
 * Movimento individual que a composição resume: sangria, suprimento ou estorno. Troco e recebimento
 * de venda não entram aqui — cada um já tem sua própria linha no modal.
 */
export type TSessionMovement = {
	id: string;
	titulo: string;
	tipo: string;
	valor: number;
	metodo: TPaymentMethodEnum;
	data: string | Date | null;
	/** Observação do operador (sangria/suprimento) ou motivo do estorno. */
	observacoes: string | null;
	autorNome: string | null;
};

export type TSessionMethodLine = {
	metodo: TPaymentMethodEnum;
	valorEsperado: number;
	valorInformado: number | null;
	diferenca: number | null;
	/**
	 * Composição do esperado. Null quando o ledger atual não soma o esperado congelado no
	 * fechamento — aí o snapshot manda, e exibir a composição seria mostrar uma conta que não fecha.
	 */
	composicao: TSessionMethodComposition | null;
};

type TSessionFrozenReconciliation = {
	metodo: TPaymentMethodEnum;
	valorEsperado: number;
	valorInformado: number | null;
	diferenca: number | null;
};

// Meio centavo: abaixo disso é ruído de ponto flutuante, não divergência de caixa.
export const MONEY_TOLERANCE = 0.005;

function toCents(value: number) {
	return Math.round(value * 100);
}

/** Soma valores monetários em centavos para não acumular erro de ponto flutuante. */
export function sumMoney(values: number[]): number {
	return values.reduce((total, value) => total + toCents(value), 0) / 100;
}

export function sumSessionComposition(composicao: TSessionMethodComposition): number {
	return (toCents(composicao.saldoInicial) + toCents(composicao.entradas) - toCents(composicao.troco) - toCents(composicao.outrasSaidas)) / 100;
}

export function hasSessionCompositionMovement(composicao: TSessionMethodComposition): boolean {
	return composicao.entradas !== 0 || composicao.troco !== 0 || composicao.outrasSaidas !== 0;
}

function toComposition(linha: TSessionExpectedByMethod, saldoInicial: number): TSessionMethodComposition {
	return {
		saldoInicial: isCashDrawerMethod(linha.metodo) ? saldoInicial : 0,
		entradas: linha.entradas,
		troco: linha.troco,
		outrasSaidas: linha.outrasSaidas,
	};
}

/**
 * Junta o snapshot congelado da conferência com o ledger da sessão para montar a linha de cada método.
 *
 * Sessão sem conferência (aberta, ou cancelada antes do fechamento) só tem o ledger ao vivo. Depois
 * do fechamento o snapshot manda — é ele que registra o contado e a diferença aceita pelo operador —
 * e o ledger entra apenas para explicar como o esperado se formou.
 */
export function buildSessionMethodLines({
	saldoInicial,
	resumoEsperado,
	conferencias,
}: {
	saldoInicial: number;
	resumoEsperado: TSessionExpectedByMethod[];
	conferencias: TSessionFrozenReconciliation[];
}): TSessionMethodLine[] {
	const composicoes = new Map(resumoEsperado.map((linha) => [linha.metodo, toComposition(linha, saldoInicial)]));

	if (conferencias.length === 0) {
		return resumoEsperado.map((linha) => ({
			metodo: linha.metodo,
			valorEsperado: linha.valorEsperado,
			valorInformado: null,
			diferenca: null,
			composicao: composicoes.get(linha.metodo) ?? null,
		}));
	}

	const linhasConferidas = conferencias.map((conferencia) => {
		const composicao = composicoes.get(conferencia.metodo) ?? null;
		const reconcilia = !!composicao && Math.abs(sumSessionComposition(composicao) - conferencia.valorEsperado) < MONEY_TOLERANCE;
		return { ...conferencia, composicao: reconcilia ? composicao : null };
	});

	// Movimento fora do snapshot (fechamento legado) ainda precisa aparecer para quem confere.
	const metodosConferidos = new Set(conferencias.map((conferencia) => conferencia.metodo));
	const linhasSoltas = resumoEsperado
		.filter((linha) => !metodosConferidos.has(linha.metodo))
		.map((linha) => ({
			metodo: linha.metodo,
			valorEsperado: linha.valorEsperado,
			valorInformado: null,
			diferenca: null,
			composicao: toComposition(linha, saldoInicial),
		}))
		.filter((linha) => linha.valorEsperado !== 0 || hasSessionCompositionMovement(linha.composicao));

	return [...linhasConferidas, ...linhasSoltas];
}
