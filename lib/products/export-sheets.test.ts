import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { buildProductExportSheets } from "./export-sheets";
import { buildProductsSearchParams } from "./search-params";
import type { TProductExportEntry } from "@/app/api/products/export/route";

const product = {
	id: "p1",
	codigo: "001",
	nome: "Produto",
	codigoBarras: "0012345678901",
	descricao: null,
	grupo: "Grupo",
	tipo: "Produto",
	unidade: "UN",
	ativo: true,
	vendavel: true,
	precoVenda: 12.5,
	precoCusto: null,
	quantidade: 0,
	rastreamentoEstoqueAtivo: true,
	dataInsercao: new Date("2026-10-10T12:00:00Z"),
	dataAtualizacao: new Date("2026-10-10T12:00:00Z"),
	dataUltimaSincronizacao: null,
	estatisticas: { vendasValorTotal: 25, vendasQtdeTotal: 2, vendasCustoTotal: 0, curvaABC: "A", dataPrimeiraVenda: null, dataUltimaVenda: null },
	variantes: [
		{
			id: "v1",
			nome: "Grande",
			codigo: "002",
			codigoBarras: null,
			precoVenda: 20,
			precoCusto: null,
			quantidade: null,
			ativo: true,
			rastreamentoEstoqueAtivo: false,
		},
	],
} as TProductExportEntry;
const profile = {
	id: "f1",
	produtoId: "p1",
	produtoVarianteId: null,
	ncm: "01012100",
	exTipi: "01",
	cest: "0000001",
	cfopPadrao: "5102",
	origemMercadoria: "NACIONAL" as const,
	unidadeComercial: "UN",
	codigoBeneficioFiscal: null,
	grupoTributario: { nome: "Padrao" },
};

test("separates base and variant profiles and preserves spreadsheet cell types", () => {
	const sheets = buildProductExportSheets([
		{ ...product, ncm: "00000000", perfisFiscais: [profile, { ...profile, id: "f2", produtoVarianteId: "v1", ncm: "01012900" }] },
	]);
	assert.deepEqual(
		sheets.map((sheet) => sheet.name),
		["Produtos", "Variantes", "Perfis fiscais"],
	);
	assert.equal(sheets[2].rows.length, 2);
	assert.equal("VARIANTE" in sheets[2].rows[0] && sheets[2].rows[0].VARIANTE, "Produto base");
	assert.equal("VARIANTE" in sheets[2].rows[1] && sheets[2].rows[1].VARIANTE, "Grande");
	const workbook = XLSX.utils.book_new();
	for (const sheet of sheets) XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sheet.rows), sheet.name);
	const restored = XLSX.read(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }), { type: "buffer" });
	const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(restored.Sheets.Produtos);
	assert.equal(rows[0]["NCM DO CADASTRO"], "00000000");
	assert.equal(rows[0]["NCM DO PERFIL BASE"], "01012100");
	assert.equal(rows[0]["C\u00d3DIGO DO PRODUTO"], "001");
	assert.equal(rows[0]["PRE\u00c7O DE VENDA"], 12.5);
	assert.equal(rows[0].ESTOQUE, 0);
});

test("omits unauthorized fiscal and supplier sections", () => {
	const sheets = buildProductExportSheets([product]);
	assert.equal(sheets.length, 2);
	assert.equal("NCM DO CADASTRO" in sheets[0].rows[0], false);
	assert.equal("FORNECEDOR PRINCIPAL" in sheets[0].rows[0], false);
});

test("keeps products without profiles and variants", () => {
	const sheets = buildProductExportSheets([{ ...product, variantes: [], ncm: "00000000", perfisFiscais: [] }]);
	assert.equal(sheets[0].rows.length, 1);
	assert.equal("NCM DO PERFIL BASE" in sheets[0].rows[0] && sheets[0].rows[0]["NCM DO PERFIL BASE"], "");
	assert.equal(sheets[1].rows.length, 0);
	assert.equal(sheets[2].rows.length, 0);
});

test("serializes arrays, dates and zero bounds without empty query values", () => {
	const query = buildProductsSearchParams({
		search: ["cafe", "leite"],
		statsPeriodBefore: null,
		statsSellerIds: [],
		statsIntegrationsIds: [],
		statsExcludedSalesIds: [],
		statsTotalMin: null,
		statsTotalMax: null,
		stockStatus: [],
		mainSupplierIds: [],
		withoutMainSupplier: false,
		abcClasses: [],
		priceMax: null,
		resultLimit: null,
		groups: [],
		priceMin: 0,
		trackedOnly: false,
		statsPeriodAfter: new Date("2026-10-01T00:00:00Z"),
		page: 2,
	});
	assert.equal(query.get("search"), "cafe,leite");
	assert.equal(query.get("priceMin"), "0");
	assert.equal(query.get("statsPeriodAfter"), "2026-10-01T00:00:00.000Z");
	assert.equal(query.has("groups"), false);
	assert.equal(query.has("trackedOnly"), false);
});
