import { CampaignReportImage, SalesReportImage } from "@/components/Reports";
import { Resvg } from "@resvg/resvg-js";
import React from "react";
import { loadSatori } from "@/lib/brand/load-satori";
import { getReportFonts } from "./fonts";
import type { TCampaignReportPayload, TSalesReportPayload } from "./types";

type RenderReportImageOptions = {
	payload: TSalesReportPayload;
};

type RenderCampaignReportImageOptions = {
	payload: TCampaignReportPayload;
};

const CAMPAIGN_REPORT_WIDTH = 1080;
const CAMPAIGN_REPORT_HEIGHT = 1920;

function bufferToDataUrl(buffer: Buffer, mimeType: string) {
	return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

async function resolveLogoDataUrl(logoUrl: string | null) {
	if (!logoUrl) return null;

	try {
		const response = await fetch(logoUrl);
		if (!response.ok) return null;

		const contentType = response.headers.get("content-type") || "image/png";
		const arrayBuffer = await response.arrayBuffer();
		return bufferToDataUrl(Buffer.from(arrayBuffer), contentType);
	} catch (error) {
		console.warn("[REPORT_IMAGE] Failed to resolve logo", { logoUrl, error });
		return null;
	}
}

export async function renderReportSvg({ payload }: RenderReportImageOptions) {
	// Fontes, logo e o próprio satori são independentes: carregam juntos.
	const [fonts, logoSrc, satori] = await Promise.all([getReportFonts(), resolveLogoDataUrl(payload.theme.logoUrl), loadSatori()]);

	return satori(<SalesReportImage payload={payload} logoSrc={logoSrc} />, {
		width: 1080,
		height: 1350,
		fonts,
	});
}

export async function renderReportPng({ payload }: RenderReportImageOptions): Promise<Buffer> {
	const svg = await renderReportSvg({ payload });
	const resvg = new Resvg(svg, {
		fitTo: {
			mode: "width",
			value: 1080,
		},
		font: {
			loadSystemFonts: false,
		},
	});

	return resvg.render().asPng();
}

export async function renderCampaignReportSvg({ payload }: RenderCampaignReportImageOptions) {
	// Fontes, logo e o próprio satori são independentes: carregam juntos.
	const [fonts, logoSrc, satori] = await Promise.all([getReportFonts(), resolveLogoDataUrl(payload.theme.logoUrl), loadSatori()]);

	return satori(<CampaignReportImage payload={payload} logoSrc={logoSrc} />, {
		width: CAMPAIGN_REPORT_WIDTH,
		height: CAMPAIGN_REPORT_HEIGHT,
		fonts,
	});
}

export async function renderCampaignReportPng({ payload }: RenderCampaignReportImageOptions): Promise<Buffer> {
	const svg = await renderCampaignReportSvg({ payload });
	const resvg = new Resvg(svg, {
		fitTo: {
			mode: "width",
			value: CAMPAIGN_REPORT_WIDTH,
		},
		font: {
			loadSystemFonts: false,
		},
	});

	return resvg.render().asPng();
}

export default {
	renderReportSvg,
	renderReportPng,
	renderCampaignReportSvg,
	renderCampaignReportPng,
};
