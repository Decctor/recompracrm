import assert from "node:assert/strict";
import { test } from "node:test";
import type { TCanonicalClient, TCanonicalImportBatch } from "@/lib/data-connectors";
import { clientDocumentsConflict, normalizeClientDocument } from "./client-document";
import { getCanonicalClientResolutionKey, matchClientForCanonicalSale, resolveClientForCanonicalSale } from "./sync-auxiliary-entities";
import type { TResolvedAuxiliaryEntities, TResolvedClientForImport } from "./types";

// CPFs válidos (dígitos verificadores corretos), sem relação com pessoas reais.
const CPF_ANDRE = "52998224725";
const CPF_ANA = "11144477735";
const PHONE = "3497732842";

function crmClient(overrides: Partial<TResolvedClientForImport>): TResolvedClientForImport {
	return {
		id: "client",
		externalId: null,
		name: "CLIENTE",
		basePhone: "",
		document: null,
		rfmTitle: null,
		metadataTotalPurchases: 0,
		metadataTotalPurchaseValue: 0,
		isNew: false,
		...overrides,
	};
}

/** Contexto como a carga monta: listas por documento na ordem dada (compra mais recente por último). */
function context(entries: TResolvedClientForImport[]): TResolvedAuxiliaryEntities {
	const clientsByDocument = new Map<string, TResolvedClientForImport[]>();
	for (const client of entries) {
		if (client.document) clientsByDocument.set(client.document, [...(clientsByDocument.get(client.document) ?? []), client]);
	}
	return {
		clientsByExternalId: new Map(entries.filter((client) => client.externalId).map((client) => [client.externalId as string, client])),
		clientsByName: new Map(),
		clientsByBasePhone: new Map(entries.filter((client) => client.basePhone).map((client) => [client.basePhone, client])),
		clientsByDocument,
		productsByCode: new Map(),
		productsByExternalItemId: new Map(),
		variantsByCode: new Map(),
		sellersByIdentifier: new Map(),
		partnersByIdentifier: new Map(),
		productAddOnsByExternalId: new Map(),
		productAddOnOptionsByExternalId: new Map(),
		createdClientsCount: 0,
		createdProductsCount: 0,
		createdSellersCount: 0,
		createdPartnersCount: 0,
	};
}

const batch = {
	policies: { clientResolutionStrategy: "EXTERNAL_ID_THEN_PHONE", saleItemRewritePolicy: "REPLACE_ON_EVERY_SYNC" },
} as unknown as TCanonicalImportBatch;

function canonical(overrides: Partial<TCanonicalClient>): TCanonicalClient {
	return { externalId: null, name: "CLIENTE", phone: "", basePhone: "", ...overrides };
}

test("normalizeClientDocument keeps only valid documents, as digits", () => {
	assert.equal(normalizeClientDocument("529.982.247-25"), CPF_ANDRE);
	assert.equal(normalizeClientDocument("000.000.000-00"), null);
	assert.equal(normalizeClientDocument("123"), null);
	assert.equal(normalizeClientDocument(null), null);
});

test("documents conflict only when both exist, have the same type and differ", () => {
	assert.equal(clientDocumentsConflict(CPF_ANDRE, CPF_ANA), true);
	assert.equal(clientDocumentsConflict(CPF_ANDRE, CPF_ANDRE), false);
	assert.equal(clientDocumentsConflict(CPF_ANDRE, null), false);
	assert.equal(clientDocumentsConflict(null, null), false);
	// CPF da pessoa contra CNPJ do MEI dela: não prova que são pessoas diferentes.
	assert.equal(clientDocumentsConflict(CPF_ANDRE, "11222333000181"), false);
});

test("external id wins over document and phone", () => {
	const andre = crmClient({ id: "andre", basePhone: PHONE, document: CPF_ANDRE });
	const linked = crmClient({ id: "linked", externalId: "20117" });
	const match = matchClientForCanonicalSale(batch, context([andre, linked]), canonical({ externalId: "20117", basePhone: PHONE, cpfCnpj: CPF_ANA }));
	assert.deepEqual([match?.client.id, match?.via], ["linked", "EXTERNAL_ID"]);
});

test("CPF comes before phone: a family member's purchase goes to their own record", () => {
	// O celular é do André, mas o cadastro do ERP é da Ana, que já existe no CRM sem telefone.
	const andre = crmClient({ id: "andre", basePhone: PHONE });
	const ana = crmClient({ id: "ana", document: CPF_ANA });
	const match = matchClientForCanonicalSale(batch, context([andre, ana]), canonical({ externalId: "20117", basePhone: PHONE, cpfCnpj: CPF_ANA }));
	assert.deepEqual([match?.client.id, match?.via], ["ana", "DOCUMENT"]);
});

test("same phone, different CPF and no record for that CPF: no match, so a new client is created", () => {
	const andre = crmClient({ id: "andre", basePhone: PHONE, document: CPF_ANDRE });
	assert.equal(resolveClientForCanonicalSale(batch, context([andre]), canonical({ externalId: "20117", basePhone: PHONE, cpfCnpj: CPF_ANA })), null);
});

test("phone still decides when either side has no document", () => {
	const noDocument = crmClient({ id: "phone-owner", basePhone: PHONE });
	const byPhone = matchClientForCanonicalSale(batch, context([noDocument]), canonical({ basePhone: PHONE, cpfCnpj: CPF_ANA }));
	assert.deepEqual([byPhone?.client.id, byPhone?.via], ["phone-owner", "PHONE"]);

	const withDocument = crmClient({ id: "phone-owner", basePhone: PHONE, document: CPF_ANDRE });
	assert.equal(resolveClientForCanonicalSale(batch, context([withDocument]), canonical({ basePhone: PHONE }))?.id, "phone-owner");
});

test("a known CPF resolves even without a phone", () => {
	const known = crmClient({ id: "known", document: CPF_ANA });
	assert.equal(resolveClientForCanonicalSale(batch, context([known]), canonical({ cpfCnpj: CPF_ANA }))?.id, "known");
});

test("duplicates by CPF: the one with the sale's phone wins, even if older", () => {
	const old = crmClient({ id: "old-with-phone", basePhone: PHONE, document: CPF_ANDRE });
	const recent = crmClient({ id: "recent-with-code", externalId: "20000495", document: CPF_ANDRE });
	assert.equal(resolveClientForCanonicalSale(batch, context([old, recent]), canonical({ basePhone: PHONE, cpfCnpj: CPF_ANDRE }))?.id, "old-with-phone");
});

test("duplicates by CPF without phone match: the one carrying a source code wins, then the most recent", () => {
	const withCode = crmClient({ id: "with-code", externalId: "20000495", document: CPF_ANDRE });
	const recent = crmClient({ id: "recent", document: CPF_ANDRE });
	assert.equal(resolveClientForCanonicalSale(batch, context([withCode, recent]), canonical({ cpfCnpj: CPF_ANDRE }))?.id, "with-code");

	const older = crmClient({ id: "older", document: CPF_ANDRE });
	const newer = crmClient({ id: "newer", document: CPF_ANDRE });
	assert.equal(resolveClientForCanonicalSale(batch, context([older, newer]), canonical({ cpfCnpj: CPF_ANDRE }))?.id, "newer");
});

test("other strategies are untouched", () => {
	const nameBatch = { policies: { clientResolutionStrategy: "NAME_THEN_PHONE" } } as unknown as TCanonicalImportBatch;
	const byPhone = crmClient({ id: "phone-owner", basePhone: PHONE, document: CPF_ANDRE });
	assert.equal(resolveClientForCanonicalSale(nameBatch, context([byPhone]), canonical({ basePhone: PHONE, cpfCnpj: CPF_ANA }))?.id, "phone-owner");
});

test("resolution key: external id, then document, then phone", () => {
	assert.equal(getCanonicalClientResolutionKey(batch, canonical({ externalId: "20117", basePhone: PHONE, cpfCnpj: CPF_ANA })), "20117");
	assert.equal(getCanonicalClientResolutionKey(batch, canonical({ basePhone: PHONE, cpfCnpj: CPF_ANA })), CPF_ANA);
	assert.equal(getCanonicalClientResolutionKey(batch, canonical({ basePhone: PHONE })), PHONE);
});
