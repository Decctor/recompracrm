import type { TTimeDurationUnitsEnum } from "@/schemas/enums";

/**
 * Escala de receita e reincorporação de saldo no construtor de produção.
 *
 * A receita rende `rendimentoReceita` da saída principal (a primeira saída). O usuário pede `alvo`
 * dessa saída; todos os insumos e saídas escalam pelo mesmo fator — receitas com várias saídas
 * mantêm a proporção entre elas.
 *
 * Reincorporar saldo devolve `quantidade` já produzida da saída principal como insumo:
 * - `MANTER_RENDIMENTO`: a produção continua rendendo `alvo`; a mistura nova cobre só `alvo − saldo`,
 *   então os insumos diminuem na proporção do saldo. Saldo ≥ alvo não deixa nada a produzir (bloqueado).
 * - `SOMAR_AO_RENDIMENTO`: os insumos seguem o `alvo` e o saldo se soma ao rendimento (`alvo + saldo`).
 */

export type TReincorporationMode = "MANTER_RENDIMENTO" | "SOMAR_AO_RENDIMENTO";

export type TRecipeScaleParams = {
	/** Quanto a receita base rende da saída principal. */
	rendimentoReceita: number;
	/** Quanto o usuário quer produzir da saída principal. */
	alvo: number;
	reincorporacao?: { quantidade: number; modo: TReincorporationMode } | null;
};

export type TRecipeScale = {
	/** Fator aplicado aos insumos da receita. */
	fatorInsumos: number;
	/** Fator aplicado às saídas da receita. */
	fatorSaidas: number;
	/** Quantidade prevista da saída principal. */
	quantidadeSaida: number;
	/** Parte do alvo coberta por mistura nova (sem o saldo). */
	quantidadeMisturaNova: number;
	/** Saldo efetivamente reincorporado (0 quando desligado). */
	quantidadeSaldo: number;
	/** Redução dos insumos em relação ao alvo, de 0 a 1. Zero fora do modo `MANTER_RENDIMENTO`. */
	reducaoInsumos: number;
	/** Saldo cobre todo o alvo no modo `MANTER_RENDIMENTO` — não há o que produzir. */
	bloqueado: boolean;
};

export function roundQuantity(value: number) {
	return Math.round(value * 1000) / 1000;
}

export function scaleRecipe({ rendimentoReceita, alvo, reincorporacao }: TRecipeScaleParams): TRecipeScale {
	const yieldBase = rendimentoReceita > 0 ? rendimentoReceita : 1;
	const target = Math.max(alvo, 0);
	const leftover = Math.max(reincorporacao?.quantidade ?? 0, 0);

	if (!reincorporacao || leftover === 0) {
		return {
			fatorInsumos: target / yieldBase,
			fatorSaidas: target / yieldBase,
			quantidadeSaida: target,
			quantidadeMisturaNova: target,
			quantidadeSaldo: 0,
			reducaoInsumos: 0,
			bloqueado: target <= 0,
		};
	}

	if (reincorporacao.modo === "SOMAR_AO_RENDIMENTO") {
		return {
			fatorInsumos: target / yieldBase,
			fatorSaidas: (target + leftover) / yieldBase,
			quantidadeSaida: target + leftover,
			quantidadeMisturaNova: target,
			quantidadeSaldo: leftover,
			reducaoInsumos: 0,
			bloqueado: target <= 0,
		};
	}

	const fresh = Math.max(target - leftover, 0);
	return {
		fatorInsumos: fresh / yieldBase,
		fatorSaidas: target / yieldBase,
		quantidadeSaida: target,
		quantidadeMisturaNova: fresh,
		quantidadeSaldo: leftover,
		reducaoInsumos: target > 0 ? Math.min(leftover / target, 1) : 0,
		bloqueado: leftover >= target,
	};
}

type TRecipeItem = { produtoId: string; produtoVarianteId?: string | null; quantidade: number };
type TRecipeOutputItem = TRecipeItem & {
	prazoValidadeMedida?: TTimeDurationUnitsEnum | null;
	prazoValidadeValor?: number | null;
};

/** A saída principal é a primeira — a mesma ordem (por id) que a rota de receitas devolve. */
export function getPrimaryRecipeOutput<T>(saidas: T[]): T | null {
	return saidas[0] ?? null;
}

/**
 * Itens previstos da produção a partir da receita escalada. A linha de saldo, quando existe, vem
 * primeiro — é a primeira coisa pesada na tela de produção.
 */
export function buildProductionItemsFromRecipe<TOutput extends TRecipeOutputItem>({
	insumos,
	saidas,
	escala,
	saldo,
}: {
	insumos: TRecipeItem[];
	saidas: TOutput[];
	escala: TRecipeScale;
	saldo?: { loteId: string | null } | null;
}) {
	const primaryOutput = getPrimaryRecipeOutput(saidas);

	const entradas = insumos
		.map((input) => ({
			produtoId: input.produtoId,
			produtoVarianteId: input.produtoVarianteId ?? null,
			quantidadePrevista: roundQuantity(input.quantidade * escala.fatorInsumos),
			quantidadeReal: null,
			reincorporado: false,
			loteId: null as string | null,
		}))
		.filter((input) => input.quantidadePrevista > 0);

	if (primaryOutput && escala.quantidadeSaldo > 0) {
		entradas.unshift({
			produtoId: primaryOutput.produtoId,
			produtoVarianteId: primaryOutput.produtoVarianteId ?? null,
			quantidadePrevista: roundQuantity(escala.quantidadeSaldo),
			quantidadeReal: null,
			reincorporado: true,
			loteId: saldo?.loteId ?? null,
		});
	}

	const saidasPrevistas = saidas.map((output, index) => ({
		produtoId: output.produtoId,
		produtoVarianteId: output.produtoVarianteId ?? null,
		quantidadePrevista: roundQuantity(index === 0 ? escala.quantidadeSaida : output.quantidade * escala.fatorSaidas),
		quantidadeReal: null,
		prazoValidadeMedida: output.prazoValidadeMedida ?? null,
		prazoValidadeValor: output.prazoValidadeValor ?? null,
	}));

	return { entradas, saidas: saidasPrevistas };
}
