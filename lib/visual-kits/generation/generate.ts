"use client";

import type { TVisualKitFormatEnum, TVisualKitOutputEnum } from "@/schemas/enums";
import { A4_PAGE, VISUAL_KIT_FORMATS } from "../formats";
import { paginateVisualKitPiece } from "../pieces";
import type { TVisualKitPage, TVisualKitPieceProps } from "../types";
import {
	visualKitCarouselFileName,
	visualKitOutputExtension,
	visualKitPagedFileName,
	visualKitPieceFileName,
	visualKitPieceFolderName,
	visualKitProductFileName,
} from "./file-names";
import { withProxiedImages } from "./image-proxy";
import { canvasToJpg, canvasToPng } from "./images";
import { createVisualKitPdf, PDF_A4_SIZE, pdfPageSizeForCanvas } from "./pdf";
import { prepareVisualKitRasterization, rasterizePage, VISUAL_KIT_PIXEL_RATIOS, yieldToEventLoop } from "./render";

export type TGeneratedFileMimeType = "application/pdf" | "image/png" | "image/jpeg";

export type TGeneratedFile = {
	nome: string;
	pasta: string;
	mimeType: TGeneratedFileMimeType;
	blob: Blob;
	produtoId: string | null;
	produtoVarianteId: string | null;
	/** Posição 1-based do arquivo dentro da peça (a mesma do prefixo `NN-` do nome). */
	ordem: number;
};

export type TGeneratedPiece = { formato: TVisualKitFormatEnum; saida: TVisualKitOutputEnum; arquivos: TGeneratedFile[] };

export type TGenerationProgress = {
	pecaIndice: number; // 0-based
	totalPecas: number;
	formato: TVisualKitFormatEnum;
	paginaAtual: number; // 1-based: a página que está sendo renderizada agora
	totalPaginas: number;
};

export type TGenerationPieceInput = { formato: TVisualKitFormatEnum; saida: TVisualKitOutputEnum; props: TVisualKitPieceProps };

// Peças com uma imagem por produto: o arquivo leva o produto (e o nome dele).
const PER_PRODUCT_FORMATS = new Set<TVisualKitFormatEnum>(["SELO_PRODUTO", "POST_FEED", "STORY"]);

/** Erro pt-BR quando a saída não vale para o formato (ex.: PNG de etiqueta de gôndola). */
export function assertVisualKitOutput(formato: TVisualKitFormatEnum, saida: TVisualKitOutputEnum) {
	const spec = VISUAL_KIT_FORMATS[formato];
	if (!spec.saidas.some((option) => option.id === saida)) {
		const validas = spec.saidas.map((option) => option.titulo).join(" ou ");
		throw new Error(`A peça "${spec.nome}" não pode ser gerada nesse formato de arquivo. Use ${validas}.`);
	}
}

function hasItems(pages: TVisualKitPage[]) {
	return pages.some((page) => page.itens.length > 0);
}

type TPieceContext = {
	formato: TVisualKitFormatEnum;
	saida: TVisualKitOutputEnum;
	props: TVisualKitPieceProps;
	pages: TVisualKitPage[];
	pixelRatio: number;
	fontEmbedCSS: string | undefined;
	signal: AbortSignal | undefined;
	reportPage: (paginaAtual: number) => void;
};

/** Rasteriza as páginas em ordem, uma por vez, chamando `onPage` com cada canvas (liberado em seguida). */
async function forEachRenderedPage(ctx: TPieceContext, onPage: (canvas: HTMLCanvasElement, page: TVisualKitPage, index: number) => Promise<void>) {
	for (let index = 0; index < ctx.pages.length; index += 1) {
		ctx.signal?.throwIfAborted();
		ctx.reportPage(index + 1);
		const page = ctx.pages[index];
		const canvas = await rasterizePage({ formato: ctx.formato, props: ctx.props, page, pixelRatio: ctx.pixelRatio, fontEmbedCSS: ctx.fontEmbedCSS });
		try {
			await onPage(canvas, page, index);
		} finally {
			// Solta a memória do canvas na hora (folhas de 300 dpi pesam ~35 MB).
			canvas.width = 0;
			canvas.height = 0;
		}
		await yieldToEventLoop();
	}
}

async function generatePdfPiece(ctx: TPieceContext): Promise<TGeneratedFile[]> {
	const spec = VISUAL_KIT_FORMATS[ctx.formato];
	const pdf = await createVisualKitPdf({ titulo: `${spec.nome} · ${ctx.props.marca.nome}` });
	const isA4 = spec.pagina === A4_PAGE;
	await forEachRenderedPage(ctx, async (canvas, page) => {
		if (ctx.saida === "PDF_ETIQUETADORA") {
			await pdf.addShelfLabelsFromSheet(canvas, { count: page.itens.length, pixelRatio: ctx.pixelRatio });
			return;
		}
		await pdf.addCanvasPage(canvas, isA4 ? PDF_A4_SIZE : pdfPageSizeForCanvas(canvas, ctx.pixelRatio));
	});
	ctx.signal?.throwIfAborted();
	const blob = await pdf.save();
	return [
		{
			nome: visualKitPieceFileName(ctx.formato, "pdf"),
			pasta: visualKitPieceFolderName(ctx.formato),
			mimeType: "application/pdf",
			blob,
			produtoId: null,
			produtoVarianteId: null,
			ordem: 1,
		},
	];
}

async function generateImagePiece(ctx: TPieceContext): Promise<TGeneratedFile[]> {
	const ext = visualKitOutputExtension(ctx.saida);
	const mimeType: TGeneratedFileMimeType = ctx.saida === "JPG" ? "image/jpeg" : "image/png";
	const total = ctx.pages.length;
	const perProduct = PER_PRODUCT_FORMATS.has(ctx.formato);
	const files: TGeneratedFile[] = [];
	await forEachRenderedPage(ctx, async (canvas, page, index) => {
		const ordem = index + 1;
		const item = perProduct ? (page.itens[0] ?? null) : null;
		let nome: string;
		if (item) nome = visualKitProductFileName({ ordem, total, produtoNome: item.nome, ext });
		else if (ctx.formato === "CARROSSEL") nome = visualKitCarouselFileName({ ordem, total, ext });
		else nome = visualKitPagedFileName({ formato: ctx.formato, ordem, total, ext });
		const blob = ctx.saida === "JPG" ? await canvasToJpg(canvas) : await canvasToPng(canvas);
		files.push({
			nome,
			pasta: visualKitPieceFolderName(ctx.formato),
			mimeType,
			blob,
			produtoId: item?.produtoId ?? null,
			produtoVarianteId: item?.produtoVarianteId ?? null,
			ordem,
		});
	});
	return files;
}

/**
 * Gera os arquivos de cada peça no navegador, uma página por vez. Lança `AbortError` (DOMException)
 * quando `signal` é abortado — a checagem acontece entre páginas.
 */
export async function generateVisualKit({
	pecas,
	onProgress,
	signal,
}: {
	pecas: TGenerationPieceInput[];
	onProgress?: (progress: TGenerationProgress) => void;
	signal?: AbortSignal;
}): Promise<TGeneratedPiece[]> {
	// Valida tudo antes de renderizar qualquer coisa: erro de configuração não desperdiça minutos.
	const prepared = pecas.map(({ formato, saida, props }) => {
		assertVisualKitOutput(formato, saida);
		const proxied = withProxiedImages(props);
		const pages = paginateVisualKitPiece(formato, proxied);
		if (!hasItems(pages)) throw new Error(`A peça "${VISUAL_KIT_FORMATS[formato].nome}" não tem produtos para gerar.`);
		return { formato, saida, props: proxied, pages };
	});
	if (!prepared.length) return [];

	signal?.throwIfAborted();
	const first = prepared[0];
	const { fontEmbedCSS } = await prepareVisualKitRasterization({ formato: first.formato, props: first.props, page: first.pages[0] });

	const results: TGeneratedPiece[] = [];
	for (let pecaIndice = 0; pecaIndice < prepared.length; pecaIndice += 1) {
		const piece = prepared[pecaIndice];
		const ctx: TPieceContext = {
			...piece,
			pixelRatio: VISUAL_KIT_PIXEL_RATIOS[piece.formato],
			fontEmbedCSS,
			signal,
			reportPage: (paginaAtual) =>
				onProgress?.({ pecaIndice, totalPecas: prepared.length, formato: piece.formato, paginaAtual, totalPaginas: piece.pages.length }),
		};
		const isPdf = piece.saida === "PDF" || piece.saida === "PDF_ETIQUETADORA";
		const arquivos = isPdf ? await generatePdfPiece(ctx) : await generateImagePiece(ctx);
		results.push({ formato: piece.formato, saida: piece.saida, arquivos });
	}
	return results;
}
