import assert from "node:assert/strict";
import test from "node:test";
import { calculateDifal } from "./difal";
import { computeFiscoComponents, replaceCalculatedFiscoComponents, type TEntryFiscoContext, type TEntryLineTaxFacts } from "./fisco-components";
import { getUfIcmsParameters, resolveInterstateIcmsRate } from "./uf-parameters";

const facts: TEntryLineTaxFacts = {
	baseIcms: 5000,
	aliquotaIcms: 12,
	origemMercadoria: "0",
	stRetido: false,
	stDestacado: false,
	difalDestacado: false,
};
const mg: TEntryFiscoContext = {
	ufOrganizacao: "MG",
	ufEmitente: "SP",
	contribuinteIcms: true,
	regime: "LUCRO_REAL",
	antecipacaoParcial: false,
	parametrosUf: {
		uf: "MG",
		vigenciaInicio: "2024-01-01",
		vigenciaFim: null,
		aliquotaInterna: 18,
		aliquotaFcp: 2,
		metodoDifal: "BASE_DUPLA",
		prazoVencimentoDias: 30,
	},
};

test("base única: difal = base × (interna − inter); base dupla grossa up the internal base", () => {
	const single = calculateDifal({ baseCentavos: 500000, aliquotaInterestadual: 12, aliquotaInterna: 18, metodo: "BASE_UNICA" });
	assert.equal(single.difalCentavos, 30000);
	const double = calculateDifal({ baseCentavos: 500000, aliquotaInterestadual: 12, aliquotaInterna: 18, aliquotaFcp: 2, metodo: "BASE_DUPLA" });
	// base interna = 5000 × 0,88 / 0,82 = 5365,85; 18% = 965,85; − 600 = 365,85
	assert.equal(double.baseInternaCentavos, 536585);
	assert.equal(double.difalCentavos, 36585);
	assert.equal(double.fcpCentavos, 10732);
	assert.equal(calculateDifal({ baseCentavos: 1000, aliquotaInterestadual: 18, aliquotaInterna: 18, metodo: "BASE_UNICA" }).difalCentavos, 0);
});

test("interstate rate: 4% imported, 7% south/southeast to north/northeast, 12% otherwise", () => {
	assert.equal(resolveInterstateIcmsRate({ ufOrigem: "SP", ufDestino: "MG" }), 12);
	assert.equal(resolveInterstateIcmsRate({ ufOrigem: "SP", ufDestino: "BA" }), 7);
	assert.equal(resolveInterstateIcmsRate({ ufOrigem: "BA", ufDestino: "SP" }), 12);
	assert.equal(resolveInterstateIcmsRate({ ufOrigem: "SP", ufDestino: "BA", origemMercadoria: "1" }), 4);
	assert.ok(getUfIcmsParameters("sp"));
	assert.equal(getUfIcmsParameters("XX"), null);
});

test("uso e consumo interestadual gera DIFAL e FCP ao fisco; revenda não, salvo antecipação habilitada", () => {
	const consumo = computeFiscoComponents({ destinacao: "USO_CONSUMO", valorLinha: 5000, facts, context: mg });
	assert.deepEqual(
		consumo.map((c) => [c.chave, c.valorCentavos, c.contrapartida, c.origem]),
		[
			["IMPOSTOS_DIFAL", 36585, "FISCO", "CALCULO"],
			["IMPOSTOS_FCP_DIFAL", 10732, "FISCO", "CALCULO"],
		],
	);
	assert.equal(consumo[0].memoriaCalculo.uf, "MG");
	assert.deepEqual(computeFiscoComponents({ destinacao: "REVENDA", valorLinha: 5000, facts, context: mg }), []);
	const antecipacao = computeFiscoComponents({ destinacao: "REVENDA", valorLinha: 5000, facts, context: { ...mg, antecipacaoParcial: true } });
	assert.deepEqual(
		antecipacao.map((c) => [c.chave, c.valorCentavos]),
		[["IMPOSTOS_ANTECIPACAO", 30000]],
	);
});

test("no DIFAL when intrastate, non-contributor, ST already in the chain or issuer computed it", () => {
	assert.deepEqual(computeFiscoComponents({ destinacao: "USO_CONSUMO", valorLinha: 5000, facts, context: { ...mg, ufEmitente: "MG" } }), []);
	assert.deepEqual(computeFiscoComponents({ destinacao: "USO_CONSUMO", valorLinha: 5000, facts, context: { ...mg, contribuinteIcms: false } }), []);
	assert.deepEqual(computeFiscoComponents({ destinacao: "USO_CONSUMO", valorLinha: 5000, facts: { ...facts, stRetido: true }, context: mg }), []);
	assert.deepEqual(
		computeFiscoComponents({ destinacao: "USO_CONSUMO", valorLinha: 5000, facts: { ...facts, difalDestacado: true }, context: mg }),
		[],
	);
	assert.deepEqual(computeFiscoComponents({ destinacao: "USO_CONSUMO", valorLinha: 5000, facts: null, context: mg }), []);
});

test("recomputing replaces CALCULO components and keeps manual ones", () => {
	const manual = { chave: "IMPOSTOS_ICMS_ST_ENTRADA", contrapartida: "FISCO", origem: "MANUAL" };
	const stale = { chave: "IMPOSTOS_DIFAL", contrapartida: "FISCO", origem: "CALCULO" };
	const other = { chave: "FRETE", contrapartida: null, origem: "XML" };
	const next = replaceCalculatedFiscoComponents(
		[manual, stale, other],
		computeFiscoComponents({ destinacao: "USO_CONSUMO", valorLinha: 5000, facts, context: mg }),
	);
	assert.deepEqual(
		next.map((m) => m.chave),
		["IMPOSTOS_ICMS_ST_ENTRADA", "FRETE", "IMPOSTOS_DIFAL", "IMPOSTOS_FCP_DIFAL"],
	);
});
