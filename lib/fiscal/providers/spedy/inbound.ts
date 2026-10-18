import type {
	IFiscalInboundProvider,
	TInboundDocumentSnapshot,
	TInboundListResult,
	TInboundManifestInput,
	TInboundManifestResult,
	TInboundProviderRef,
	TInboundSyncStatus,
} from "@/lib/fiscal/inbound/types";
import type { TFiscalOrganization } from "@/lib/fiscal/types";
import type { TFiscalInboundManifestEventEnum, TFiscalInboundSituacaoEnum } from "@/schemas/enums";
import axios from "axios";
import createHttpError from "http-errors";
import { getSpedyCompanyClient } from "./client";
import type {
	TSpedyInboundInvoice,
	TSpedyInboundInvoicePage,
	TSpedyInboundSyncStatus,
	TSpedyManifestation,
	TSpedyManifestationStatus,
} from "./types";

const LIST_PAGE_SIZE = 100;
// Overlap na retomada por watermark: cobre atrasos de distribuicao da SEFAZ (o dedupe por chave absorve repetidos).
const WATERMARK_OVERLAP_MS = 24 * 60 * 60 * 1000;

const MANIFEST_EVENT_TO_SPEDY: Record<TFiscalInboundManifestEventEnum, TSpedyManifestationStatus> = {
	CIENCIA: "acknowledged",
	CONFIRMACAO: "confirmed",
	DESCONHECIMENTO: "unknown",
	NAO_REALIZADA: "notPerformed",
};

const SPEDY_MANIFESTATION_TO_EVENT: Partial<Record<TSpedyManifestationStatus, TFiscalInboundManifestEventEnum>> = {
	acknowledged: "CIENCIA",
	confirmed: "CONFIRMACAO",
	unknown: "DESCONHECIMENTO",
	notPerformed: "NAO_REALIZADA",
};

const SPEDY_STATUS_TO_SITUACAO: Record<string, TFiscalInboundSituacaoEnum> = {
	authorized: "AUTORIZADA",
	denied: "DENEGADA",
	canceled: "CANCELADA",
};

// Checkpoint opaco da Spedy: `cursor` continua uma paginacao em andamento; `watermark` marca a
// emissao mais recente ja coberta; `pendingWatermark` so promove a watermark quando a paginacao
// termina — assim um cursor morto no meio da varredura nao engole paginas antigas.
type TSpedyInboundCheckpoint = {
	watermark: string | null;
	cursor: string | null;
	pendingWatermark: string | null;
};

function parseCheckpoint(raw: string | null): TSpedyInboundCheckpoint {
	if (!raw) return { watermark: null, cursor: null, pendingWatermark: null };
	try {
		const parsed = JSON.parse(raw) as Partial<TSpedyInboundCheckpoint>;
		return {
			watermark: typeof parsed.watermark === "string" ? parsed.watermark : null,
			cursor: typeof parsed.cursor === "string" ? parsed.cursor : null,
			pendingWatermark: typeof parsed.pendingWatermark === "string" ? parsed.pendingWatermark : null,
		};
	} catch {
		return { watermark: null, cursor: null, pendingWatermark: null };
	}
}

function parseDate(value: string | null | undefined): Date | null {
	if (!value) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function mapManifestation(manifestation: TSpedyManifestation | null | undefined): TInboundDocumentSnapshot["manifestacao"] {
	if (!manifestation?.status || manifestation.status === "none") return null;
	return {
		evento: SPEDY_MANIFESTATION_TO_EVENT[manifestation.status] ?? null,
		protocolo: manifestation.protocol ?? null,
		data: parseDate(manifestation.date),
		justificativa: manifestation.justification ?? null,
		rejeitada: manifestation.status === "rejected",
	};
}

export function mapSpedyInboundInvoice(invoice: TSpedyInboundInvoice): TInboundDocumentSnapshot | null {
	if (!invoice.accessKey) return null;
	return {
		chaveAcesso: invoice.accessKey,
		provedorDocumentoId: invoice.id,
		completo: invoice.isComplete === true,
		situacao: invoice.status ? (SPEDY_STATUS_TO_SITUACAO[invoice.status] ?? null) : null,
		emitenteCpfCnpj: invoice.issuer?.federalTaxNumber ?? null,
		emitenteNome: invoice.issuer?.name ?? invoice.issuer?.legalName ?? null,
		valorTotal: invoice.amount ?? null,
		dataEmissao: parseDate(invoice.issuedOn),
		manifestacao: mapManifestation(invoice.manifestation),
		eventos: invoice.events ?? null,
		resumoPayload: invoice as unknown as Record<string, unknown>,
	};
}

function logSpedyError(scope: string, error: unknown) {
	if (axios.isAxiosError(error) && error.response?.data !== undefined) {
		console.error(`[SPEDY_INBOUND] ${scope}`, JSON.stringify(error.response.data, null, 2));
	} else {
		console.error(`[SPEDY_INBOUND] ${scope}`, error);
	}
}

function requireDocumentId(doc: TInboundProviderRef) {
	if (!doc.provedorDocumentoId) throw new createHttpError.BadRequest("Nota recebida sem ID na Spedy.");
	return doc.provedorDocumentoId;
}

export class SpedyInboundProvider implements IFiscalInboundProvider {
	async listDocuments({ checkpoint: rawCheckpoint }: { checkpoint: string | null }, organization: TFiscalOrganization): Promise<TInboundListResult> {
		const client = getSpedyCompanyClient(organization);
		const checkpoint = parseCheckpoint(rawCheckpoint);

		const params = new URLSearchParams();
		params.set("limit", String(LIST_PAGE_SIZE));
		if (checkpoint.cursor) {
			params.set("cursor", checkpoint.cursor);
		} else if (checkpoint.watermark) {
			const watermarkDate = parseDate(checkpoint.watermark);
			if (watermarkDate) params.set("initialDate", new Date(watermarkDate.getTime() - WATERMARK_OVERLAP_MS).toISOString());
		}

		let page: TSpedyInboundInvoicePage;
		try {
			const { data } = await client.get<TSpedyInboundInvoicePage>(`/v1/inbound-product-invoices?${params.toString()}`);
			page = data;
		} catch (error) {
			// Cursor invalidado pelo provedor ("nao interprete o cursor"): recomeca do watermark na
			// proxima rodada em vez de travar a organizacao para sempre.
			if (axios.isAxiosError(error) && error.response?.status === 400 && checkpoint.cursor) {
				logSpedyError("Cursor de paginacao invalidado; varredura recomecara do watermark.", error);
				return {
					documentos: [],
					checkpoint: JSON.stringify({ watermark: checkpoint.watermark, cursor: null, pendingWatermark: null } satisfies TSpedyInboundCheckpoint),
					hasMore: true,
				};
			}
			logSpedyError("Erro ao listar notas recebidas.", error);
			throw error;
		}

		const documentos = (page.items ?? []).map(mapSpedyInboundInvoice).filter((doc): doc is TInboundDocumentSnapshot => doc !== null);

		// Lista vem da mais recente para a mais antiga: a candidata a watermark e a maior emissao vista.
		let pendingWatermark = checkpoint.pendingWatermark ?? checkpoint.watermark;
		for (const doc of documentos) {
			const issuedOn = doc.dataEmissao?.toISOString();
			if (issuedOn && (!pendingWatermark || issuedOn > pendingWatermark)) pendingWatermark = issuedOn;
		}

		const hasMore = page.hasNext === true && !!page.nextCursor;
		const nextCheckpoint: TSpedyInboundCheckpoint = hasMore
			? { watermark: checkpoint.watermark, cursor: page.nextCursor ?? null, pendingWatermark }
			: { watermark: pendingWatermark, cursor: null, pendingWatermark: null };

		return { documentos, checkpoint: JSON.stringify(nextCheckpoint), hasMore };
	}

	async manifest(input: TInboundManifestInput, doc: TInboundProviderRef, organization: TFiscalOrganization): Promise<TInboundManifestResult> {
		const client = getSpedyCompanyClient(organization);
		const documentId = requireDocumentId(doc);
		try {
			const { data } = await client.post<TSpedyInboundInvoice>(`/v1/inbound-product-invoices/${documentId}/manifest`, {
				status: MANIFEST_EVENT_TO_SPEDY[input.evento],
				...(input.justificativa ? { justification: input.justificativa } : {}),
			});
			const readback = mapManifestation(data?.manifestation);
			return {
				registrado: true,
				// Sem readback no retorno (contrato defensivo): assume o evento enviado, sem protocolo.
				manifestacao: readback ?? { evento: input.evento, protocolo: null, data: null, justificativa: input.justificativa ?? null },
			};
		} catch (error) {
			logSpedyError(`Erro ao manifestar nota recebida ${doc.chaveAcesso}.`, error);
			throw error;
		}
	}

	async getDocument(doc: TInboundProviderRef, organization: TFiscalOrganization): Promise<TInboundDocumentSnapshot | null> {
		const client = getSpedyCompanyClient(organization);
		const documentId = requireDocumentId(doc);
		const { data } = await client.get<TSpedyInboundInvoice>(`/v1/inbound-product-invoices/${documentId}`);
		return mapSpedyInboundInvoice(data);
	}

	async downloadXml(doc: TInboundProviderRef, organization: TFiscalOrganization): Promise<ArrayBuffer | null> {
		const client = getSpedyCompanyClient(organization);
		const documentId = requireDocumentId(doc);
		const { data } = await client.get<ArrayBuffer>(`/v1/inbound-product-invoices/${documentId}/xml`, { responseType: "arraybuffer" });
		return data;
	}

	async downloadPdf(doc: TInboundProviderRef, organization: TFiscalOrganization): Promise<ArrayBuffer | null> {
		const client = getSpedyCompanyClient(organization);
		const documentId = requireDocumentId(doc);
		const { data } = await client.get<ArrayBuffer>(`/v1/inbound-product-invoices/${documentId}/pdf`, { responseType: "arraybuffer" });
		return data;
	}

	async requestSync(organization: TFiscalOrganization): Promise<{ accepted: boolean; retryAfterSeconds?: number | null }> {
		const client = getSpedyCompanyClient(organization);
		try {
			await client.post("/v1/inbound-product-invoices/sync", undefined, { spedySkip429Retry: true });
			return { accepted: true };
		} catch (error) {
			// Rate limit vem da SEFAZ, nao e falha nossa: devolve a janela para o core reagendar.
			if (axios.isAxiosError(error) && error.response?.status === 429) {
				const body = error.response.data as { retryAfterSeconds?: number | null } | undefined;
				const headerRetryAfter = Number(error.response.headers?.["retry-after"]);
				return { accepted: false, retryAfterSeconds: body?.retryAfterSeconds ?? (Number.isFinite(headerRetryAfter) ? headerRetryAfter : null) };
			}
			logSpedyError("Erro ao solicitar sincronizacao de notas recebidas.", error);
			throw error;
		}
	}

	async getSyncStatus(organization: TFiscalOrganization): Promise<TInboundSyncStatus | null> {
		const client = getSpedyCompanyClient(organization);
		const { data } = await client.get<TSpedyInboundSyncStatus>("/v1/inbound-product-invoices/sync-status");
		return {
			lastSyncAt: parseDate(data.lastSyncAt),
			nextAllowedSyncAt: parseDate(data.nextAllowedSyncAt),
			outcome: data.lastAttemptOutcome ?? null,
			mensagem: data.lastAttemptMessage ?? null,
		};
	}
}
