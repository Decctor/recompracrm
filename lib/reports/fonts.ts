import fs from "node:fs/promises";
import path from "node:path";

type TSatoriFont = {
	name: string;
	data: ArrayBuffer;
	weight: 400 | 600 | 700;
	style: "normal";
};

let reportFontsPromise: Promise<TSatoriFont[]> | null = null;

async function loadFont(fileName: string) {
	const filePath = path.join(process.cwd(), "utils", "fonts", fileName);
	const fontBuffer = await fs.readFile(filePath);
	return fontBuffer.buffer.slice(fontBuffer.byteOffset, fontBuffer.byteOffset + fontBuffer.byteLength);
}

export function getReportFonts(): Promise<TSatoriFont[]> {
	if (!reportFontsPromise) {
		reportFontsPromise = Promise.all([
			loadFont("Outfit-Regular.ttf"),
			loadFont("Outfit-SemiBold.ttf"),
			loadFont("Outfit-Bold.ttf"),
		]).then(([regular, semiBold, bold]) => [
			{ name: "Outfit", data: regular, weight: 400, style: "normal" as const },
			{ name: "Outfit", data: semiBold, weight: 600, style: "normal" as const },
			{ name: "Outfit", data: bold, weight: 700, style: "normal" as const },
		]);
	}

	return reportFontsPromise;
}
