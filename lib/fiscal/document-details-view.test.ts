import assert from "node:assert/strict";
import test from "node:test";
import {
	buildSaleProductNames,
	extractPayloadItems,
	extractRecipientFromPayload,
	extractTaxTotalsFromPayload,
	isPlaceholderItemDescription,
} from "./document-details-view";

const spedyPayload = {
	receiver: { name: "Maria", federalTaxNumber: "13953428659" },
	items: [
		{ description: "Açaí 500ml", ncm: "08119000", cfop: 5102, quantity: 1, unitAmount: 34, totalAmount: 34, taxes: { icms: { csosn: 102 } } },
		{ description: "Água", ncm: "22011000", cfop: 5405, quantity: 2, unitAmount: 3, totalAmount: 6, taxes: { icms: { csosn: 500 } } },
	],
	total: {
		invoiceAmount: 47,
		productAmount: 40,
		discountAmount: 0,
		pisAmount: 0,
		cofinsAmount: 0,
		totalTax: 12.89,
		icmsBaseTax: 0,
		icmsAmount: 0,
		icmsStAmount: 0,
		fcpAmount: 0,
	},
};

const infNFePayload = {
	infNFe: {
		dest: { xNome: "Empresa X", CNPJ: "53825696000151" },
		det: [
			{
				nItem: 1,
				prod: { xProd: "Bombom", NCM: "18069000", CFOP: "5102", qCom: 3, vUnCom: 2, vProd: 6 },
				imposto: { ICMS: { ICMSSN102: { CSOSN: "102" } } },
			},
		],
		total: { ICMSTot: { vNF: "6.00", vProd: "6.00", vDesc: "0.00", vTotTrib: "1.10" } },
	},
};

test("totais: payload da Spedy", () => {
	const totals = extractTaxTotalsFromPayload(spedyPayload);
	assert.equal(totals?.vNF, 47);
	assert.equal(totals?.vProd, 40);
	assert.equal(totals?.vTotTrib, 12.89);
	assert.equal(totals?.vICMS, 0);
});

test("totais: payload espelho do XML (infNFe)", () => {
	const totals = extractTaxTotalsFromPayload(infNFePayload);
	assert.equal(totals?.vNF, 6);
	assert.equal(totals?.vTotTrib, 1.1);
	// Ausente no payload é "sem dado", não zero.
	assert.equal(totals?.vICMS, null);
});

test("totais: sem payload ou formato desconhecido devolve null", () => {
	assert.equal(extractTaxTotalsFromPayload(null), null);
	assert.equal(extractTaxTotalsFromPayload({ algo: 1 }), null);
});

test("destinatário nos dois formatos", () => {
	assert.deepEqual(extractRecipientFromPayload(spedyPayload), { nome: "Maria", cpfCnpj: "13953428659" });
	assert.deepEqual(extractRecipientFromPayload(infNFePayload), { nome: "Empresa X", cpfCnpj: "53825696000151" });
	assert.equal(extractRecipientFromPayload({ receiver: { name: "", federalTaxNumber: "" } }), null);
});

test("itens: CFOP e CSOSN numéricos da Spedy viram texto", () => {
	const items = extractPayloadItems(spedyPayload);
	assert.equal(items.length, 2);
	assert.deepEqual(
		items.map((item) => [item.cfop, item.csosn, item.valorTotal]),
		[
			["5102", "102", 34],
			["5405", "500", 6],
		],
	);
	assert.equal(extractPayloadItems(infNFePayload)[0]?.cfop, "5102");
});

test("itens: código do item vira produtoId nos dois formatos", () => {
	const spedy = extractPayloadItems({ items: [{ code: "prod-1", description: "ITEM 1", quantity: 1, totalAmount: 5 }] });
	assert.equal(spedy[0].produtoId, "prod-1");
	const xml = extractPayloadItems({ infNFe: { det: [{ nItem: 1, prod: { cProd: "prod-2", xProd: "Bombom" } }] } });
	assert.equal(xml[0].produtoId, "prod-2");
});

test("itens: só o ITEM N de reserva conta como nome genérico", () => {
	assert.equal(isPlaceholderItemDescription("ITEM 1"), true);
	assert.equal(isPlaceholderItemDescription("Item 12"), true);
	assert.equal(isPlaceholderItemDescription("Item especial"), false);
	assert.equal(isPlaceholderItemDescription("Açaí 500ml"), false);
});

test("nomes da venda: nome gravado no item ganha do catálogo", () => {
	const names = buildSaleProductNames({
		id: "v1",
		valorTotal: 10,
		dataVenda: null,
		statusVenda: null,
		canal: null,
		itens: [
			{
				id: "i1",
				produtoId: "p1",
				produto: { nome: "Catálogo 1" },
				quantidade: 1,
				valorVendaUnitario: 5,
				valorVendaTotalBruto: 5,
				valorTotalDesconto: 0,
				metadados: { nome: "Na venda 1" },
			},
			{
				id: "i2",
				produtoId: "p2",
				produto: { nome: "Catálogo 2" },
				quantidade: 1,
				valorVendaUnitario: 5,
				valorVendaTotalBruto: 5,
				valorTotalDesconto: 0,
				metadados: { origem: "IMPORTACAO" },
			},
		],
	});
	assert.equal(names.get("p1"), "Na venda 1");
	assert.equal(names.get("p2"), "Catálogo 2");
});
