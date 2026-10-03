"use client";

import { type CSSProperties, type Ref, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { TVisualKitFormatEnum } from "@/schemas/enums";
import type { TVisualKitPage, TVisualKitPieceProps } from "../types";
import { VISUAL_KIT_PIECE_RENDERERS } from "./index";

/** Páginas da peça, recalculadas só quando o formato ou as props mudam. */
export function useVisualKitPages(formato: TVisualKitFormatEnum, props: TVisualKitPieceProps): TVisualKitPage[] {
	return useMemo(() => VISUAL_KIT_PIECE_RENDERERS[formato].paginate(props), [formato, props]);
}

type TVisualKitPieceCanvasProps = {
	formato: TVisualKitFormatEnum;
	props: TVisualKitPieceProps;
	page: TVisualKitPage;
	ref?: Ref<HTMLDivElement>;
};

/**
 * A página no tamanho real, sem transformação. É este nó que a exportação rasteriza (html-to-image):
 * ele tem largura/altura exatas e não depende de escala nem de estilos do contêiner.
 */
export function VisualKitPieceCanvas({ formato, props, page, ref }: TVisualKitPieceCanvasProps) {
	const renderer = VISUAL_KIT_PIECE_RENDERERS[formato];
	const size = renderer.pageSize(props, page);
	const { Page } = renderer;
	return (
		<div ref={ref} data-visual-kit-canvas={formato} style={{ width: size.largura, height: size.altura, overflow: "hidden" }}>
			<Page props={props} page={page} />
		</div>
	);
}

type TVisualKitPiecePreviewProps = {
	formato: TVisualKitFormatEnum;
	props: TVisualKitPieceProps;
	pageIndex: number;
	/** Largura máxima em px. Sem ela, usa a largura do contêiner (medida com ResizeObserver). */
	maxWidth?: number;
	maxHeight?: number;
	className?: string;
};

const PAPER_STYLE: CSSProperties = {
	position: "relative",
	overflow: "hidden",
	background: "#ffffff",
	boxShadow: "0 0 0 1px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.06), 0 14px 32px -10px rgba(0,0,0,0.16)",
};

/** Pré-visualização de uma página: renderiza no tamanho real e reduz com `transform: scale()`. */
export function VisualKitPiecePreview({ formato, props, pageIndex, maxWidth, maxHeight, className }: TVisualKitPiecePreviewProps) {
	const pages = useVisualKitPages(formato, props);
	const page = pages[Math.min(Math.max(0, pageIndex), pages.length - 1)];
	const size = VISUAL_KIT_PIECE_RENDERERS[formato].pageSize(props, page);

	const containerRef = useRef<HTMLDivElement>(null);
	const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
	useLayoutEffect(() => {
		if (maxWidth != null) return;
		const element = containerRef.current;
		if (!element) return;
		setMeasuredWidth(element.clientWidth);
		const observer = new ResizeObserver(([entry]) => setMeasuredWidth(entry.contentRect.width));
		observer.observe(element);
		return () => observer.disconnect();
	}, [maxWidth]);

	const availableWidth = maxWidth ?? measuredWidth;
	const scale =
		availableWidth == null ? 0 : Math.min(1, availableWidth / size.largura, maxHeight != null ? maxHeight / size.altura : Number.POSITIVE_INFINITY);

	return (
		<div ref={containerRef} className={cn("flex w-full justify-center", className)}>
			<div
				style={{
					...PAPER_STYLE,
					width: size.largura * scale,
					height: size.altura * scale,
					visibility: scale > 0 ? "visible" : "hidden",
				}}
			>
				<div style={{ width: size.largura, height: size.altura, transform: `scale(${scale})`, transformOrigin: "top left" }}>
					<VisualKitPieceCanvas formato={formato} props={props} page={page} />
				</div>
			</div>
		</div>
	);
}
