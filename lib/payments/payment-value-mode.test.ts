import assert from "node:assert/strict";
import test from "node:test";
import { resolveSaleChange } from "../sales/sale-change";
import {
	getPaymentsToCharge,
	nextPaymentValueMode,
	promotePaymentToRemaining,
	resolveExcessAdjustment,
	resolvePaymentValues,
} from "./payment-value-mode";

type TTestPayment = { id: string; metodo: "PIX" | "DINHEIRO" | "CARTAO_DEBITO"; valor: number; valorModo: "RESTANTE" | "FIXO" };

const pix = (valorModo: TTestPayment["valorModo"], valor = 0): TTestPayment => ({ id: "pix", metodo: "PIX", valor, valorModo });
const cash = (valorModo: TTestPayment["valorModo"], valor = 0): TTestPayment => ({ id: "cash", metodo: "DINHEIRO", valor, valorModo });

test("RESTANTE cobre o total e acompanha o desconto lançado depois", () => {
	const payments = [pix("RESTANTE")];
	assert.equal(resolvePaymentValues(payments, 189.9)[0].valor, 189.9);
	// Desconto de R$ 30 depois do pagamento: era aqui que o excesso virava troco.
	const afterDiscount = resolvePaymentValues(payments, 159.9);
	assert.equal(afterDiscount[0].valor, 159.9);
	assert.equal(resolveSaleChange({ payments: afterDiscount, saleTotal: 159.9 }).troco, 0);
});

test("dividido: o FIXO digitado é descontado do RESTANTE", () => {
	const resolved = resolvePaymentValues([pix("RESTANTE"), cash("FIXO", 50)], 189.9);
	assert.equal(resolved[0].valor, 139.9);
	assert.equal(resolved[1].valor, 50);
});

test("nota de 200 em dinheiro fixo: troco certo antes e depois do desconto", () => {
	const payments = [cash("FIXO", 200)];
	assert.equal(resolveSaleChange({ payments: resolvePaymentValues(payments, 189.9), saleTotal: 189.9 }).troco, 10.1);
	// A nota na mão não mudou: o desconto aumenta o troco, e isso está certo.
	assert.equal(resolveSaleChange({ payments: resolvePaymentValues(payments, 159.9), saleTotal: 159.9 }).troco, 40.1);
});

test("RESTANTE zera quando os fixos já cobrem tudo, sem ficar negativo", () => {
	const resolved = resolvePaymentValues([pix("FIXO", 200), cash("RESTANTE")], 159.9);
	assert.equal(resolved[1].valor, 0);
});

test("maquininha com RESTANTE segue exata depois do desconto", () => {
	const card: TTestPayment = { id: "card", metodo: "CARTAO_DEBITO", valor: 0, valorModo: "RESTANTE" };
	assert.equal(resolvePaymentValues([card], 189.9)[0].valor, 189.9);
	assert.equal(resolvePaymentValues([card], 159.9)[0].valor, 159.9);
});

test("sem RESTANTE (rascunho antigo, tudo FIXO) devolve o mesmo array", () => {
	const payments = [pix("FIXO", 189.9)];
	assert.equal(resolvePaymentValues(payments, 159.9), payments);
});

test("valor já em dia devolve o mesmo array", () => {
	const payments = [pix("RESTANTE", 159.9)];
	assert.equal(resolvePaymentValues(payments, 159.9), payments);
});

test("mais de um RESTANTE: só o primeiro absorve a diferença", () => {
	const resolved = resolvePaymentValues([pix("RESTANTE"), cash("RESTANTE", 20)], 100);
	assert.equal(resolved[0].valor, 80);
	assert.equal(resolved[1].valor, 20);
});

test("arredonda em centavos", () => {
	assert.equal(resolvePaymentValues([pix("RESTANTE"), cash("FIXO", 0.1)], 0.3)[0].valor, 0.2);
});

test("pagamento novo cobre o restante só se ninguém cobre", () => {
	assert.equal(nextPaymentValueMode([]), "RESTANTE");
	assert.equal(nextPaymentValueMode([pix("FIXO", 100)]), "RESTANTE");
	assert.equal(nextPaymentValueMode([pix("RESTANTE")]), "FIXO");
});

test("promover congela o RESTANTE anterior no valor que mostrava", () => {
	const resolved = resolvePaymentValues([pix("RESTANTE"), cash("FIXO", 50)], 189.9);
	const promoted = promotePaymentToRemaining(resolved, (payment) => payment.id === "cash");
	assert.deepEqual(
		promoted.map((payment) => [payment.id, payment.valorModo, payment.valor]),
		[
			["pix", "FIXO", 139.9],
			["cash", "RESTANTE", 50],
		],
	);
	// Nada salta: com os mesmos totais, o promovido continua no mesmo valor.
	assert.equal(resolvePaymentValues(promoted, 189.9)[1].valor, 50);
	// E agora é ele que acompanha o total.
	assert.equal(resolvePaymentValues(promoted, 159.9)[1].valor, 20);
});

test("promover o próprio RESTANTE não muda nada", () => {
	const payments = [pix("RESTANTE", 10), cash("FIXO", 5)];
	const promoted = promotePaymentToRemaining(payments, (payment) => payment.id === "pix");
	assert.deepEqual(promoted, payments);
});

test("pagamentos zerados não são cobrados, de qualquer modo", () => {
	const payments = [pix("FIXO", 189.9), cash("RESTANTE", 0), { ...cash("FIXO", 0), id: "cash-2" }];
	assert.deepEqual(
		getPaymentsToCharge(payments).map((payment) => payment.id),
		["pix"],
	);
});

test("excesso no PIX fixo: ajusta o PIX para o total", () => {
	const result = resolveExcessAdjustment([pix("FIXO", 189.9)], 30);
	assert.equal(result?.payment.id, "pix");
	assert.equal(result?.valor, 159.9);
});

test("excesso não se resolve no dinheiro, nem com mais de um candidato, nem sem sobra", () => {
	assert.equal(resolveExcessAdjustment([cash("FIXO", 200)], 40.1), null);
	const card: TTestPayment = { id: "card", metodo: "CARTAO_DEBITO", valor: 100, valorModo: "FIXO" };
	assert.equal(resolveExcessAdjustment([pix("FIXO", 100), card], 30), null);
	assert.equal(resolveExcessAdjustment([pix("FIXO", 20), cash("FIXO", 200)], 60), null);
	assert.equal(resolveExcessAdjustment([pix("FIXO", 189.9)], 0), null);
});

test("excesso ignora o RESTANTE zerado na escolha do candidato", () => {
	const result = resolveExcessAdjustment([pix("FIXO", 189.9), cash("RESTANTE", 0)], 30);
	assert.equal(result?.valor, 159.9);
});
