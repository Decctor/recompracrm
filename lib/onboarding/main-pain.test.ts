import assert from "node:assert/strict";
import test from "node:test";

import { getAvailableCampaignPresets } from "@/config/onboarding-campaign-presets";
import { MAIN_PAIN_OPTIONS, recommendCampaignPreset } from "./main-pain";

test("cada incômodo recomenda uma campanha disponível para o programa", () => {
	for (const cashbackAtivo of [true, false]) {
		const available = new Set(getAvailableCampaignPresets(cashbackAtivo).map((preset) => preset.key));
		for (const option of MAIN_PAIN_OPTIONS) {
			const key = recommendCampaignPreset({ dor: option.value, cashbackAtivo });
			assert.ok(key && available.has(key), `${option.value} com cashback ${cashbackAtivo}: ${key}`);
		}
	}
});

test("sem resposta, sem recomendação", () => {
	assert.equal(recommendCampaignPreset({ dor: null, cashbackAtivo: true }), null);
});

test("frequência sem cashback não recomenda o lembrete de cashback", () => {
	assert.equal(recommendCampaignPreset({ dor: "POUCA_FREQUENCIA", cashbackAtivo: false }), "segunda-compra");
	assert.equal(recommendCampaignPreset({ dor: "CLIENTES_PARARAM", cashbackAtivo: false }), "recuperacao");
});
