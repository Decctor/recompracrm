import assert from "node:assert/strict";
import test from "node:test";
import { isValidGtin, normalizeGtin } from "./gtin";
import { PROMOTION_PREVIOUS_PRICE_WINDOW_DAYS, resolvePromotion } from "./pricing";
import { formatProductContent, resolveUnitPrice, resolveVariantContent } from "./unit-price";

const agora = new Date("2026-10-03T12:00:00Z");
const daysAgo = (days: number) => new Date(agora.getTime() - days * 24 * 60 * 60 * 1000);

test("promoção: anterior maior que o atual, dentro da janela", () => {
	assert.deepEqual(resolvePromotion({ precoAtual: 9.9, precoVendaAnterior: 12.9, dataAlteracaoPrecoVenda: daysAgo(3), agora }), {
		emPromocao: true,
		precoDe: 12.9,
		percentualDesconto: 23,
	});
	// Data serializada (resposta de API) também vale.
	assert.equal(
		resolvePromotion({ precoAtual: 9.9, precoVendaAnterior: 12.9, dataAlteracaoPrecoVenda: daysAgo(3).toISOString(), agora }).emPromocao,
		true,
	);
});

test("sem promoção: aumento, igual, sem anterior ou fora da janela", () => {
	const off = { emPromocao: false, precoDe: null, percentualDesconto: null };
	assert.deepEqual(resolvePromotion({ precoAtual: 12.9, precoVendaAnterior: 9.9, dataAlteracaoPrecoVenda: daysAgo(1), agora }), off);
	assert.deepEqual(resolvePromotion({ precoAtual: 9.9, precoVendaAnterior: 9.9, dataAlteracaoPrecoVenda: daysAgo(1), agora }), off);
	assert.deepEqual(resolvePromotion({ precoAtual: 9.9, precoVendaAnterior: null, dataAlteracaoPrecoVenda: null, agora }), off);
	assert.deepEqual(resolvePromotion({ precoAtual: null, precoVendaAnterior: 12.9, dataAlteracaoPrecoVenda: daysAgo(1), agora }), off);
	assert.deepEqual(
		resolvePromotion({ precoAtual: 9.9, precoVendaAnterior: 12.9, dataAlteracaoPrecoVenda: daysAgo(PROMOTION_PREVIOUS_PRICE_WINDOW_DAYS + 1), agora }),
		off,
	);
	assert.equal(
		resolvePromotion({ precoAtual: 9.9, precoVendaAnterior: 12.9, dataAlteracaoPrecoVenda: daysAgo(PROMOTION_PREVIOUS_PRICE_WINDOW_DAYS), agora })
			.emPromocao,
		true,
	);
});

test("preço do canal é comparado com o anterior do preço base", () => {
	// Canal mais barato que o base: o desconto exibido é sobre o anterior do base.
	assert.equal(resolvePromotion({ precoAtual: 8.9, precoVendaAnterior: 12.9, dataAlteracaoPrecoVenda: daysAgo(2), agora }).percentualDesconto, 31);
	// Canal acima do anterior (iFood com acréscimo): sem "De / Por".
	assert.equal(resolvePromotion({ precoAtual: 14.9, precoVendaAnterior: 12.9, dataAlteracaoPrecoVenda: daysAgo(2), agora }).emPromocao, false);
});

test("GTIN: aceita EAN-8/12/13/14 com verificador válido e normaliza separadores", () => {
	assert.equal(isValidGtin("4006381333931"), true);
	assert.equal(isValidGtin("96385074"), true);
	assert.equal(isValidGtin("036000291452"), true);
	assert.equal(isValidGtin("00012345600012"), true);
	assert.equal(normalizeGtin(" 400-6381.333931 "), "4006381333931");
});

test("GTIN: rejeita verificador errado, tamanhos fora do padrão, letras e zeros", () => {
	assert.equal(normalizeGtin("4006381333932"), null);
	assert.equal(normalizeGtin("400638133393"), null);
	assert.equal(normalizeGtin("SKU-123"), null);
	assert.equal(normalizeGtin("0000000000000"), null);
	assert.equal(normalizeGtin(""), null);
	assert.equal(normalizeGtin(null), null);
});

test("conteúdo e preço por unidade de medida", () => {
	assert.equal(formatProductContent({ conteudoQuantidade: 200, conteudoUnidade: "ML" }), "200 ml");
	assert.equal(formatProductContent({ conteudoQuantidade: 10, conteudoUnidade: "COMPRIMIDO" }), "10 comprimidos");
	assert.equal(formatProductContent({ conteudoQuantidade: 1, conteudoUnidade: "CAPSULA" }), "1 cápsula");
	assert.equal(formatProductContent({ conteudoQuantidade: 1.5, conteudoUnidade: "L" }), "1,5 l");
	assert.equal(formatProductContent({ conteudoQuantidade: 200, conteudoUnidade: null }), null);

	const perMl = resolveUnitPrice({ preco: 44.9, conteudoQuantidade: 200, conteudoUnidade: "ML" });
	assert.equal(perMl?.rotulo, "por 100 ml");
	assert.ok(perMl && Math.abs(perMl.valor - 22.45) < 1e-9);
	assert.deepEqual(resolveUnitPrice({ preco: 9.9, conteudoQuantidade: 10, conteudoUnidade: "COMPRIMIDO" }), { valor: 0.99, rotulo: "por comprimido" });
	assert.equal(resolveUnitPrice({ preco: 9.9, conteudoQuantidade: 0, conteudoUnidade: "ML" }), null);
	assert.equal(resolveUnitPrice({ preco: null, conteudoQuantidade: 10, conteudoUnidade: "ML" }), null);
});

test("variante sobrescreve só a quantidade do conteúdo", () => {
	assert.deepEqual(resolveVariantContent({ conteudoQuantidade: 200, conteudoUnidade: "ML" }, { conteudoQuantidade: 400 }), {
		conteudoQuantidade: 400,
		conteudoUnidade: "ML",
	});
	assert.deepEqual(resolveVariantContent({ conteudoQuantidade: 200, conteudoUnidade: "ML" }, { conteudoQuantidade: null }), {
		conteudoQuantidade: 200,
		conteudoUnidade: "ML",
	});
});
