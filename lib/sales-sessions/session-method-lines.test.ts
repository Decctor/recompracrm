import assert from "node:assert/strict";
import test from "node:test";
import { buildSessionMethodLines } from "./session-method-lines";

const ledgerDinheiro = { metodo: "DINHEIRO" as const, valorEsperado: 466, entradas: 100, troco: 34, outrasSaidas: 0 };
const ledgerPix = { metodo: "PIX" as const, valorEsperado: 66, entradas: 66, troco: 0, outrasSaidas: 0 };

test("sessão sem conferência mostra o ledger ao vivo, sem contagem", () => {
	const [dinheiro] = buildSessionMethodLines({ saldoInicial: 400, resumoEsperado: [ledgerDinheiro], conferencias: [] });
	assert.equal(dinheiro.valorEsperado, 466);
	assert.equal(dinheiro.valorInformado, null);
	assert.equal(dinheiro.diferenca, null);
	assert.deepEqual(dinheiro.composicao, { saldoInicial: 400, entradas: 100, troco: 34, outrasSaidas: 0 });
});

test("sessão fechada usa o snapshot congelado e ganha a composição do ledger", () => {
	const [dinheiro] = buildSessionMethodLines({
		saldoInicial: 400,
		resumoEsperado: [ledgerDinheiro],
		conferencias: [{ metodo: "DINHEIRO", valorEsperado: 466, valorInformado: 460, diferenca: -6 }],
	});
	assert.equal(dinheiro.valorEsperado, 466);
	assert.equal(dinheiro.valorInformado, 460);
	assert.equal(dinheiro.diferenca, -6);
	assert.deepEqual(dinheiro.composicao, { saldoInicial: 400, entradas: 100, troco: 34, outrasSaidas: 0 });
});

test("composição que não soma o esperado congelado é omitida em vez de mostrar conta errada", () => {
	const [dinheiro] = buildSessionMethodLines({
		saldoInicial: 400,
		resumoEsperado: [ledgerDinheiro],
		conferencias: [{ metodo: "DINHEIRO", valorEsperado: 500, valorInformado: 500, diferenca: 0 }],
	});
	assert.equal(dinheiro.valorEsperado, 500);
	assert.equal(dinheiro.composicao, null);
});

test("recebível só ganha composição quando o ledger fecha, sem fundo de troco somado", () => {
	const [, pix] = buildSessionMethodLines({
		saldoInicial: 400,
		resumoEsperado: [ledgerDinheiro, ledgerPix],
		conferencias: [
			{ metodo: "DINHEIRO", valorEsperado: 466, valorInformado: 466, diferenca: 0 },
			{ metodo: "PIX", valorEsperado: 66, valorInformado: null, diferenca: null },
		],
	});
	assert.equal(pix.metodo, "PIX");
	assert.deepEqual(pix.composicao, { saldoInicial: 0, entradas: 66, troco: 0, outrasSaidas: 0 });
});

test("método com movimento fora do snapshot ainda aparece para quem confere", () => {
	const linhas = buildSessionMethodLines({
		saldoInicial: 400,
		resumoEsperado: [ledgerDinheiro, ledgerPix],
		conferencias: [{ metodo: "DINHEIRO", valorEsperado: 466, valorInformado: 466, diferenca: 0 }],
	});
	assert.equal(linhas.length, 2);
	assert.equal(linhas[1].metodo, "PIX");
	assert.equal(linhas[1].valorInformado, null);
});

test("método zerado e sem movimento fora do snapshot não vira linha vazia", () => {
	const linhas = buildSessionMethodLines({
		saldoInicial: 400,
		resumoEsperado: [ledgerDinheiro, { metodo: "CARTAO_DEBITO", valorEsperado: 0, entradas: 0, troco: 0, outrasSaidas: 0 }],
		conferencias: [{ metodo: "DINHEIRO", valorEsperado: 466, valorInformado: 466, diferenca: 0 }],
	});
	assert.equal(linhas.length, 1);
});

test("tolerância de meio centavo absorve ruído de ponto flutuante", () => {
	const [dinheiro] = buildSessionMethodLines({
		saldoInicial: 0,
		resumoEsperado: [{ metodo: "DINHEIRO", valorEsperado: 0.3, entradas: 0.1 + 0.2, troco: 0, outrasSaidas: 0 }],
		conferencias: [{ metodo: "DINHEIRO", valorEsperado: 0.3, valorInformado: 0.3, diferenca: 0 }],
	});
	assert.notEqual(dinheiro.composicao, null);
});
