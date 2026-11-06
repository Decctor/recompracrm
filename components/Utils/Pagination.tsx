"use client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PAGE_SIZE_OPTIONS, getPaginationItems } from "@/lib/pagination";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type GeneralPaginationComponentProps = {
	activePage: number;
	totalPages: number;
	selectPage: (page: number) => void;
	queryLoading: boolean;
	itemsMatchedText?: string;
	itemsShowingText?: string;
	/** Tamanho de página atual. Junto com `onPageSizeChange`, mostra o seletor "por página". */
	pageSize?: number;
	onPageSizeChange?: (pageSize: number) => void;
	/**
	 * A barra gruda no topo da área visível enquanto a lista rola por baixo dela. Só funciona
	 * renderizada ANTES da lista, como filho direto do container que envolve a lista inteira (o
	 * sticky fica limitado ao pai). `false` para listas embutidas em caixas com rolagem própria.
	 */
	sticky?: boolean;
	/** Ao trocar de página, rola de volta para o topo do container da barra (padrão: `true`). */
	scrollToTopOnChange?: boolean;
	className?: string;
	/** @deprecated A régua compacta sempre mostra só as setas. Mantido por compatibilidade. */
	showSteppersText?: boolean;
	/** @deprecated O parágrafo explicativo foi removido. Mantido por compatibilidade. */
	showExplanation?: boolean;
	/** @deprecated A régua tem um tamanho só. Mantido por compatibilidade. */
	pageIconSize?: "default" | "sm" | "xs";
};

/**
 * Barra de paginação das listagens.
 *
 * Fica acima da lista e, com `sticky`, gruda no topo da tela enquanto a lista rola — o usuário troca
 * de página de qualquer ponto da rolagem sem voltar ao início, e a barra não se duplica. O fundo é
 * sempre opaco (o conteúdo passa por baixo dela); grudada, ganha sombra para se destacar da lista.
 */
function GeneralPaginationComponent({
	totalPages,
	activePage,
	selectPage,
	itemsMatchedText,
	itemsShowingText,
	queryLoading,
	pageSize,
	onPageSizeChange,
	sticky = true,
	scrollToTopOnChange = true,
	className,
}: GeneralPaginationComponentProps) {
	const barRef = useRef<HTMLElement>(null);
	const isStuck = useIsStuck({ enabled: sticky, barRef });

	const hasPages = totalPages > 1;
	const showPageSize = !!onPageSizeChange && pageSize !== undefined && (hasPages || pageSize > PAGE_SIZE_OPTIONS[0]);
	const summary = [itemsMatchedText, itemsShowingText].filter(Boolean).join(" · ");

	function scrollListIntoView() {
		if (!scrollToTopOnChange) return;
		const container = barRef.current?.parentElement;
		if (!container) return;
		// Só rola quando o topo da lista saiu de vista; clicando com o topo visível, nada se mexe.
		const scrollParent = findScrollParent(container);
		const visibleTop = scrollParent ? scrollParent.getBoundingClientRect().top : 0;
		if (container.getBoundingClientRect().top < visibleTop) container.scrollIntoView({ block: "start", behavior: "smooth" });
	}

	function goToPage(page: number) {
		if (page < 1 || page > totalPages || page === activePage) return;
		selectPage(page);
		scrollListIntoView();
	}

	function changePageSize(nextSize: number) {
		if (!onPageSizeChange || nextSize === pageSize) return;
		onPageSizeChange(nextSize);
		scrollListIntoView();
	}

	if (!hasPages && !showPageSize) {
		return summary ? <p className={cn("w-full py-1 text-center text-xs tracking-tight text-muted-foreground", className)}>{summary}</p> : null;
	}

	return (
		<>
			<nav ref={barRef} aria-label="Paginação" data-stuck={isStuck} className={cn("group/pagination z-20 w-full", sticky && "sticky top-2", className)}>
				<div
					className={cn(
						"flex w-full flex-col gap-1.5 rounded-2xl border border-border/70 bg-background/95 px-2 py-1.5 backdrop-blur-md transition-shadow duration-200 sm:flex-row sm:items-center sm:justify-between sm:gap-3",
						"group-data-[stuck=true]/pagination:shadow-[0_8px_32px_rgba(0,0,0,0.12)]",
					)}
				>
					<p
						className={cn(
							"min-w-0 truncate text-center text-xs tracking-tight text-muted-foreground sm:flex-1 sm:text-left",
							// Flutuando no celular, a linha de contagem sai para a barra ocupar uma linha só.
							"group-data-[stuck=true]/pagination:max-sm:hidden",
						)}
					>
						{summary || " "}
					</p>

					{hasPages ? (
						<div className="flex items-center justify-center gap-1">
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								aria-label="Página anterior"
								disabled={queryLoading || activePage <= 1}
								onClick={() => goToPage(activePage - 1)}
							>
								<ChevronLeft />
							</Button>
							{/* Celular: só "3 de 12"; a régua inteira não cabe em 360px. */}
							<span className="min-w-16 text-center text-xs font-medium tabular-nums sm:hidden">
								{activePage} de {totalPages}
							</span>
							<div className="hidden items-center gap-1 sm:flex">
								{getPaginationItems({ activePage, totalPages }).map((item) =>
									item.type === "gap" ? (
										<span key={item.key} aria-hidden className="w-6 text-center text-xs text-muted-foreground">
											…
										</span>
									) : (
										<button
											key={item.page}
											type="button"
											disabled={queryLoading}
											aria-label={`Página ${item.page}`}
											aria-current={item.page === activePage ? "page" : undefined}
											onClick={() => goToPage(item.page)}
											className={cn(
												"h-8 min-w-8 rounded-full px-2 text-xs font-medium tabular-nums outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
												item.page === activePage ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
											)}
										>
											{item.page}
										</button>
									),
								)}
							</div>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								aria-label="Próxima página"
								disabled={queryLoading || activePage >= totalPages}
								onClick={() => goToPage(activePage + 1)}
							>
								<ChevronRight />
							</Button>
						</div>
					) : null}

					<div className={cn("flex items-center justify-center sm:flex-1 sm:justify-end", !showPageSize && "hidden sm:flex")}>
						{showPageSize ? (
							<Select
								items={PAGE_SIZE_OPTIONS.map((size) => ({ value: String(size), label: `${size} por página` }))}
								value={String(pageSize)}
								onValueChange={(value) => {
									if (value) changePageSize(Number(value));
								}}
							>
								<SelectTrigger size="sm" aria-label="Itens por página" className="h-8 border-none bg-transparent text-xs shadow-none hover:bg-muted">
									<SelectValue />
								</SelectTrigger>
								<SelectContent side="bottom" alignItemWithTrigger={false}>
									<SelectGroup>
										{PAGE_SIZE_OPTIONS.map((size) => (
											<SelectItem key={size} value={String(size)} className="text-xs">
												{size} por página
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						) : null}
					</div>
				</div>
			</nav>
		</>
	);
}

export default GeneralPaginationComponent;

/** Distância do topo em que a barra gruda (`top-2`), em px. */
const STICKY_TOP_PX = 8;

function useIsStuck({ enabled, barRef }: { enabled: boolean; barRef: React.RefObject<HTMLElement | null> }) {
	const [isStuck, setIsStuck] = useState(false);
	useEffect(() => {
		const bar = barRef.current;
		if (!enabled || !bar || typeof IntersectionObserver === "undefined") {
			setIsStuck(false);
			return;
		}
		// Encolhe a área observada 1px além do ponto em que a barra gruda: grudada, ela fica parcialmente
		// fora dessa área POR CIMA. Cortada por baixo (a lista ainda nem chegou), não conta.
		const observer = new IntersectionObserver(
			([entry]) => {
				if (!entry) return;
				const observedTop = entry.rootBounds?.top ?? STICKY_TOP_PX + 1;
				setIsStuck(entry.intersectionRatio < 1 && entry.boundingClientRect.top < observedTop);
			},
			{ rootMargin: `-${STICKY_TOP_PX + 1}px 0px 0px 0px`, threshold: [1] },
		);
		observer.observe(bar);
		return () => observer.disconnect();
	}, [enabled, barRef]);
	return isStuck;
}

function findScrollParent(element: HTMLElement): HTMLElement | null {
	let current = element.parentElement;
	while (current && current !== document.body) {
		const { overflowY } = getComputedStyle(current);
		if ((overflowY === "auto" || overflowY === "scroll") && current.scrollHeight > current.clientHeight) return current;
		current = current.parentElement;
	}
	return null;
}
