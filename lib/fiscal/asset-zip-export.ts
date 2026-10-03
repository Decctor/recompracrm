"use client";

import type { TFiscalDocumentAssetExportEntry, TGetFiscalDocumentAssetsExportOutput } from "@/app/api/fiscal/documents/export/assets/route";
import { FISCAL_LIFECYCLE_STATUS_LABELS } from "@/app/dashboard/fiscal/_module/shared/fiscal-labels";
import { mapWithConcurrency } from "@/lib/async/map-with-concurrency";
import { type TPaginatedLoopOutcome, type TPaginatedLoopPageContext, usePaginatedLoop, type UsePaginatedLoopReturn } from "@/lib/exportations/use-paginated-loop";
import { openZipVolumeWriter, type TZipVolumeWriter } from "@/lib/exportations/zip-volume-writer";
import { buildFiscalDocumentsSearchParams, type TFiscalDocumentsFiltersState } from "@/lib/fiscal/document-filters";
import { formatDateAsLocale } from "@/lib/formatting";
import { FISCAL_DOCUMENT_TYPE_LABELS } from "@/lib/sales/export-summaries";
import axios from "axios";
import dayjs from "dayjs";
import { useCallback, useRef, useState } from "react";

/**
 * Exportação de XML/DANFE em ZIP. A rota devolve, por página, URLs assinadas do storage; o
 * navegador baixa direto de lá (o servidor não carrega bytes) e grava no ZIP à medida que chegam.
 *
 * Todo documento do recorte vira uma linha em `_RELATORIO.csv`, com o arquivo incluído ou o motivo
 * da ausência: uma nota que some do ZIP em silêncio é pior que uma que aparece como "falhou".
 */

export type TFiscalAssetExportType = "xml" | "pdf";

const DOWNLOAD_CONCURRENCY = 6;
// Status com que o storage responde a uma URL assinada vencida — vale repedir a página.
const EXPIRED_URL_STATUSES = new Set([400, 401, 403]);

type TReportLine = {
	entry: TFiscalDocumentAssetExportEntry;
	situacao: string;
};

type TDownloadResult = { ok: true } | { ok: false; motivo: string; retryable: boolean };

export type UseFiscalDocumentAssetsZipExportReturn = UsePaginatedLoopReturn & {
	failures: number;
	volumes: number;
};

async function fetchFiscalDocumentAssetsPage({ filters, asset, page }: { filters: TFiscalDocumentsFiltersState; asset: TFiscalAssetExportType; page: number }) {
	const searchParams = buildFiscalDocumentsSearchParams(filters);
	searchParams.set("asset", asset);
	searchParams.set("page", page.toString());
	const { data } = await axios.get<TGetFiscalDocumentAssetsExportOutput>(`/api/fiscal/documents/export/assets?${searchParams.toString()}`);
	return data.data;
}

function escapeCsvCell(value: string) {
	return /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** CSV com `;` e BOM: abre direto no Excel em português, com acentos. */
function buildReportCsv(lines: TReportLine[]) {
	const header = ["TIPO", "SÉRIE", "NÚMERO", "CHAVE DE ACESSO", "STATUS", "DATA DE EMISSÃO", "ARQUIVO NO ZIP", "SITUAÇÃO"];
	const rows = lines.map(({ entry, situacao }) => [
		FISCAL_DOCUMENT_TYPE_LABELS[entry.tipo] ?? entry.tipo,
		entry.serie ?? "",
		entry.numero ?? "",
		entry.chaveAcesso ?? "",
		FISCAL_LIFECYCLE_STATUS_LABELS[entry.statusInterno] ?? entry.statusInterno,
		entry.dataEmissao ? (formatDateAsLocale(entry.dataEmissao, true) ?? "") : "",
		situacao === "INCLUÍDO" ? entry.caminhoNoZip : "",
		situacao,
	]);
	const csv = [header, ...rows].map((row) => row.map(escapeCsvCell).join(";")).join("\r\n");
	return new TextEncoder().encode(`﻿${csv}`);
}

export function useFiscalDocumentAssetsZipExport({
	filters,
	asset,
}: {
	filters: TFiscalDocumentsFiltersState;
	asset: TFiscalAssetExportType;
}): UseFiscalDocumentAssetsZipExportReturn {
	const writerRef = useRef<TZipVolumeWriter | null>(null);
	const reportRef = useRef<TReportLine[]>([]);
	const [failures, setFailures] = useState(0);
	const [volumes, setVolumes] = useState(0);

	const fetchPage = useCallback(
		async (page: number) => {
			const result = await fetchFiscalDocumentAssetsPage({ filters, asset, page });
			return { rows: result.arquivos, totalPages: result.totalPages, totalMatched: result.documentsMatched };
		},
		[filters, asset],
	);

	const onStart = useCallback(async () => {
		reportRef.current = [];
		setFailures(0);
		setVolumes(0);
		const writer = await openZipVolumeWriter({ fileNamePrefix: `notas-fiscais-${asset}-${dayjs().format("YYYY-MM-DD_HH-mm-ss")}` });
		if (!writer) return false;
		writerRef.current = writer;
		return true;
	}, [asset]);

	const download = useCallback(
		async (entry: TFiscalDocumentAssetExportEntry): Promise<TDownloadResult> => {
			const writer = writerRef.current;
			if (!writer) return { ok: false, motivo: "Exportação encerrada.", retryable: false };
			if (!entry.url) return { ok: false, motivo: entry.motivo ?? "Arquivo indisponível.", retryable: false };
			try {
				const response = await fetch(entry.url);
				if (!response.ok) {
					return { ok: false, motivo: `Falha ao baixar o arquivo (HTTP ${response.status}).`, retryable: EXPIRED_URL_STATUSES.has(response.status) };
				}
				const data = new Uint8Array(await response.arrayBuffer());
				// XML comprime ~10x; PDF já vem comprimido, deflate só gastaria CPU.
				writer.addFile(entry.caminhoNoZip, data, { compress: asset === "xml" });
				setVolumes(writer.volumesWritten());
				return { ok: true };
			} catch (error) {
				return { ok: false, motivo: `Falha ao baixar o arquivo: ${error instanceof Error ? error.message : "erro de rede"}.`, retryable: true };
			}
		},
		[asset],
	);

	const onPage = useCallback(
		async (rows: TFiscalDocumentAssetExportEntry[], { page, reportProgress, isCanceled }: TPaginatedLoopPageContext) => {
			let done = 0;
			const results = await mapWithConcurrency(rows, DOWNLOAD_CONCURRENCY, async (entry) => {
				const result: TDownloadResult = isCanceled() ? { ok: false, motivo: "Exportação cancelada.", retryable: false } : await download(entry);
				done += 1;
				reportProgress(done);
				return result;
			});

			// URL vencida (página lenta) ou falha de rede: repede a página uma vez, com URLs novas.
			const retryIndexes = results.flatMap((result, index) => (!result.ok && result.retryable ? [index] : []));
			if (retryIndexes.length > 0 && !isCanceled()) {
				const fresh = await fetchPage(page);
				const freshById = new Map(fresh.rows.map((entry) => [entry.documentoId, entry]));
				await mapWithConcurrency(retryIndexes, DOWNLOAD_CONCURRENCY, async (index) => {
					const freshEntry = freshById.get(rows[index].documentoId);
					if (freshEntry) results[index] = await download(freshEntry);
				});
			}

			const lines = rows.map((entry, index) => {
				const result = results[index];
				return { entry, situacao: result.ok ? "INCLUÍDO" : result.motivo };
			});
			reportRef.current.push(...lines);
			const pageFailures = results.filter((result) => !result.ok).length;
			if (pageFailures > 0) setFailures((prev) => prev + pageFailures);
			// Contrapressão: não busca a próxima página antes de o disco absorver esta.
			await writerRef.current?.flush();
		},
		[download, fetchPage],
	);

	const onFinish = useCallback(async (outcome: TPaginatedLoopOutcome) => {
		const writer = writerRef.current;
		writerRef.current = null;
		if (!writer) return;
		if (outcome === "COMPLETED") {
			await writer.finish({ path: "_RELATORIO.csv", data: buildReportCsv(reportRef.current) });
			setVolumes(writer.volumesWritten());
		} else {
			await writer.abort();
		}
		reportRef.current = [];
	}, []);

	const loop = usePaginatedLoop({ fetchPage, onStart, onPage, onFinish, errorMessage: "Falha ao exportar os arquivos fiscais." });
	const { reset: resetLoop } = loop;

	const reset = useCallback(() => {
		setFailures(0);
		setVolumes(0);
		resetLoop();
	}, [resetLoop]);

	return { ...loop, reset, failures, volumes };
}
