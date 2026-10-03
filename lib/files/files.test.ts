import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { inspectImageFile } from "./inspect";
import { createUploadIntake } from "./intake";
import { sanitizeFileName } from "./service";

const ALLOWED = new Set(["image/jpeg", "image/png"]);

test("sanitizeFileName normaliza o nome e força a extensão pelo mime sniffado", () => {
	assert.equal(sanitizeFileName("Promoção de Verão.PNG", "image/png"), "promocao-de-verao.png");
	assert.equal(sanitizeFileName("foto", "image/jpeg"), "foto.jpg");
	assert.equal(sanitizeFileName("///", "image/png"), "arquivo.png");
});

test("a inspeção decodifica por completo: imagem válida passa, truncada e vazia são recusadas", async () => {
	const png = await sharp({ create: { width: 32, height: 24, channels: 3, background: { r: 10, g: 20, b: 30 } } })
		.png()
		.toBuffer();
	const inspected = await inspectImageFile(png, { allowedMimeTypes: ALLOWED });
	assert.deepEqual(inspected, { mimeType: "image/png", metadados: { tipo: "IMAGEM", largura: 32, altura: 24 } });

	// Um JPEG truncado mantém o cabeçalho válido (metadata() passa) com corpo de lixo — foi
	// exatamente assim que uma imagem cinza chegou a um template. A decodificação completa
	// precisa recusá-lo.
	const jpeg = await sharp({ create: { width: 512, height: 512, channels: 3, background: { r: 200, g: 40, b: 90 } } })
		.jpeg()
		.toBuffer();
	const truncated = jpeg.subarray(0, Math.floor(jpeg.length / 2));
	await assert.rejects(() => inspectImageFile(truncated, { allowedMimeTypes: ALLOWED }), /corrompido|não é uma imagem/);
	await assert.rejects(() => inspectImageFile(Buffer.alloc(0), { allowedMimeTypes: ALLOWED }), /vazio/);
	await assert.rejects(() => inspectImageFile(Buffer.from("isso não é uma imagem"), { allowedMimeTypes: ALLOWED }), /não é uma imagem/);
});

test("o intake recusa tamanho fora do teto e SHA-256 malformado antes de tocar no banco", async () => {
	await assert.rejects(() => createUploadIntake({ organizacaoId: "org-1", proposito: "MIDIA_TEMPLATE_MENSAGEM", tamanhoEsperadoBytes: 0 }), /máximo/);
	await assert.rejects(
		() => createUploadIntake({ organizacaoId: "org-1", proposito: "MIDIA_TEMPLATE_MENSAGEM", tamanhoEsperadoBytes: 5 * 1024 * 1024 }),
		/máximo/,
	);
	await assert.rejects(
		() =>
			createUploadIntake({
				organizacaoId: "org-1",
				proposito: "MIDIA_TEMPLATE_MENSAGEM",
				tamanhoEsperadoBytes: 1000,
				sha256Esperado: "não-é-um-hash",
			}),
		/SHA-256/,
	);
});

test("sniffMimeType reconhece PDF, PNG e JPEG pela assinatura e recusa o resto", async () => {
	const { sniffMimeType } = await import("./inspect");
	assert.equal(sniffMimeType(new TextEncoder().encode("%PDF-1.7\n")), "application/pdf");
	assert.equal(sniffMimeType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])), "image/png");
	assert.equal(sniffMimeType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
	assert.equal(sniffMimeType(new TextEncoder().encode("<html>")), null);
	assert.equal(sniffMimeType(new Uint8Array([])), null);
});
