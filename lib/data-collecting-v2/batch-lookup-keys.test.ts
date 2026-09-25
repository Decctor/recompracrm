import assert from "node:assert/strict";
import { test } from "node:test";
import type { TCanonicalImportBatch, TCanonicalSale } from "@/lib/data-connectors";
import { collectBatchLookupKeys, normalizeClientName } from "./batch-lookup-keys";

function sale(overrides: Partial<TCanonicalSale>): TCanonicalSale {
	return {
		sourceSaleId: "S1",
		totalValue: 10,
		totalCost: 0,
		totalDiscount: 0,
		totalSurcharge: 0,
		sellerName: "",
		channel: null,
		deliveryMode: "RETIRADA",
		partnerIdentifier: null,
		key: "",
		document: "",
		model: "",
		movement: "",
		nature: "",
		series: "",
		statusText: "",
		type: "",
		occurredAt: new Date("2026-09-25T12:00:00Z"),
		client: null,
		seller: null,
		partner: null,
		items: [],
		isValidSale: true,
		isCanceled: false,
		...overrides,
	} as TCanonicalSale;
}

function batch(overrides: Partial<TCanonicalImportBatch>): TCanonicalImportBatch {
	return {
		organizationId: "org",
		integrationId: "int",
		source: "IFOOD",
		window: { startDate: new Date(), endDate: new Date() },
		policies: { clientResolutionStrategy: "EXTERNAL_ID_THEN_PHONE", saleItemRewritePolicy: "REPLACE_ON_EVERY_SYNC" },
		sales: [],
		products: [],
		sellers: [],
		partners: [],
		productAddOns: [],
		productAddOnOptions: [],
		...overrides,
	} as unknown as TCanonicalImportBatch;
}

test("normalizeClientName trims and uppercases like the context index", () => {
	assert.equal(normalizeClientName("  maria josé "), "MARIA JOSÉ");
	assert.equal(normalizeClientName(null), "");
});

test("collects deduplicated keys from sales, items and batch-level entities", () => {
	const keys = collectBatchLookupKeys(
		batch({
			products: [
				{ externalId: "EXT-1", code: "P1", description: "", unit: "", group: "", ncm: "", type: "" },
				{ externalId: null, code: "P2", description: "", unit: "", group: "", ncm: "", type: "" },
			],
			sellers: [{ identifier: "V1", name: "Ana" }],
			partners: [{ identifier: "PA1", name: "Parceiro" }],
			sales: [
				sale({
					client: { externalId: "C1", name: " joão ", phone: "", basePhone: "11999990000" },
					seller: { identifier: "V2", name: "Bia" },
					partnerIdentifier: "PA2",
					items: [
						{
							productExternalId: "EXT-9",
							productCode: "P1",
							quantity: 1,
							unitSaleValue: 1,
							unitCostValue: 0,
							grossSaleValue: 1,
							discountValue: 0,
							netSaleValue: 1,
							totalCostValue: 0,
						},
						{
							productExternalId: null,
							productCode: "P3",
							quantity: 1,
							unitSaleValue: 1,
							unitCostValue: 0,
							grossSaleValue: 1,
							discountValue: 0,
							netSaleValue: 1,
							totalCostValue: 0,
						},
					],
				}),
				sale({ sourceSaleId: "S2", client: { externalId: "C1", name: "JOÃO", phone: "", basePhone: "" } }),
				sale({ sourceSaleId: "S3", client: null }),
			],
		}),
	);

	assert.deepEqual(keys, {
		clientExternalIds: ["C1"],
		clientBasePhones: ["11999990000"],
		clientNames: ["JOÃO"],
		productCodes: ["P1", "P2", "P3"],
		productExternalItemIds: ["EXT-1", "EXT-9"],
		sellerIdentifiers: ["V1", "V2"],
		partnerIdentifiers: ["PA1", "PA2"],
	});
});

test("an empty batch yields empty key lists", () => {
	const keys = collectBatchLookupKeys(batch({}));
	assert.ok(Object.values(keys).every((list) => list.length === 0));
});
