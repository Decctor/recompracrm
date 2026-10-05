import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { TVisualKitPieceProps } from "../types";
import { Code128Barcode } from "./code128";
import { shelfLabelRenderer } from "./shelf-label";
import { code128Bars } from "./code128";
import { barcodeFor } from "./barcode";

// Vetores independentes: larguras do start, dados, verificador módulo 103 e stop.
function modules(...widths: string[]) {
	return widths.map((symbol) => Array.from(symbol, (width, index) => (index % 2 ? "0" : "1").repeat(Number(width))).join("")).join("");
}

test("Code 128 C codifica o código da Use e Abluse com verificador 57", () => {
	const bars = code128Bars("1215416471");
	assert.ok(bars);
	assert.equal(bars.code, "1215416471");
	// 105, 12, 15, 41, 64, 71, 57, 106.
	assert.equal(bars.modules, modules("211232", "112232", "113222", "231311", "111422", "122114", "312113", "2331112"));
	assert.equal(bars.modules.length, 90);
});

test("quantidade ímpar de dígitos começa em B e muda para C; verificador inclui a troca", () => {
	const bars = code128Bars("123456789");
	assert.ok(bars);
	// 104, 17, 99, 23, 45, 67, 89, 98, 106.
	assert.equal(bars.modules, modules("211214", "123221", "113141", "312131", "113123", "141122", "212141", "411311", "2331112"));
});

test("Code 128 B codifica letras e números com verificador 67", () => {
	const bars = code128Bars("ABC123");
	assert.ok(bars);
	// 104, 33, 34, 35, 17, 18, 19, 67, 106.
	assert.equal(bars.modules, modules("211214", "111323", "131123", "131321", "123221", "223211", "221132", "141122", "2331112"));
});

test("zeros à esquerda e espaços no SKU permanecem intactos", () => {
	assert.equal(code128Bars("000012")?.code, "000012");
	assert.equal(code128Bars(" SKU-01 ")?.code, " SKU-01 ");
	assert.ok(code128Bars("1"));
	assert.ok(code128Bars("!~"));
});

test("valores vazios, controles, DEL e Unicode não são silenciosamente alterados", () => {
	for (const code of [null, undefined, "", "   ", "A\nB", "A\tB", "A\x7fB", "AÇÃO", "😀"]) assert.equal(code128Bars(code), null);
});

const enabled = { mostrarCodigoBarras: true };
const maxModules = 177;

test("SVG mantém margens de 10 módulos e imprime o código original", () => {
	const bars = code128Bars("1215416471")!;
	const svg = renderToStaticMarkup(createElement(Code128Barcode, { bars, moduleWidth: 1, barHeight: 58 }));
	assert.ok(svg.includes('viewBox="0 0 110 70"'));
	assert.ok(svg.includes('width="110"'));
	assert.ok(svg.includes('height="70"'));
	assert.ok(svg.includes('d="M10 0'));
	assert.ok(svg.includes('aria-label="1215416471"'));
	assert.ok(svg.includes(">1215416471</text>"));
});

test("folha de etiquetas renderiza Code 128 e respeita o toggle", () => {
	const props: TVisualKitPieceProps = {
		items: [
			{
				chave: "p1:",
				produtoId: "p1",
				produtoVarianteId: null,
				nome: "Blazer em alfaiataria forrado - Marrom - G",
				detalhe: null,
				grupo: "Inverno",
				codigo: "1215416471",
				codigoBarras: "1215416471",
				imagemUrl: null,
				unidade: "UN",
				preco: 199.9,
				promocao: { emPromocao: false, precoDe: null, percentualDesconto: null },
				precoUnidade: null,
			},
		],
		chamada: "PREÇOS",
		validadeFim: null,
		brand: {
			nome: "Use e Abluse",
			logoUrl: null,
			corPrimaria: "#111111",
			corPrimariaForeground: "#ffffff",
			corSecundaria: "#eeeeee",
			corSecundariaForeground: "#111111",
		},
		configuracao: { mostrarCodigoBarras: true, mostrarPrecoDe: false, mostrarPercentual: false, mostrarPrecoUnidade: false },
	};
	const page = shelfLabelRenderer.paginate(props)[0];
	assert.ok(renderToStaticMarkup(createElement(shelfLabelRenderer.Page, { props, page })).includes('aria-label="1215416471"'));
	props.configuracao.mostrarCodigoBarras = false;
	assert.ok(!renderToStaticMarkup(createElement(shelfLabelRenderer.Page, { props, page })).includes("<svg"));
});

test("EAN válido usa EAN; código interno cadastrado usa Code 128 sem depender do codigo", () => {
	assert.deepEqual(barcodeFor({ codigo: "SKU-01", codigoBarras: "4006381333931" }, enabled, maxModules), { kind: "EAN", code: "4006381333931" });
	assert.equal(barcodeFor({ codigo: "4006381333931", codigoBarras: null }, enabled, maxModules), null);
	const barcode = barcodeFor({ codigo: "outro", codigoBarras: "1215416471" }, enabled, maxModules);
	assert.equal(barcode?.kind, "CODE128");
	assert.equal(barcode?.kind === "CODE128" ? barcode.bars.code : null, "1215416471");
	assert.deepEqual(barcodeFor({ codigo: "SKU", codigoBarras: "036000291452" }, enabled, maxModules), { kind: "EAN", code: "0036000291452" });
});

test("GTIN não suportado em EAN usa Code 128; toggle e largura insuficiente suprimem o desenho", () => {
	const item = { codigo: "1215416471", codigoBarras: "1215416471" };
	assert.equal(barcodeFor(item, { mostrarCodigoBarras: false }, maxModules), null);
	assert.equal(barcodeFor({ ...item, codigoBarras: "4006381333932" }, enabled, maxModules)?.kind, "CODE128");
	assert.equal(barcodeFor({ ...item, codigoBarras: "14006381333938" }, enabled, maxModules)?.kind, "CODE128");
	assert.equal(barcodeFor({ codigo: "SKU", codigoBarras: "A".repeat(12) }, enabled, maxModules), null);
	// 90 módulos de barras + 10 de margem em cada lado.
	assert.equal(barcodeFor(item, enabled, 109), null);
	assert.equal(barcodeFor(item, enabled, 110)?.kind, "CODE128");
});
