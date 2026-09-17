import { renderPaginationPageItemsIcons } from "@/lib/rendering";
import React from "react";

type GeneralPaginationComponentProps = {
	activePage: number;
	totalPages: number;
	itemsMatchedText?: string;
	itemsShowingText?: string;
	showSteppersText?: boolean;
	showExplanation?: boolean;
	selectPage: (page: number) => void;
	queryLoading: boolean;
	pageIconSize?: "default" | "sm" | "xs";
};
function GeneralPaginationComponent({
	totalPages,
	activePage,
	selectPage,
	itemsMatchedText,
	itemsShowingText,
	queryLoading,
	showSteppersText = true,
	showExplanation = true,
	pageIconSize = "default",
}: GeneralPaginationComponentProps) {
	return (
		<div className="my-2 flex w-full flex-col items-center gap-3">
			{totalPages > 1 ? (
				<>
					{showExplanation ? (
						<p className="w-full text-center text-sm leading-none tracking-tight text-foreground/80">
							Um número grande de resultados foi encontrado, separamos em páginas para facilitar a visualização. Clique na página desejada para visualizar os
							demais resultados.
						</p>
					) : null}
					<div className="flex flex-col flex-wrap items-center justify-center gap-1 lg:flex-row lg:gap-4">
						<button
							disabled={queryLoading}
							onClick={() => {
								if (activePage - 1 > 0) return selectPage(activePage - 1);
								return;
							}}
							className="font-sans flex select-none items-center gap-2 rounded-full px-6 py-3 text-center align-middle text-xs font-bold uppercase text-foreground transition-all disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none hover:bg-primary/10 active:bg-primary/20"
							type="button"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								strokeWidth="2"
								stroke="currentColor"
								aria-hidden="true"
								className="h-4 w-4"
							>
								<path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
							</svg>
							{showSteppersText ? "ANTERIOR" : null}
						</button>
						<div className="flex items-center gap-2">
							{renderPaginationPageItemsIcons({ totalPages, activePage, selectPage, disabled: queryLoading, pageIconSize })}
						</div>
						<button
							disabled={queryLoading}
							onClick={() => {
								if (activePage + 1 <= totalPages) selectPage(activePage + 1);
								else return;
							}}
							className="font-sans flex select-none items-center gap-2 rounded-full px-6 py-3 text-center align-middle text-xs font-bold uppercase text-foreground transition-all disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none hover:bg-primary/10 active:bg-primary/20"
							type="button"
						>
							{showSteppersText ? "PRÓXIMA" : null}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								strokeWidth="2"
								stroke="currentColor"
								aria-hidden="true"
								className="h-4 w-4"
							>
								<path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
							</svg>
						</button>
					</div>
				</>
			) : null}
			<div className="flex w-full flex-col gap-1">
				<p className="w-full text-center text-sm leading-none tracking-tight text-foreground/80">{itemsMatchedText ? itemsMatchedText : "..."}</p>
				<p className="w-full text-center text-sm leading-none tracking-tight text-foreground/80">{itemsShowingText ? itemsShowingText : "..."}</p>
			</div>
		</div>
	);
}

export default GeneralPaginationComponent;
