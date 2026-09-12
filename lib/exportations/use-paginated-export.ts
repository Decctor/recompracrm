"use client";

import dayjs from "dayjs";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

/**
 * Laço de exportação paginada: busca a primeira página, descobre o total, percorre as demais e
 * acumula as linhas já no formato da planilha. Uma implementação para clientes e vendas — cada
 * entidade só diz como buscar uma página e como cada registro vira linha.
 */

export type TPaginatedExportPage<TRow> = {
	rows: TRow[];
	/** Total de páginas; `null` quando a página não informa (só a primeira precisa informar). */
	totalPages: number | null;
	/** Total de registros do recorte; `null` quando a página não informa. */
	totalMatched: number | null;
};

export type UsePaginatedExportReturn<TRow> = {
	exportData: TRow[];
	isExporting: boolean;
	isCanceled: boolean;
	progress: number;
	currentPage: number;
	totalPages: number;
	totalMatched: number;
	start: () => Promise<void>;
	cancel: () => void;
	reset: () => void;
	downloadXlsx: (fileName?: string) => void;
};

type UsePaginatedExportParams<TRow> = {
	fetchPage: (page: number) => Promise<TPaginatedExportPage<TRow>>;
	/** Nome da aba na planilha ("Clientes", "Vendas"). */
	sheetName: string;
	/** Prefixo do arquivo; recebe data e hora no download ("vendas-2026-09-12_10-30-00.xlsx"). */
	fileNamePrefix: string;
	/** Mensagem de erro genérica, quando a falha não traz mensagem própria. */
	errorMessage: string;
};

export function usePaginatedExport<TRow extends object>({
	fetchPage,
	sheetName,
	fileNamePrefix,
	errorMessage,
}: UsePaginatedExportParams<TRow>): UsePaginatedExportReturn<TRow> {
	const [exportData, setExportData] = useState<TRow[]>([]);
	const [isExporting, setIsExporting] = useState(false);
	const [isCanceled, setIsCanceled] = useState(false);
	const [progress, setProgress] = useState(0);
	const [currentPage, setCurrentPage] = useState(0);
	const [totalPages, setTotalPages] = useState(0);
	const [totalMatched, setTotalMatched] = useState(0);

	const cancelRef = useRef(false);

	const reset = useCallback(() => {
		cancelRef.current = false;
		setExportData([]);
		setIsExporting(false);
		setIsCanceled(false);
		setProgress(0);
		setCurrentPage(0);
		setTotalPages(0);
		setTotalMatched(0);
	}, []);

	const cancel = useCallback(() => {
		cancelRef.current = true;
		setIsCanceled(true);
		toast.info("Exportação cancelada.");
	}, []);

	const start = useCallback(async () => {
		if (isExporting) return;

		setIsExporting(true);
		setIsCanceled(false);
		cancelRef.current = false;
		setExportData([]);
		setProgress(0);
		setCurrentPage(0);
		setTotalPages(0);
		setTotalMatched(0);

		try {
			const firstPage = await fetchPage(1);
			const discoveredTotalPages = firstPage.totalPages ?? 0;
			const matched = firstPage.totalMatched ?? 0;

			setExportData(firstPage.rows);
			setTotalPages(discoveredTotalPages);
			setTotalMatched(matched);
			setCurrentPage(discoveredTotalPages > 0 ? 1 : 0);
			setProgress(discoveredTotalPages > 0 ? Math.round((1 / discoveredTotalPages) * 100) : 100);

			for (let page = 2; page <= discoveredTotalPages; page++) {
				if (cancelRef.current) break;
				const pageResult = await fetchPage(page);
				setExportData((prev) => [...prev, ...pageResult.rows]);
				setCurrentPage(page);
				setProgress(Math.round((page / discoveredTotalPages) * 100));
			}

			if (!cancelRef.current) toast.success("Exportação concluída.");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : errorMessage);
		} finally {
			setIsExporting(false);
		}
	}, [isExporting, fetchPage, errorMessage]);

	const downloadXlsx = useCallback(
		(fileName?: string) => {
			if (exportData.length === 0) {
				toast.info("Nenhum dado para exportar.");
				return;
			}

			const safeName = fileName?.trim().length ? fileName.trim() : `${fileNamePrefix}-${dayjs().format("YYYY-MM-DD_HH-mm-ss")}`;
			const worksheet = XLSX.utils.json_to_sheet(exportData);
			const workbook = XLSX.utils.book_new();
			XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
			XLSX.writeFile(workbook, `${safeName}.xlsx`);
			toast.success("Arquivo XLSX gerado.");
		},
		[exportData, fileNamePrefix, sheetName],
	);

	return {
		exportData,
		isExporting,
		isCanceled,
		progress,
		currentPage,
		totalPages,
		totalMatched,
		start,
		cancel,
		reset,
		downloadXlsx,
	};
}
