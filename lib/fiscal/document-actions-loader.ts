import { db } from "@/services/drizzle";
import { fiscalDocumentEvents, fiscalOutboundDocuments } from "@/services/drizzle/schema";
import { and, count, eq, inArray } from "drizzle-orm";
import { resolveFiscalDocumentActions, type TFiscalDocumentAction, type TFiscalDocumentForActions } from "./document-actions";
import { resolveFiscalDocumentProblems, type TFiscalProblem } from "./problems";

/**
 * Carrega o contexto que a matriz de acoes nao consegue deduzir do documento sozinho (cartas de
 * correcao ja emitidas, devolucao existente, perfil de devolucao da organizacao) e devolve
 * `acoes` + `problemas` prontos para a API. Consultas em lote: uma pagina inteira custa tres queries.
 */

type DecoratableDocument = TFiscalDocumentForActions & {
	id: string;
	organizacaoId: string;
	problemas?: string | null;
	codigoRejeicao?: string | null;
	mensagens?: unknown[] | null;
};

export type TFiscalDocumentDecoration = {
	revisaoCreditoIcms?: boolean;
	acoes: TFiscalDocumentAction[];
	problemas: TFiscalProblem[];
};

async function hasActiveReturnProfile(organizationId: string) {
	const profile = await db.query.fiscalOperationProfiles.findFirst({
		where: (fields, operators) =>
			operators.and(
				operators.eq(fields.organizacaoId, organizationId),
				operators.eq(fields.tipoDocumento, "NFE"),
				operators.eq(fields.finalidade, "DEVOLUCAO"),
				operators.eq(fields.ativo, true),
			),
		columns: { id: true },
	});
	return !!profile;
}

export async function decorateFiscalDocuments<T extends DecoratableDocument>({
	documents,
	organizationId,
	provider,
	resaleCreditEnabled = false,
	now = new Date(),
}: {
	documents: T[];
	organizationId: string;
	provider: string | null | undefined;
	resaleCreditEnabled?: boolean;
	now?: Date;
}): Promise<Array<T & TFiscalDocumentDecoration>> {
	if (documents.length === 0) return [];

	const authorizedNfeIds = documents.filter((doc) => doc.tipo === "NFE" && doc.statusInterno === "AUTORIZADO").map((doc) => doc.id);
	const authorizedIds = documents.filter((doc) => doc.statusInterno === "AUTORIZADO").map((doc) => doc.id);

	const [correctionRows, returnRows, hasReturnProfile] = await Promise.all([
		authorizedNfeIds.length > 0
			? db
					.select({ documentoFiscalId: fiscalDocumentEvents.documentoFiscalId, total: count() })
					.from(fiscalDocumentEvents)
					.where(and(inArray(fiscalDocumentEvents.documentoFiscalId, authorizedNfeIds), eq(fiscalDocumentEvents.tipo, "CARTA_CORRECAO")))
					.groupBy(fiscalDocumentEvents.documentoFiscalId)
			: Promise.resolve([]),
		authorizedIds.length > 0
			? db
					.select({ documentoOrigemId: fiscalOutboundDocuments.documentoOrigemId })
					.from(fiscalOutboundDocuments)
					.where(
						and(
							eq(fiscalOutboundDocuments.organizacaoId, organizationId),
							inArray(fiscalOutboundDocuments.documentoOrigemId, authorizedIds),
							eq(fiscalOutboundDocuments.statusInterno, "AUTORIZADO"),
						),
					)
			: Promise.resolve([]),
		authorizedIds.length > 0 ? hasActiveReturnProfile(organizationId) : Promise.resolve(null),
	]);

	const correctionsById = new Map(correctionRows.map((row) => [row.documentoFiscalId, row.total]));
	const returnedIds = new Set(returnRows.map((row) => row.documentoOrigemId).filter((id): id is string => !!id));

	return documents.map((document) => ({
		...document,
		revisaoCreditoIcms: resaleCreditEnabled && document.tipo === "NFE" && !("documentoOrigemId" in document && document.documentoOrigemId),
		acoes: resolveFiscalDocumentActions({
			document,
			now,
			context: {
				provider,
				correctionLettersIssued: correctionsById.get(document.id) ?? 0,
				hasAuthorizedReturn: returnedIds.has(document.id),
				hasReturnProfile,
			},
		}),
		problemas: resolveFiscalDocumentProblems(document),
	}));
}

export async function loadFiscalDocumentActions(document: DecoratableDocument, provider: string | null | undefined, now = new Date()) {
	const [decorated] = await decorateFiscalDocuments({ documents: [document], organizationId: document.organizacaoId, provider, now });
	return decorated.acoes;
}
