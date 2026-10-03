import "server-only";
import { fiscalOutboundDocuments } from "@/services/drizzle/schema";
import { eq, inArray, type SQL, sql } from "drizzle-orm";
import type { TFiscalDocumentsFilters } from "./document-filters";

/**
 * Data de referência do documento: a de emissão; rascunhos e erros, que nunca foram emitidos, caem
 * pela data de criação. É a mesma expressão do índice `idx_fiscal_outbound_documents_org_data_ref`,
 * então mude os dois juntos — com outra expressão o filtro de período volta a varrer a organização.
 */
export const fiscalDocumentReferenceDate = sql`coalesce(${fiscalOutboundDocuments.dataEmissao}, ${fiscalOutboundDocuments.dataInsercao})`;

/**
 * Condições da lista de documentos fiscais. Compartilhada pela listagem e pelas exportações, para
 * que os três recortes devolvam o mesmo conjunto.
 */
export function buildFiscalDocumentsConditions({
	organizationId,
	filters,
}: {
	organizationId: string;
	filters: Partial<TFiscalDocumentsFilters>;
}) {
	const conditions: SQL[] = [eq(fiscalOutboundDocuments.organizacaoId, organizationId)];
	const searchLike = filters.search?.trim() ? `%${filters.search.trim()}%` : null;
	if (searchLike) {
		conditions.push(sql`(${fiscalOutboundDocuments.referencia} ilike ${searchLike} or ${fiscalOutboundDocuments.chaveAcesso} ilike ${searchLike})`);
	}
	if (filters.statusInterno && filters.statusInterno.length > 0) conditions.push(inArray(fiscalOutboundDocuments.statusInterno, filters.statusInterno));
	if (filters.tipos && filters.tipos.length > 0) conditions.push(inArray(fiscalOutboundDocuments.tipo, filters.tipos));
	if (filters.ambiente) conditions.push(eq(fiscalOutboundDocuments.ambiente, filters.ambiente));
	// SQL cru não passa pelo conversor da coluna: a data vai como ISO.
	if (filters.periodAfter) conditions.push(sql`${fiscalDocumentReferenceDate} >= ${filters.periodAfter.toISOString()}`);
	if (filters.periodBefore) conditions.push(sql`${fiscalDocumentReferenceDate} <= ${filters.periodBefore.toISOString()}`);
	return conditions;
}
