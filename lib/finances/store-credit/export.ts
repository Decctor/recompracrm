"use client";

import type { TGetStoreCreditExportOutput, TStoreCreditExportTitle } from "@/app/api/finances/store-credit/export/route";
import { type TPaginatedExportSheet, usePaginatedExport, type UsePaginatedExportReturn } from "@/lib/exportations/use-paginated-export";
import { formatDateAsLocale, formatToCPForCNPJ, formatToPhone } from "@/lib/formatting";
import { PAYMENT_METHOD_LABELS } from "@/lib/payments/labels";
import type { TPaymentMethodEnum } from "@/schemas/enums";
import axios from "axios";
import dayjs from "dayjs";
import { useCallback } from "react";
import { getStoreCreditDaysOverdue, resolveStoreCreditAgingBucket, STORE_CREDIT_AGING_BUCKETS, type TStoreCreditAgingBucket } from "./aging";
import { STORE_CREDIT_METHOD, STORE_CREDIT_REMAINDER_ORIGIN, type TStoreCreditStatus } from "./constants";

/**
 * Exportação dos fiados em planilha de duas abas:
 * - "Fiados": uma linha por título, como chega da rota.
 * - "Clientes": o agregado por cliente, calculado aqui a partir das mesmas linhas — as duas abas
 *   fecham por construção, sem uma segunda consulta que pudesse divergir.
 *
 * Valores saem como número: quem gerencia fiado em planilha soma, filtra e ordena coluna.
 */

export type TStoreCreditExportFilters = {
	search: string;
	statuses: TStoreCreditStatus[];
	agingBuckets: TStoreCreditAgingBucket[];
	originAfter: Date | null;
	originBefore: Date | null;
	includeSettled: boolean;
};

export type UseStoreCreditExportReturn = UsePaginatedExportReturn<TStoreCreditExportTitle>;

async function fetchStoreCreditExportPage({ filters, page }: { filters: TStoreCreditExportFilters; page: number }) {
	const searchParams = new URLSearchParams();
	searchParams.set("page", page.toString());
	if (filters.search.trim()) searchParams.set("search", filters.search.trim());
	if (filters.statuses.length > 0) searchParams.set("statuses", filters.statuses.join(","));
	if (filters.agingBuckets.length > 0) searchParams.set("agingBuckets", filters.agingBuckets.join(","));
	if (filters.originAfter) searchParams.set("originAfter", filters.originAfter.toISOString());
	if (filters.originBefore) searchParams.set("originBefore", filters.originBefore.toISOString());
	if (filters.includeSettled) searchParams.set("includeSettled", "true");
	const { data } = await axios.get<TGetStoreCreditExportOutput>(`/api/finances/store-credit/export?${searchParams.toString()}`);
	return data.data;
}

const AGING_LABELS = Object.fromEntries(STORE_CREDIT_AGING_BUCKETS.map((bucket) => [bucket.chave, bucket.rotulo])) as Record<TStoreCreditAgingBucket, string>;

function roundMoney(value: number) {
	return Math.round(value * 100) / 100;
}

function formatOptionalDate(date: string | Date | null | undefined, showHours = false) {
	return date ? (formatDateAsLocale(date, showHours) ?? "") : "";
}

function isOverdue(title: TStoreCreditExportTitle, startOfToday: Date) {
	return title.emAberto && !!title.dataPrevisao && new Date(title.dataPrevisao) < startOfToday;
}

/** Forma real do recebimento. A tela genérica de movimentações efetiva sem trocar o método. */
function formatReceiptMethod(title: TStoreCreditExportTitle) {
	if (title.emAberto) return "";
	if (title.metodo === STORE_CREDIT_METHOD) return "Não informada";
	return PAYMENT_METHOD_LABELS[title.metodo as TPaymentMethodEnum] ?? title.metodo;
}

function buildTitleRow(title: TStoreCreditExportTitle, referenceDate: Date, startOfToday: Date) {
	const overdue = isOverdue(title, startOfToday);
	return {
		CLIENTE: title.clienteNome,
		TELEFONE: title.clienteTelefone ? formatToPhone(title.clienteTelefone) : "",
		"CPF/CNPJ": title.clienteCpfCnpj ? formatToCPForCNPJ(title.clienteCpfCnpj) : "",
		TÍTULO: title.titulo,
		// Uma baixa parcial divide o título em dois; sem esta coluna, quem lê vê duas linhas para a
		// mesma venda e não sabe por quê. Depois de quitado, o saldo vira recebimento como os demais.
		"ORIGEM DO TÍTULO": title.origem === STORE_CREDIT_REMAINDER_ORIGIN ? "Saldo de baixa parcial" : "Fiado",
		VALOR: roundMoney(title.valor),
		"DATA DE ORIGEM": formatOptionalDate(title.dataOrigem),
		VENCIMENTO: formatOptionalDate(title.dataPrevisao),
		SITUAÇÃO: !title.emAberto ? "QUITADO" : overdue ? "VENCIDO" : "EM ABERTO",
		// Só faz sentido para o que está em aberto e vencido: em dia ou quitado fica vazio, não 0.
		"DIAS EM ATRASO": overdue ? getStoreCreditDaysOverdue(title.dataPrevisao, referenceDate) : null,
		"FAIXA DE ATRASO": title.emAberto ? AGING_LABELS[resolveStoreCreditAgingBucket(title.dataPrevisao, referenceDate)] : "",
		"RECEBIDO EM": formatOptionalDate(title.dataEfetivacao, true),
		"FORMA DE RECEBIMENTO": formatReceiptMethod(title),
		CONTA: title.contaFinanceiraNome ?? "",
		VENDA: title.vendaId ?? "",
		"DATA DA VENDA": formatOptionalDate(title.vendaDataVenda, true),
		"VALOR DA VENDA": title.vendaValorTotal,
		VENDEDOR: title.vendedorNome ?? "",
		"ID DO TÍTULO": title.transacaoId,
	};
}

type TClientAggregate = {
	nome: string;
	telefone: string | null;
	cpfCnpj: string | null;
	saldoAberto: number;
	titulosAbertos: number;
	valorVencido: number;
	previsaoMaisAntiga: Date | null;
	totalRecebido: number;
	titulosQuitados: number;
	ultimoRecebimento: Date | null;
};

function buildClientRows(titles: TStoreCreditExportTitle[], { includeSettled, referenceDate, startOfToday }: { includeSettled: boolean; referenceDate: Date; startOfToday: Date }) {
	// Map preserva a ordem de inserção: os clientes saem na ordem dos títulos (por nome).
	const byClient = new Map<string, TClientAggregate>();
	for (const title of titles) {
		const aggregate = byClient.get(title.clienteId) ?? {
			nome: title.clienteNome,
			telefone: title.clienteTelefone,
			cpfCnpj: title.clienteCpfCnpj,
			saldoAberto: 0,
			titulosAbertos: 0,
			valorVencido: 0,
			previsaoMaisAntiga: null,
			totalRecebido: 0,
			titulosQuitados: 0,
			ultimoRecebimento: null,
		};
		if (title.emAberto) {
			aggregate.saldoAberto += title.valor;
			aggregate.titulosAbertos += 1;
			if (isOverdue(title, startOfToday)) aggregate.valorVencido += title.valor;
			const previsao = title.dataPrevisao ? new Date(title.dataPrevisao) : null;
			if (previsao && (!aggregate.previsaoMaisAntiga || previsao < aggregate.previsaoMaisAntiga)) aggregate.previsaoMaisAntiga = previsao;
		} else {
			aggregate.totalRecebido += title.valor;
			aggregate.titulosQuitados += 1;
			const efetivacao = title.dataEfetivacao ? new Date(title.dataEfetivacao) : null;
			if (efetivacao && (!aggregate.ultimoRecebimento || efetivacao > aggregate.ultimoRecebimento)) aggregate.ultimoRecebimento = efetivacao;
		}
		byClient.set(title.clienteId, aggregate);
	}

	return [...byClient.values()].map((client) => {
		const diasAtraso = client.previsaoMaisAntiga ? getStoreCreditDaysOverdue(client.previsaoMaisAntiga, referenceDate) : null;
		const row: Record<string, string | number | null> = {
			CLIENTE: client.nome,
			TELEFONE: client.telefone ? formatToPhone(client.telefone) : "",
			"CPF/CNPJ": client.cpfCnpj ? formatToCPForCNPJ(client.cpfCnpj) : "",
			"SALDO EM ABERTO": roundMoney(client.saldoAberto),
			"TÍTULOS EM ABERTO": client.titulosAbertos,
			"VALOR VENCIDO": roundMoney(client.valorVencido),
			"VENCIMENTO MAIS ANTIGO": formatOptionalDate(client.previsaoMaisAntiga),
			// O atraso que o cliente carrega é o do título em aberto mais antigo — o mesmo critério da faixa na tela.
			"DIAS EM ATRASO": diasAtraso !== null && diasAtraso > 0 ? diasAtraso : null,
		};
		// Sem os quitados na exportação, "total recebido" seria um zero que o dado não sustenta.
		if (includeSettled) {
			row["TOTAL RECEBIDO"] = roundMoney(client.totalRecebido);
			row["TÍTULOS QUITADOS"] = client.titulosQuitados;
			row["ÚLTIMO RECEBIMENTO"] = formatOptionalDate(client.ultimoRecebimento, true);
		}
		return row;
	});
}

export function buildStoreCreditExportSheets(
	titles: TStoreCreditExportTitle[],
	{ includeSettled, referenceDate = new Date() }: { includeSettled: boolean; referenceDate?: Date },
): TPaginatedExportSheet[] {
	// Uma referência para a planilha inteira: um título não muda de faixa entre as duas abas.
	const startOfToday = dayjs(referenceDate).startOf("day").toDate();
	return [
		{ name: "Clientes", rows: buildClientRows(titles, { includeSettled, referenceDate, startOfToday }) },
		{ name: "Fiados", rows: titles.map((title) => buildTitleRow(title, referenceDate, startOfToday)) },
	];
}

export function useStoreCreditExport({ filters }: { filters: TStoreCreditExportFilters }): UseStoreCreditExportReturn {
	const fetchPage = useCallback(
		async (page: number) => {
			const result = await fetchStoreCreditExportPage({ filters, page });
			return { rows: result.titulos, totalPages: result.totalPages, totalMatched: result.titlesMatched };
		},
		[filters],
	);

	const toSheets = useCallback(
		(titles: TStoreCreditExportTitle[]) => buildStoreCreditExportSheets(titles, { includeSettled: filters.includeSettled }),
		[filters.includeSettled],
	);

	return usePaginatedExport({ fetchPage, toSheets, sheetName: "Fiados", fileNamePrefix: "fiados", errorMessage: "Falha ao exportar os fiados." });
}
