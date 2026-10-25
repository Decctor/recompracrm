/**
 * Caminho LEGADO do documento importado, anterior ao catálogo `files` (ADR-0002, Fase 1). Documentos
 * novos são resolvidos por `arquivoId`; este caminho só serve snapshots ainda não cobertos por
 * scripts/backfill-purchase-fiscal-files.ts, e some quando o backfill terminar.
 *
 * O caminho do documento importado é derivado, nunca transportado. O cliente escolhe a referência
 * (um UUID opaco), mas o escopo de organização vem sempre da sessão — assim uma referência forjada
 * só alcança objetos da própria organização, e nenhum payload consegue apontar para outro bucket ou
 * para outro tenant. Consulte docs/security/file-storage-classification.md.
 */
export function buildPurchaseImportedDocumentPath({ organizationId, referencia }: { organizationId: string; referencia: string }) {
	if (!/^[0-9a-fA-F-]{36}$/.test(referencia)) throw new Error("Referência de documento importado inválida.");
	return `organizations/${organizationId}/purchase-imports/${referencia}`;
}
