import "server-only";
import { mapWithConcurrency } from "@/lib/async/map-with-concurrency";
import { getErrorMessage } from "@/lib/errors";
import { db } from "@/services/drizzle";
import { fiscalOutboundDocuments, organizations } from "@/services/drizzle/schema";
import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { FISCAL_DOCUMENT_STATUSES_WITH_ASSETS } from "./document-filters";
import { fetchAndStoreFiscalDocumentAsset } from "./documents";
import { loadFiscalOrganization } from "./settings";
import type { TFiscalAssetType } from "./storage";

/**
 * Backfill de XML/DANFE. A autorização já guarda os dois arquivos (`persistAuthorizedAssets`);
 * isto cobre o que escapou (provedor fora no momento, documento anterior ao armazenamento), para
 * que a exportação em ZIP nunca dependa do provedor na hora.
 *
 * Diferente da autorização, não dispara a impressão automática da DANFE: imprimir uma nota antiga
 * porque o arquivo dela chegou agora seria uma surpresa no balcão.
 */

const BACKFILL_BATCH_SIZE = 50;
const PROVIDER_FETCH_CONCURRENCY = 4;
// Dá tempo de a autorização terminar de guardar os arquivos antes de o cron disputar com ela.
const AUTHORIZATION_GRACE_MINUTES = 15;

export async function backfillMissingFiscalAssets({ limit = BACKFILL_BATCH_SIZE }: { limit?: number } = {}) {
	const graceCutoff = new Date(Date.now() - AUTHORIZATION_GRACE_MINUTES * 60 * 1000);
	// Só documentos do provedor atual da organização: o de um provedor anterior não está mais lá
	// para ser baixado, e repedir a cada hora só gastaria chamadas.
	const candidates = await db
		.select({ id: fiscalOutboundDocuments.id, organizacaoId: fiscalOutboundDocuments.organizacaoId })
		.from(fiscalOutboundDocuments)
		.innerJoin(organizations, eq(organizations.id, fiscalOutboundDocuments.organizacaoId))
		.where(
			and(
				inArray(fiscalOutboundDocuments.statusInterno, [...FISCAL_DOCUMENT_STATUSES_WITH_ASSETS]),
				or(isNull(fiscalOutboundDocuments.xmlStoragePath), isNull(fiscalOutboundDocuments.pdfStoragePath)),
				sql`${fiscalOutboundDocuments.provedor} = ${organizations.fiscalProvedor}::text`,
				lte(fiscalOutboundDocuments.dataInsercao, graceCutoff),
			),
		)
		// Aleatório: um documento que o provedor nunca devolve não trava a fila dos demais.
		.orderBy(sql`random()`)
		.limit(limit);
	if (candidates.length === 0) return { candidatos: 0, arquivosGuardados: 0, falhas: [] as { documentoId: string; motivo: string }[] };

	const documents = await db.query.fiscalOutboundDocuments.findMany({
		where: inArray(
			fiscalOutboundDocuments.id,
			candidates.map((candidate) => candidate.id),
		),
	});
	const organizationIds = [...new Set(documents.map((document) => document.organizacaoId))];
	const organizationsById = new Map(
		(await Promise.all(organizationIds.map(async (id) => [id, await loadFiscalOrganization(id)] as const))).flatMap(([id, organization]) =>
			organization ? [[id, organization] as const] : [],
		),
	);

	let arquivosGuardados = 0;
	const falhas: { documentoId: string; motivo: string }[] = [];
	await mapWithConcurrency(documents, PROVIDER_FETCH_CONCURRENCY, async (document) => {
		const organization = organizationsById.get(document.organizacaoId);
		if (!organization) return;
		const missingAssets: TFiscalAssetType[] = [...(document.xmlStoragePath ? [] : ["xml" as const]), ...(document.pdfStoragePath ? [] : ["pdf" as const])];
		for (const asset of missingAssets) {
			try {
				await fetchAndStoreFiscalDocumentAsset({ document, organization, asset });
				arquivosGuardados += 1;
			} catch (error) {
				falhas.push({ documentoId: document.id, motivo: `${asset.toUpperCase()}: ${getErrorMessage(error)}` });
			}
		}
	});

	return { candidatos: documents.length, arquivosGuardados, falhas };
}
