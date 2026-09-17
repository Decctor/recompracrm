import assert from "node:assert/strict";
import test from "node:test";
import { resolveTriggeredCampaigns, type TSaleTriggerFacts, type TTriggerCampaign } from "./triggers";

function campaign(overrides: Partial<TTriggerCampaign> & { id: string; gatilhoTipo: TTriggerCampaign["gatilhoTipo"] }): TTriggerCampaign {
	return {
		gatilhoNovaCompraValorMinimo: null,
		gatilhoQuantidadeTotalCompras: null,
		gatilhoValorTotalCompras: null,
		gatilhoNovoCashbackAcumuladoValorMinimo: null,
		gatilhoTotalCashbackAcumuladoValorMinimo: null,
		...overrides,
	};
}

const CLIENT = "cliente-1";
const campaigns = [
	campaign({ id: "primeira", gatilhoTipo: "PRIMEIRA-COMPRA" }),
	campaign({ id: "nova", gatilhoTipo: "NOVA-COMPRA", gatilhoNovaCompraValorMinimo: 50 }),
	campaign({ id: "qtde-5", gatilhoTipo: "QUANTIDADE-TOTAL-COMPRAS", gatilhoQuantidadeTotalCompras: 5 }),
	campaign({ id: "valor-1000", gatilhoTipo: "VALOR-TOTAL-COMPRAS", gatilhoValorTotalCompras: 1000 }),
	campaign({ id: "cashback", gatilhoTipo: "CASHBACK-ACUMULADO", gatilhoNovoCashbackAcumuladoValorMinimo: 5 }),
];
const everyone = new Map(campaigns.map((c) => [c.id, new Set([CLIENT])]));

function sale(overrides: Partial<TSaleTriggerFacts>): TSaleTriggerFacts {
	return {
		clientId: CLIENT,
		isFirstPurchase: false,
		saleValue: 100,
		newTotalPurchaseCount: 2,
		previousTotalPurchaseCount: 1,
		newTotalPurchaseValue: 200,
		previousTotalPurchaseValue: 100,
		cashbackAccumulatedValue: null,
		cashbackAvailableBalance: null,
		...overrides,
	};
}

const ids = (result: ReturnType<typeof resolveTriggeredCampaigns>) => result.map((item) => item.campaign.id);

test("primeira compra vence nova compra e quantidade", () => {
	assert.deepEqual(
		ids(
			resolveTriggeredCampaigns({
				campaigns,
				audiencesByCampaignId: everyone,
				sale: sale({ isFirstPurchase: true, newTotalPurchaseCount: 1, previousTotalPurchaseCount: 0 }),
			}),
		),
		["primeira"],
	);
});

test("sem campanha de primeira compra aplicável, nova compra dispara na primeira compra (decisão única)", () => {
	const audiences = new Map(everyone);
	audiences.set("primeira", new Set());
	assert.deepEqual(
		ids(
			resolveTriggeredCampaigns({
				campaigns,
				audiencesByCampaignId: audiences,
				sale: sale({ isFirstPurchase: true, newTotalPurchaseCount: 1, previousTotalPurchaseCount: 0 }),
			}),
		),
		["nova"],
	);
});

test("cruzamento de quantidade total tem prioridade sobre nova compra e dispara uma única vez", () => {
	assert.deepEqual(
		ids(
			resolveTriggeredCampaigns({ campaigns, audiencesByCampaignId: everyone, sale: sale({ newTotalPurchaseCount: 6, previousTotalPurchaseCount: 3 }) }),
		),
		["qtde-5"],
	);
	assert.deepEqual(
		ids(
			resolveTriggeredCampaigns({ campaigns, audiencesByCampaignId: everyone, sale: sale({ newTotalPurchaseCount: 7, previousTotalPurchaseCount: 6 }) }),
		),
		["nova"],
	);
});

test("nova compra respeita o valor mínimo", () => {
	assert.deepEqual(ids(resolveTriggeredCampaigns({ campaigns, audiencesByCampaignId: everyone, sale: sale({ saleValue: 20 }) })), []);
});

test("valor total cruza o limiar mesmo saltando o valor exato, e soma-se ao gatilho de compra", () => {
	assert.deepEqual(
		ids(
			resolveTriggeredCampaigns({
				campaigns,
				audiencesByCampaignId: everyone,
				sale: sale({ newTotalPurchaseValue: 1300, previousTotalPurchaseValue: 900 }),
			}),
		),
		["nova", "valor-1000"],
	);
	assert.deepEqual(
		ids(
			resolveTriggeredCampaigns({
				campaigns,
				audiencesByCampaignId: everyone,
				sale: sale({ newTotalPurchaseValue: 1300, previousTotalPurchaseValue: 1100 }),
			}),
		),
		["nova"],
	);
});

test("cashback acumulado exige acúmulo acima do mínimo", () => {
	assert.deepEqual(
		ids(
			resolveTriggeredCampaigns({
				campaigns,
				audiencesByCampaignId: everyone,
				sale: sale({ cashbackAccumulatedValue: 10, cashbackAvailableBalance: 30 }),
			}),
		),
		["nova", "cashback"],
	);
	assert.deepEqual(
		ids(
			resolveTriggeredCampaigns({
				campaigns,
				audiencesByCampaignId: everyone,
				sale: sale({ cashbackAccumulatedValue: 2, cashbackAvailableBalance: 30 }),
			}),
		),
		["nova"],
	);
});

test("cliente fora da audiência ou sem id não dispara nada", () => {
	assert.deepEqual(ids(resolveTriggeredCampaigns({ campaigns, audiencesByCampaignId: new Map(), sale: sale({}) })), []);
	assert.deepEqual(ids(resolveTriggeredCampaigns({ campaigns, audiencesByCampaignId: everyone, sale: sale({ clientId: null }) })), []);
});
