import assert from "node:assert/strict";
import test from "node:test";
import { isPlaceholderPhone, mapSqlViewsSale, toCanonicalSqlViewsImportBatch } from "./mappers";
import type { TSqlViewsClientRow, TSqlViewsProductRow, TSqlViewsSaleItemRow, TSqlViewsSaleRow } from "./types";

function buildSale(overrides: Partial<TSqlViewsSaleRow> = {}): TSqlViewsSaleRow {
	return {
		venda_id: "1-500",
		venda_numero: "500",
		loja_id: "1",
		data_venda: new Date("2026-10-27T12:00:00.000Z"),
		data_atualizacao: new Date("2026-10-27T12:00:00.000Z"),
		status_codigo: "CONCLUIDA",
		status_original: "ENVIADO",
		data_cancelamento: null,
		valor_total: 18,
		cliente_id: "20214",
		cliente_nome: "MARIA DA SILVA",
		cliente_telefone: "34999998888",
		cliente_cpf_cnpj: "12345678909",
		vendedor_id: "7",
		vendedor_nome: "JOAO",
		canal: "LOJA",
		modalidade_entrega: "PRESENCIAL",
		documento_fiscal_numero: "1234",
		documento_fiscal_serie: "1",
		documento_fiscal_modelo: "65",
		documento_fiscal_chave: "3126...",
		...overrides,
	};
}

function buildItem(overrides: Partial<TSqlViewsSaleItemRow> = {}): TSqlViewsSaleItemRow {
	return {
		item_id: "1-500-1",
		venda_id: "1-500",
		produto_id: "149731",
		produto_codigo: "149731",
		produto_descricao: "DIPIRONA 500MG",
		quantidade: 2,
		valor_unitario: 10,
		valor_bruto: 20,
		valor_desconto: 2,
		valor_liquido: 18,
		custo_unitario: 4,
		custo_total: 8,
		sequencia: 1,
		unidade: "U",
		...overrides,
	};
}

function buildClient(overrides: Partial<TSqlViewsClientRow> = {}): TSqlViewsClientRow {
	return {
		cliente_id: "20214",
		nome: "MARIA DA SILVA",
		nome_fantasia: null,
		telefone: null,
		telefone_secundario: "34988887777",
		email: null,
		cpf_cnpj: "12345678909",
		inscricao_estadual: null,
		data_nascimento: "1980-03-15",
		cep: "38400000",
		estado: "MG",
		cidade: "UBERLANDIA",
		bairro: "CENTRO",
		logradouro: "RUA A",
		numero: "10",
		complemento: null,
		...overrides,
	};
}

test("venda concluída vira venda válida SN01 com itens, custo e desconto", () => {
	const sale = mapSqlViewsSale({ sale: buildSale(), items: [buildItem()], client: buildClient(), anonymousClientIds: [] });

	assert.equal(sale.isValidSale, true);
	assert.equal(sale.isCanceled, false);
	assert.equal(sale.nature, "SN01");
	assert.equal(sale.totalValue, 18);
	assert.equal(sale.totalCost, 8);
	assert.equal(sale.totalDiscount, 2);
	assert.equal(sale.channel, "Loja Física");
	assert.equal(sale.deliveryMode, "PRESENCIAL");
	assert.deepEqual(sale.seller, { identifier: "7", name: "JOAO" });
	assert.equal(sale.items[0].unitCostValue, 4);
	assert.equal(sale.items[0].netSaleValue, 18);
});

test("venda cancelada é cancelada e deixa de contar como SN01", () => {
	const sale = mapSqlViewsSale({
		sale: buildSale({ status_codigo: "CANCELADA", status_original: "ABORTADO" }),
		items: [buildItem()],
		client: null,
		anonymousClientIds: [],
	});

	assert.equal(sale.isCanceled, true);
	assert.equal(sale.isValidSale, false);
	assert.equal(sale.nature, "SN99");
	assert.equal(sale.statusText, "ABORTADO");
});

test("cliente do cadastro prevalece sobre a venda e traz aniversário como dia civil UTC", () => {
	const sale = mapSqlViewsSale({ sale: buildSale(), items: [], client: buildClient(), anonymousClientIds: [] });

	assert.equal(sale.client?.externalId, "20214");
	assert.equal(sale.client?.basePhone, "3488887777");
	assert.equal(sale.client?.birthDate?.toISOString(), "1980-03-15T00:00:00.000Z");
	assert.equal(sale.client?.location?.cep, "38400-000");
});

test("CLIENTE PADRÃO é venda sem cliente, mesmo com telefone fictício", () => {
	const byName = mapSqlViewsSale({
		sale: buildSale({ cliente_id: "30015372", cliente_nome: "CLIENTE PADRÃO", cliente_telefone: "3433333333" }),
		items: [],
		client: null,
		anonymousClientIds: [],
	});
	const byId = mapSqlViewsSale({
		sale: buildSale({ cliente_id: "999", cliente_nome: "BALCAO" }),
		items: [],
		client: null,
		anonymousClientIds: ["999"],
	});

	assert.equal(byName.client, null);
	assert.equal(byId.client, null);
});

test("cliente sem cadastro na view usa os dados da venda", () => {
	const sale = mapSqlViewsSale({ sale: buildSale(), items: [], client: undefined, anonymousClientIds: [] });

	assert.equal(sale.client?.name, "MARIA DA SILVA");
	assert.equal(sale.client?.basePhone, "3499998888");
	assert.equal(sale.client?.birthDate, null);
});

test("batch ordena itens pela sequência e prefere o cadastro da view ao produto do item", () => {
	const product: TSqlViewsProductRow = {
		produto_id: "149731",
		codigo: "149731",
		descricao: "DIPIRONA",
		unidade: "CX",
		grupo: "MEDICAMENTOS",
		tipo: "PRODUTO",
		ncm: "30049099",
		variante_descricao: "500MG",
	};
	const batch = toCanonicalSqlViewsImportBatch({
		organizationId: "org-1",
		window: { startDate: new Date("2026-10-27T03:00:00.000Z"), endDate: new Date("2026-10-28T02:59:59.999Z") },
		sales: [buildSale()],
		items: [buildItem({ item_id: "b", sequencia: 2, produto_id: "2", produto_codigo: "2" }), buildItem({ item_id: "a", sequencia: 1 })],
		clients: [],
		products: [product],
		anonymousClientIds: [],
	});

	assert.deepEqual(
		batch.sales[0].items.map((item) => item.metadata?.itemId),
		["a", "b"],
	);
	assert.equal(batch.products.find((item) => item.code === "149731")?.description, "DIPIRONA - 500MG");
	assert.equal(batch.products.find((item) => item.code === "2")?.group, "N/A");
	assert.equal(batch.sellers.length, 1);
});

test("telefone fictício é ignorado e o próximo telefone real assume", () => {
	assert.equal(isPlaceholderPhone("3433333333"), true);
	assert.equal(isPlaceholderPhone("3400000000"), true);
	assert.equal(isPlaceholderPhone("9999999999"), true);
	assert.equal(isPlaceholderPhone("3499726796"), false);

	const onlyPlaceholder = mapSqlViewsSale({
		sale: buildSale({ cliente_telefone: "3433333333" }),
		items: [],
		client: buildClient({ telefone: "3433333333", telefone_secundario: null }),
		anonymousClientIds: [],
	});
	const placeholderThenReal = mapSqlViewsSale({
		sale: buildSale(),
		items: [],
		client: buildClient({ telefone: "3400000000", telefone_secundario: "34999726796" }),
		anonymousClientIds: [],
	});

	assert.equal(onlyPlaceholder.client?.basePhone, "");
	assert.equal(onlyPlaceholder.client?.phone, "");
	assert.equal(onlyPlaceholder.client?.externalId, "20214");
	assert.equal(placeholderThenReal.client?.basePhone, "3499726796");
});
