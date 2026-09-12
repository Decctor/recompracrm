import assert from "node:assert/strict";
import { test } from "node:test";
import { classifySalePaymentTransactions, groupSalePaymentsByMethod, type SalePaymentTransactionInput } from "./utils";

/**
 * Uma venda parcelada tem uma linha por parcela em `financial_transactions`. A leitura útil na
 * página da venda é uma linha por pagamento ("Crédito 6x · 2 de 6 recebidas"), não seis linhas.
 * Estes testes fixam o colapso e os três casos que ele precisa distinguir: a vista, parcelado e
 * cancelado.
 */

const NOW = new Date("2026-09-03T12:00:00.000Z");

function transaction(overrides: Partial<SalePaymentTransactionInput> & { id: string }): SalePaymentTransactionInput {
	return {
		lancamentoContabilId: "lancamento-1",
		valor: 100,
		tipo: "ENTRADA",
		metodo: "CARTAO_CREDITO",
		dataPrevisao: NOW,
		...overrides,
	};
}

function group(transactions: SalePaymentTransactionInput[]) {
	return groupSalePaymentsByMethod(classifySalePaymentTransactions(transactions).todas, NOW);
}

test("parcelas do mesmo pagamento colapsam numa linha só", () => {
	const groups = group([
		transaction({
			id: "p1",
			parcela: 1,
			totalParcelas: 3,
			valor: 200,
			dataEfetivacao: new Date("2026-08-01"),
		}),
		transaction({
			id: "p2",
			parcela: 2,
			totalParcelas: 3,
			valor: 200,
			dataPrevisao: new Date("2026-09-01"),
		}),
		transaction({
			id: "p3",
			parcela: 3,
			totalParcelas: 3,
			valor: 200,
			dataPrevisao: new Date("2026-10-01"),
		}),
	]);

	assert.equal(groups.length, 1);
	assert.equal(groups[0].parcelasTotal, 3);
	assert.equal(groups[0].parcelasRecebidas, 1);
	assert.equal(groups[0].valor, 600);
	assert.equal(groups[0].valorRecebido, 200);
	assert.equal(groups[0].transacaoFinanceiraId, "p2");
	// A parcela em aberto mais próxima, não a primeira da lista.
	assert.deepEqual(groups[0].proximoVencimento, new Date("2026-09-01"));
});

test("pagamento à vista vira um grupo de uma parcela", () => {
	// `resolveInstallmentGroupId` devolve null quando totalParcelas <= 1: o fallback por `id` é o
	// que impede dois pagamentos à vista de colidirem num grupo só.
	const groups = group([
		transaction({
			id: "pix",
			metodo: "PIX",
			valor: 150,
			dataEfetivacao: new Date("2026-09-02"),
		}),
		transaction({
			id: "dinheiro",
			metodo: "DINHEIRO",
			valor: 50,
			dataEfetivacao: new Date("2026-09-02"),
		}),
	]);

	assert.equal(groups.length, 2);
	assert.deepEqual(
		groups.map((item) => [item.metodo, item.parcelasTotal, item.parcelasRecebidas]),
		[
			["PIX", 1, 1],
			["DINHEIRO", 1, 1],
		],
	);
});

test("parcela vencida e não efetivada marca o grupo em atraso", () => {
	const groups = group([
		transaction({
			id: "p1",
			parcela: 1,
			totalParcelas: 2,
			dataEfetivacao: new Date("2026-07-01"),
		}),
		transaction({
			id: "p2",
			parcela: 2,
			totalParcelas: 2,
			dataPrevisao: new Date("2026-08-01"),
		}),
	]);

	assert.equal(groups[0].emAtraso, true);
	assert.equal(groups[0].parcelasRecebidas, 1);
});

test("grupo inteiramente estornado é marcado como cancelado", () => {
	const groups = group([
		transaction({
			id: "p1",
			parcela: 1,
			totalParcelas: 2,
			provedorStatus: "ESTORNADO",
		}),
		transaction({
			id: "p2",
			parcela: 2,
			totalParcelas: 2,
			provedorStatus: "ESTORNADO",
		}),
	]);

	assert.equal(groups[0].cancelado, true);
	// Estorno não conta como atraso: a cobrança deixou de existir, não venceu.
	assert.equal(groups[0].emAtraso, false);
});

test("saídas vinculadas à venda não viram recebimento", () => {
	// Taxa de canal gerenciado (ex.: comissão iFood) é lançada contra a mesma venda. Contá-la aqui
	// inflaria o total recebido do cliente.
	const groups = group([
		transaction({
			id: "recebimento",
			metodo: "PIX",
			valor: 100,
			dataEfetivacao: NOW,
		}),
		transaction({ id: "taxa", tipo: "SAIDA", metodo: "OUTRO", valor: 12 }),
	]);

	assert.equal(groups.length, 1);
	assert.equal(groups[0].valor, 100);
});

test("parcelas futuras ainda não lançadas não encolhem o rótulo", () => {
	// Só a primeira das 6 parcelas existe no banco. O grupo deve continuar lendo "6x", porque
	// `totalParcelas` é a fonte de verdade — e não o número de linhas já criadas.
	const groups = group([transaction({ id: "p1", parcela: 1, totalParcelas: 6, valor: 100 })]);

	assert.equal(groups[0].parcelasTotal, 6);
	assert.equal(groups[0].parcelasRecebidas, 0);
});
