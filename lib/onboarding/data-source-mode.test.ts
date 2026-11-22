import assert from "node:assert/strict";
import test from "node:test";

import { isSalesSourceDefined, resolveDataSourceMode } from "./data-source-mode";

const base = { integracoesAtivas: 0, poiRegistroAtivo: true, modoDeclarado: null, vendasPoiRecentes: 0 } as const;

test("registro do balcão ligado por padrão, sem escolha nem venda: nenhuma fonte", () => {
	assert.equal(resolveDataSourceMode(base), "NENHUMA");
	assert.equal(resolveDataSourceMode({ ...base, modoDeclarado: "DEPOIS" }), "NENHUMA");
});

test("balcão escolhido no onboarding conta antes da primeira venda", () => {
	assert.equal(resolveDataSourceMode({ ...base, modoDeclarado: "POI" }), "POI");
});

test("vendas recentes no balcão contam mesmo sem resposta (organizações anteriores ao onboarding)", () => {
	assert.equal(resolveDataSourceMode({ ...base, vendasPoiRecentes: 3 }), "POI");
});

test("registro desligado nunca é balcão", () => {
	assert.equal(resolveDataSourceMode({ ...base, poiRegistroAtivo: false, modoDeclarado: "POI", vendasPoiRecentes: 3 }), "NENHUMA");
});

test("integração ativa, com e sem balcão em uso", () => {
	assert.equal(resolveDataSourceMode({ ...base, integracoesAtivas: 1, modoDeclarado: "INTEGRACAO" }), "INTEGRACAO");
	assert.equal(resolveDataSourceMode({ ...base, integracoesAtivas: 2, vendasPoiRecentes: 1 }), "AMBOS");
});

test("com ERP, o PDV já é a fonte das vendas", () => {
	assert.equal(isSalesSourceDefined({ modo: "NENHUMA", erpAcesso: true }), true);
	assert.equal(isSalesSourceDefined({ modo: "NENHUMA", erpAcesso: false }), false);
	assert.equal(isSalesSourceDefined({ modo: "POI", erpAcesso: false }), true);
});
