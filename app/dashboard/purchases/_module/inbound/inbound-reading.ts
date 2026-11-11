"use client";

import type { TImportResult } from "../builder/helpers/review-lines";

/**
 * A leitura feita na gaveta "Registrar compra" segue para o construtor sem ser refeita. O estado do
 * construtor vive só no navegador, então a passagem é um singleton de módulo: sobrevive à navegação
 * client-side e some num recarregamento — e aí o construtor lê a nota de novo pelo `inboundId`.
 */
type TInboundReadingHandoff = { inboundId: string; file: File; result: TImportResult };

let pendingHandoff: TInboundReadingHandoff | null = null;

export function stashInboundReading(handoff: TInboundReadingHandoff) {
	pendingHandoff = handoff;
}

export function takeInboundReading(inboundId: string) {
	if (pendingHandoff?.inboundId !== inboundId) return null;
	const handoff = pendingHandoff;
	pendingHandoff = null;
	return handoff;
}

/** Baixa o XML autorizado da nota recebida como um arquivo, no formato que a leitura de compras aceita. */
export async function fetchInboundXmlFile({ inboundId, fileName }: { inboundId: string; fileName?: string }) {
	const response = await fetch(`/api/fiscal/inbound/xml?inboundId=${encodeURIComponent(inboundId)}`);
	if (!response.ok) {
		const body = await response.json().catch(() => null);
		throw new Error(body?.error?.message ?? "Não foi possível baixar o XML da nota.");
	}
	const blob = await response.blob();
	return new File([blob], fileName ?? `nfe-${inboundId}.xml`, { type: "application/xml" });
}
