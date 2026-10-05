import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { resolveVisualKitBrand } from "../brand";
import type { TVisualKitPieceProps } from "../types";
import { priceStickerRenderer } from "./price-sticker";

function fixture(): TVisualKitPieceProps {
	return {
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
		brand: resolveVisualKitBrand({
			nome: "Use e Abluse",
			logoUrl: null,
			corPrimaria: "#111111",
			corPrimariaForeground: "#ffffff",
			corSecundaria: "#eeeeee",
			corSecundariaForeground: "#111111",
		}),
		configuracao: { mostrarCodigoBarras: true, mostrarPrecoDe: false, mostrarPercentual: false, mostrarPrecoUnidade: false },
	};
}

function render(props: TVisualKitPieceProps) {
	return renderToStaticMarkup(createElement(priceStickerRenderer.Page, { props, page: priceStickerRenderer.paginate(props)[0] }));
}

test("campo de código de barras rende 65 adesivos com Code 128 na grade de cinco colunas", () => {
	const props = fixture();
	assert.equal(priceStickerRenderer.paginate(props)[0].items.length, 65);
	const html = render(props);
	assert.equal((html.match(/aria-label="1215416471"/g) ?? []).length, 65);
	assert.ok(html.includes("grid-template-columns:repeat(5,"));
	assert.ok(html.includes('viewBox="0 0 110 36"'));
});

test("código de barras funciona para qualquer marca; campo vazio mantém o adesivo original", () => {
	const props = fixture();
	props.brand.nome = "Outra loja";
	assert.ok(render(props).includes('aria-label="1215416471"'));
	props.items[0].codigoBarras = "4006381333931";
	assert.ok(render(props).includes('aria-label="4006381333931"'));
	props.items[0].codigoBarras = null;
	assert.ok(!render(props).includes("<svg"));
});

test("toggle desligado mantém o adesivo original, e código grande demais não é comprimido", () => {
	const props = fixture();
	props.configuracao.mostrarCodigoBarras = false;
	assert.ok(!render(props).includes("<svg"));
	assert.ok(render(props).includes("padding:8px 8px 6px 8px"));
	props.configuracao.mostrarCodigoBarras = true;
	props.items[0].codigo = "SKU-MUITO-LONGO-123456789";
	props.items[0].codigoBarras = props.items[0].codigo;
	assert.ok(!render(props).includes("<svg"));
});

test("mais de 65 produtos preservam a paginação em 65 + restante", () => {
	const props = fixture();
	props.items = Array.from({ length: 66 }, (_, index) => ({ ...props.items[0], chave: `p${index}:`, produtoId: `p${index}` }));
	assert.deepEqual(
		priceStickerRenderer.paginate(props).map((page) => page.items.length),
		[65, 1],
	);
});
