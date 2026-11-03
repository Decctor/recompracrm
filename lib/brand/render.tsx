import { getReportFonts } from "@/lib/reports/fonts";
import { Resvg } from "@resvg/resvg-js";
import type { ReactElement } from "react";
import { loadSatori } from "./load-satori";

type RenderBrandAssetOptions = {
	element: ReactElement;
	width: number;
	height: number;
};

export async function renderBrandAssetSvg({ element, width, height }: RenderBrandAssetOptions) {
	// Reutiliza as fontes Outfit já usadas nas imagens de relatório.
	const [fonts, satori] = await Promise.all([getReportFonts(), loadSatori()]);
	return satori(element, { width, height, fonts });
}

export async function renderBrandAssetPng({ element, width, height }: RenderBrandAssetOptions): Promise<Buffer> {
	const svg = await renderBrandAssetSvg({ element, width, height });
	const resvg = new Resvg(svg, {
		fitTo: { mode: "width", value: width },
		font: { loadSystemFonts: false },
	});
	return resvg.render().asPng();
}
