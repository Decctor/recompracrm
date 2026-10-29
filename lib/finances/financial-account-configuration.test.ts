import assert from "node:assert/strict";
import { test } from "node:test";
import {
	calculateFinancialAccountBalance,
	getDefaultFinancialAccountConfiguration,
	getDefaultFinancialAccountReceipts,
	getLegacyBankFields,
	isCashLikeFinancialAccountType,
} from "./financial-account-configuration";
import type { TFinancialAccountConfiguration } from "@/schemas/financial";

test("cria configuração de cartão com ciclo de fatura padrão", () => {
	assert.deepEqual(getDefaultFinancialAccountConfiguration("CARTAO_CREDITO"), {
		categoria: "CARTAO_CREDITO",
		recebimentos: getDefaultFinancialAccountReceipts(),
		limiteCredito: null,
		diaFechamentoFatura: 25,
		diaVencimentoFatura: 5,
		contaPagamentoPadraoId: null,
		taxaJurosMensal: null,
		taxaMulta: null,
		taxaFixa: null,
	});
});

test("mantém os campos legados de banco sincronizados", () => {
	const configuration = getDefaultFinancialAccountConfiguration("BANCO");
	const bankConfiguration: Extract<TFinancialAccountConfiguration, { categoria: "BANCO" }> = {
		categoria: "BANCO",
		tipo: configuration.categoria === "BANCO" ? configuration.tipo : "CORRENTE",
		codigo: "001",
		nome: "Banco principal",
		agencia: "1234",
		contaNumero: "98765",
		contaDigito: "0",
	};
	assert.deepEqual(getLegacyBankFields(bankConfiguration), {
		codigoBanco: "001",
		nomeBanco: "Banco principal",
		agencia: "1234",
		numeroConta: "98765",
		digitoConta: "0",
		tipoConta: "CORRENTE",
	});
});

test("classifica caixa, banco e carteira como contas cash-like", () => {
	assert.equal(isCashLikeFinancialAccountType("CAIXA"), true);
	assert.equal(isCashLikeFinancialAccountType("BANCO"), true);
	assert.equal(isCashLikeFinancialAccountType("CARTEIRA_DIGITAL"), true);
	assert.equal(isCashLikeFinancialAccountType("CARTAO_CREDITO"), false);
	assert.equal(isCashLikeFinancialAccountType("INVESTIMENTO"), false);
});

test("calcula saldo devedor de cartão invertendo entradas e saídas", () => {
	assert.equal(calculateFinancialAccountBalance({ tipo: "BANCO", saldoInicial: 100, totalEntradas: 50, totalSaidas: 20 }), 130);
	assert.equal(calculateFinancialAccountBalance({ tipo: "CARTAO_CREDITO", saldoInicial: 100, totalEntradas: 50, totalSaidas: 20 }), 70);
});
