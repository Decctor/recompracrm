import assert from "node:assert/strict";
import test from "node:test";
import { mapIfoodSale } from "./mappers";
import { IfoodOrderSchema } from "./types";

test("preserva no metadata o pagamento online para impressão independente do financeiro", () => {
	const order = IfoodOrderSchema.parse({
		id: "order-payment-online",
		status: "CONFIRMED",
		createdAt: "2026-08-31T13:30:00.000Z",
		payments: {
			prepaid: 27,
			pending: 0,
			methods: [{ method: "PIX", type: "ONLINE", value: 27, currency: "BRL" }],
		},
	});

	const sale = mapIfoodSale(order);
	assert.deepEqual(sale.integrationMetadata?.pagamentos, {
		prePago: 27,
		pendente: 0,
		metodos: [{ metodo: "PIX", valor: 27, pagoOnline: true, descricao: null }],
	});
});

test("preserva pagamento offline como valor a cobrar na entrega", () => {
	const order = IfoodOrderSchema.parse({
		id: "order-payment-offline",
		status: "CONFIRMED",
		createdAt: "2026-08-31T13:30:00.000Z",
		payments: {
			prepaid: 0,
			pending: 27,
			methods: [{ method: "CASH", type: "OFFLINE", value: 27, currency: "BRL" }],
		},
	});

	const sale = mapIfoodSale(order);
	assert.deepEqual(sale.integrationMetadata?.pagamentos?.metodos, [{ metodo: "DINHEIRO", valor: 27, pagoOnline: false, descricao: null }]);
});

test("guarda o troco a levar quando o cliente paga em dinheiro com nota maior", () => {
	const order = IfoodOrderSchema.parse({
		id: "order-payment-change",
		status: "CONFIRMED",
		createdAt: "2026-08-31T13:30:00.000Z",
		payments: {
			prepaid: 0,
			pending: 86,
			methods: [{ method: "CASH", type: "OFFLINE", value: 86, currency: "BRL", cash: { changeFor: 100 } }],
		},
	});

	const sale = mapIfoodSale(order);
	assert.equal(sale.payments?.[0]?.trocoPara, 100);
	assert.deepEqual(sale.integrationMetadata?.pagamentos?.metodos, [{ metodo: "DINHEIRO", valor: 86, pagoOnline: false, descricao: null, trocoPara: 100 }]);
});

test("não registra troco quando a nota informada não passa do valor", () => {
	const order = IfoodOrderSchema.parse({
		id: "order-payment-exact-cash",
		status: "CONFIRMED",
		createdAt: "2026-08-31T13:30:00.000Z",
		payments: {
			prepaid: 0,
			pending: 86,
			methods: [{ method: "CASH", type: "OFFLINE", value: 86, currency: "BRL", cash: { changeFor: 86 } }],
		},
	});

	const sale = mapIfoodSale(order);
	assert.equal("trocoPara" in (sale.integrationMetadata?.pagamentos?.metodos[0] ?? {}), false);
});

test("leva a instrução de entrega para a observação da venda e a referência para os metadados", () => {
	const order = IfoodOrderSchema.parse({
		id: "order-delivery-notes",
		status: "CONFIRMED",
		createdAt: "2026-08-31T13:30:00.000Z",
		orderType: "DELIVERY",
		delivery: {
			deliveredBy: "MERCHANT",
			observations: "  Tocar a campainha  ",
			deliveryAddress: { streetName: "R. Baru", streetNumber: "440", reference: "Portão verde" },
		},
	});

	const sale = mapIfoodSale(order);
	assert.equal(sale.notes, "Tocar a campainha");
	assert.equal(sale.integrationMetadata?.entrega.referencia, "Portão verde");
});

test("pedido sem instrução nem referência não cria as chaves (assinatura de importação estável)", () => {
	const order = IfoodOrderSchema.parse({
		id: "order-without-delivery-notes",
		status: "CONFIRMED",
		createdAt: "2026-08-31T13:30:00.000Z",
		orderType: "DELIVERY",
		delivery: { deliveredBy: "MERCHANT", observations: "   ", deliveryAddress: { streetName: "R. Baru" } },
	});

	const sale = mapIfoodSale(order);
	assert.equal(sale.notes, undefined);
	assert.equal("referencia" in (sale.integrationMetadata?.entrega ?? {}), false);
});
