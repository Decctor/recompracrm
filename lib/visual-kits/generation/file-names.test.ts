import assert from "node:assert/strict";
import test from "node:test";
import { VisualKitFormatEnum } from "@/schemas/enums";
import { A4_PAGE, mmToPx } from "../formats";
import {
	kitZipName,
	padFileOrder,
	slugifyFileName,
	VISUAL_KIT_PIECE_SLUGS,
	visualKitCarouselFileName,
	visualKitOutputExtension,
	visualKitPagedFileName,
	visualKitPieceFileName,
	visualKitPieceFolderName,
	visualKitProductFileName,
} from "./file-names";
import { proxyVisualKitImageUrl, withProxiedImages } from "./image-proxy";
import { scaleRectToCanvas, SHELF_LABEL_PER_SHEET, shelfLabelCellRect } from "./label-geometry";

test("slug é ASCII, minúsculo e sem acentos/símbolos", () => {
	assert.equal(slugifyFileName("Café & Pão 500g"), "cafe-pao-500g");
	assert.equal(slugifyFileName("  Camiseta Básica · Preta / G  "), "camiseta-basica-preta-g");
	assert.equal(slugifyFileName("AÇÚCAR REFINADO—1kg"), "acucar-refinado-1kg");
	assert.equal(slugifyFileName("🔥🔥"), "");
	assert.equal(slugifyFileName("a".repeat(80)).length, 60);
	assert.equal(slugifyFileName(`${"a".repeat(59)} b`), "a".repeat(59));
	assert.match(slugifyFileName("Ñandú ÿ ß œ"), /^[a-z0-9-]*$/);
});

test("todo formato tem slug e pasta únicos", () => {
	const slugs = VisualKitFormatEnum.options.map((formato) => VISUAL_KIT_PIECE_SLUGS[formato]);
	assert.equal(new Set(slugs).size, slugs.length);
	for (const formato of VisualKitFormatEnum.options) {
		assert.equal(visualKitPieceFolderName(formato), VISUAL_KIT_PIECE_SLUGS[formato]);
		assert.match(visualKitPieceFolderName(formato), /^[a-z0-9-]+$/);
	}
});

test("extensões por saída", () => {
	assert.equal(visualKitOutputExtension("PDF"), "pdf");
	assert.equal(visualKitOutputExtension("PDF_ETIQUETADORA"), "pdf");
	assert.equal(visualKitOutputExtension("PNG"), "png");
	assert.equal(visualKitOutputExtension("JPG"), "jpg");
});

test("nomes de arquivo por peça", () => {
	assert.equal(visualKitPieceFileName("ETIQUETA_GONDOLA", "pdf"), "etiquetas-gondola.pdf");
	assert.equal(visualKitPieceFileName("LISTA_WHATSAPP", "png"), "lista-whatsapp.png");
	assert.equal(
		visualKitProductFileName({ ordem: 3, total: 12, produtoNome: "Shampoo Anticaspa 200 ml", ext: "png" }),
		"03-shampoo-anticaspa-200-ml.png",
	);
	assert.equal(visualKitProductFileName({ ordem: 7, total: 120, produtoNome: "Óleo", ext: "jpg" }), "007-oleo.jpg");
	assert.equal(visualKitProductFileName({ ordem: 1, total: 1, produtoNome: "***", ext: "png" }), "01-produto.png");
	assert.equal(visualKitCarouselFileName({ ordem: 1, total: 20, ext: "png" }), "01.png");
	assert.equal(visualKitCarouselFileName({ ordem: 20, total: 20, ext: "jpg" }), "20.jpg");
	assert.equal(visualKitPagedFileName({ formato: "ENCARTE", ordem: 2, total: 3, ext: "png" }), "encarte-02.png");
	assert.equal(visualKitPagedFileName({ formato: "ENCARTE", ordem: 1, total: 1, ext: "png" }), "encarte.png");
	assert.equal(padFileOrder(5, 9), "05");
	assert.equal(padFileOrder(100, 100), "100");
});

test("nome do zip do kit", () => {
	assert.equal(kitZipName("Ofertas da Semana!"), "kit-ofertas-da-semana.zip");
	assert.equal(kitZipName("   "), "kit.zip");
});

test("proxy de imagens: só URLs absolutas de outra origem", () => {
	const origin = "https://app.recompracrm.com.br";
	assert.equal(
		proxyVisualKitImageUrl("https://cdn.example.com/a b.png?x=1", origin),
		`/api/visual-kits/image?url=${encodeURIComponent("https://cdn.example.com/a%20b.png?x=1")}`,
	);
	assert.equal(proxyVisualKitImageUrl(`${origin}/img.png`, origin), `${origin}/img.png`);
	assert.equal(proxyVisualKitImageUrl("/uploads/img.png", origin), "/uploads/img.png");
	assert.equal(proxyVisualKitImageUrl("data:image/png;base64,AAAA", origin), "data:image/png;base64,AAAA");
	assert.equal(proxyVisualKitImageUrl("blob:https://x/123", origin), "blob:https://x/123");
	assert.equal(proxyVisualKitImageUrl(null, origin), null);
	assert.ok(proxyVisualKitImageUrl("//cdn.example.com/x.png", origin)?.startsWith("/api/visual-kits/image?url="));
	const proxied = proxyVisualKitImageUrl("https://cdn.example.com/x.png", origin);
	assert.equal(proxyVisualKitImageUrl(proxied, origin), proxied);
});

test("withProxiedImages reescreve fotos e logo sem mutar as props", () => {
	const origin = "https://app.example.com";
	const item = {
		chave: "p1:",
		produtoId: "p1",
		produtoVarianteId: null,
		nome: "X",
		detalhe: null,
		grupo: "G",
		codigo: "1",
		codigoBarras: null,
		imagemUrl: "https://cdn.example.com/x.png",
		unidade: "UN",
		preco: 10,
		promocao: { emPromocao: false, precoDe: null, percentualDesconto: null },
		precoUnidade: null,
	} as unknown as Parameters<typeof withProxiedImages>[0]["itens"][number];
	const props = {
		itens: [item],
		chamada: "Ofertas",
		validadeFim: null,
		marca: {
			nome: "Loja",
			logoUrl: "https://s3.example.com/logo.png",
			corPrimaria: "#000",
			corPrimariaForeground: "#fff",
			corSecundaria: "#fff",
			corSecundariaForeground: "#000",
		},
		opcoes: {},
	} as unknown as Parameters<typeof withProxiedImages>[0];
	const result = withProxiedImages(props, origin);
	assert.ok(result.itens[0].imagemUrl?.startsWith("/api/visual-kits/image?url="));
	assert.ok(result.marca.logoUrl?.startsWith("/api/visual-kits/image?url="));
	assert.equal(props.itens[0].imagemUrl, "https://cdn.example.com/x.png");
	assert.equal(props.marca.logoUrl, "https://s3.example.com/logo.png");
});

test("células da folha de etiquetas: grade 2 × 7 de 100 × 40 mm a partir de (5, 6) mm", () => {
	assert.equal(SHELF_LABEL_PER_SHEET, 14);
	const first = shelfLabelCellRect(0);
	assert.deepEqual(first, { x: mmToPx(5), y: mmToPx(6), width: mmToPx(100), height: mmToPx(40) });
	const second = shelfLabelCellRect(1);
	assert.equal(second.x, mmToPx(105));
	assert.equal(second.y, mmToPx(6));
	const last = shelfLabelCellRect(13);
	assert.equal(last.x, mmToPx(105));
	assert.ok(Math.abs(last.y - mmToPx(246)) < 1e-9);
	assert.ok(last.x + last.width <= A4_PAGE.largura);
	assert.ok(last.y + last.height <= A4_PAGE.altura);
	assert.throws(() => shelfLabelCellRect(14), RangeError);
	assert.throws(() => shelfLabelCellRect(-1), RangeError);
});

test("recorte em 300 dpi: células vizinhas encostam sem sobrepor e têm ~1181 × 472 px", () => {
	const ratio = 300 / 96;
	for (let index = 0; index < SHELF_LABEL_PER_SHEET; index += 1) {
		const cell = scaleRectToCanvas(shelfLabelCellRect(index), ratio);
		assert.ok(Number.isInteger(cell.x) && Number.isInteger(cell.y) && Number.isInteger(cell.width) && Number.isInteger(cell.height));
		assert.ok(Math.abs(cell.width - 1181) <= 1, `largura ${cell.width}`);
		assert.ok(Math.abs(cell.height - 472) <= 1, `altura ${cell.height}`);
		if (index % 2 === 0) {
			const right = scaleRectToCanvas(shelfLabelCellRect(index + 1), ratio);
			assert.equal(cell.x + cell.width, right.x);
		}
		if (index + 2 < SHELF_LABEL_PER_SHEET) {
			const below = scaleRectToCanvas(shelfLabelCellRect(index + 2), ratio);
			assert.equal(cell.y + cell.height, below.y);
		}
	}
});
