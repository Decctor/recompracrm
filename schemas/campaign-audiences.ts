import { z } from "zod";

// ============================================================================
// FILTER TREE (audience definition)
// ============================================================================

export const FilterConditionSchema: z.ZodType = z.object({
	tipo: z.string({
		required_error: "Tipo do filtro não informado.",
		invalid_type_error: "Tipo não válido para o tipo do filtro.",
	}),
	configuracao: z.record(z.unknown(), {
		required_error: "Configuração do filtro não informada.",
		invalid_type_error: "Tipo não válido para a configuração do filtro.",
	}),
});
export type TFilterCondition = z.infer<typeof FilterConditionSchema>;

export const FilterTreeSchema: z.ZodType = z.lazy(() =>
	z.object({
		logica: z.enum(["AND", "OR"], {
			required_error: "Lógica do filtro não informada.",
			invalid_type_error: "Tipo não válido para a lógica do filtro. Use 'AND' ou 'OR'.",
		}),
		condicoes: z.array(FilterConditionSchema),
		grupos: z.array(FilterTreeSchema).optional(),
	}),
);
export type TFilterTree = {
	logica: "AND" | "OR";
	condicoes: TFilterCondition[];
	grupos?: TFilterTree[];
};

// ============================================================================
// CAMPAIGN AUDIENCE
// ============================================================================

export const CampaignAudienceSchema = z.object({
	titulo: z.string({
		required_error: "Título do público não informado.",
		invalid_type_error: "Tipo não válido para o título do público.",
	}),
	descricao: z
		.string({
			invalid_type_error: "Tipo não válido para a descrição do público.",
		})
		.optional()
		.nullable(),
	filtros: FilterTreeSchema,
	autorId: z.string({
		required_error: "ID do autor não informado.",
		invalid_type_error: "Tipo não válido para o ID do autor.",
	}),
	dataInsercao: z
		.string({
			invalid_type_error: "Tipo não válido para a data de inserção.",
		})
		.datetime()
		.transform((val) => new Date(val)),
});
export type TCampaignAudience = z.infer<typeof CampaignAudienceSchema>;

export const CampaignAudienceStateSchema = z.object({
	audience: CampaignAudienceSchema.omit({ dataInsercao: true, autorId: true }),
});
export type TCampaignAudienceState = z.infer<typeof CampaignAudienceStateSchema>;
