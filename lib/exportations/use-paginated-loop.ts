"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Laço de exportação paginada, sem saber para onde vão os registros: busca a primeira página,
 * descobre o total, percorre as demais e entrega cada página ao `onPage` do consumidor. A planilha
 * acumula linhas (`usePaginatedExport`); o ZIP baixa arquivos e grava no volume
 * (`useFiscalDocumentAssetsZipExport`). Progresso, cancelamento e contadores ficam aqui, iguais
 * para os dois.
 */

export type TPaginatedExportPage<TItem> = {
	rows: TItem[];
	/** Total de páginas; `null` quando a página não informa (só a primeira precisa informar). */
	totalPages: number | null;
	/** Total de registros do recorte; `null` quando a página não informa. */
	totalMatched: number | null;
};

export type TPaginatedLoopPageContext = {
	page: number;
	/** Quantos itens desta página já foram processados — para o progresso andar dentro da página. */
	reportProgress: (processedInPage: number) => void;
	isCanceled: () => boolean;
};

export type TPaginatedLoopOutcome = "COMPLETED" | "CANCELED" | "FAILED";

type UsePaginatedLoopParams<TItem> = {
	fetchPage: (page: number) => Promise<TPaginatedExportPage<TItem>>;
	/** Roda antes da primeira página, ainda dentro do clique (ex.: abrir o seletor de arquivo). `false` aborta sem erro. */
	onStart?: () => Promise<boolean | void> | boolean | void;
	onPage: (rows: TItem[], context: TPaginatedLoopPageContext) => Promise<void> | void;
	onFinish?: (outcome: TPaginatedLoopOutcome) => Promise<void> | void;
	/** Mensagem de erro genérica, quando a falha não traz mensagem própria. */
	errorMessage: string;
};

export type UsePaginatedLoopReturn = {
	isExporting: boolean;
	isCanceled: boolean;
	isCompleted: boolean;
	progress: number;
	currentPage: number;
	totalPages: number;
	totalMatched: number;
	processed: number;
	start: () => Promise<void>;
	cancel: () => void;
	reset: () => void;
};

export function usePaginatedLoop<TItem>({ fetchPage, onStart, onPage, onFinish, errorMessage }: UsePaginatedLoopParams<TItem>): UsePaginatedLoopReturn {
	const [isExporting, setIsExporting] = useState(false);
	const [isCanceled, setIsCanceled] = useState(false);
	const [isCompleted, setIsCompleted] = useState(false);
	const [currentPage, setCurrentPage] = useState(0);
	const [totalPages, setTotalPages] = useState(0);
	const [totalMatched, setTotalMatched] = useState(0);
	const [processed, setProcessed] = useState(0);

	const cancelRef = useRef(false);
	const runningRef = useRef(false);

	const resetCounters = useCallback(() => {
		setIsCanceled(false);
		setIsCompleted(false);
		setCurrentPage(0);
		setTotalPages(0);
		setTotalMatched(0);
		setProcessed(0);
	}, []);

	const reset = useCallback(() => {
		cancelRef.current = false;
		setIsExporting(false);
		resetCounters();
	}, [resetCounters]);

	const cancel = useCallback(() => {
		cancelRef.current = true;
		setIsCanceled(true);
		toast.info("Exportação cancelada.");
	}, []);

	const start = useCallback(async () => {
		if (runningRef.current) return;
		runningRef.current = true;
		cancelRef.current = false;
		resetCounters();

		let outcome: TPaginatedLoopOutcome = "COMPLETED";
		let started = false;
		try {
			// Antes de qualquer `await` de rede: APIs como `showSaveFilePicker` exigem o gesto do usuário.
			if ((await onStart?.()) === false) return;
			started = true;
			setIsExporting(true);

			let processedBefore = 0;
			const runPage = async (page: number, pageResult: TPaginatedExportPage<TItem>) => {
				const base = processedBefore;
				await onPage(pageResult.rows, {
					page,
					reportProgress: (processedInPage) => setProcessed(base + processedInPage),
					isCanceled: () => cancelRef.current,
				});
				processedBefore = base + pageResult.rows.length;
				setProcessed(processedBefore);
				setCurrentPage(page);
			};

			const firstPage = await fetchPage(1);
			const discoveredTotalPages = firstPage.totalPages ?? 0;
			setTotalPages(discoveredTotalPages);
			setTotalMatched(firstPage.totalMatched ?? 0);
			await runPage(1, firstPage);

			for (let page = 2; page <= discoveredTotalPages; page++) {
				if (cancelRef.current) break;
				await runPage(page, await fetchPage(page));
			}

			if (cancelRef.current) outcome = "CANCELED";
		} catch (error) {
			outcome = "FAILED";
			toast.error(error instanceof Error ? error.message : errorMessage);
		} finally {
			try {
				if (started) await onFinish?.(outcome);
				if (started && outcome === "COMPLETED") {
					setIsCompleted(true);
					toast.success("Exportação concluída.");
				}
			} catch (error) {
				toast.error(error instanceof Error ? error.message : errorMessage);
			}
			setIsExporting(false);
			runningRef.current = false;
		}
	}, [fetchPage, onStart, onPage, onFinish, errorMessage, resetCounters]);

	// Com total conhecido, o progresso conta registros (anda dentro da página); sem, conta páginas.
	const progress = isCompleted
		? 100
		: totalMatched > 0
			? Math.min(100, Math.round((processed / totalMatched) * 100))
			: totalPages > 0
				? Math.round((currentPage / totalPages) * 100)
				: 0;

	return { isExporting, isCanceled, isCompleted, progress, currentPage, totalPages, totalMatched, processed, start, cancel, reset };
}
