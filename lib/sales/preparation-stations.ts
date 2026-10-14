// Resolver puro das estações de preparo: decide para qual estação vai cada item do TICKET_PREPARO
// e monta um ticket por estação. Sem banco — o chamador carrega estações e regras da organização.
// Modelo e decisões: docs/dev-planning/preparation-stations-plan.md.
import type { TPreparationStationTicketScopeEnum } from "@/schemas/enums";
import type { TPreparationStationRuleValue } from "@/schemas/preparation-stations";

/** Precedência entre critérios: o mais específico ganha. Nada de prioridade numérica na regra. */
export const PREPARATION_RULE_SPECIFICITY = ["PRODUTO", "GRUPO"] as const;

/** O mínimo do item que o roteamento lê. Adicionais não roteiam sozinhos: seguem o item pai. */
export type TPreparationRoutableItem = {
	produtoId?: string | null;
	grupo?: string | null;
};

export type TPreparationStationInput = {
	id: string;
	ordem: number;
	ativa: boolean;
	padrao: boolean;
	escopoTicket: TPreparationStationTicketScopeEnum;
};

export type TPreparationStationRuleInput = {
	estacaoId: string;
	valor: TPreparationStationRuleValue;
};

export type TPreparationTicketItem<TItem> = TItem & { destaque: boolean };

export type TPreparationTicketSplitEntry<TItem, TStation extends TPreparationStationInput = TPreparationStationInput> = {
	estacao: TStation;
	itens: TPreparationTicketItem<TItem>[];
};

// products.grupo é texto livre: "Bebidas" e " bebidas " são o mesmo grupo.
function normalizeGroup(grupo: string | null | undefined) {
	const normalized = grupo?.trim().toLocaleLowerCase("pt-BR");
	return normalized ? normalized : null;
}

function sortActiveStations<TStation extends TPreparationStationInput>(stations: TStation[]) {
	return stations.filter((station) => station.ativa).sort((a, b) => a.ordem - b.ordem);
}

function ruleMatchesItem(rule: TPreparationStationRuleInput, item: TPreparationRoutableItem) {
	if (rule.valor.criterio === "PRODUTO") return !!item.produtoId && rule.valor.produtoId === item.produtoId;
	const itemGroup = normalizeGroup(item.grupo);
	return !!itemGroup && normalizeGroup(rule.valor.grupo) === itemGroup;
}

function resolveAmongActiveStations<TStation extends TPreparationStationInput>({
	item,
	rules,
	activeStations,
}: {
	item: TPreparationRoutableItem;
	rules: TPreparationStationRuleInput[];
	activeStations: TStation[];
}): TStation | null {
	if (activeStations.length === 0) return null;
	const stationsById = new Map(activeStations.map((station) => [station.id, station]));
	for (const criterion of PREPARATION_RULE_SPECIFICITY) {
		// Regras de estação inativa (ou que sumiu) são ignoradas: o item cai no próximo critério.
		const match = rules.find((rule) => rule.valor.criterio === criterion && stationsById.has(rule.estacaoId) && ruleMatchesItem(rule, item));
		if (match) return stationsById.get(match.estacaoId) ?? null;
	}
	// Sem padrão é estado inválido mas possível: cai na primeira estação ativa por ordem.
	return activeStations.find((station) => station.padrao) ?? activeStations[0];
}

/**
 * Estação que prepara o item: regra mais específica (PRODUTO > GRUPO) entre estações ativas,
 * senão a estação padrão, senão a primeira ativa por `ordem`. `null` só quando não há estação ativa.
 */
export function resolvePreparationStation<TStation extends TPreparationStationInput>({
	item,
	rules,
	stations,
}: {
	item: TPreparationRoutableItem;
	rules: TPreparationStationRuleInput[];
	stations: TStation[];
}): TStation | null {
	return resolveAmongActiveStations({ item, rules, activeStations: sortActiveStations(stations) });
}

/**
 * Um ticket por estação com ≥1 item próprio, na ordem das estações. Escopo PEDIDO: o pedido inteiro,
 * com `destaque` nos itens da estação; escopo ESTACAO: só os itens dela. Sem estação ativa → `[]`
 * (o chamador mantém o ticket único sem estação).
 */
export function splitPreparationTicketByStation<TItem extends TPreparationRoutableItem, TStation extends TPreparationStationInput>({
	itens,
	rules,
	stations,
}: {
	itens: TItem[];
	rules: TPreparationStationRuleInput[];
	stations: TStation[];
}): TPreparationTicketSplitEntry<TItem, TStation>[] {
	const activeStations = sortActiveStations(stations);
	if (activeStations.length === 0) return [];

	const assignedStationIds = itens.map((item) => resolveAmongActiveStations({ item, rules, activeStations })?.id ?? null);

	const entries: TPreparationTicketSplitEntry<TItem, TStation>[] = [];
	for (const station of activeStations) {
		if (!assignedStationIds.includes(station.id)) continue;
		const stationItems =
			station.escopoTicket === "ESTACAO"
				? itens.filter((_, index) => assignedStationIds[index] === station.id).map((item) => ({ ...item, destaque: true }))
				: itens.map((item, index) => ({ ...item, destaque: assignedStationIds[index] === station.id }));
		entries.push({ estacao: station, itens: stationItems });
	}
	return entries;
}
