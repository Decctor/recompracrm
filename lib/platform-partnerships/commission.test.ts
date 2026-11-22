import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveInvoiceCommission, splitInvoiceCommissionBase } from "./commission";

const CONSULTORIA = new Set(["price_consultoria", "price_consultoria_legado"]);
const ADDONS = new Set(["price_hub_m", "price_hub_y"]);

function split(lines: { amount: number; priceId: string | null; isYearly?: boolean }[]) {
	return splitInvoiceCommissionBase({
		lines: lines.map((line) => ({ isYearly: false, ...line })),
		consultoriaPriceIds: CONSULTORIA,
		addonPriceIds: ADDONS,
	});
}

test("o invoice se divide em plano-base, adicionais e consultoria", () => {
	assert.deepEqual(
		split([
			{ amount: 59990, priceId: "price_crm_erp" },
			{ amount: 29990, priceId: "price_hub_m" },
			{ amount: 50000, priceId: "price_consultoria" },
		]),
		{ valorConsultoriaCentavos: 50000, valorAdicionaisCentavos: 29990, valorBaseComissionavelCentavos: 59990, hasYearlyBaseLine: false },
	);
});

test("price de tier antigo ou sem price conta como plano-base", () => {
	const result = split([
		{ amount: 39990, priceId: "price_crescimento_legado" },
		{ amount: 1000, priceId: null },
		{ amount: 50000, priceId: "price_consultoria_legado" },
	]);
	assert.equal(result.valorBaseComissionavelCentavos, 40990);
	assert.equal(result.valorAdicionaisCentavos, 0);
	assert.equal(result.valorConsultoriaCentavos, 50000);
});

test("só o plano-base anual liga a regra anual", () => {
	assert.equal(split([{ amount: 287990, priceId: "price_hub_y", isYearly: true }]).hasYearlyBaseLine, false);
	assert.equal(split([{ amount: 575990, priceId: "price_crm_erp_y", isYearly: true }]).hasYearlyBaseLine, true);
});

test("venda completa: bônus só sobre o plano-base, 20% fixo sobre o Hub", () => {
	const invoice = { valorBaseComissionavelCentavos: 59990, valorAdicionaisCentavos: 29990, hasYearlyBaseLine: false };

	const first = resolveInvoiceCommission({ previousBaseInvoices: 0, ...invoice });
	assert.deepEqual(first, {
		numeroInvoiceAssinatura: 1,
		percentualComissaoBps: 10000,
		percentualComissaoAdicionaisBps: 2000,
		valorComissaoCentavos: 59990 + 5998,
	});

	const second = resolveInvoiceCommission({ previousBaseInvoices: 1, ...invoice });
	assert.equal(second.percentualComissaoBps, 2000);
	assert.equal(second.valorComissaoCentavos, 11998 + 5998);

	const third = resolveInvoiceCommission({ previousBaseInvoices: 2, ...invoice });
	assert.equal(third.percentualComissaoBps, 10000);
	assert.equal(third.valorComissaoCentavos, 59990 + 5998);

	const fourth = resolveInvoiceCommission({ previousBaseInvoices: 3, ...invoice });
	assert.equal(fourth.valorComissaoCentavos, 11998 + 5998);

	// Três primeiros invoices: ~R$ 1.500, como no plano de preços.
	assert.equal(first.valorComissaoCentavos + second.valorComissaoCentavos + third.valorComissaoCentavos, 149972);
});

test("sem adicional a regra é a de antes", () => {
	const base = { valorBaseComissionavelCentavos: 39990, valorAdicionaisCentavos: 0, hasYearlyBaseLine: false };
	assert.deepEqual(resolveInvoiceCommission({ previousBaseInvoices: 0, ...base }), {
		numeroInvoiceAssinatura: 1,
		percentualComissaoBps: 10000,
		percentualComissaoAdicionaisBps: 0,
		valorComissaoCentavos: 39990,
	});
	assert.equal(resolveInvoiceCommission({ previousBaseInvoices: 1, ...base }).valorComissaoCentavos, 7998);
	assert.equal(resolveInvoiceCommission({ previousBaseInvoices: 2, ...base }).valorComissaoCentavos, 39990);
});

test("anual: 27% no plano-base e 20% no Hub", () => {
	const result = resolveInvoiceCommission({
		previousBaseInvoices: 0,
		valorBaseComissionavelCentavos: 575990,
		valorAdicionaisCentavos: 287990,
		hasYearlyBaseLine: true,
	});
	assert.equal(result.percentualComissaoBps, 2700);
	assert.equal(result.valorComissaoCentavos, Math.round(575990 * 0.27) + Math.round(287990 * 0.2));
});

test("o proporcional de um Hub contratado no meio do ciclo paga 20% e não avança a numeração", () => {
	const prorated = resolveInvoiceCommission({
		previousBaseInvoices: 2,
		valorBaseComissionavelCentavos: 0,
		valorAdicionaisCentavos: 15000,
		hasYearlyBaseLine: false,
	});
	assert.deepEqual(prorated, {
		numeroInvoiceAssinatura: 2,
		percentualComissaoBps: 0,
		percentualComissaoAdicionaisBps: 2000,
		valorComissaoCentavos: 3000,
	});

	// O invoice seguinte, com plano-base, continua sendo o 3º e leva o bônus.
	const next = resolveInvoiceCommission({
		previousBaseInvoices: 2,
		valorBaseComissionavelCentavos: 39990,
		valorAdicionaisCentavos: 29990,
		hasYearlyBaseLine: false,
	});
	assert.equal(next.numeroInvoiceAssinatura, 3);
	assert.equal(next.percentualComissaoBps, 10000);
});

test("crédito de adicional cancelado não vira comissão negativa", () => {
	const result = resolveInvoiceCommission({
		previousBaseInvoices: 4,
		valorBaseComissionavelCentavos: 39990,
		valorAdicionaisCentavos: -12000,
		hasYearlyBaseLine: false,
	});
	assert.equal(result.percentualComissaoAdicionaisBps, 0);
	assert.equal(result.valorComissaoCentavos, 7998);
});
