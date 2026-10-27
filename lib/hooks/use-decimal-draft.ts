import { useState } from "react";

/** Lê um decimal digitado em pt-BR ("1.234,5"): ponto é milhar, vírgula é decimal. */
export const parseDecimalInput = (raw: string) => Number.parseFloat(raw.replace(/\./g, "").replace(",", ".")) || 0;

export const formatMoneyInput = (value: number) => value.toFixed(2).replace(".", ",");

/**
 * Texto de um input decimal controlado. Preserva o que o operador digita ("10," ou "0,5") enquanto
 * o texto ainda corresponde ao valor; quando o valor muda por fora (um atalho, o arredondamento, o
 * teto de 100%, o pagamento RESTANTE acompanhando o total), o texto deixa de bater e o input mostra
 * o valor formatado. Sem efeito de sincronização. Zero aparece vazio, para o placeholder guiar.
 */
export function useDecimalDraft(value: number, format: (value: number) => string = formatMoneyInput) {
	const [draft, setDraft] = useState<string | null>(null);
	const display = draft !== null && parseDecimalInput(draft) === value ? draft : value > 0 ? format(value) : "";
	return { display, setDraft };
}
