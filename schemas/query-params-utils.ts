import { z } from "zod";

export const PeriodQueryParamSchema = z.object({
	after: z
		.string({
			required_error: "Parâmetros de período não fornecidos ou inválidos.",
			invalid_type_error: "Parâmetros de período não fornecidos ou inválidos.",
		})
		.datetime({ message: "Tipo inválido para parâmetro de período." }),
	before: z
		.string({
			required_error: "Parâmetros de período não fornecidos ou inválidos.",
			invalid_type_error: "Parâmetros de período não fornecidos ou inválidos.",
		})
		.datetime({ message: "Tipo inválido para parâmetro de período." }),
});

export const SalesStatsGeneralQueryParamsSchema = z.object({
	period: PeriodQueryParamSchema,
	total: z.object({
		min: z.number({ invalid_type_error: "Tipo não válido para valor mínimo da venda." }).optional().nullable(),
		max: z.number({ invalid_type_error: "Tipo não válido para valor máximo da venda." }).optional().nullable(),
	}),
	integrationsIds: z.array(
		z.string({ required_error: "ID da integração não informado.", invalid_type_error: "Tipo não válido para o ID da integração." }),
	),
	sellersIds: z.array(z.string({ required_error: "ID do vendedor não informado.", invalid_type_error: "Tipo não válido para o ID do vendedor." })),
	clientRFMTitles: z.array(
		z.string({ required_error: "Título RFM do cliente não informado.", invalid_type_error: "Tipo não válido para o título RFM do cliente." }),
	),
	excludedSalesIds: z.array(z.string({ required_error: "ID da venda não informado.", invalid_type_error: "Tipo não válido para o ID da venda." })),
});
export type TSaleStatsGeneralQueryParams = z.infer<typeof SalesStatsGeneralQueryParamsSchema>;

export const SalesGraphFilterSchema = SalesStatsGeneralQueryParamsSchema.extend({
	group: z.enum(["DIA", "MÊS", "BIMESTRE", "TRIMESTRE", "SEMESTRE", "ANO"], {
		required_error: "Agrupamento de período não informado.",
		invalid_type_error: "Tipo não válido para o agrupamento de período.",
	}),
});
export type TSalesGraphFilters = z.infer<typeof SalesGraphFilterSchema>;

export const SalesGeneralStatsFiltersSchema = SalesStatsGeneralQueryParamsSchema;
export type TSalesGeneralStatsFilters = z.infer<typeof SalesGeneralStatsFiltersSchema>;

/**
 * Filtros da visão geral de vendas mais o recorte de comparação, já resolvido no navegador (a regra
 * escolhida pelo usuário, em hora local). Sem ele, a visão geral não calcula `anterior`.
 */
export const SalesOverallStatsFiltersSchema = SalesStatsGeneralQueryParamsSchema.extend({
	comparisonPeriod: PeriodQueryParamSchema.optional().nullable(),
});
export type TSalesOverallStatsFilters = z.infer<typeof SalesOverallStatsFiltersSchema>;
