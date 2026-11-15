import type { TCreateProductionInput } from "@/app/api/productions/route";
import type { TGetProductionRecipesOutputById } from "@/app/api/productions/recipes/route";
import {
	buildProductionItemsFromRecipe,
	getPrimaryRecipeOutput,
	roundQuantity,
	scaleRecipe,
	type TReincorporationMode,
} from "@/lib/productions/builder-math";
import type { TValuationOrigin } from "@/lib/productions/valuation";
import type { TTimeDurationUnitsEnum } from "@/schemas/enums";
import { addDuration } from "./format";

export type TBuilderRecipe = TGetProductionRecipesOutputById;

export type TReincorporationState = {
	on: boolean;
	quantidade: number;
	/** Nulo = "Sem lote específico" (baixa pelo saldo geral) ou produto sem controle de estoque. */
	loteId: string | null;
	modo: TReincorporationMode;
};

export type TRecipeQuantities = {
	target: number;
	reinc: TReincorporationState;
};

/** Passo do "quanto produzir" e do saldo, na unidade da saída principal. */
export function getQuantitySteps(unit: string) {
	return unit === "UN" ? { target: 5, saldo: 1 } : { target: 0.5, saldo: 0.1 };
}

function getItemName(item: { produto: { nome: string }; produtoVariante: { nome: string } | null }) {
	return item.produtoVariante ? `${item.produto.nome} · ${item.produtoVariante.nome}` : item.produto.nome;
}

/**
 * Valores iniciais ao escolher a receita: produz o rendimento base e, havendo lote, já liga a
 * reincorporação com o primeiro (o que vence antes) — exceto quando ele cobriria a produção inteira,
 * o que abriria a etapa já bloqueada.
 */
export function getRecipeDefaults(recipe: TBuilderRecipe): TRecipeQuantities {
	const primaryOutput = getPrimaryRecipeOutput(recipe.saidas);
	const target = primaryOutput?.quantidade ?? 0;
	const firstLot = recipe.saldo?.lotes[0] ?? null;
	const quantidade = roundQuantity(firstLot ? firstLot.quantidadeAtual : Math.max(recipe.saldo?.saldoGeral ?? 0, 0));
	return {
		target,
		reinc: {
			on: !!firstLot && quantidade > 0 && quantidade < target,
			quantidade,
			loteId: firstLot?.id ?? null,
			modo: "MANTER_RENDIMENTO",
		},
	};
}

export type TPlanValuation = {
	custoTotal: number;
	retornoEsperado: number;
	margem: number;
	margemPercentual: number | null;
	custoCompleto: boolean;
	retornoCompleto: boolean;
	origemValores: TValuationOrigin;
};

export function buildRecipePlan({ recipe, quantities, start }: { recipe: TBuilderRecipe; quantities: TRecipeQuantities; start: Date }) {
	const primaryOutput = getPrimaryRecipeOutput(recipe.saidas);
	const rendimento = primaryOutput?.quantidade ?? 0;
	const unit = primaryOutput?.produto.unidade ?? "UN";
	const lots = recipe.saldo?.lotes ?? [];
	const lotsTotal = lots.reduce((total, lot) => total + lot.quantidadeAtual, 0);
	const saldoGeral = Math.max(recipe.saldo?.saldoGeral ?? 0, 0);
	// Com controle de estoque, o saldo é o que o estoque tem — informar mais faria a conclusão falhar por
	// saldo insuficiente. Sem controle, não há o que validar (como em qualquer insumo sem controle): o
	// saldo é informado livremente e a conclusão não baixa nada dele.
	const tracksStock = recipe.saldo?.rastreamentoEstoqueAtivo ?? false;
	const canReincorporate = !!primaryOutput && (!tracksStock || lots.length > 0 || saldoGeral > 0);

	const { target, reinc } = quantities;
	const lot = tracksStock && reinc.loteId ? (lots.find((item) => item.id === reinc.loteId) ?? null) : null;
	/** Nulo = sem limite (produto sem controle de estoque). */
	const maxSaldo = tracksStock ? roundQuantity(lot ? lot.quantidadeAtual : Math.max(saldoGeral, lotsTotal)) : null;
	const reincOn = canReincorporate && reinc.on;
	const saldo = reincOn ? (maxSaldo == null ? Math.max(reinc.quantidade, 0) : Math.min(reinc.quantidade, maxSaldo)) : 0;
	// Saldo fora do estoque não tem custo de lote: a conclusão usa o preço de custo do catálogo, e sem
	// ele o saldo entra de graça — a produção fica com custo menor do que teve.
	const leftoverCatalogCost = recipe.saldo?.custoUnitario ?? null;
	const untrackedLeftover = reincOn && !tracksStock && saldo > 0;
	const untrackedLeftoverWithoutCost = untrackedLeftover && !(leftoverCatalogCost != null && leftoverCatalogCost > 0);

	const escala = scaleRecipe({
		rendimentoReceita: rendimento,
		alvo: target,
		reincorporacao: reincOn ? { quantidade: saldo, modo: reinc.modo } : null,
	});
	const items = buildProductionItemsFromRecipe({
		insumos: recipe.insumos,
		saidas: recipe.saidas,
		escala,
		saldo: { loteId: lot?.id ?? null },
	});

	const baseFactor = rendimento > 0 ? target / rendimento : 0;
	const insumos = recipe.insumos.map((input) => ({
		id: input.id,
		nome: getItemName(input),
		unidade: input.produto.unidade,
		quantidade: roundQuantity(input.quantidade * escala.fatorInsumos),
		quantidadeBase: roundQuantity(input.quantidade * baseFactor),
	}));
	const saidas = recipe.saidas.map((output, index) => ({
		id: output.id,
		nome: getItemName(output),
		unidade: output.produto.unidade,
		quantidade: items.saidas[index]?.quantidadePrevista ?? 0,
		validade:
			output.prazoValidadeValor != null && output.prazoValidadeMedida
				? {
						valor: output.prazoValidadeValor,
						medida: output.prazoValidadeMedida as TTimeDurationUnitsEnum,
						vence: addDuration(start, output.prazoValidadeValor, output.prazoValidadeMedida),
					}
				: null,
	}));

	// Estimativa: a receita é valorada no rendimento base. O saldo de estoque entra pelo custo unitário
	// da saída; o saldo sem controle, pelo custo de catálogo — o mesmo que a conclusão vai gravar.
	const recipeUnitCost = rendimento > 0 ? recipe.valores.custoTotal / rendimento : 0;
	const leftoverUnitCost = tracksStock ? recipeUnitCost : (leftoverCatalogCost ?? 0);
	const custoTotal = recipe.valores.custoTotal * escala.fatorInsumos + escala.quantidadeSaldo * leftoverUnitCost;
	const retornoEsperado = recipe.valores.retornoEsperado * escala.fatorSaidas;
	const margem = retornoEsperado - custoTotal;
	const valores: TPlanValuation = {
		custoTotal,
		retornoEsperado,
		margem,
		margemPercentual: retornoEsperado > 0 ? (margem / retornoEsperado) * 100 : null,
		custoCompleto: recipe.valores.custoCompleto && !untrackedLeftoverWithoutCost,
		retornoCompleto: recipe.valores.retornoCompleto,
		origemValores: "PROJECAO",
	};

	const duration =
		recipe.previsaoTempoValor != null && recipe.previsaoTempoMedida
			? { valor: recipe.previsaoTempoValor, medida: recipe.previsaoTempoMedida as TTimeDurationUnitsEnum }
			: null;

	return {
		primaryOutput,
		rendimento,
		unit,
		lots,
		lot,
		saldoGeral,
		maxSaldo,
		tracksStock,
		/** Saldo reincorporado de produto sem controle de estoque: só registro, nada é baixado. */
		untrackedLeftover,
		/** …e sem preço de custo: entra com custo zero. */
		untrackedLeftoverWithoutCost,
		canReincorporate,
		reincOn,
		escala,
		baseFactor,
		insumos,
		saidas,
		items,
		valores,
		duration,
		/** Sem saída cadastrada não há o que produzir nem em que unidade medir. */
		missingOutput: !primaryOutput,
		blocked: !primaryOutput || escala.bloqueado,
		/** O saldo cobre o alvo inteiro no modo "manter rendimento". */
		saldoCoversTarget: escala.quantidadeSaldo > 0 && reinc.modo === "MANTER_RENDIMENTO" && escala.quantidadeSaldo >= target,
	};
}
export type TRecipePlan = ReturnType<typeof buildRecipePlan>;

export type TProductionPayloadStatus = "PLANEJADA" | "EM_PRODUCAO";

export function buildRecipeProductionPayload({
	recipe,
	plan,
	titulo,
	status,
	dataInicio,
	dataPrevisaoConclusao,
}: {
	recipe: TBuilderRecipe;
	plan: TRecipePlan;
	titulo: string;
	status: TProductionPayloadStatus;
	dataInicio: Date | null;
	dataPrevisaoConclusao: Date | null;
}): TCreateProductionInput {
	return {
		production: {
			receitaId: recipe.id,
			titulo,
			origem: "MANUAL",
			status,
			vendaId: null,
			vendaItemId: null,
			dataInicio,
			dataPrevisaoConclusao,
			dataConclusao: null,
			observacoes: null,
		},
		// `quantidadeReal` fica nula: a pesagem acontece na tela da produção.
		productionInputs: plan.items.entradas,
		productionOutputs: plan.items.saidas.map((output) => ({ ...output, dataValidade: null })),
	};
}
