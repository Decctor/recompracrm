/**
 * Regra de preço dos grupos de adicionais.
 *
 * `SOMA` (padrão histórico): cada opção escolhida soma o próprio `precoDelta` × quantidade.
 * `MAIOR`: o grupo cobra só a opção mais cara — pizza de 2 sabores pelo maior valor, o modelo de
 * mercado (iFood, Neemo). `MEDIA`: o grupo cobra a média dos preços, ponderada pelas quantidades.
 *
 * Todo precificador (construtor do PDV/comanda, loja, resolução de pedidos, validação e drift de
 * venda) passa por aqui, e o resultado é um preço UNITÁRIO efetivo por opção. Assim a invariante
 * que o resto do sistema já assume continua valendo: `valorTotal = valorUnitario × quantidade` em
 * cada modificador e `valorModificadores = Σ valorTotal` no item — repricing, cupom, impressão e
 * relatórios não precisam conhecer a regra. Em `MAIOR` a cobrança inteira fica na opção vencedora
 * e as demais saem a 0; em `MEDIA` cada opção carrega a sua fração.
 */
import type { TProductAddOnPricingRuleEnum } from "@/schemas/enums";

export type TAddOnPricingSelection = {
	opcaoId: string;
	quantidade: number;
	precoDelta: number;
	grupoId: string;
	regraPreco: TProductAddOnPricingRuleEnum;
};

function roundCents(value: number) {
	return Math.round(value * 100) / 100;
}

/** Preço unitário efetivo de cada opção escolhida, com a regra do grupo aplicada. */
export function resolveAddOnUnitPrices(selections: TAddOnPricingSelection[]): Map<string, number> {
	// A mesma opção pode chegar em duas linhas: a regra olha a escolha consolidada.
	const byOption = new Map<string, TAddOnPricingSelection>();
	for (const selection of selections) {
		if (!(selection.quantidade > 0)) continue;
		const current = byOption.get(selection.opcaoId);
		byOption.set(selection.opcaoId, current ? { ...current, quantidade: current.quantidade + selection.quantidade } : selection);
	}

	const byGroup = new Map<string, TAddOnPricingSelection[]>();
	for (const selection of byOption.values()) {
		const group = byGroup.get(selection.grupoId);
		if (group) group.push(selection);
		else byGroup.set(selection.grupoId, [selection]);
	}

	const prices = new Map<string, number>();
	for (const group of byGroup.values()) {
		const rule = group[0].regraPreco;
		if (rule === "MAIOR") {
			// Empate desempata pelo id: cliente e servidor precisam eleger a mesma opção, ou a
			// validação por modificador acusaria divergência só pela ordem das linhas.
			const winner = group.reduce((best, candidate) =>
				candidate.precoDelta > best.precoDelta || (candidate.precoDelta === best.precoDelta && candidate.opcaoId < best.opcaoId) ? candidate : best,
			);
			for (const selection of group) prices.set(selection.opcaoId, selection === winner ? roundCents(winner.precoDelta / winner.quantidade) : 0);
			continue;
		}
		if (rule === "MEDIA") {
			const totalQuantity = group.reduce((sum, selection) => sum + selection.quantidade, 0);
			for (const selection of group) prices.set(selection.opcaoId, roundCents(selection.precoDelta / totalQuantity));
			continue;
		}
		for (const selection of group) prices.set(selection.opcaoId, selection.precoDelta);
	}
	return prices;
}

type TPricedAddOnReference = {
	grupo: { id?: string; regraPreco?: TProductAddOnPricingRuleEnum | null; opcoes: { id: string; precoDelta: number }[] };
};

/**
 * Atalho para quem tem os vínculos do produto (já projetados para o canal) e as escolhas do
 * cliente: localiza o grupo de cada opção — o primeiro vínculo que a contém, como os construtores
 * já faziam — e aplica a regra. Opção fora dos vínculos fica fora do mapa.
 */
export function resolveSelectedAddOnPrices(references: TPricedAddOnReference[], modifiers: { opcaoId: string; quantidade: number }[]) {
	const optionGroups = new Map<string, { precoDelta: number; grupoId: string; regraPreco: TProductAddOnPricingRuleEnum }>();
	for (const [referenceIndex, reference] of references.entries()) {
		const grupoId = reference.grupo.id ?? `referencia-${referenceIndex}`;
		for (const option of reference.grupo.opcoes) {
			if (!optionGroups.has(option.id))
				optionGroups.set(option.id, { precoDelta: option.precoDelta, grupoId, regraPreco: reference.grupo.regraPreco ?? "SOMA" });
		}
	}
	const selections: TAddOnPricingSelection[] = [];
	for (const modifier of modifiers) {
		const option = optionGroups.get(modifier.opcaoId);
		if (option) selections.push({ opcaoId: modifier.opcaoId, quantidade: modifier.quantidade, ...option });
	}
	return resolveAddOnUnitPrices(selections);
}

/** Complemento da dica do grupo no construtor ("Escolha até 2 · cobrada pelo maior valor"). */
export function describeAddOnPricingRule(rule: TProductAddOnPricingRuleEnum | null | undefined) {
	if (rule === "MAIOR") return "cobrado pelo maior valor";
	if (rule === "MEDIA") return "cobrado pela média";
	return null;
}

export const ADD_ON_PRICING_RULE_LABELS: Record<TProductAddOnPricingRuleEnum, { label: string; description: string }> = {
	SOMA: { label: "Somar opções", description: "Cada opção escolhida soma o próprio preço." },
	MAIOR: { label: "Maior valor", description: "Cobra só a opção mais cara. Padrão para pizza de mais de um sabor." },
	MEDIA: { label: "Média", description: "Cobra a média dos preços das opções escolhidas." },
};
