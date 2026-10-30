import type { TMetaAdsActionStat, TMetaAdsPurchaseRoasStat } from "./types";

export function toNumber(value: string | undefined): number {
	if (!value) return 0;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

export function toNullableNumber(value: string | undefined): number | null {
	if (!value) return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

export function ratio(numerator: number, denominator: number): number | null {
	if (!denominator || denominator <= 0) return null;
	const value = numerator / denominator;
	return Number.isFinite(value) ? value : null;
}

// A Meta retorna a MESMA conversão em vários `action_type` sobrepostos (ex.: uma venda aparece como
// `omni_purchase` + `offsite_conversion.fb_pixel_purchase` + `purchase` + ...). Somar todos multiplica a
// receita. Escolhemos UM tipo canônico por ordem de prioridade. `omni_purchase` é o total consolidado
// cross-canal — bate exatamente com o `purchase_roas` nativo da Meta.
export const PURCHASE_ACTION_PRIORITY = ["omni_purchase", "offsite_conversion.fb_pixel_purchase", "purchase"] as const;
// Idem para leads: `lead` é o total deduplicado. Os `*_add_meta_leads` (content view, search, registration)
// NÃO são leads — são breakdowns de campanhas de lead e inflam a contagem se somados.
export const LEAD_ACTION_PRIORITY = ["lead", "onsite_conversion.lead_grouped", "onsite_conversion.lead", "onsite_web_lead"] as const;
export const MESSAGING_CONVERSATION_ACTION_PRIORITY = ["onsite_conversion.messaging_conversation_started_7d"] as const;

/** Mapa `action_type -> soma` de um array de estatísticas. */
export function buildActionMap(stats: TMetaAdsActionStat[] | undefined): Map<string, number> {
	const map = new Map<string, number>();
	for (const stat of stats ?? []) {
		if (!stat.action_type) continue;
		map.set(stat.action_type, (map.get(stat.action_type) ?? 0) + toNumber(stat.value));
	}
	return map;
}

/** Valor do primeiro `action_type` presente na ordem de prioridade, ou 0. Nunca soma famílias. */
export function pickAction(map: Map<string, number>, priority: readonly string[]): number {
	for (const type of priority) {
		const value = map.get(type);
		if (value != null) return value;
	}
	return 0;
}

export function pickCanonicalActionValue(stats: TMetaAdsActionStat[] | undefined, priority: readonly string[]): number {
	return pickAction(buildActionMap(stats), priority);
}

export function getPurchaseRoas(purchaseRoas: TMetaAdsPurchaseRoasStat[] | undefined): number | null {
	if (!purchaseRoas || purchaseRoas.length === 0) return null;
	for (const type of PURCHASE_ACTION_PRIORITY) {
		const match = purchaseRoas.find((item) => item.action_type === type);
		if (match) return toNullableNumber(match.value);
	}
	return toNullableNumber(purchaseRoas[0]?.value);
}
