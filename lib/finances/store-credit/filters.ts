import z from "zod";
import { STORE_CREDIT_AGING_BUCKET_KEYS, type TStoreCreditAgingBucket } from "./aging";
import type { TStoreCreditSortDirection, TStoreCreditSortField, TStoreCreditStatus } from "./constants";

const VALID_STATUSES: TStoreCreditStatus[] = ["EM_ABERTO", "VENCIDO", "QUITADO"];
const VALID_SORT_FIELDS: TStoreCreditSortField[] = ["saldo", "previsao", "nome"];

/**
 * Filtros da lista de fiados como chegam na query string. Uma única definição para
 * `GET /api/finances/store-credit` e para a exportação: o recorte que a tela mostra é o que a
 * planilha leva.
 */
export const StoreCreditFiltersSchema = z.object({
	search: z.string({ invalid_type_error: "Tipo inválido para pesquisa." }).optional().nullable(),
	// Recorte por quando o fiado foi gerado (a venda), não por quando vence — é o eixo do
	// fechamento mensal de quem fecha a conta do mês independente do vencimento.
	originAfter: z
		.string({ invalid_type_error: "Tipo inválido para o período de origem." })
		.datetime({ message: "Tipo inválido para o período de origem." })
		.optional()
		.nullable()
		.transform((value) => (value ? new Date(value) : null)),
	originBefore: z
		.string({ invalid_type_error: "Tipo inválido para o período de origem." })
		.datetime({ message: "Tipo inválido para o período de origem." })
		.optional()
		.nullable()
		.transform((value) => (value ? new Date(value) : null)),
	statuses: z
		.string({ invalid_type_error: "Tipo inválido para status." })
		.optional()
		.nullable()
		.transform((value) =>
			value ? (value.split(",").filter((item) => VALID_STATUSES.includes(item as TStoreCreditStatus)) as TStoreCreditStatus[]) : [],
		),
	agingBuckets: z
		.string({ invalid_type_error: "Tipo inválido para faixa de atraso." })
		.optional()
		.nullable()
		.transform((value) =>
			value
				? (value.split(",").filter((item) => STORE_CREDIT_AGING_BUCKET_KEYS.includes(item as TStoreCreditAgingBucket)) as TStoreCreditAgingBucket[])
				: [],
		),
	sortField: z
		.string({ invalid_type_error: "Tipo inválido para ordenação." })
		.optional()
		.nullable()
		.transform((value) => (value && VALID_SORT_FIELDS.includes(value as TStoreCreditSortField) ? (value as TStoreCreditSortField) : "saldo")),
	sortDirection: z
		.string({ invalid_type_error: "Tipo inválido para direção da ordenação." })
		.optional()
		.nullable()
		.transform((value) => (value === "asc" ? "asc" : "desc") as TStoreCreditSortDirection),
});
export type TStoreCreditFilters = z.infer<typeof StoreCreditFiltersSchema>;
