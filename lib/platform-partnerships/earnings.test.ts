import assert from "node:assert/strict";
import { test } from "node:test";
import {
	type TEarningsCommission,
	type TEarningsReferral,
	buildPartnerEarningsSummary,
	buildPartnerStore,
	detectPixKeyType,
	getCommissionPayoutDate,
	getNextPayoutDate,
	getPayoutDateForEligibility,
	getStoreInitials,
	maskPixKey,
} from "./earnings";

// Horário local de São Paulo (UTC-3) → instante UTC.
const sp = (iso: string) => new Date(`${iso}-03:00`);
const day = (date: Date) => date.toISOString().slice(0, 10);

let commissionSeq = 0;
function commission(partial: Partial<TEarningsCommission>): TEarningsCommission {
	commissionSeq++;
	return {
		id: `c${commissionSeq}`,
		referralId: "r1",
		payoutId: null,
		numeroInvoiceAssinatura: 1,
		valorInvoiceBrutoCentavos: 19700,
		valorBaseComissionavelCentavos: 19700,
		percentualComissaoBps: 10000,
		valorComissaoCentavos: 19700,
		ajusteOrigemCommissionId: null,
		status: "PENDENTE",
		dataElegibilidade: sp("2026-09-15T10:00:00"),
		dataInsercao: sp("2026-08-16T10:00:00"),
		...partial,
	};
}

test("PIX do dia 10 paga o que ficou elegível até o fim do mês anterior", () => {
	assert.equal(day(getPayoutDateForEligibility(sp("2026-09-01T00:30:00"))), "2026-10-10");
	assert.equal(day(getPayoutDateForEligibility(sp("2026-09-30T23:30:00"))), "2026-10-10");
	// 23h30 do dia 30 em SP já é dia 1º em UTC: tem que continuar no PIX de outubro.
	assert.equal(day(getPayoutDateForEligibility(sp("2026-10-01T00:10:00"))), "2026-11-10");
	assert.equal(day(getPayoutDateForEligibility(sp("2026-12-20T12:00:00"))), "2027-01-10");
});

test("próximo PIX: o próprio dia 10 ainda é o próximo; o dia 11 passa para o mês seguinte", () => {
	assert.equal(day(getNextPayoutDate(sp("2026-09-30T12:00:00"))), "2026-10-10");
	assert.equal(day(getNextPayoutDate(sp("2026-10-10T20:00:00"))), "2026-10-10");
	assert.equal(day(getNextPayoutDate(sp("2026-10-11T08:00:00"))), "2026-11-10");
});

test("comissão atrasada rola para o próximo PIX em vez de ficar num PIX passado", () => {
	const next = getNextPayoutDate(sp("2026-09-30T12:00:00"));
	const late = commission({ dataElegibilidade: sp("2026-07-20T12:00:00"), status: "APROVADA" });
	assert.equal(day(getCommissionPayoutDate({ commission: late, payoutsById: new Map(), nextPayoutDate: next })), "2026-10-10");
});

function referral(partial: Partial<TEarningsReferral> & { commissions: TEarningsCommission[] }): TEarningsReferral {
	return {
		id: "r1",
		organizacaoNomeSnapshot: null,
		dataInsercao: sp("2026-07-18T10:00:00"),
		organizacao: {
			id: "o1",
			nome: "Padaria Pão de Mel",
			assinaturaPlano: "ESSENCIAL",
			stripeSubscriptionStatus: "active",
			periodoTesteFim: null,
			assinaturaPeriodoPagoFim: sp("2026-10-18T10:00:00"),
		},
		...partial,
	};
}

test("trilha: 1ª e 3ª a 100%, demais a 20%; próxima vem do fim do período pago", () => {
	const store = buildPartnerStore({
		referral: referral({
			commissions: [
				commission({ numeroInvoiceAssinatura: 1, status: "PAGA", dataInsercao: sp("2026-08-18T10:00:00") }),
				commission({
					numeroInvoiceAssinatura: 2,
					percentualComissaoBps: 2000,
					valorComissaoCentavos: 3940,
					dataInsercao: sp("2026-09-18T10:00:00"),
					dataElegibilidade: sp("2026-10-18T10:00:00"),
				}),
			],
		}),
		fallbackBaseCentavos: 19990,
		payoutsById: new Map(),
		now: sp("2026-09-30T12:00:00"),
	});
	assert.equal(store.iniciais, "PP");
	assert.equal(getStoreInitials("Ótica Visão Clara"), "OV");
	assert.equal(getStoreInitials("Mercadinho São Jorge"), "MS");
	assert.equal(store.periodicidade, "MENSAL");
	assert.equal(store.faturasPagas, 2);
	assert.equal(store.valorGanhoCentavos, 23640);
	assert.deepEqual(
		store.trilha.map((installment) => [installment.numero, installment.percentualComissaoBps, installment.situacao]),
		[
			[1, 10000, "PAGA"],
			[2, 2000, "PAGA"],
			[3, 10000, "PROXIMA"],
			[4, 2000, "FUTURA"],
			[5, 2000, "FUTURA"],
			[6, 2000, "FUTURA"],
		],
	);
	// A 3ª usa a base da última fatura (R$ 197,00), não o preço de tabela.
	assert.equal(store.proximaMensalidade?.valorComissaoCentavos, 19700);
	assert.equal(day(store.proximaMensalidade?.dataFatura as Date), "2026-10-18");
	// Fatura em 18/10 → elegível em 17/11 → PIX de 10/12.
	assert.equal(day(store.proximaMensalidade?.dataPix as Date), "2026-12-10");
	assert.equal(day(store.trilha[4].dataFatura as Date), "2026-12-18");
	// 12 mensalidades de R$ 197: 197 + 39,40 + 197 + 9 × 39,40 = 788,00.
	assert.equal(store.valorProjetado12MesesCentavos, 78800);
});

test("loja em teste projeta pelo preço do plano e marca a 1ª como próxima", () => {
	const store = buildPartnerStore({
		referral: referral({
			commissions: [],
			organizacao: {
				id: "o2",
				nome: "Ótica Visão Clara",
				assinaturaPlano: "ESSENCIAL",
				stripeSubscriptionStatus: null,
				periodoTesteFim: sp("2026-10-05T10:00:00"),
				assinaturaPeriodoPagoFim: null,
			},
		}),
		fallbackBaseCentavos: 19990,
		payoutsById: new Map(),
		now: sp("2026-09-30T12:00:00"),
	});
	assert.equal(store.situacao, "EM_TESTE");
	assert.equal(store.proximaMensalidade?.numero, 1);
	assert.equal(store.proximaMensalidade?.valorComissaoCentavos, 19990);
	assert.equal(day(store.proximaMensalidade?.dataFatura as Date), "2026-10-05");
});

test("comissão cancelada e ajuste não contam como mensalidade", () => {
	const store = buildPartnerStore({
		referral: referral({
			commissions: [
				commission({ numeroInvoiceAssinatura: 1, status: "PAGA" }),
				commission({ numeroInvoiceAssinatura: 2, status: "CANCELADA", valorComissaoCentavos: 3940 }),
				commission({ numeroInvoiceAssinatura: 1, ajusteOrigemCommissionId: "c-original", valorComissaoCentavos: -1000 }),
			],
		}),
		fallbackBaseCentavos: null,
		payoutsById: new Map(),
		now: sp("2026-09-30T12:00:00"),
	});
	assert.equal(store.faturasPagas, 1);
	assert.equal(store.valorGanhoCentavos, 18700);
	assert.equal(store.proximaMensalidade?.numero, 2);
});

test("resumo: próximo PIX, previsão garantida + projetada e bônus da 3ª", () => {
	const now = sp("2026-09-30T12:00:00");
	const commissions = [
		commission({ id: "paid", status: "PAGA", dataElegibilidade: sp("2026-08-17T10:00:00"), valorComissaoCentavos: 19700 }),
		commission({ id: "sep", status: "APROVADA", dataElegibilidade: sp("2026-09-17T10:00:00"), valorComissaoCentavos: 3940 }),
		commission({ id: "oct", status: "PENDENTE", dataElegibilidade: sp("2026-10-18T10:00:00"), valorComissaoCentavos: 3940 }),
		commission({ id: "void", status: "CANCELADA", dataElegibilidade: sp("2026-09-10T10:00:00"), valorComissaoCentavos: 99999 }),
	];
	const store = buildPartnerStore({
		referral: referral({
			commissions: [
				commission({ numeroInvoiceAssinatura: 1, status: "PAGA" }),
				commission({ numeroInvoiceAssinatura: 2, percentualComissaoBps: 2000, valorComissaoCentavos: 3940 }),
			],
			organizacao: {
				id: "o1",
				nome: "Padaria Pão de Mel",
				assinaturaPlano: "ESSENCIAL",
				stripeSubscriptionStatus: "active",
				periodoTesteFim: null,
				// Fatura em 05/10 → elegível em 04/11 → cai no PIX de 10/12, não no de 10/11.
				assinaturaPeriodoPagoFim: sp("2026-09-25T10:00:00"),
			},
		}),
		fallbackBaseCentavos: null,
		payoutsById: new Map(),
		now,
	});
	const summary = buildPartnerEarningsSummary({ commissions, payouts: [], stores: [store], now });
	assert.equal(day(summary.proximoPix.data), "2026-10-10");
	assert.equal(summary.proximoPix.valorCentavos, 3940);
	assert.equal(day(summary.previsao.data), "2026-11-10");
	assert.equal(summary.previsao.mes, "2026-10");
	assert.equal(summary.previsao.garantidoCentavos, 3940);
	// Fatura prevista em 25/09 (já passou, ainda não lançada): elegível 25/10 → PIX de 10/11.
	assert.equal(summary.previsao.projetadoCentavos, 19700);
	assert.equal(summary.bonusTerceiraMensalidade?.lojaNome, "Padaria Pão de Mel");
	assert.equal(summary.valorRecebidoCentavos, 19700);
	assert.equal(summary.valorTotalCentavos, 19700 + 3940 + 3940);
	assert.deepEqual(
		summary.ganhosPorMes.map((month) => [month.mes, month.valorCentavos, month.situacao]),
		[
			["2026-04", 0, "A_RECEBER"],
			["2026-05", 0, "A_RECEBER"],
			["2026-06", 0, "A_RECEBER"],
			["2026-07", 0, "A_RECEBER"],
			["2026-08", 19700, "PAGO"],
			["2026-09", 3940, "EM_APURACAO"],
		],
	);
	assert.equal(summary.lojasPagantes, 1);
});

test("máscara e detecção da chave PIX", () => {
	assert.equal(maskPixKey("123.456.789-09", "CPF"), "***.456.789-**");
	assert.equal(maskPixKey("12.345.678/0001-90", "CNPJ"), "12.345.678/0001-**");
	assert.equal(maskPixKey("marina@souza.com.br", "EMAIL"), "ma***@souza.com.br");
	assert.equal(maskPixKey("(11) 98765-4321", "TELEFONE"), "(**) *****-4321");
	assert.equal(detectPixKeyType("123.456.789-09"), "CPF");
	assert.equal(detectPixKeyType("12.345.678/0001-90"), "CNPJ");
	assert.equal(detectPixKeyType("marina@souza.com.br"), "EMAIL");
	assert.equal(detectPixKeyType("(11) 98765-4321"), "TELEFONE");
	assert.equal(detectPixKeyType("123e4567-e89b-12d3-a456-426614174000"), "ALEATORIA");
});

test("mês anterior no calendário de São Paulo", async () => {
	const { getPreviousLocalMonthRange } = await import("./earnings");
	const range = getPreviousLocalMonthRange(sp("2026-10-05T12:00:00"));
	assert.equal(range.start.toISOString(), "2026-09-01T03:00:00.000Z");
	assert.equal(range.end.toISOString(), "2026-10-01T02:59:59.999Z");
});
