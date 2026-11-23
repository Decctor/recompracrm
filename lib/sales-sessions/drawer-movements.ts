import { SALE_CHANGE_TRANSACTION_ORIGIN } from "@/lib/sales/sale-change";

/**
 * Natureza de cada transação carimbada numa sessão de caixa. Client-safe: o resumo do servidor, o
 * extrato da gaveta e o relatório de resultados classificam pela mesma régua.
 *
 * A classificação vem do lançamento contábil, não do título: sangria e suprimento são
 * TRANSFERENCIA (desde o primeiro dia), a despesa paga com a gaveta é MANUAL e o estorno é ESTORNO.
 * Por isso movimentos antigos se classificam sem migração.
 */
export type TDrawerMovementKind = "VENDA" | "TROCO" | "SUPRIMENTO" | "SANGRIA" | "DESPESA" | "ESTORNO" | "DEMAIS_ENTRADAS" | "DEMAIS_SAIDAS";

export type TDrawerMovementClassifiable = {
	tipo: string;
	origemTipo?: string | null;
	modificadoresMetadata?: { origem?: string | null } | null;
};

export function classifyDrawerMovement(row: TDrawerMovementClassifiable): TDrawerMovementKind {
	if (row.tipo === "ENTRADA") {
		if (row.origemTipo === "VENDA") return "VENDA";
		if (row.origemTipo === "TRANSFERENCIA") return "SUPRIMENTO";
		return "DEMAIS_ENTRADAS";
	}
	if (row.modificadoresMetadata?.origem === SALE_CHANGE_TRANSACTION_ORIGIN) return "TROCO";
	if (row.origemTipo === "TRANSFERENCIA") return "SANGRIA";
	if (row.origemTipo === "MANUAL") return "DESPESA";
	if (row.origemTipo === "ESTORNO") return "ESTORNO";
	return "DEMAIS_SAIDAS";
}

/** Quanto cada natureza movimentou num método. Entradas e saídas sempre positivas. */
export type TDrawerBreakdown = {
	vendas: number;
	suprimentos: number;
	demaisEntradas: number;
	troco: number;
	sangrias: number;
	despesas: number;
	estornos: number;
	demaisSaidas: number;
};

export const DRAWER_BREAKDOWN_KEY: Record<TDrawerMovementKind, keyof TDrawerBreakdown> = {
	VENDA: "vendas",
	SUPRIMENTO: "suprimentos",
	DEMAIS_ENTRADAS: "demaisEntradas",
	TROCO: "troco",
	SANGRIA: "sangrias",
	DESPESA: "despesas",
	ESTORNO: "estornos",
	DEMAIS_SAIDAS: "demaisSaidas",
};

export function emptyDrawerBreakdown(): TDrawerBreakdown {
	return { vendas: 0, suprimentos: 0, demaisEntradas: 0, troco: 0, sangrias: 0, despesas: 0, estornos: 0, demaisSaidas: 0 };
}

/** Movimentos que existem fora das vendas: sem nenhum, o extrato não precisa do subtotal "ficou das vendas". */
export function hasNonSaleDrawerMovement(breakdown: TDrawerBreakdown): boolean {
	return (
		breakdown.suprimentos !== 0 ||
		breakdown.demaisEntradas !== 0 ||
		breakdown.sangrias !== 0 ||
		breakdown.despesas !== 0 ||
		breakdown.estornos !== 0 ||
		breakdown.demaisSaidas !== 0
	);
}
