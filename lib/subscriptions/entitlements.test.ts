import assert from "node:assert/strict";
import { test } from "node:test";
import { AppSubscriptionPlans, HUB_AI_MONTHLY_SPEND_LIMIT_USD, PIX_MANDATE_MAX_AMOUNT_CENTS, SUBSCRIPTION_ADDONS } from "@/config";
import type { TOrganizationConfiguration } from "@/schemas/organizations";
import {
	type TSubscriptionPriceCatalogEntry,
	applySubscriptionSelectionToConfiguration,
	buildSubscriptionLineItems,
	getSubscriptionCycleTotal,
	hasSubscriptionSelectionChanged,
	isAddonAvailableInCycle,
	isModularSubscriptionMetadata,
	normalizeSubscriptionAddons,
	resolveSubscriptionEntitlements,
	resolveSubscriptionSelectionFromPriceIds,
} from "./entitlements";

const CATALOG: TSubscriptionPriceCatalogEntry[] = [
	{ priceId: "price_crm_m", kind: "BASE", key: "CRM", cycle: "MENSAL" },
	{ priceId: "price_crm_y", kind: "BASE", key: "CRM", cycle: "ANUAL" },
	{ priceId: "price_erp_m", kind: "BASE", key: "CRM_ERP", cycle: "MENSAL" },
	{ priceId: "price_hub_m", kind: "ADDON", key: "HUB_ATENDIMENTOS", cycle: "MENSAL" },
	{ priceId: "price_hub_y", kind: "ADDON", key: "HUB_ATENDIMENTOS", cycle: "ANUAL" },
	{ priceId: "price_cons_m", kind: "ADDON", key: "CONSULTORIA", cycle: "MENSAL" },
];

test("o plano CRM libera o CRM e deixa ERP, atendimentos e IA fechados", () => {
	const recursos = resolveSubscriptionEntitlements({ basePlan: "CRM", addons: [] });
	assert.equal(recursos.campanhas.acesso, true);
	assert.equal(recursos.integracoes.acesso, true);
	assert.equal(recursos.erp.acesso, false);
	assert.equal(recursos.hubAtendimentos.acesso, false);
	assert.equal(recursos.iaAtendimento.acesso, false);
});

test("CRM_ERP só acrescenta o ERP", () => {
	const crm = resolveSubscriptionEntitlements({ basePlan: "CRM", addons: [] });
	const erp = resolveSubscriptionEntitlements({ basePlan: "CRM_ERP", addons: [] });
	assert.equal(erp.erp.acesso, true);
	assert.deepEqual({ ...erp, erp: crm.erp }, crm);
});

test("o Hub abre a caixa de entrada e a IA, com o teto de uso justo", () => {
	const recursos = resolveSubscriptionEntitlements({ basePlan: "CRM", addons: ["HUB_ATENDIMENTOS"] });
	assert.equal(recursos.hubAtendimentos.acesso, true);
	assert.equal(recursos.iaAtendimento.acesso, true);
	assert.equal(recursos.iaAtendimento.limiteCreditos, HUB_AI_MONTHLY_SPEND_LIMIT_USD);
	assert.equal(recursos.erp.acesso, false);
});

test("a consultoria não libera recurso nenhum", () => {
	assert.deepEqual(
		resolveSubscriptionEntitlements({ basePlan: "CRM_ERP", addons: ["CONSULTORIA"] }),
		resolveSubscriptionEntitlements({ basePlan: "CRM_ERP", addons: [] }),
	);
});

test("nenhuma combinação carrega limite de campanhas, integrações ou atendentes", () => {
	for (const basePlan of ["CRM", "CRM_ERP"] as const) {
		const recursos = resolveSubscriptionEntitlements({ basePlan, addons: ["HUB_ATENDIMENTOS", "CONSULTORIA"] });
		assert.equal(recursos.campanhas.limiteAtivas, null);
		assert.equal(recursos.integracoes.limiteAtivas, null);
		assert.equal(recursos.hubAtendimentos.limiteAtendentes, null);
	}
});

test("o resultado não compartilha referência com o config", () => {
	const recursos = resolveSubscriptionEntitlements({ basePlan: "CRM", addons: ["HUB_ATENDIMENTOS"] });
	recursos.campanhas.acesso = false;
	recursos.hubAtendimentos.acesso = false;
	assert.equal(AppSubscriptionPlans.CRM.capabilities.campanhas.acesso, true);
	assert.equal(SUBSCRIPTION_ADDONS.HUB_ATENDIMENTOS.capabilities.hubAtendimentos?.acesso, true);
});

test("os itens da assinatura viram plano-base, adicionais e ciclo", () => {
	assert.deepEqual(resolveSubscriptionSelectionFromPriceIds(["price_cons_m", "price_erp_m", "price_hub_m"], CATALOG), {
		basePlan: "CRM_ERP",
		addons: ["HUB_ATENDIMENTOS", "CONSULTORIA"],
		cycle: "MENSAL",
	});
	assert.deepEqual(resolveSubscriptionSelectionFromPriceIds(["price_crm_y"], CATALOG), { basePlan: "CRM", addons: [], cycle: "ANUAL" });
});

test("assinatura sem plano-base conhecido, ou com dois, não é descrita", () => {
	assert.equal(resolveSubscriptionSelectionFromPriceIds(["price_legado"], CATALOG), null);
	assert.equal(resolveSubscriptionSelectionFromPriceIds(["price_hub_m"], CATALOG), null);
	assert.equal(resolveSubscriptionSelectionFromPriceIds(["price_crm_m", "price_erp_m"], CATALOG), null);
	assert.equal(resolveSubscriptionSelectionFromPriceIds([], CATALOG), null);
});

test("um price desconhecido ao lado do plano-base é ignorado", () => {
	assert.deepEqual(resolveSubscriptionSelectionFromPriceIds(["price_crm_m", "price_de_outro_app"], CATALOG), {
		basePlan: "CRM",
		addons: [],
		cycle: "MENSAL",
	});
});

test("os adicionais são normalizados para a ordem do catálogo, sem repetição", () => {
	assert.deepEqual(normalizeSubscriptionAddons(["CONSULTORIA", "HUB_ATENDIMENTOS", "CONSULTORIA", "OUTRO"]), ["HUB_ATENDIMENTOS", "CONSULTORIA"]);
	assert.deepEqual(normalizeSubscriptionAddons(null), []);
});

test("a consultoria só existe no ciclo mensal", () => {
	assert.equal(isAddonAvailableInCycle("CONSULTORIA", "MENSAL"), true);
	assert.equal(isAddonAvailableInCycle("CONSULTORIA", "ANUAL"), false);
	assert.equal(isAddonAvailableInCycle("HUB_ATENDIMENTOS", "ANUAL"), true);

	// A regra de ciclo é checada antes dos prices, então vale mesmo sem price configurado no teste.
	assert.deepEqual(buildSubscriptionLineItems({ basePlan: "CRM", addons: ["CONSULTORIA"], cycle: "ANUAL" }), {
		ok: false,
		reason: "ADDON_UNAVAILABLE_IN_CYCLE",
		item: "CONSULTORIA",
	});
});

test("os totais seguem a tabela de preços", () => {
	assert.equal(getSubscriptionCycleTotal({ basePlan: "CRM", addons: [], cycle: "MENSAL" }), 399.9);
	assert.equal(getSubscriptionCycleTotal({ basePlan: "CRM_ERP", addons: [], cycle: "MENSAL" }), 599.9);
	assert.equal(getSubscriptionCycleTotal({ basePlan: "CRM_ERP", addons: ["HUB_ATENDIMENTOS"], cycle: "MENSAL" }), 899.8);
	assert.equal(getSubscriptionCycleTotal({ basePlan: "CRM_ERP", addons: ["HUB_ATENDIMENTOS", "CONSULTORIA"], cycle: "MENSAL" }), 1399.8);
	assert.equal(getSubscriptionCycleTotal({ basePlan: "CRM_ERP", addons: ["HUB_ATENDIMENTOS"], cycle: "ANUAL" }), 8639.8);
});

test("o teto do mandato PIX cobre o maior combo mensal e não recua do teto antigo", () => {
	const largestMonthlyCombo = getSubscriptionCycleTotal({ basePlan: "CRM_ERP", addons: ["HUB_ATENDIMENTOS", "CONSULTORIA"], cycle: "MENSAL" });
	assert.ok(PIX_MANDATE_MAX_AMOUNT_CENTS >= Math.round(largestMonthlyCombo * 100));
	assert.ok(PIX_MANDATE_MAX_AMOUNT_CENTS >= 139990);
});

test("só a marca no metadata torna a assinatura governada pelos itens", () => {
	assert.equal(isModularSubscriptionMetadata({ pricingModel: "MODULAR" }), true);
	assert.equal(isModularSubscriptionMetadata({ organizationId: "org" }), false);
	assert.equal(isModularSubscriptionMetadata(null), false);
});

test("os recursos só são reescritos quando plano ou adicionais mudam", () => {
	const resolved = { basePlan: "CRM" as const, addons: ["HUB_ATENDIMENTOS" as const] };
	assert.equal(hasSubscriptionSelectionChanged({ stored: { assinaturaPlano: "CRM", assinaturaAdicionais: ["HUB_ATENDIMENTOS"] }, resolved }), false);
	assert.equal(hasSubscriptionSelectionChanged({ stored: { assinaturaPlano: "CRM", assinaturaAdicionais: [] }, resolved }), true);
	assert.equal(
		hasSubscriptionSelectionChanged({ stored: { assinaturaPlano: "CRESCIMENTO", assinaturaAdicionais: ["HUB_ATENDIMENTOS"] }, resolved }),
		true,
	);
	assert.equal(
		hasSubscriptionSelectionChanged({ stored: { assinaturaPlano: "CRM", assinaturaAdicionais: null }, resolved: { basePlan: "CRM", addons: [] } }),
		false,
	);
});

test("trocar de plano preserva preferências e defaults e liga o rastreamento de estoque com o ERP", () => {
	const configuracao = {
		recursos: resolveSubscriptionEntitlements({ basePlan: "CRM", addons: [] }),
		preferencias: { rastreamentoEstoque: false, carteirasClientes: { habilitado: true } },
		defaults: { marcador: "defaults" },
	} as unknown as TOrganizationConfiguration;

	const next = applySubscriptionSelectionToConfiguration({ configuracao, basePlan: "CRM_ERP", addons: [] });
	assert.equal(next.recursos.erp.acesso, true);
	assert.equal(next.preferencias.rastreamentoEstoque, true);
	assert.deepEqual(next.preferencias.carteirasClientes, { habilitado: true });
	assert.equal(next.defaults, configuracao.defaults);

	const back = applySubscriptionSelectionToConfiguration({ configuracao: next, basePlan: "CRM", addons: [] });
	assert.equal(back.preferencias.rastreamentoEstoque, false);
});

test("o teto de IA ajustado à mão sobrevive enquanto a IA continua ligada", () => {
	const recursos = resolveSubscriptionEntitlements({ basePlan: "CRM", addons: ["HUB_ATENDIMENTOS"] });
	recursos.iaAtendimento.limiteCreditos = 80;
	const configuracao = { recursos, preferencias: {}, defaults: {} } as unknown as TOrganizationConfiguration;

	const withConsulting = applySubscriptionSelectionToConfiguration({ configuracao, basePlan: "CRM", addons: ["HUB_ATENDIMENTOS", "CONSULTORIA"] });
	assert.equal(withConsulting.recursos.iaAtendimento.limiteCreditos, 80);

	const withoutHub = applySubscriptionSelectionToConfiguration({ configuracao, basePlan: "CRM", addons: [] });
	assert.equal(withoutHub.recursos.iaAtendimento.acesso, false);

	const hubAgain = applySubscriptionSelectionToConfiguration({ configuracao: withoutHub, basePlan: "CRM", addons: ["HUB_ATENDIMENTOS"] });
	assert.equal(hubAgain.recursos.iaAtendimento.limiteCreditos, HUB_AI_MONTHLY_SPEND_LIMIT_USD);
});
