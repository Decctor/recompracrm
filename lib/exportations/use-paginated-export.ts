"use client";

import dayjs from "dayjs";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { type TPaginatedExportPage, usePaginatedLoop, type UsePaginatedLoopReturn } from "./use-paginated-loop";

/**
 * Exportação paginada para planilha: o laço de `usePaginatedLoop` com um destino que acumula as
 * linhas já no formato da planilha. Cada entidade só diz como buscar uma página e como cada
 * registro vira linha.
 */

export type { TPaginatedExportPage };

export type UsePaginatedExportReturn<TRow> = UsePaginatedLoopReturn & {
	exportData: TRow[];
	downloadXlsx: (fileName?: string) => void;
};

export type TPaginatedExportSheet = { name: string; rows: object[]; headers?: string[]; columnWidths?: number[] };

type UsePaginatedExportParams<TRow> = {
	fetchPage: (page: number) => Promise<TPaginatedExportPage<TRow>>;
	/** Nome da aba na planilha ("Clientes", "Vendas"). Ignorado quando `toSheets` é informado. */
	sheetName: string;
	/**
	 * Mais de uma aba: recebe tudo o que o laço acumulou e devolve as abas na ordem. Com ele, as
	 * linhas acumuladas podem ser o registro cru — a formatação acontece só no download, e uma aba
	 * de resumo pode agregar os números sem desfazer formatação.
	 */
	toSheets?: (rows: TRow[]) => TPaginatedExportSheet[];
	/** Prefixo do arquivo; recebe data e hora no download ("vendas-2026-09-12_10-30-00.xlsx"). */
	fileNamePrefix: string;
	/** Mensagem de erro genérica, quando a falha não traz mensagem própria. */
	errorMessage: string;
};

export function usePaginatedExport<TRow extends object>({
	fetchPage,
	sheetName,
	toSheets,
	fileNamePrefix,
	errorMessage,
}: UsePaginatedExportParams<TRow>): UsePaginatedExportReturn<TRow> {
	const [exportData, setExportData] = useState<TRow[]>([]);
	// O laço lê daqui; o estado só existe para a tela re-renderizar.
	const rowsRef = useRef<TRow[]>([]);

	const onStart = useCallback(() => {
		rowsRef.current = [];
		setExportData([]);
	}, []);
	const onPage = useCallback((rows: TRow[]) => {
		rowsRef.current = [...rowsRef.current, ...rows];
		setExportData(rowsRef.current);
	}, []);

	const loop = usePaginatedLoop({ fetchPage, onStart, onPage, errorMessage });
	const { reset: resetLoop } = loop;

	const reset = useCallback(() => {
		rowsRef.current = [];
		setExportData([]);
		resetLoop();
	}, [resetLoop]);

	const downloadXlsx = useCallback(
		(fileName?: string) => {
			if (exportData.length === 0) {
				toast.info("Nenhum dado para exportar.");
				return;
			}

			const safeName = fileName?.trim().length ? fileName.trim() : `${fileNamePrefix}-${dayjs().format("YYYY-MM-DD_HH-mm-ss")}`;
			const sheets: TPaginatedExportSheet[] = toSheets ? toSheets(exportData) : [{ name: sheetName, rows: exportData }];
			const workbook = XLSX.utils.book_new();
			for (const sheet of sheets) {
				const worksheet = XLSX.utils.json_to_sheet(sheet.rows, { header: sheet.headers });
				if (sheet.columnWidths) worksheet["!cols"] = sheet.columnWidths.map((wch) => ({ wch }));
				if (sheet.headers && worksheet["!ref"]) worksheet["!autofilter"] = { ref: worksheet["!ref"] };
				XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
			}
			XLSX.writeFile(workbook, `${safeName}.xlsx`);
			toast.success("Arquivo XLSX gerado.");
		},
		[exportData, fileNamePrefix, sheetName, toSheets],
	);

	return { ...loop, reset, exportData, downloadXlsx };
}
