import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { MOCK_PRODUCT_PHOTOS, PRODUCT_PHOTOS_DIR } from "../app/(brand-marketing)/erp/_components/mocks/product-photos";

// Baixa do Pexels as fotos dos produtos de exemplo das telas do ERP (PDV e loja digital) e grava
// os recortes em public/images/erp/products. A lista, com créditos, fica em
// app/(brand-marketing)/erp/_components/mocks/product-photos.ts.
//
// Uso:
//   npm run download:erp-mock-photos            # baixa só o que ainda não existe
//   npm run download:erp-mock-photos -- --force # baixa tudo de novo
//
// Cada foto vira <slug>.webp em 4:3 (800×600, o card do PDV) e, quando marcada como `square`,
// <slug>-square.webp em 1:1 (600×600, o card da loja digital). O recorte usa o ponto de interesse
// do sharp ("attention"), que acerta o produto mesmo quando ele não está no centro.

const CARD = { width: 800, height: 600 };
const SQUARE = { width: 600, height: 600 };
const QUALITY = 78;

async function exists(file: string) {
	try {
		await sharp(file).metadata();
		return true;
	} catch {
		return false;
	}
}

async function download(url: string) {
	// O CDN do Pexels redimensiona na origem: 1600px de largura basta para os dois recortes.
	const response = await fetch(`${url}?auto=compress&cs=tinysrgb&w=1600`);
	if (!response.ok) throw new Error(`HTTP ${response.status} ao baixar ${url}`);
	return Buffer.from(await response.arrayBuffer());
}

async function main() {
	const force = process.argv.includes("--force");
	const outDir = path.join(process.cwd(), PRODUCT_PHOTOS_DIR);
	await mkdir(outDir, { recursive: true });

	let written = 0;
	let skipped = 0;
	const failures: string[] = [];

	for (const photo of MOCK_PRODUCT_PHOTOS) {
		const cardFile = path.join(outDir, `${photo.slug}.webp`);
		const squareFile = path.join(outDir, `${photo.slug}-square.webp`);
		const needsCard = force || !(await exists(cardFile));
		const needsSquare = !!photo.square && (force || !(await exists(squareFile)));
		if (!needsCard && !needsSquare) {
			skipped++;
			continue;
		}

		try {
			const original = await download(photo.source);
			if (needsCard) {
				const card = await sharp(original)
					.resize({ ...CARD, fit: "cover", position: "attention" })
					.webp({ quality: QUALITY })
					.toBuffer();
				await writeFile(cardFile, card);
				written++;
			}
			if (needsSquare) {
				const square = await sharp(original)
					.resize({ ...SQUARE, fit: "cover", position: "attention" })
					.webp({ quality: QUALITY })
					.toBuffer();
				await writeFile(squareFile, square);
				written++;
			}
			console.log(`✓ ${photo.slug} (Pexels ${photo.pexelsId}, ${photo.photographer})`);
		} catch (error) {
			failures.push(`${photo.slug}: ${error instanceof Error ? error.message : String(error)}`);
			console.error(`✗ ${photo.slug}`);
		}
	}

	console.log(`\n${written} arquivo(s) gravado(s), ${skipped} foto(s) já existiam, ${failures.length} falha(s). Pasta: ${PRODUCT_PHOTOS_DIR}`);
	if (failures.length > 0) {
		for (const failure of failures) console.error(`  ${failure}`);
		process.exit(1);
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
