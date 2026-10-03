"use client";

import { getFontEmbedCSS, toCanvas } from "html-to-image";
import type { ReactElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { TVisualKitFormatEnum } from "@/schemas/enums";
import { getVisualKitPageSize } from "../pieces";
import { VisualKitPieceCanvas } from "../pieces/piece-preview";
import type { TVisualKitPage, TVisualKitPieceProps } from "../types";

// Folhas A4 saem em 300 dpi (a página é desenhada em px CSS a 96 dpi); peças digitais já têm o
// tamanho final em px.
export const VISUAL_KIT_PRINT_PIXEL_RATIO = 300 / 96;

export const VISUAL_KIT_PIXEL_RATIOS: Record<TVisualKitFormatEnum, number> = {
	ETIQUETA_GONDOLA: VISUAL_KIT_PRINT_PIXEL_RATIO,
	ADESIVO_PRECO: VISUAL_KIT_PRINT_PIXEL_RATIO,
	WOBBLER: VISUAL_KIT_PRINT_PIXEL_RATIO,
	ENCARTE: VISUAL_KIT_PRINT_PIXEL_RATIO,
	SELO_PRODUTO: 1,
	POST_FEED: 1,
	STORY: 1,
	CARROSSEL: 1,
	LISTA_WHATSAPP: 1,
};

const IMAGE_LOAD_TIMEOUT_MS = 15_000;
// GIF 1×1 transparente: imagem que falhou sai vazia em vez de derrubar a página inteira (sem isso o
// html-to-image rejeita com o evento de erro da <img>).
const TRANSPARENT_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/** Devolve o controle ao event loop (a animação de progresso da tela continua rodando). */
export function yieldToEventLoop(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve));
}

function withTimeout(promise: Promise<unknown>, ms: number): Promise<void> {
	return new Promise((resolve) => {
		const timer = setTimeout(resolve, ms);
		promise.then(
			() => {
				clearTimeout(timer);
				resolve();
			},
			() => {
				clearTimeout(timer);
				resolve();
			},
		);
	});
}

/** Espera a imagem carregar e decodificar; erro ou demora não travam — a peça sai com o que carregou. */
function waitForImage(img: HTMLImageElement): Promise<void> {
	if (img.complete && img.naturalWidth > 0) return img.decode().catch(() => undefined);
	const loaded = new Promise<void>((resolve, reject) => {
		if (img.complete) {
			reject(new Error("imagem falhou"));
			return;
		}
		img.addEventListener("load", () => resolve(), { once: true });
		img.addEventListener("error", () => reject(new Error("imagem falhou")), { once: true });
	}).then(() => img.decode());
	return withTimeout(loaded, IMAGE_LOAD_TIMEOUT_MS);
}

/**
 * Monta o elemento fora da tela (sem transform em nenhum ancestral) e espera o commit do React, as
 * fontes e todas as imagens. `node` é o primeiro filho renderizado.
 */
export async function mountOffscreen(element: ReactElement): Promise<{ node: HTMLElement; unmount: () => void }> {
	const container = document.createElement("div");
	container.setAttribute("aria-hidden", "true");
	Object.assign(container.style, {
		position: "fixed",
		left: "-100000px",
		top: "0",
		pointerEvents: "none",
		transform: "none",
		zIndex: "-1",
	});
	document.body.appendChild(container);
	const root = createRoot(container);
	const unmount = () => {
		root.unmount();
		container.remove();
	};

	try {
		flushSync(() => root.render(element));
		// Sem requestAnimationFrame: ele para em aba em segundo plano e travaria a geração.
		await yieldToEventLoop();
		await document.fonts.ready;
		await Promise.all(Array.from(container.querySelectorAll("img")).map(waitForImage));
		const node = container.firstElementChild;
		if (!(node instanceof HTMLElement)) throw new Error("Não foi possível montar a peça para exportação.");
		return { node, unmount };
	} catch (error) {
		unmount();
		throw error;
	}
}

type TRasterizePageArgs = {
	formato: TVisualKitFormatEnum;
	props: TVisualKitPieceProps;
	page: TVisualKitPage;
	pixelRatio: number;
	/** CSS das fontes já embutidas (`prepareVisualKitRasterization`): sem ele, cada página baixa as fontes de novo. */
	fontEmbedCSS?: string;
};

async function rasterizeNode(node: HTMLElement, size: { largura: number; altura: number }, pixelRatio: number, fontEmbedCSS?: string) {
	return toCanvas(node, {
		width: size.largura,
		height: size.altura,
		pixelRatio,
		backgroundColor: "#ffffff",
		fontEmbedCSS,
		skipAutoScale: true,
		imagePlaceholder: TRANSPARENT_PIXEL,
		onImageErrorHandler: () => undefined,
	});
}

/** Rasteriza uma página no tamanho real × `pixelRatio`. */
export async function rasterizePage({ formato, props, page, pixelRatio, fontEmbedCSS }: TRasterizePageArgs): Promise<HTMLCanvasElement> {
	const size = getVisualKitPageSize(formato, props, page);
	const { node, unmount } = await mountOffscreen(<VisualKitPieceCanvas formato={formato} props={props} page={page} />);
	try {
		return await rasterizeNode(node, size, pixelRatio, fontEmbedCSS);
	} finally {
		unmount();
	}
}

/**
 * Início de uma geração: calcula o CSS das fontes uma vez (repassado a todo `rasterizePage`) e faz
 * uma renderização descartável — a primeira passada do html-to-image às vezes sai sem fonte/imagem.
 */
export async function prepareVisualKitRasterization({
	formato,
	props,
	page,
}: {
	formato: TVisualKitFormatEnum;
	props: TVisualKitPieceProps;
	page: TVisualKitPage;
}): Promise<{ fontEmbedCSS: string | undefined }> {
	const size = getVisualKitPageSize(formato, props, page);
	const { node, unmount } = await mountOffscreen(<VisualKitPieceCanvas formato={formato} props={props} page={page} />);
	try {
		let fontEmbedCSS: string | undefined;
		try {
			fontEmbedCSS = await getFontEmbedCSS(node);
		} catch {
			fontEmbedCSS = undefined; // cai no caminho padrão do html-to-image (embute a cada página)
		}
		try {
			const warmUp = await rasterizeNode(node, size, 1, fontEmbedCSS);
			warmUp.width = 0;
			warmUp.height = 0;
		} catch {
			// Só aquecimento.
		}
		return { fontEmbedCSS };
	} finally {
		unmount();
	}
}
