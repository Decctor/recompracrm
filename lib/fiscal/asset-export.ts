import "server-only";
import { mapWithConcurrency } from "@/lib/async/map-with-concurrency";
import { getErrorMessage } from "@/lib/errors";
import { OPERATION_TIMEZONE } from "@/lib/operation-timezone";
import { db } from "@/services/drizzle";
import { fiscalOutboundDocuments } from "@/services/drizzle/schema";
import { and, count, desc, inArray } from "drizzle-orm";
import { FISCAL_DOCUMENT_STATUSES_WITH_ASSETS, type TFiscalDocumentsFilters } from "./document-filters";
import { buildFiscalDocumentsConditions, fiscalDocumentReferenceDate } from "./document-list-conditions";
import { buildFiscalAssetFileName, fetchAndStoreFiscalDocumentAsset } from "./documents";
import { loadFiscalOrganization } from "./settings";
import { createSignedFiscalAssetUrls, type TFiscalAssetType } from "./storage";

/**
 * Exportação de XML/DANFE em lote, página a página. O servidor não carrega bytes: devolve URLs
 * assinadas do storage privado e o navegador baixa direto de lá e monta o ZIP. O único trabalho
 * pesado aqui é materializar o arquivo que a autorização não chegou a guardar (documento antigo,
 * falha transitória do provedor) — e isso fica guardado, então a próxima exportação sai "quente".
 */

// Menor que a página da planilha: um documento sem arquivo custa uma chamada ao provedor.
const ASSET_EXPORT_PAGE_SIZE = 50;
const PROVIDER_FETCH_CONCURRENCY = 4;
// Cobre o laço de uma página no navegador com folga; o cliente repede a página se expirar.
export const ASSET_EXPORT_SIGNED_URL_TTL_SECONDS = 10 * 60;
// Teto para materializar arquivos dentro de uma requisição (maxDuration da rota é 60s). O que passar
// disso volta sem URL e com o motivo — o relatório do ZIP mostra, e o cron de backfill completa.
const PROVIDER_FETCH_BUDGET_MS = 40_000;

const yearMonthFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: OPERATION_TIMEZONE, year: "numeric", month: "2-digit" });

/** `NFCE/2026-09/{chave}.xml` — o mês é o de emissão, no fuso da operação. */
function buildZipPath(
	document: { id: string; tipo: string; serie: string | null; numero: string | null; chaveAcesso: string | null; dataEmissao: Date | null; dataInsercao: Date },
	asset: TFiscalAssetType,
) {
	const yearMonth = yearMonthFormatter.format(document.dataEmissao ?? document.dataInsercao);
	return `${document.tipo}/${yearMonth}/${buildFiscalAssetFileName(document, asset)}`;
}

/**
 * Restringe os status pedidos aos que têm arquivo. Sem filtro de status, vale o conjunto todo;
 * com filtro que não cruza (ex.: só "ERRO"), a exportação é vazia — e não "tudo".
 */
function resolveAssetStatuses(statusInterno: TFiscalDocumentsFilters["statusInterno"] | undefined) {
	const withAssets: readonly string[] = FISCAL_DOCUMENT_STATUSES_WITH_ASSETS;
	if (!statusInterno || statusInterno.length === 0) return [...FISCAL_DOCUMENT_STATUSES_WITH_ASSETS];
	return statusInterno.filter((status): status is (typeof FISCAL_DOCUMENT_STATUSES_WITH_ASSETS)[number] => withAssets.includes(status));
}

export async function listFiscalDocumentAssetsForExport({
	organizationId,
	filters,
	asset,
	page,
}: {
	organizationId: string;
	filters: TFiscalDocumentsFilters;
	asset: TFiscalAssetType;
	page: number;
}) {
	const statuses = resolveAssetStatuses(filters.statusInterno);
	if (statuses.length === 0) return { arquivos: [], documentsMatched: page === 1 ? 0 : null, totalPages: page === 1 ? 0 : null };

	const where = and(...buildFiscalDocumentsConditions({ organizationId, filters: { ...filters, statusInterno: statuses } }));
	const [documentsPage, countResult] = await Promise.all([
		db
			.select({ id: fiscalOutboundDocuments.id })
			.from(fiscalOutboundDocuments)
			.where(where)
			.orderBy(desc(fiscalDocumentReferenceDate), desc(fiscalOutboundDocuments.id))
			.offset(ASSET_EXPORT_PAGE_SIZE * (page - 1))
			.limit(ASSET_EXPORT_PAGE_SIZE),
		page === 1 ? db.select({ count: count() }).from(fiscalOutboundDocuments).where(where) : Promise.resolve(null),
	]);
	const documentIds = documentsPage.map((document) => document.id);
	const documentsHydrated =
		documentIds.length === 0 ? [] : await db.query.fiscalOutboundDocuments.findMany({ where: inArray(fiscalOutboundDocuments.id, documentIds) });
	const documentsById = new Map(documentsHydrated.map((document) => [document.id, document]));
	// Preserva a ordem da página: `IN (...)` não garante ordem.
	const documents = documentIds.flatMap((id) => documentsById.get(id) ?? []);

	// 1. Materializa o que falta, com teto de concorrência (provedor) e de tempo (função).
	const storagePathByDocumentId = new Map<string, string>();
	const failureByDocumentId = new Map<string, string>();
	const missing = documents.filter((document) => !(asset === "xml" ? document.xmlStoragePath : document.pdfStoragePath));
	for (const document of documents) {
		const path = asset === "xml" ? document.xmlStoragePath : document.pdfStoragePath;
		if (path) storagePathByDocumentId.set(document.id, path);
	}
	if (missing.length > 0) {
		const organization = await loadFiscalOrganization(organizationId);
		const deadline = Date.now() + PROVIDER_FETCH_BUDGET_MS;
		await mapWithConcurrency(missing, PROVIDER_FETCH_CONCURRENCY, async (document) => {
			if (!organization) {
				failureByDocumentId.set(document.id, "Organização sem configuração fiscal.");
				return;
			}
			if (Date.now() > deadline) {
				failureByDocumentId.set(document.id, "Tempo esgotado ao buscar o arquivo no provedor. Exporte novamente em alguns minutos.");
				return;
			}
			try {
				const { storedPath } = await fetchAndStoreFiscalDocumentAsset({ document, organization, asset });
				storagePathByDocumentId.set(document.id, storedPath);
			} catch (error) {
				failureByDocumentId.set(document.id, `Arquivo indisponível no provedor: ${getErrorMessage(error)}`);
			}
		});
	}

	// 2. Assina tudo de uma vez — uma chamada ao storage por página, não uma por arquivo.
	const signed = await createSignedFiscalAssetUrls({
		storagePaths: [...new Set(storagePathByDocumentId.values())],
		expiresInSeconds: ASSET_EXPORT_SIGNED_URL_TTL_SECONDS,
	});
	const signedUrlByPath = new Map(signed.flatMap((entry) => (entry.path && entry.signedUrl ? [[entry.path, entry.signedUrl] as const] : [])));

	const arquivos = documents.map((document) => {
		const storagePath = storagePathByDocumentId.get(document.id);
		const url = storagePath ? (signedUrlByPath.get(storagePath) ?? null) : null;
		return {
			documentoId: document.id,
			tipo: document.tipo,
			serie: document.serie,
			numero: document.numero,
			chaveAcesso: document.chaveAcesso,
			statusInterno: document.statusInterno,
			dataEmissao: document.dataEmissao,
			caminhoNoZip: buildZipPath(document, asset),
			url,
			motivo: url ? null : (failureByDocumentId.get(document.id) ?? "Não foi possível assinar o arquivo no armazenamento."),
		};
	});

	const documentsMatched = countResult?.[0]?.count ?? null;
	return {
		arquivos,
		documentsMatched,
		totalPages: documentsMatched === null ? null : Math.ceil(documentsMatched / ASSET_EXPORT_PAGE_SIZE),
	};
}
