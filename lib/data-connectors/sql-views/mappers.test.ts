import assert from "node:assert/strict";
import test from "node:test";
import { isPlaceholderPhone, mapSqlViewsSale, mapSqlViewsSalePayment, toCanonicalSqlViewsImportBatch } from "./mappers";
import { getManagedChannelIntegrationMetadata } from "@/lib/sales/fulfillment-channels/policy";
import { SaleIntegrationMetadataSchema } from "@/schemas/sales";
import type { TSqlViewsClientRow, TSqlViewsProductRow, TSqlViewsSaleItemRow, TSqlViewsSalePaymentRow, TSqlViewsSaleRow } from "./types";

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

function buildPayment(overrides: Partial<TSqlViewsSalePaymentRow> = {}): TSqlViewsSalePaymentRow {
	return {
		pagamento_id: "PAG-1",
		venda_id: "1-500",
		forma_pagamento: "PIX",
		forma_pagamento_original: "PIX",
		valor: 18,
		parcelas: 1,
		pago_online: false,
		troco_para: null,
		...overrides,
	};
}

test("fonte sem view de pagamentos: venda chega com payments null", () => {
	const sale = mapSqlViewsSale({ sale: buildSale(), items: [buildItem()], client: buildClient(), anonymousClientIds: [] });
	assert.equal(sale.payments, null);
});

test("pagamento usa a forma da fonte quando a integração não traduz o rótulo", () => {
	const payment = mapSqlViewsSalePayment(buildPayment(), {});
	assert.deepEqual(payment, { metodo: "PIX", valor: 18, pagoOnline: false, descricao: "PIX", trocoPara: null, formaOriginal: "PIX" });
});

test("tradução da integração vence a forma da fonte, comparando o rótulo normalizado", () => {
	const mapping = { tef: "CARTAO_CREDITO" as const, Subsídio: "OUTRO" as const, CONVENIO: "FIADO_NOTA" as const };
	assert.equal(mapSqlViewsSalePayment(buildPayment({ forma_pagamento: "OUTRO", forma_pagamento_original: "TEF" }), mapping).metodo, "CARTAO_CREDITO");
	assert.equal(mapSqlViewsSalePayment(buildPayment({ forma_pagamento: "OUTRO", forma_pagamento_original: "SUBSIDIO" }), mapping).metodo, "OUTRO");
	assert.equal(
		mapSqlViewsSalePayment(buildPayment({ forma_pagamento: "OUTRO", forma_pagamento_original: " Convênio " }), mapping).metodo,
		"FIADO_NOTA",
	);
});

test("forma da fonte fora do enum vira OUTRO", () => {
	assert.equal(mapSqlViewsSalePayment(buildPayment({ forma_pagamento: "CHEQUE", forma_pagamento_original: "CHEQUE" }), {}).metodo, "OUTRO");
});

test("batch distribui pagamentos por venda; venda sem linha na view recebe lista vazia", () => {
	const batch = toCanonicalSqlViewsImportBatch({
		organizationId: "org-1",
		window: { startDate: new Date("2026-10-27T00:00:00.000Z"), endDate: new Date("2026-10-28T00:00:00.000Z") },
		sales: [buildSale(), buildSale({ venda_id: "1-501", status_codigo: "CANCELADA" })],
		items: [buildItem()],
		clients: [],
		products: [],
		anonymousClientIds: [],
		payments: [
			buildPayment({ forma_pagamento: "DINHEIRO", forma_pagamento_original: "DINHEIRO", valor: 50, troco_para: null }),
			buildPayment({ pagamento_id: "PAG-2", forma_pagamento: "DINHEIRO", forma_pagamento_original: "DINHEIRO", valor: -32, troco_para: 50 }),
		],
		paymentMethodMapping: {},
	});
	assert.deepEqual(
		batch.sales[0].payments?.map((payment) => [payment.metodo, payment.valor, payment.trocoPara]),
		[
			["DINHEIRO", 50, null],
			["DINHEIRO", -32, 50],
		],
	);
	assert.deepEqual(batch.sales[1].payments, []);
});

test("integracaoMetadados registra a fonte e as entradas das decisões, com base comum neutra", () => {
	const sale = mapSqlViewsSale({
		sale: buildSale(),
		items: [buildItem()],
		client: buildClient({ telefone: "3400000000", telefone_secundario: "34999726796" }),
		anonymousClientIds: [],
		payments: [
			buildPayment({ forma_pagamento: "OUTRO", forma_pagamento_original: "CONVENIO", valor: 10 }),
			buildPayment({ pagamento_id: "PAG-2", forma_pagamento: "PIX", forma_pagamento_original: "PIX", valor: 5 }),
			buildPayment({ pagamento_id: "PAG-3", forma_pagamento: "CHEQUE", forma_pagamento_original: "CHEQUE", valor: 3 }),
		],
		paymentMethodMapping: { Convênio: "FIADO_NOTA" },
		source: { contrato_versao: "1.2", sistema_nome: "ATMA", fuso_horario: null, ultima_venda_em: null, ultima_atualizacao_em: null, gerado_em: null },
	});

	assert.deepEqual(sale.integrationMetadata, {
		versao: 1,
		canal: "SQL_VIEWS",
		entrega: { realizadaPor: null, valorFrete: 0 },
		descontos: { loja: 0, patrocinados: [] },
		taxasCanal: [],
		pagamentos: {
			prePago: 0,
			pendente: 0,
			metodos: [
				{ metodo: "FIADO_NOTA", valor: 10, pagoOnline: false, descricao: "CONVENIO" },
				{ metodo: "PIX", valor: 5, pagoOnline: false, descricao: "PIX" },
				{ metodo: "OUTRO", valor: 3, pagoOnline: false, descricao: "CHEQUE" },
			],
		},
		sqlViews: {
			sistema: "ATMA",
			contratoVersao: "1.2",
			lojaId: "1",
			statusCodigo: "CONCLUIDA",
			statusOriginal: "ENVIADO",
			clienteId: "20214",
			telefoneCampo: "TELEFONE_SECUNDARIO",
			formasPagamento: [
				{ original: "CONVENIO", metodo: "FIADO_NOTA", traducao: "MAPEAMENTO_INTEGRACAO" },
				{ original: "PIX", metodo: "PIX", traducao: "FONTE" },
				{ original: "CHEQUE", metodo: "OUTRO", traducao: "PADRAO_OUTRO" },
			],
		},
	});
});

test("sem view de pagamentos não há bloco pagamentos; cliente anônimo não tem telefone escolhido", () => {
	const sale = mapSqlViewsSale({
		sale: buildSale({ cliente_id: "30015372", cliente_nome: "CLIENTE PADRÃO", cliente_telefone: "34999998888" }),
		items: [],
		client: null,
		anonymousClientIds: [],
	});

	assert.equal("pagamentos" in (sale.integrationMetadata ?? {}), false);
	assert.equal(sale.integrationMetadata?.sqlViews?.formasPagamento, null);
	assert.equal(sale.integrationMetadata?.sqlViews?.clienteId, "30015372");
	assert.equal(sale.integrationMetadata?.sqlViews?.telefoneCampo, null);
	assert.equal(sale.integrationMetadata?.sqlViews?.sistema, null);
});

test("telefone da linha da venda é registrado quando o cliente não está na view de clientes", () => {
	const sale = mapSqlViewsSale({ sale: buildSale(), items: [], client: undefined, anonymousClientIds: [] });
	assert.equal(sale.integrationMetadata?.sqlViews?.telefoneCampo, "CLIENTE_TELEFONE");
});

test("metadados do SQL-VIEWS não ligam o tratamento de canal gerenciado", () => {
	const sale = mapSqlViewsSale({ sale: buildSale(), items: [], client: buildClient(), anonymousClientIds: [], payments: [buildPayment()] });
	assert.equal(getManagedChannelIntegrationMetadata(sale.integrationMetadata), null);
	const ifoodLike = { ...sale.integrationMetadata!, canal: "IFOOD", sqlViews: undefined };
	assert.equal(getManagedChannelIntegrationMetadata(ifoodLike), ifoodLike);
	assert.equal(getManagedChannelIntegrationMetadata(null), null);
});

test("metadados gerados passam no schema da coluna", () => {
	const sale = mapSqlViewsSale({
		sale: buildSale(),
		items: [buildItem()],
		client: buildClient(),
		anonymousClientIds: [],
		payments: [buildPayment({ troco_para: 50 })],
	});
	assert.doesNotThrow(() => SaleIntegrationMetadataSchema.parse(sale.integrationMetadata));
});
