import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTurnAttachment, toProviderMediaType } from "./attachment";

test("mantém o anexo válido e normaliza as bordas", () => {
	assert.deepEqual(normalizeTurnAttachment({ url: "  https://exemplo.com/cardapio.pdf  ", tipo: "DOCUMENTO", nomeArquivo: " cardapio.pdf " }), {
		url: "https://exemplo.com/cardapio.pdf",
		tipo: "DOCUMENTO",
		nomeArquivo: "cardapio.pdf",
	});

	// Nome vazio é ausência de nome, não string vazia indo para o provedor.
	assert.equal(normalizeTurnAttachment({ url: "https://exemplo.com/foto.jpg", tipo: "IMAGEM", nomeArquivo: "   " })?.nomeArquivo, null);
});

test("descarta o anexo em vez de derrubar o turno", () => {
	assert.equal(normalizeTurnAttachment(null), null);
	assert.equal(normalizeTurnAttachment(undefined), null);
	assert.equal(normalizeTurnAttachment({ url: "   ", tipo: "DOCUMENTO", nomeArquivo: null }), null);
	// URL alucinada: o modelo escreveu o nome do arquivo sem origem.
	assert.equal(normalizeTurnAttachment({ url: "cardapio.pdf", tipo: "DOCUMENTO", nomeArquivo: null }), null);
	assert.equal(normalizeTurnAttachment({ url: "/uploads/cardapio.pdf", tipo: "DOCUMENTO", nomeArquivo: null }), null);
});

test("exige https porque é a Meta quem busca o link", () => {
	assert.equal(normalizeTurnAttachment({ url: "http://exemplo.com/cardapio.pdf", tipo: "DOCUMENTO", nomeArquivo: null }), null);
	assert.equal(normalizeTurnAttachment({ url: "file:///etc/passwd", tipo: "DOCUMENTO", nomeArquivo: null }), null);
	assert.notEqual(normalizeTurnAttachment({ url: "https://exemplo.com/cardapio.pdf", tipo: "DOCUMENTO", nomeArquivo: null }), null);
});

test("traduz o tipo para o nome do provedor", () => {
	assert.equal(toProviderMediaType("IMAGEM"), "image");
	assert.equal(toProviderMediaType("VIDEO"), "video");
	assert.equal(toProviderMediaType("DOCUMENTO"), "document");
});
