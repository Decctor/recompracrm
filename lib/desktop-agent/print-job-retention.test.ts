import assert from "node:assert/strict";
import test from "node:test";
import { omitInlineDataUrls } from "./print-job-retention";

test("troca a logo embutida por null e preserva o resto do snapshot", () => {
	const venda = { data: new Date("2026-11-27T12:00:00Z"), codigoInterno: "AB12CD34" };
	const dados = {
		organizacao: { nome: "Loja", cnpj: "00.000.000/0001-00", logoDataUrl: "data:image/png;base64,iVBORw0KGgo=" },
		venda,
		itens: [{ nome: "Café", quantidade: 2 }],
	};

	const stored = omitInlineDataUrls(dados);

	assert.equal(stored.organizacao.logoDataUrl, null);
	assert.equal(stored.organizacao.nome, "Loja");
	assert.deepEqual(stored.itens, [{ nome: "Café", quantidade: 2 }]);
	assert.equal(stored.venda.data, venda.data);
	assert.equal(dados.organizacao.logoDataUrl, "data:image/png;base64,iVBORw0KGgo=", "não altera o objeto original");
});

test("encontra data URLs em listas e níveis profundos", () => {
	assert.deepEqual(omitInlineDataUrls({ a: [{ b: "data:image/jpeg;base64,/9j/" }, "texto"] }), { a: [{ b: null }, "texto"] });
});

test("mantém URLs comuns, números, booleanos e nulos", () => {
	const dados = { pdfUrl: "https://example.com/danfe.pdf", copias: 2, pago: true, observacoes: null };
	assert.deepEqual(omitInlineDataUrls(dados), dados);
});
