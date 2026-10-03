-- Filtro de período da lista de documentos fiscais e das exportações (planilha/ZIP).
-- Mesma expressão de `fiscalDocumentReferenceDate` em lib/fiscal/document-list-conditions.ts.
-- Sem CONCURRENTLY: o apply-sql-migration roda dentro de transação, e a tabela é pequena.
CREATE INDEX IF NOT EXISTS "idx_fiscal_outbound_documents_org_data_ref"
	ON "ampmais_fiscal_outbound_documents" ("organizacao_id", (coalesce("data_emissao", "data_insercao")));
