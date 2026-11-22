import {
	AppSubscriptionPlans,
	SUBSCRIPTION_ADDONS,
	SUBSCRIPTION_ADDON_KEYS,
	SUBSCRIPTION_BASE_PLAN_KEYS,
	SUBSCRIPTION_CYCLE_PRICING_KEY,
	SUBSCRIPTION_PRICING_MODEL_METADATA_KEY,
	SUBSCRIPTION_PRICING_MODEL_MODULAR,
	type TSubscriptionAddonKey,
	type TSubscriptionBasePlanKey,
} from "@/config";
import type { TSubscriptionCycleEnum } from "@/schemas/enums";
import type { TOrganizationConfiguration } from "@/schemas/organizations";

/**
 * Recursos de uma assinatura = plano-base + adicionais. Tudo aqui é puro (sem banco, sem Stripe):
 * o webhook, o checkout, o período de teste e os deals chegam ao mesmo resultado pela mesma função.
 * A escrita no banco fica em ./entitlements-sync.ts.
 */

export type TSubscriptionSelection = {
	basePlan: TSubscriptionBasePlanKey;
	addons: TSubscriptionAddonKey[];
	cycle: TSubscriptionCycleEnum;
};

/** Adicionais sem repetição e na ordem do catálogo — a forma comparável e gravável. */
export function normalizeSubscriptionAddons(addons: readonly string[] | null | undefined): TSubscriptionAddonKey[] {
	const informed = new Set(addons ?? []);
	return SUBSCRIPTION_ADDON_KEYS.filter((key) => informed.has(key));
}

export function isSubscriptionBasePlanKey(value: string | null | undefined): value is TSubscriptionBasePlanKey {
	return !!value && (SUBSCRIPTION_BASE_PLAN_KEYS as string[]).includes(value);
}

/** Bloco `configuracao.recursos` de um plano-base com os adicionais aplicados por cima. */
export function resolveSubscriptionEntitlements({
	basePlan,
	addons,
}: {
	basePlan: TSubscriptionBasePlanKey;
	addons: readonly TSubscriptionAddonKey[];
}): TOrganizationConfiguration["recursos"] {
	// Cópia profunda: o resultado vai para o jsonb da organização e não pode compartilhar
	// referência com o config.
	const recursos = structuredClone(AppSubscriptionPlans[basePlan].capabilities);
	for (const addon of normalizeSubscriptionAddons(addons)) {
		Object.assign(recursos, structuredClone(SUBSCRIPTION_ADDONS[addon].capabilities));
	}
	return recursos;
}

/**
 * `configuracao` da organização depois de uma mudança de plano-base ou de adicionais. Troca os
 * recursos inteiros e preserva o resto: preferências e defaults são da operação da loja, não do
 * plano. Duas exceções ligadas ao plano:
 * - `rastreamentoEstoque` acompanha o ERP, como sempre acompanhou;
 * - o teto de gasto com IA já gravado é mantido enquanto a IA continuar ligada, para que contratar
 *   ou cancelar outro adicional não desfaça um teto ajustado à mão pelo admin.
 */
export function applySubscriptionSelectionToConfiguration({
	configuracao,
	basePlan,
	addons,
}: {
	configuracao: TOrganizationConfiguration;
	basePlan: TSubscriptionBasePlanKey;
	addons: readonly TSubscriptionAddonKey[];
}): TOrganizationConfiguration {
	const recursos = resolveSubscriptionEntitlements({ basePlan, addons });
	const previousAi = configuracao.recursos?.iaAtendimento;
	if (recursos.iaAtendimento.acesso && previousAi?.acesso) recursos.iaAtendimento.limiteCreditos = previousAi.limiteCreditos;

	return {
		...configuracao,
		recursos,
		preferencias: {
			...configuracao.preferencias,
			rastreamentoEstoque: recursos.erp.acesso === true,
		},
	};
}

/** Consultoria não tem ciclo anual: é serviço mensal, e o Stripe não mistura intervalos. */
export function isAddonAvailableInCycle(addon: TSubscriptionAddonKey, cycle: TSubscriptionCycleEnum) {
	return SUBSCRIPTION_ADDONS[addon].pricing[SUBSCRIPTION_CYCLE_PRICING_KEY[cycle]] !== null;
}

/** Valor cobrado por ciclo (mensalidade no MENSAL, anuidade no ANUAL). */
export function getSubscriptionCycleTotal({ basePlan, addons, cycle }: TSubscriptionSelection) {
	const pricingKey = SUBSCRIPTION_CYCLE_PRICING_KEY[cycle];
	let total = AppSubscriptionPlans[basePlan].pricing[pricingKey].price;
	for (const addon of normalizeSubscriptionAddons(addons)) {
		total += SUBSCRIPTION_ADDONS[addon].pricing[pricingKey]?.price ?? 0;
	}
	return Math.round(total * 100) / 100;
}

export type TSubscriptionPriceCatalogEntry =
	| { priceId: string; kind: "BASE"; key: TSubscriptionBasePlanKey; cycle: TSubscriptionCycleEnum }
	| { priceId: string; kind: "ADDON"; key: TSubscriptionAddonKey; cycle: TSubscriptionCycleEnum };

/**
 * Prices do modelo plano-base + adicionais na conta de vendas (os NEXT_PUBLIC_STRIPE_*_PRICE_ID).
 * Um price sem variável configurada simplesmente não entra: o item correspondente não é
 * reconhecido, em vez de casar com `undefined`.
 */
export function buildSubscriptionPriceCatalog(): TSubscriptionPriceCatalogEntry[] {
	const catalog: TSubscriptionPriceCatalogEntry[] = [];
	const cycles = Object.keys(SUBSCRIPTION_CYCLE_PRICING_KEY) as TSubscriptionCycleEnum[];
	for (const cycle of cycles) {
		const pricingKey = SUBSCRIPTION_CYCLE_PRICING_KEY[cycle];
		for (const key of SUBSCRIPTION_BASE_PLAN_KEYS) {
			const priceId = AppSubscriptionPlans[key].pricing[pricingKey].stripePriceId;
			if (priceId) catalog.push({ priceId, kind: "BASE", key, cycle });
		}
		for (const key of SUBSCRIPTION_ADDON_KEYS) {
			const priceId = SUBSCRIPTION_ADDONS[key].pricing[pricingKey]?.stripePriceId;
			if (priceId) catalog.push({ priceId, kind: "ADDON", key, cycle });
		}
	}
	return catalog;
}

/**
 * Lê os prices dos itens de uma assinatura. Null quando nenhum item é um plano-base conhecido
 * (ou há mais de um): não é uma assinatura que este modelo saiba descrever, e quem chama deve
 * deixar a organização como está.
 */
export function resolveSubscriptionSelectionFromPriceIds(
	priceIds: readonly string[],
	catalog: TSubscriptionPriceCatalogEntry[] = buildSubscriptionPriceCatalog(),
): TSubscriptionSelection | null {
	const matched = priceIds.flatMap((priceId) => catalog.filter((entry) => entry.priceId === priceId));
	const baseEntries = matched.filter((entry) => entry.kind === "BASE");
	if (baseEntries.length !== 1) return null;

	const [baseEntry] = baseEntries;
	const addons = matched.flatMap((entry) => (entry.kind === "ADDON" ? [entry.key] : []));
	return {
		basePlan: baseEntry.key as TSubscriptionBasePlanKey,
		addons: normalizeSubscriptionAddons(addons),
		cycle: baseEntry.cycle,
	};
}

/** Price de um adicional no ciclo informado; null quando ele não existe nesse ciclo. */
export function getSubscriptionAddonPriceId(addon: TSubscriptionAddonKey, cycle: TSubscriptionCycleEnum) {
	return SUBSCRIPTION_ADDONS[addon].pricing[SUBSCRIPTION_CYCLE_PRICING_KEY[cycle]]?.stripePriceId || null;
}

export type TSubscriptionLineItemsResult =
	| { ok: true; lineItems: { price: string; quantity: number }[] }
	| { ok: false; reason: "ADDON_UNAVAILABLE_IN_CYCLE" | "PRICE_NOT_CONFIGURED"; item: TSubscriptionBasePlanKey | TSubscriptionAddonKey };

/** Itens de checkout de uma seleção. Não lança: quem chama traduz o motivo em erro HTTP. */
export function buildSubscriptionLineItems({ basePlan, addons, cycle }: TSubscriptionSelection): TSubscriptionLineItemsResult {
	const pricingKey = SUBSCRIPTION_CYCLE_PRICING_KEY[cycle];
	const selectedAddons = normalizeSubscriptionAddons(addons);
	// A regra de ciclo vem antes da checagem de price: é o erro que o lojista consegue corrigir.
	const unavailableAddon = selectedAddons.find((addon) => !isAddonAvailableInCycle(addon, cycle));
	if (unavailableAddon) return { ok: false, reason: "ADDON_UNAVAILABLE_IN_CYCLE", item: unavailableAddon };

	const basePriceId = AppSubscriptionPlans[basePlan].pricing[pricingKey].stripePriceId;
	if (!basePriceId) return { ok: false, reason: "PRICE_NOT_CONFIGURED", item: basePlan };

	const lineItems = [{ price: basePriceId, quantity: 1 }];
	for (const addon of selectedAddons) {
		const priceId = getSubscriptionAddonPriceId(addon, cycle);
		if (!priceId) return { ok: false, reason: "PRICE_NOT_CONFIGURED", item: addon };
		lineItems.push({ price: priceId, quantity: 1 });
	}
	return { ok: true, lineItems };
}

/** Só assinaturas com a marca têm os recursos governados pelos itens — ver o comentário da constante. */
export function isModularSubscriptionMetadata(metadata: Record<string, string> | null | undefined) {
	return metadata?.[SUBSCRIPTION_PRICING_MODEL_METADATA_KEY] === SUBSCRIPTION_PRICING_MODEL_MODULAR;
}

export const MODULAR_SUBSCRIPTION_METADATA: Record<string, string> = {
	[SUBSCRIPTION_PRICING_MODEL_METADATA_KEY]: SUBSCRIPTION_PRICING_MODEL_MODULAR,
};

/**
 * A assinatura mudou em relação ao que está gravado? Só então os recursos são reescritos: assim
 * um ajuste feito à mão pelo admin (recursos, teto de IA) sobrevive a renovações e mudanças de
 * status, que também chegam como customer.subscription.updated.
 */
export function hasSubscriptionSelectionChanged({
	stored,
	resolved,
}: {
	stored: { assinaturaPlano: string | null | undefined; assinaturaAdicionais: readonly string[] | null | undefined };
	resolved: Pick<TSubscriptionSelection, "basePlan" | "addons">;
}) {
	if (stored.assinaturaPlano !== resolved.basePlan) return true;
	const storedAddons = normalizeSubscriptionAddons(stored.assinaturaAdicionais);
	const resolvedAddons = normalizeSubscriptionAddons(resolved.addons);
	return storedAddons.length !== resolvedAddons.length || storedAddons.some((addon, index) => addon !== resolvedAddons[index]);
}
