import {
	FiscalDocumentEnvironmentEnum,
	FiscalDocumentLifecycleStatusEnum,
	FiscalDocumentTypeEnum,
	type TFiscalDocumentEnvironmentEnum,
	type TFiscalDocumentLifecycleStatusEnum,
	type TFiscalDocumentTypeEnum,
} from "@/schemas/enums";
import { z } from "zod";

/**
 * Filtros da lista de documentos fiscais como chegam na query string (strings cruas, transformadas
 * aqui). Uma única definição para `GET /api/fiscal/documents` e para as duas exportações (planilha
 * e ZIP): o recorte que o usuário vê filtrado é o que ele exporta.
 */
export const FiscalDocumentsFiltersSchema = z.object({
	search: z
		.string({
			invalid_type_error: "Tipo inválido para busca.",
		})
		.optional()
		.nullable(),
	statusInterno: z
		.string({
			invalid_type_error: "Tipo inválido para status.",
		})
		.optional()
		.nullable()
		.transform((v) => (v ? v.split(",").filter(Boolean) : []))
		.pipe(z.array(FiscalDocumentLifecycleStatusEnum)),
	tipos: z
		.string({
			invalid_type_error: "Tipo inválido para tipos de documento.",
		})
		.optional()
		.nullable()
		.transform((v) => (v ? v.split(",").filter(Boolean) : []))
		.pipe(z.array(FiscalDocumentTypeEnum)),
	ambiente: FiscalDocumentEnvironmentEnum.optional().nullable(),
	// Período sobre a data de emissão; rascunhos e erros, que nunca foram emitidos, caem pela data
	// de criação (ver `fiscalDocumentReferenceDate`).
	periodAfter: z
		.string({
			invalid_type_error: "Tipo inválido para período.",
		})
		.optional()
		.nullable()
		.transform((v) => (v ? new Date(v) : null)),
	periodBefore: z
		.string({
			invalid_type_error: "Tipo inválido para período.",
		})
		.optional()
		.nullable()
		.transform((v) => (v ? new Date(v) : null)),
});
export type TFiscalDocumentsFilters = z.infer<typeof FiscalDocumentsFiltersSchema>;

/** Os filtros já transformados, do lado do cliente (datas como `Date`, listas como array). */
export type TFiscalDocumentsFiltersState = {
	search: string;
	statusInterno: TFiscalDocumentLifecycleStatusEnum[];
	tipos: TFiscalDocumentTypeEnum[];
	ambiente: TFiscalDocumentEnvironmentEnum | null;
	periodAfter: Date | null;
	periodBefore: Date | null;
};

export function buildFiscalDocumentsSearchParams(filters: Partial<TFiscalDocumentsFiltersState>) {
	const searchParams = new URLSearchParams();
	if (filters.search?.trim()) searchParams.set("search", filters.search.trim());
	if (filters.statusInterno && filters.statusInterno.length > 0) searchParams.set("statusInterno", filters.statusInterno.join(","));
	if (filters.tipos && filters.tipos.length > 0) searchParams.set("tipos", filters.tipos.join(","));
	if (filters.ambiente) searchParams.set("ambiente", filters.ambiente);
	if (filters.periodAfter) searchParams.set("periodAfter", filters.periodAfter.toISOString());
	if (filters.periodBefore) searchParams.set("periodBefore", filters.periodBefore.toISOString());
	return searchParams;
}

/** Status cujo documento tem XML/DANFE: só nota que passou pela SEFAZ gera arquivo. */
export const FISCAL_DOCUMENT_STATUSES_WITH_ASSETS = [
	"AUTORIZADO",
	"CANCELAMENTO_PENDENTE",
	"CANCELADO",
] as const satisfies readonly TFiscalDocumentLifecycleStatusEnum[];
