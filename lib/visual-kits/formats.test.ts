import assert from "node:assert/strict";
import test from "node:test";
import { VisualKitFormatEnum } from "@/schemas/enums";
import { DEFAULT_VISUAL_KIT_CONFIG } from "@/schemas/visual-kits";
import {
	describeVisualKitPiece,
	sortVisualKitFormats,
	VISUAL_KIT_FORMAT_ORDER,
	VISUAL_KIT_FORMATS,
	VISUAL_KIT_PRESETS,
	visualKitPieceItemCount,
} from "./formats";
import { parseVisualKitItemKey, toVisualKitPieceItem, visualKitItemKey } from "./types";

test("todo formato do enum está no registro e na ordem canônica, com ao menos uma saída", () => {
	for (const formato of VisualKitFormatEnum.options) {
		assert.ok(VISUAL_KIT_FORMATS[formato], formato);
		assert.ok(VISUAL_KIT_FORMAT_ORDER.includes(formato), formato);
		assert.ok(VISUAL_KIT_FORMATS[formato].outputs.length > 0, formato);
	}
	assert.equal(VISUAL_KIT_FORMAT_ORDER.length, VisualKitFormatEnum.options.length);
});

test("kits prontos só usam formatos existentes, sem repetição", () => {
	for (const preset of VISUAL_KIT_PRESETS) {
		assert.equal(new Set(preset.formats).size, preset.formats.length, preset.id);
		for (const formato of preset.formats) assert.ok(VISUAL_KIT_FORMATS[formato], `${preset.id}: ${formato}`);
	}
});

test("peças são ordenadas: ponto de venda antes de online", () => {
	const sorted = sortVisualKitFormats([{ formato: "STORY" as const }, { formato: "ETIQUETA_GONDOLA" as const }, { formato: "ENCARTE" as const }]);
	assert.deepEqual(
		sorted.map((piece) => piece.formato),
		["ETIQUETA_GONDOLA", "ENCARTE", "STORY"],
	);
});

test("tetos por formato e resumo da peça", () => {
	assert.equal(visualKitPieceItemCount("CARROSSEL", 30), 18);
	assert.equal(visualKitPieceItemCount("LISTA_WHATSAPP", 30), 12);
	assert.equal(visualKitPieceItemCount("POST_FEED", 30), 30);
	assert.equal(describeVisualKitPiece("ETIQUETA_GONDOLA", 15), "15 etiquetas · 2 folhas A4");
	assert.equal(describeVisualKitPiece("ETIQUETA_GONDOLA", 1), "1 etiqueta · 1 folha A4");
	assert.equal(describeVisualKitPiece("ADESIVO_PRECO", 5), "5 adesivos · 1 folha A4");
	assert.equal(
		describeVisualKitPiece("ADESIVO_PRECO", 5, { ...DEFAULT_VISUAL_KIT_CONFIG, completarFolhaAdesivos: true }),
		"65 adesivos · 13 por produto",
	);
	assert.equal(describeVisualKitPiece("CARROSSEL", 30), "20 páginas");
	assert.equal(describeVisualKitPiece("LISTA_WHATSAPP", 3), "1 imagem · 3 produtos");
});

test("chave de item ida e volta, com e sem variante", () => {
	assert.equal(visualKitItemKey({ produtoId: "p1", produtoVarianteId: null }), "p1:");
	assert.deepEqual(parseVisualKitItemKey("p1:"), { produtoId: "p1", produtoVarianteId: null });
	assert.deepEqual(parseVisualKitItemKey("p1:v2"), { produtoId: "p1", produtoVarianteId: "v2" });
	assert.equal(parseVisualKitItemKey(""), null);
});

test("item sem preço não vira item de peça", () => {
	const base = {
		chave: "p1:",
		produtoId: "p1",
		produtoVarianteId: null,
		produtoNome: "Shampoo",
		varianteNome: null,
		nome: "Shampoo",
		detalhe: null,
		grupo: "HIGIENE",
		codigo: "123",
		codigoBarras: null,
		imagemUrl: null,
		unidade: "UN",
		precoBase: null,
		precoVendaAnterior: null,
		promocao: { emPromocao: false, precoDe: null, percentualDesconto: null },
		precoUnidade: null,
	};
	assert.equal(toVisualKitPieceItem({ ...base, preco: null }), null);
	const item = toVisualKitPieceItem({ ...base, preco: 9.9 });
	assert.equal(item?.preco, 9.9);
	assert.equal(item && "produtoNome" in item, false);
});
