"use client";

import type { TGetClientsInput, TGetClientsOutput, TGetClientsOutputDefault } from "@/app/api/clients/route";
import { formatDateAsLocale, formatToMoney, formatToPhone } from "@/lib/formatting";
import axios from "axios";
import dayjs from "dayjs";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

type ClientExportParams = Omit<TGetClientsInput, "id" | "page">;
type ClientExportClient = TGetClientsOutputDefault["clients"][number];

export type ClientExportRow = {
	ID: string;
	NOME: string;
	TELEFONE: string;
	EMAIL: string;
	"CPF/CNPJ": string;
	AQUISIÇÃO: string;
	"SEGMENTAÇÃO RFM": string;
	"VALOR TOTAL DE COMPRAS": string;
	"QUANTIDADE TOTAL DE COMPRAS": number;
	"PRIMEIRA COMPRA": string | null;
	"ÚLTIMA COMPRA": string | null;
	"CASHBACK DISPONÍVEL": string;
	CIDADE: string;
	ESTADO: string;
	BAIRRO: string;
	CEP: string;
	"PRODUTO/GRUPO MAIS COMPRADO": string;
	"DATA DE CADASTRO": string | null;
};

export type UseClientsExportReturn = {
	exportData: ClientExportRow[];
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

function buildClientsSearchParams(input: TGetClientsInput) {
	const searchParams = new URLSearchParams();
	if (input.search) searchParams.set("search", input.search);
	if (input.acquisitionChannels.length > 0) searchParams.set("acquisitionChannels", input.acquisitionChannels.join(","));
	if (input.segmentationTitles.length > 0) searchParams.set("segmentationTitles", input.segmentationTitles.join(","));
	if (input.statsPeriodAfter) searchParams.set("statsPeriodAfter", input.statsPeriodAfter.toISOString());
	if (input.statsPeriodBefore) searchParams.set("statsPeriodBefore", input.statsPeriodBefore.toISOString());
	if (input.statsIntegrationsIds.length > 0) searchParams.set("statsIntegrationsIds", input.statsIntegrationsIds.join(","));
	if (input.statsExcludedSalesIds.length > 0) searchParams.set("statsExcludedSalesIds", input.statsExcludedSalesIds.join(","));
	if (input.birthdaysPeriodAfter) searchParams.set("birthdaysPeriodAfter", input.birthdaysPeriodAfter.toISOString());
	if (input.birthdaysPeriodBefore) searchParams.set("birthdaysPeriodBefore", input.birthdaysPeriodBefore.toISOString());
	if (input.orderByField) searchParams.set("orderByField", input.orderByField);
	if (input.orderByDirection) searchParams.set("orderByDirection", input.orderByDirection);
	searchParams.set("page", input.page.toString());
	return searchParams;
}

async function fetchClientsExportPage(input: TGetClientsInput) {
	const searchParams = buildClientsSearchParams(input);
	const { data } = await axios.get<TGetClientsOutput>(`/api/clients?${searchParams.toString()}`);
	if (!data.data.default) throw new Error("Clientes não encontrados.");
	return data.data.default;
}

function formatOptionalDate(date?: string | Date | null) {
	return date ? formatDateAsLocale(date) : "";
}

function formatClientForExport(client: ClientExportClient): ClientExportRow {
	const cashbackBalance = client.saldos[0] ?? null;

	return {
		ID: client.id,
		NOME: client.nome,
		TELEFONE: client.telefone ? formatToPhone(client.telefone) : "",
		EMAIL: client.email ?? "",
		"CPF/CNPJ": client.cpfCnpj ?? "",
		AQUISIÇÃO: client.canalAquisicao ?? "",
		"SEGMENTAÇÃO RFM": client.analiseRFMTitulo ?? "",
		"VALOR TOTAL DE COMPRAS": formatToMoney(client.estatisticas.comprasValorTotal),
		"QUANTIDADE TOTAL DE COMPRAS": client.estatisticas.comprasQtdeTotal,
		"PRIMEIRA COMPRA": formatOptionalDate(client.estatisticas.primeiraCompraData),
		"ÚLTIMA COMPRA": formatOptionalDate(client.estatisticas.ultimaCompraData),
		"CASHBACK DISPONÍVEL": cashbackBalance ? formatToMoney(cashbackBalance.saldoValorDisponivel) : "",
		CIDADE: client.localizacaoCidade ?? "",
		ESTADO: client.localizacaoEstado ?? "",
		BAIRRO: client.localizacaoBairro ?? "",
		CEP: client.localizacaoCep ?? "",
		"PRODUTO/GRUPO MAIS COMPRADO": client.metadataGrupoProdutoMaisComprado ?? "",
		"DATA DE CADASTRO": formatOptionalDate(client.dataInsercao),
	};
}

export function useClientsExport({ params }: { params: ClientExportParams }): UseClientsExportReturn {
	const [exportData, setExportData] = useState<ClientExportRow[]>([]);
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
			const firstPage = await fetchClientsExportPage({ ...params, page: 1 });
			const discoveredTotalPages = firstPage.totalPages ?? 0;
			const matched = firstPage.clientsMatched ?? 0;

			setExportData(firstPage.clients.map(formatClientForExport));
			setTotalPages(discoveredTotalPages);
			setTotalMatched(matched);
			setCurrentPage(discoveredTotalPages > 0 ? 1 : 0);
			setProgress(discoveredTotalPages > 0 ? Math.round((1 / discoveredTotalPages) * 100) : 100);

			for (let page = 2; page <= discoveredTotalPages; page++) {
				if (cancelRef.current) break;
				const pageResult = await fetchClientsExportPage({ ...params, page });
				setExportData((prev) => [...prev, ...pageResult.clients.map(formatClientForExport)]);
				setCurrentPage(page);
				setProgress(Math.round((page / discoveredTotalPages) * 100));
			}

			if (!cancelRef.current) toast.success("Exportação concluída.");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Falha ao exportar clientes.");
		} finally {
			setIsExporting(false);
		}
	}, [isExporting, params]);

	const downloadXlsx = useCallback(
		(fileName?: string) => {
			if (exportData.length === 0) {
				toast.info("Nenhum dado para exportar.");
				return;
			}

			const safeName = fileName?.trim().length ? fileName.trim() : `clientes-${dayjs().format("YYYY-MM-DD_HH-mm-ss")}`;
			const worksheet = XLSX.utils.json_to_sheet(exportData);
			const workbook = XLSX.utils.book_new();
			XLSX.utils.book_append_sheet(workbook, worksheet, "Clientes");
			XLSX.writeFile(workbook, `${safeName}.xlsx`);
			toast.success("Arquivo XLSX gerado.");
		},
		[exportData],
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
