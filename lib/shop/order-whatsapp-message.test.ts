import assert from "node:assert/strict";
import test from "node:test";
import { buildShopOrderWhatsappMessage, buildWhatsappMessageUrl, type TShopOrderWhatsappInput } from "./order-whatsapp-message";

const baseInput: TShopOrderWhatsappInput = {
	organizationName: "Brejaria Burguer",
	orderNumber: "0001ABCD",
	client: { nome: "Patricia Aidar", telefone: "34998071515" },
	deliveryMode: "ENTREGA",
	address: {
		logradouro: "R. RD 14",
		numero: "280",
		complemento: "Muro marrom",
		bairro: "Residencial Drummond",
		cidade: "Ituiutaba",
		estado: "MG",
		cep: "38302294",
	},
	paymentMethod: "CARTAO_CREDITO",
	items: [
		{
			nome: "Cheddar Combo",
			quantidade: 1,
			valorUnitarioBase: 41.9,
			valorTotalBruto: 46.9,
			observacoes: null,
			adicionais: [
				{ nome: "MINI ONION RINGS", grupo: "ACOMPANHAMENTO COMBO", quantidade: 1, valorUnitario: 4, valorTotal: 4 },
				{ nome: "Suco Abacaxi c/ hortelã 330ml", grupo: "BEBIDA COMBO:", quantidade: 1, valorUnitario: 1, valorTotal: 1 },
				{ nome: "Não quero sachês", grupo: "Aceita sachês?", quantidade: 1, valorUnitario: 0, valorTotal: 0 },
			],
		},
	],
	subtotal: 46.9,
	coupon: null,
	cashbackRedeemed: 15,
	rewards: [],
	otherDiscount: 0,
	deliveryFee: 7,
	estimatedMinutes: 45,
	total: 38.9,
	notes: null,
};

test("builds the order summary with customer, delivery, grouped add-ons and totals", () => {
	const message = buildShopOrderWhatsappMessage(baseInput);
	assert.ok(message.startsWith("*NOVO PEDIDO - BREJARIA BURGUER*\nCódigo: *0001ABCD*"));
	assert.ok(message.includes("*Telefone:* (34) 99807-1515"));
	assert.ok(message.includes("*Endereço:* R. RD 14, 280 - Muro marrom - Residencial Drummond - Ituiutaba/MG - CEP: 38302-294"));
	assert.ok(message.includes("*Pagamento:* Cartão de crédito"));
	assert.ok(
		message.includes("*1. CHEDDAR COMBO*\n   Qtd: 1x\n   Valor unit.: R$ 41,90\n   *ACOMPANHAMENTO COMBO:*\n      + MINI ONION RINGS (R$ 4,00)"),
	);
	assert.ok(message.includes("   *BEBIDA COMBO:*\n"), "trailing colon of the group name is not doubled");
	assert.ok(message.includes("      - Não quero sachês"), "free options use the dash marker");
	assert.ok(message.includes("*Adicionais: +R$ 5,00*\n   *Subtotal: R$ 46,90*"));
	assert.ok(message.includes("Taxa de entrega: R$ 7,00\nPrazo estimado: 45 minutos\n*TOTAL: R$ 38,90*"));
	assert.ok(message.includes("Cashback: -R$ 15,00"));
});

test("omits address and delivery fee for pickup orders", () => {
	const message = buildShopOrderWhatsappMessage({ ...baseInput, deliveryMode: "RETIRADA", deliveryFee: 0 });
	assert.ok(message.includes("*Recebimento:* Retirada no local"));
	assert.ok(!message.includes("Endereço"));
	assert.ok(!message.includes("Taxa de entrega"));
});

test("builds the wa.me link adding the Brazilian country code only when missing", () => {
	assert.equal(buildWhatsappMessageUrl("(34) 99807-1515", "oi"), "https://wa.me/5534998071515?text=oi");
	assert.equal(buildWhatsappMessageUrl("5534998071515", "a b"), "https://wa.me/5534998071515?text=a%20b");
	assert.equal(buildWhatsappMessageUrl("123", "oi"), null);
	assert.equal(buildWhatsappMessageUrl(null, "oi"), null);
});
