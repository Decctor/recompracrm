import assert from "node:assert/strict";
import test from "node:test";
import {
	applyTaxTreatment,
	buildNewProductDraft,
	buildSupplierProductMappings,
	getLineIssue,
	getLineStatus,
	getSharedLinesDestination,
	resolveNewProducts,
	setLineDestination,
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
		produto: { id: "p1", nome: "Leite Condensado", codigo: "LC", unidade: "UN", imagemCapaUrl: null },
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
		origemImportacao: "XML",
		contaContabilId: null,
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

test("a line with its own destination leaves stock: new product stops tracking it and taxes become cost", () => {
	const ipi = { chave: "IMPOSTOS_IPI" as const, valorCentavos: 100, efeito: "ACRESCIMO" as const, tratamento: "CREDITO_TRIBUTARIO" as const };
	const freight = { chave: "FRETE" as const, valorCentavos: 50, efeito: "ACRESCIMO" as const, tratamento: null };
	const base = line({ produto: null, modificadoresCusto: [ipi, freight] });
	const withDraft = { ...base, produtoNovo: buildNewProductDraft(base, "new-1") };
	assert.equal(withDraft.produtoNovo.rastreamentoEstoqueAtivo, true);

	const maintenance = setLineDestination(withDraft, "manutencao");
	assert.equal(maintenance.contaContabilId, "manutencao");
	assert.equal(maintenance.produtoNovo?.rastreamentoEstoqueAtivo, false);
	assert.equal(maintenance.produtoNovo?.vendavel, false);
	assert.equal(maintenance.modificadoresCusto?.[0].tratamento, "CUSTO_ESTOQUE");
	// Only taxes are moved to cost; other modifiers keep waiting for the operator.
	assert.equal(maintenance.modificadoresCusto?.[1].tratamento, null);

	const back = setLineDestination(maintenance, null);
	assert.equal(back.contaContabilId, null);
	assert.equal(back.produtoNovo?.rastreamentoEstoqueAtivo, true);
	assert.equal(buildNewProductDraft(maintenance, "new-2").rastreamentoEstoqueAtivo, false);
});

test("shared destination is the common one, or undefined when lines disagree", () => {
	assert.equal(getSharedLinesDestination([line({ id: "a" }), line({ id: "b" })]), null);
	assert.equal(getSharedLinesDestination([line({ id: "a", contaContabilId: "m" }), line({ id: "b", contaContabilId: "m" })]), "m");
	assert.equal(getSharedLinesDestination([line({ id: "a", contaContabilId: "m" }), line({ id: "b" })]), undefined);
	assert.equal(getSharedLinesDestination([line({ id: "a", contaContabilId: "m" }), line({ id: "b", incluir: false })]), "m");
});
