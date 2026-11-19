import { db } from "@/services/drizzle";
import { fiscalOutboundDocuments } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import type {
	IFiscalProvider,
	TCancelDocumentInput,
	TFiscalCorrectionInput,
	TFiscalInutilizationInput,
	TProviderCorrectionResult,
	TProviderDocumentDetails,
	TProviderInutilizationResult,
	TFiscalOrganization,
	TFiscalSaleContext,
} from "@/lib/fiscal/types";
import type { TFiscalDocument } from "@/services/drizzle/schema";
import axios, { type AxiosInstance } from "axios";
import createHttpError from "http-errors";
import { getSpedyCompanyClient } from "./client";
import { mapSaleContextToSpedyInvoicePayload } from "./mappers/invoice";
import { mapSpedyInvoiceResponse } from "./status";
import type { TSpedyDisablementResponse, TSpedyInvoiceResponse } from "./types";

function getInvoiceBasePath(documento: Pick<TFiscalDocument, "tipo">) {
	return documento.tipo === "NFCE" ? "/v1/consumer-invoices" : "/v1/product-invoices";
}

export async function fetchSpedyInvoice(
	client: Pick<AxiosInstance, "get">,
	documento: Pick<TFiscalDocument, "tipo" | "provedorDocumentoId">,
): Promise<TSpedyInvoiceResponse> {
	if (!documento.provedorDocumentoId) throw new createHttpError.BadRequest("Documento fiscal sem ID na Spedy.");
	const basePath = getInvoiceBasePath(documento);
	const { data } = await client.get<TSpedyInvoiceResponse>(`${basePath}/${documento.provedorDocumentoId}`);
	return data;
}

async function getSpedyInvoice(documento: TFiscalDocument, organizacao: TFiscalOrganization) {
	const client = getSpedyCompanyClient(organizacao);
	const data = await fetchSpedyInvoice(client, documento);
	return mapSpedyInvoiceResponse(data);
}

export async function emitSpedyDocument(context: TFiscalSaleContext, documento: TFiscalDocument): Promise<TProviderDocumentDetails> {
	const client = getSpedyCompanyClient(context.organizacao);
	const basePath = getInvoiceBasePath(documento);
	const prepared = mapSaleContextToSpedyInvoicePayload(context, documento);
	const previous = documento.provedorPayload ? JSON.parse(documento.provedorPayload) : null;
	const payload = previous?.integrationId === prepared.integrationId ? previous : prepared;
	await db
		.update(fiscalOutboundDocuments)
		.set({ provedorPayload: JSON.stringify(payload) })
		.where(and(eq(fiscalOutboundDocuments.id, documento.id), eq(fiscalOutboundDocuments.organizacaoId, context.organizacao.id)));

	try {
		const { data } = await client.post<TSpedyInvoiceResponse>(basePath, payload);
		let response = data;
		if (data.status === "created") {
			await client.post(`${basePath}/${data.id}/issue`, { effectiveDate: payload.effectiveDate });
			response = await fetchSpedyInvoice(client, { tipo: documento.tipo, provedorDocumentoId: data.id });
		}
		return {
			...mapSpedyInvoiceResponse(response),
			provedorPayload: payload,
		};
	} catch (error) {
		if (axios.isAxiosError(error) && error.response?.data !== undefined) {
			console.error("[SPEDY] Erro ao emitir documento fiscal.", JSON.stringify(error.response.data, null, 2));
		} else {
			console.error("[SPEDY] Erro ao emitir documento fiscal.", error);
		}
		throw error;
	}
}

export async function consultSpedyDocument(documento: TFiscalDocument, organizacao: TFiscalOrganization): Promise<TProviderDocumentDetails> {
	return getSpedyInvoice(documento, organizacao);
}

export async function syncSpedyDocument(documento: TFiscalDocument, organizacao: TFiscalOrganization): Promise<TProviderDocumentDetails> {
	return getSpedyInvoice(documento, organizacao);
}

export async function cancelSpedyDocument(
	input: TCancelDocumentInput,
	documento: TFiscalDocument,
	organizacao: TFiscalOrganization,
): Promise<TProviderDocumentDetails> {
	if (!documento.provedorDocumentoId) throw new createHttpError.BadRequest("Documento fiscal sem ID na Spedy.");
	const client = getSpedyCompanyClient(organizacao);
	const { data } = await client.delete<TSpedyInvoiceResponse>(`${getInvoiceBasePath(documento)}/${documento.provedorDocumentoId}`, {
		data: { reason: input.reason },
	});
	const details = mapSpedyInvoiceResponse(data);
	return {
		...details,
		dataCancelamento: details.statusInterno === "CANCELADO" ? new Date() : null,
	};
}

export async function downloadSpedyXml(documento: TFiscalDocument, organizacao: TFiscalOrganization) {
	if (!documento.provedorDocumentoId) return null;
	const client = getSpedyCompanyClient(organizacao);
	const { data } = await client.get<ArrayBuffer>(`${getInvoiceBasePath(documento)}/${documento.provedorDocumentoId}/xml`, {
		responseType: "arraybuffer",
	});
	return data;
}

export async function downloadSpedyPdf(documento: TFiscalDocument, organizacao: TFiscalOrganization) {
	if (!documento.provedorDocumentoId) return null;
	const client = getSpedyCompanyClient(organizacao);
	const { data } = await client.get<ArrayBuffer>(`${getInvoiceBasePath(documento)}/${documento.provedorDocumentoId}/pdf`, {
		responseType: "arraybuffer",
	});
	return data;
}

export async function cartaCorrecaoSpedyDocument(
	input: TFiscalCorrectionInput,
	documento: TFiscalDocument,
	organizacao: TFiscalOrganization,
): Promise<TProviderCorrectionResult> {
	if (documento.tipo !== "NFE") throw new createHttpError.BadRequest("Carta de correcao disponivel apenas para NF-e.");
	if (!documento.provedorDocumentoId) throw new createHttpError.BadRequest("Documento fiscal sem ID na Spedy.");
	const client = getSpedyCompanyClient(organizacao);
	const { data } = await client.post<Record<string, unknown>>(`/v1/product-invoices/${documento.provedorDocumentoId}/corrections`, {
		letter: input.correcao,
	});
	return {
		sequenciaEvento: 1,
		protocolo: null,
		dataEvento: new Date(),
		provedorRetorno: data,
	};
}

export async function inutilizeSpedyNumber(
	input: TFiscalInutilizationInput,
	documento: TFiscalDocument,
	organizacao: TFiscalOrganization,
): Promise<TProviderInutilizationResult> {
	const numero = documento.numero ? Number(documento.numero) : null;
	if (!documento.serie || !numero) throw new createHttpError.BadRequest("Dados insuficientes para inutilizacao (serie ou numero).");
	const client = getSpedyCompanyClient(organizacao);
	const { data } = await client.post<TSpedyDisablementResponse>(`${getInvoiceBasePath(documento)}/disablement`, {
		initialNumber: numero,
		finalNumber: numero,
		series: Number(documento.serie),
		reason: input.justificativa,
	});
	return {
		status: "INUTILIZADA",
		protocolo: data.protocolNumber ?? null,
		dataEvento: data.date ? new Date(data.date) : new Date(),
		mensagens: [data.messageText].filter((message): message is string => !!message),
		provedorRetorno: data as unknown as Record<string, unknown>,
	};
}

export const spedyDocumentMethods: Pick<
	IFiscalProvider,
	| "emitirDocumento"
	| "consultarDocumento"
	| "sincronizarDocumento"
	| "cancelarDocumento"
	| "cartaCorrecaoDocumento"
	| "inutilizarNumeracao"
	| "baixarXml"
	| "baixarPdf"
> = {
	emitirDocumento: emitSpedyDocument,
	consultarDocumento: consultSpedyDocument,
	sincronizarDocumento: syncSpedyDocument,
	cancelarDocumento: cancelSpedyDocument,
	cartaCorrecaoDocumento: cartaCorrecaoSpedyDocument,
	inutilizarNumeracao: inutilizeSpedyNumber,
	baixarXml: downloadSpedyXml,
	baixarPdf: downloadSpedyPdf,
};
