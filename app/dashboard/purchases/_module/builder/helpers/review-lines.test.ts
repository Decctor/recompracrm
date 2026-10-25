import assert from "node:assert/strict";
import test from "node:test";
import {
	applyLineDestination,
	applyTaxTreatment,
	buildNewProductDraft,
	getFiscoObligations,
	buildSupplierProductMappings,
	getLineIssue,
	getLineStatus,
	getLineTotal,
	resolveNewProducts,
	type TReviewLine,
} from "./review-lines";

function line(overrides: Partial<TReviewLine> = {}): TReviewLine {
	return {
		id: "l1",
		descricao: "LEITE CONDENSADO MOCA 395G CX/27",
		codigoFornecedor: "10234",
		ean: "7891000100103",
		ncm: "04029900",
		unidade: "UN",
		quantidade: 4,
		valorUnitario: 10,
		valorTotal: 40,
		desconto: null,
		modificadoresCusto: [],
		matchTipo: "CODIGO",
		confianca: 0.95,
		motivo: null,
		produto: { id: "p1", nome: "Leite Condensado", codigo: "LC", unidade: "UN", imagemCapaUrl: null, natureza: "REVENDA" },
		produtoVarianteId: null,
		fatorConversaoSugerido: null,
		divergenciaUnidade: false,
		incluir: true,
		vinculoConfirmado: false,
		manualOverride: false,
		produtoNovo: null,
		produtoVariante: null,
		fatorConversao: null,
		lembrarVinculo: true,
		extraidoQuantidade: 4,
		extraidoValorUnitario: 10,
		documentoRef: "doc-1",
		destinacao: "REVENDA",
		destinacaoSugerida: "REVENDA",
		foraDaCompra: null,
		tributacao: { baseIcms: 40, aliquotaIcms: 12, origemMercadoria: "0", stRetido: false, stDestacado: false, difalDestacado: false },
		origemImportacao: "XML",
		...overrides,
	};
}

test("issues follow queue order: product, suggestion, unit, tax", () => {
	const ipi = { chave: "IMPOSTOS_IPI" as const, valorCentavos: 1240, efeito: "ACRESCIMO" as const, tratamento: null };
	const base = line({ matchTipo: "SUGERIDO", divergenciaUnidade: true, modificadoresCusto: [ipi] });
	assert.equal(getLineIssue({ ...base, produto: null }), "unmapped");
	assert.equal(getLineIssue(base), "suggested");
	assert.equal(getLineIssue({ ...base, vinculoConfirmado: true }), "unit");
	assert.equal(getLineIssue({ ...base, vinculoConfirmado: true, fatorConversao: 27 }), "tax");
	assert.equal(getLineIssue(line()), null);
});

test("an excluded line has no issue and reads as ignored", () => {
	const ignored = line({ produto: null, incluir: false });
	assert.equal(getLineIssue(ignored), null);
	assert.equal(getLineStatus(ignored), "ignored");
});

test("a new product draft resolves the unmapped issue and checks its own unit", () => {
	const draft = { ...buildNewProductDraft(line(), "new-1"), unidade: "CX" };
	assert.equal(getLineIssue(line({ produto: null, produtoNovo: draft })), "unit");
	assert.equal(getLineIssue(line({ produto: null, produtoNovo: { ...draft, unidade: "UN" } })), null);
});

test("lines with the same EAN become one new product", () => {
	const draft = buildNewProductDraft(line(), "new-1");
	const lines = [
		line({ id: "a", produto: null, produtoNovo: draft }),
		line({ id: "b", produto: null, produtoNovo: { ...draft, id: "new-2" } }),
		line({ id: "c", produto: null, produtoNovo: { ...draft, id: "new-3" }, incluir: false }),
	];
	const { newProducts, productIdByLineId } = resolveNewProducts(lines);
	assert.equal(newProducts.length, 1);
	assert.equal(newProducts[0].codigoBarras, "7891000100103");
	assert.equal(productIdByLineId.get("a"), "new-1");
	assert.equal(productIdByLineId.get("b"), "new-1");
	assert.equal(productIdByLineId.has("c"), false);
});

test("only included lines with the toggle on and an external key are remembered", () => {
	const lines = [
		line({ id: "a" }),
		line({ id: "b", lembrarVinculo: false }),
		line({ id: "c", codigoFornecedor: null, ean: null }),
		line({ id: "d", produto: null, produtoNovo: buildNewProductDraft(line(), "new-1") }),
	];
	const { productIdByLineId } = resolveNewProducts(lines);
	const mappings = buildSupplierProductMappings(lines, productIdByLineId);
	assert.deepEqual(
		mappings.map((mapping) => mapping.produtoId),
		["p1", "new-1"],
	);
});

test("a tax treatment can be applied to the same tax across the whole invoice", () => {
	const ipi = { chave: "IMPOSTOS_IPI" as const, valorCentavos: 100, efeito: "ACRESCIMO" as const, tratamento: null };
	const st = { chave: "IMPOSTOS_ICMS_ST" as const, valorCentavos: 50, efeito: "ACRESCIMO" as const, tratamento: null };
	const lines = [line({ id: "a", modificadoresCusto: [ipi] }), line({ id: "b", modificadoresCusto: [ipi, st] })];
	const single = applyTaxTreatment({ lines, lineId: "a", modifierIndex: 0, tratamento: "CUSTO_ESTOQUE", applyToWholeDocument: false });
	assert.equal(single[1].modificadoresCusto?.[0].tratamento, null);
	const all = applyTaxTreatment({ lines, lineId: "a", modifierIndex: 0, tratamento: "CUSTO_ESTOQUE", applyToWholeDocument: true });
	assert.equal(all[1].modificadoresCusto?.[0].tratamento, "CUSTO_ESTOQUE");
	assert.equal(all[1].modificadoresCusto?.[1].tratamento, null);
});

test("keeping an embedded tax in cost drops it; crediting it keeps it, and the line total ignores it", () => {
	const lines = [
		line({
			id: "a",
			modificadoresCusto: [
				{ chave: "IMPOSTOS_ICMS", valorCentavos: 480, efeito: "ACRESCIMO", tratamento: null, contrapartida: "INCLUSO_NO_VALOR" },
				{ chave: "IMPOSTOS_IPI", valorCentavos: 200, efeito: "ACRESCIMO", tratamento: null },
			],
		}),
	];
	assert.equal(getLineTotal(lines[0]), 42);
	const kept = applyTaxTreatment({ lines, lineId: "a", modifierIndex: 0, tratamento: "CUSTO_ESTOQUE", applyToWholeDocument: false });
	assert.deepEqual(
		kept[0].modificadoresCusto?.map((m) => m.chave),
		["IMPOSTOS_IPI"],
	);
	const credited = applyTaxTreatment({ lines, lineId: "a", modifierIndex: 0, tratamento: "CREDITO_TRIBUTARIO", applyToWholeDocument: false });
	assert.equal(credited[0].modificadoresCusto?.[0].tratamento, "CREDITO_TRIBUTARIO");
	assert.equal(getLineTotal(credited[0]), 42);
});

test("changing the destination to uso e consumo computes DIFAL to the fisco; back to revenda removes it", () => {
	const context = {
		ufOrganizacao: "MG",
		ufEmitente: "SP",
		contribuinteIcms: true,
		regime: "LUCRO_REAL" as const,
		antecipacaoParcial: false,
		parametrosUf: {
			uf: "MG",
			vigenciaInicio: "2024-01-01",
			vigenciaFim: null,
			aliquotaInterna: 18,
			aliquotaFcp: 0,
			metodoDifal: "BASE_UNICA" as const,
			prazoVencimentoDias: 30,
		},
	};
	const lines = [line({ id: "a", origemImportacao: "XML" })];
	const consumo = applyLineDestination({ lines, lineId: "a", destinacao: "USO_CONSUMO", context });
	assert.deepEqual(getFiscoObligations(consumo), [
		{ chave: "IMPOSTOS_DIFAL", valor: 2.4, linhas: 1, uf: "MG", descricao: consumo[0].modificadoresCusto?.[0].descricao ?? null },
	]);
	// The invoice line total never includes what is owed to the fisco.
	assert.equal(getLineTotal(consumo[0]), 40);
	const back = applyLineDestination({ lines: consumo, lineId: "a", destinacao: "REVENDA", context });
	assert.deepEqual(getFiscoObligations(back), []);
});
