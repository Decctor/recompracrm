import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getDelta, pickMetaResultKey } from "@/lib/paid-media/format";
import { appendPreviousName, resolveSyncMode } from "./catalog-sync-rules";
import { detectMetaAdsCreativeMedia } from "./library";
import { aggregateRichMetrics, normalizeMetaAdsInsight, normalizeMetaAdsRich } from "./mappers";

describe("normalizeMetaAdsInsight", () => {
	it("conta uma compra repetida em três famílias de ação uma única vez", () => {
		const metrics = normalizeMetaAdsInsight({
			spend: "100",
			actions: [
				{ action_type: "omni_purchase", value: "4" },
				{ action_type: "purchase", value: "4" },
				{ action_type: "offsite_conversion.fb_pixel_purchase", value: "4" },
			],
			action_values: [
				{ action_type: "omni_purchase", value: "500" },
				{ action_type: "purchase", value: "500" },
				{ action_type: "offsite_conversion.fb_pixel_purchase", value: "500" },
			],
		});
		assert.equal(metrics.purchases, 4);
		assert.equal(metrics.purchaseValue, 500);
	});

	it("lê leads e conversas pela família canônica", () => {
		const metrics = normalizeMetaAdsInsight({
			actions: [
				{ action_type: "lead", value: "7" },
				{ action_type: "onsite_conversion.lead_grouped", value: "7" },
				{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: "12" },
			],
		});
		assert.equal(metrics.leads, 7);
		assert.equal(metrics.messagingConversationsStarted, 12);
	});
});

describe("aggregateRichMetrics", () => {
	it("recalcula as razões a partir das somas em vez de tirar a média", () => {
		const a = normalizeMetaAdsRich({ spend: "100", impressions: "1000", clicks: "10", ctr: "1", cpc: "10" });
		const b = normalizeMetaAdsRich({ spend: "300", impressions: "1000", clicks: "90", ctr: "9", cpc: "3.33" });
		const total = aggregateRichMetrics([a, b]);
		assert.equal(total.spend, 400);
		assert.equal(total.clicks, 100);
		assert.equal(total.ctr, 5);
		assert.equal(total.cpc, 4);
		assert.equal(total.rankings.quality, null);
	});
});

describe("getDelta", () => {
	it("sem base de comparação não há delta", () => {
		assert.equal(getDelta(10, null), null);
		assert.equal(getDelta(0, 0), null);
	});
	it("anterior zero com atual positivo vira +100%", () => {
		assert.equal(getDelta(5, 0)?.text, "+100%");
	});
	it("menos de 0,5% é estável", () => {
		assert.equal(getDelta(100.2, 100)?.direction, "flat");
	});
	it("custo subindo é ruim quando menor é melhor", () => {
		const delta = getDelta(12, 10, true);
		assert.equal(delta?.tone, "bad");
		assert.equal(delta?.text, "+20%");
	});
});

describe("pickMetaResultKey", () => {
	it("prefere compras, depois leads, depois conversas", () => {
		assert.equal(pickMetaResultKey({ purchases: 1, leads: 9, messagingConversationsStarted: 9 }), "purchases");
		assert.equal(pickMetaResultKey({ purchases: 0, leads: 2, messagingConversationsStarted: 9 }), "leads");
		assert.equal(pickMetaResultKey({ purchases: 0, leads: 0, messagingConversationsStarted: 3 }), "messagingConversationsStarted");
	});
});

describe("detectMetaAdsCreativeMedia", () => {
	it("detecta carrossel por dois ou mais child_attachments", () => {
		const media = detectMetaAdsCreativeMedia({
			object_story_spec: { link_data: { child_attachments: [{ picture: "https://a" }, { picture: "https://b" }] } },
		});
		assert.equal(media.tipoMidia, "CARROSSEL");
		assert.equal(media.cards.length, 2);
	});
	it("detecta vídeo pelo video_data do story spec", () => {
		const media = detectMetaAdsCreativeMedia({ object_story_spec: { video_data: { video_id: "v1" } } });
		assert.equal(media.tipoMidia, "VIDEO");
		assert.equal(media.videoId, "v1");
	});
});

describe("regras da sincronização do catálogo", () => {
	const now = new Date("2026-10-30T12:00:00Z");
	it("sem sincronização anterior a rodada é completa, mesmo se pedida incremental", () => {
		assert.equal(resolveSyncMode({ requested: "incremental", lastFullAt: null, lastSuccessAt: null, now }), "full");
	});
	it("automática vira completa depois de 24h da última completa", () => {
		const lastSuccessAt = new Date("2026-10-30T06:00:00Z");
		assert.equal(resolveSyncMode({ requested: "auto", lastFullAt: "2026-10-29T11:00:00Z", lastSuccessAt, now }), "full");
		assert.equal(resolveSyncMode({ requested: "auto", lastFullAt: "2026-10-30T01:00:00Z", lastSuccessAt, now }), "incremental");
	});
	it("guarda o nome anterior normalizado, sem duplicar", () => {
		const once = appendPreviousName({}, "campanha", " Black Friday ", "Black Friday 2026");
		assert.deepEqual(once.campanha, ["black friday"]);
		assert.deepEqual(appendPreviousName(once, "campanha", "Black Friday", "Natal").campanha, ["black friday"]);
		assert.equal(appendPreviousName({}, "anuncio", "Igual", "igual").anuncio, undefined);
	});
});
