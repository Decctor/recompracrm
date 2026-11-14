import { z } from "zod";
import { ProductionOriginEnum, ProductionStatusEnum, TimeDurationUnitsEnum } from "./enums";

const PRODUCTION_DURATION_UNITS = ["MINUTOS", "HORAS", "DIAS"] as const;

export const ProductionDurationUnitEnum = TimeDurationUnitsEnum.refine(
	(value) => PRODUCTION_DURATION_UNITS.includes(value as (typeof PRODUCTION_DURATION_UNITS)[number]),
	{
		message: "Unidade de tempo não permitida para produção.",
	},
);
export type TProductionDurationUnitEnum = z.infer<typeof ProductionDurationUnitEnum>;

export const ProductionRecipeBaseSchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para ID da organização.",
	}),
	titulo: z
		.string({
			required_error: "Título da receita não informado.",
			invalid_type_error: "Tipo não válido para título da receita.",
		})
		.min(1, { message: "Título da receita não informado." }),
	descricao: z
		.string({
			invalid_type_error: "Tipo não válido para descrição da receita.",
		})
		.optional()
		.nullable()
		.transform((value) => {
			const trimmed = value?.trim();
			return trimmed ? trimmed : null;
		}),
	modoPreparo: z
		.string({
			invalid_type_error: "Tipo não válido para modo de preparo da receita.",
		})
		.optional()
		.nullable()
		.transform((value) => {
			const trimmed = value?.trim();
			return trimmed ? trimmed : null;
		}),
	previsaoTempoMedida: ProductionDurationUnitEnum.optional().nullable(),
	previsaoTempoValor: z
		.number({
			invalid_type_error: "Tipo não válido para previsão de tempo da receita.",
		})
		.nonnegative({ message: "Previsão de tempo da receita não pode ser negativa." })
		.optional()
		.nullable(),
	imagemCapaUrl: z
		.string({
			invalid_type_error: "Tipo não válido para imagem de capa da receita.",
		})
		.optional()
		.nullable(),
	capaIcone: z
		.string({
			invalid_type_error: "Tipo não válido para ícone de capa da receita.",
		})
		.optional()
		.nullable(),
	capaCor: z
		.number({
			invalid_type_error: "Tipo não válido para cor de capa da receita.",
		})
		.int({ message: "Cor de capa da receita deve ser um número inteiro." })
		.min(0, { message: "Cor de capa da receita inválida." })
		.max(359, { message: "Cor de capa da receita inválida." })
		.optional()
		.nullable(),
	ativo: z
		.boolean({
			required_error: "Status da receita não informado.",
			invalid_type_error: "Tipo não válido para status da receita.",
		})
		.default(true),
	dataInsercao: z
		.string({
			required_error: "Data de inserção não informada.",
			invalid_type_error: "Tipo não válido para data de inserção.",
		})
		.datetime({ message: "Tipo não válido para data de inserção." })
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
});
export const ProductionRecipeSchema = ProductionRecipeBaseSchema.superRefine((value, ctx) => {
	if (value.previsaoTempoValor != null && !value.previsaoTempoMedida) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["previsaoTempoMedida"],
			message: "Medida da previsão de tempo não informada.",
		});
	}
	if (value.previsaoTempoMedida && value.previsaoTempoValor == null) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["previsaoTempoValor"],
			message: "Valor da previsão de tempo não informado.",
		});
	}
});
export type TProductionRecipe = z.infer<typeof ProductionRecipeSchema>;

export const ProductionRecipeInputSchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para ID da organização.",
	}),
	receitaId: z.string({
		required_error: "ID da receita não informado.",
		invalid_type_error: "Tipo não válido para ID da receita.",
	}),
	produtoId: z.string({
		required_error: "ID do produto não informado.",
		invalid_type_error: "Tipo não válido para ID do produto.",
	}),
	produtoVarianteId: z
		.string({
			invalid_type_error: "Tipo não válido para ID da variante.",
		})
		.optional()
		.nullable(),
	quantidade: z
		.number({
			required_error: "Quantidade do insumo não informada.",
			invalid_type_error: "Tipo não válido para quantidade do insumo.",
		})
		.positive({ message: "Quantidade do insumo deve ser maior que zero." }),
});
export type TProductionRecipeInput = z.infer<typeof ProductionRecipeInputSchema>;

export const ProductionRecipeOutputBaseSchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para ID da organização.",
	}),
	receitaId: z.string({
		required_error: "ID da receita não informado.",
		invalid_type_error: "Tipo não válido para ID da receita.",
	}),
	produtoId: z.string({
		required_error: "ID do produto não informado.",
		invalid_type_error: "Tipo não válido para ID do produto.",
	}),
	produtoVarianteId: z
		.string({
			invalid_type_error: "Tipo não válido para ID da variante.",
		})
		.optional()
		.nullable(),
	quantidade: z
		.number({
			required_error: "Quantidade da saída não informada.",
			invalid_type_error: "Tipo não válido para quantidade da saída.",
		})
		.positive({ message: "Quantidade da saída deve ser maior que zero." }),
	prazoValidadeMedida: ProductionDurationUnitEnum.optional().nullable(),
	prazoValidadeValor: z
		.number({
			invalid_type_error: "Tipo não válido para prazo de validade.",
		})
		.nonnegative({ message: "Prazo de validade não pode ser negativo." })
		.optional()
		.nullable(),
});
export const ProductionRecipeOutputSchema = ProductionRecipeOutputBaseSchema.superRefine((value, ctx) => {
	if (value.prazoValidadeValor != null && !value.prazoValidadeMedida) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["prazoValidadeMedida"],
			message: "Medida do prazo de validade não informada.",
		});
	}
	if (value.prazoValidadeMedida && value.prazoValidadeValor == null) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["prazoValidadeValor"],
			message: "Valor do prazo de validade não informado.",
		});
	}
});
export type TProductionRecipeOutput = z.infer<typeof ProductionRecipeOutputSchema>;

const OptionalDateStringSchema = z
	.string({
		invalid_type_error: "Tipo não válido para data.",
	})
	.datetime({ message: "Tipo não válido para data." })
	.optional()
	.nullable()
	.transform((value) => (value ? new Date(value) : null));

export const ProductionBaseSchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para ID da organização.",
	}),
	receitaId: z
		.string({
			invalid_type_error: "Tipo não válido para ID da receita.",
		})
		.optional()
		.nullable(),
	titulo: z
		.string({
			required_error: "Título da produção não informado.",
			invalid_type_error: "Tipo não válido para título da produção.",
		})
		.min(1, { message: "Título da produção não informado." }),
	origem: ProductionOriginEnum.default("MANUAL"),
	status: ProductionStatusEnum.default("RASCUNHO"),
	vendaId: z
		.string({
			invalid_type_error: "Tipo não válido para ID da venda.",
		})
		.optional()
		.nullable(),
	vendaItemId: z
		.string({
			invalid_type_error: "Tipo não válido para ID do item da venda.",
		})
		.optional()
		.nullable(),
	dataInicio: OptionalDateStringSchema,
	dataPrevisaoConclusao: OptionalDateStringSchema,
	dataConclusao: OptionalDateStringSchema,
	observacoes: z
		.string({
			invalid_type_error: "Tipo não válido para observações da produção.",
		})
		.optional()
		.nullable()
		.transform((value) => {
			const trimmed = value?.trim();
			return trimmed ? trimmed : null;
		}),
	// Valoração congelada na conclusão. Preenchida pelo servidor, nunca pelo cliente — as rotas de
	// criação/atualização removem estes campos via `.omit()`.
	custoTotal: z
		.number({
			invalid_type_error: "Tipo não válido para custo total da produção.",
		})
		.optional()
		.nullable(),
	retornoEsperado: z
		.number({
			invalid_type_error: "Tipo não válido para retorno esperado da produção.",
		})
		.optional()
		.nullable(),
	dataSnapshotValores: OptionalDateStringSchema,
	autorId: z
		.string({
			invalid_type_error: "Tipo não válido para autor da produção.",
		})
		.optional()
		.nullable(),
	dataInsercao: z
		.string({
			required_error: "Data de inserção não informada.",
			invalid_type_error: "Tipo não válido para data de inserção.",
		})
		.datetime({ message: "Tipo não válido para data de inserção." })
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
});
export type TProduction = z.infer<typeof ProductionBaseSchema>;

export const ProductionInputSchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para ID da organização.",
	}),
	producaoId: z.string({
		required_error: "ID da produção não informado.",
		invalid_type_error: "Tipo não válido para ID da produção.",
	}),
	produtoId: z.string({
		required_error: "ID do produto não informado.",
		invalid_type_error: "Tipo não válido para ID do produto.",
	}),
	produtoVarianteId: z
		.string({
			invalid_type_error: "Tipo não válido para ID da variante.",
		})
		.optional()
		.nullable(),
	quantidadePrevista: z
		.number({
			invalid_type_error: "Tipo não válido para quantidade prevista do insumo.",
		})
		.nonnegative({ message: "Quantidade prevista do insumo não pode ser negativa." })
		.optional()
		.nullable(),
	quantidadeReal: z
		.number({
			invalid_type_error: "Tipo não válido para quantidade real do insumo.",
		})
		.nonnegative({ message: "Quantidade real do insumo não pode ser negativa." })
		.optional()
		.nullable(),
	reincorporado: z
		.boolean({
			invalid_type_error: "Tipo não válido para saldo reincorporado.",
		})
		// Ausente = falso (default da coluna); opcional para não obrigar todo formulário a enviá-lo.
		.optional(),
	loteId: z
		.string({
			invalid_type_error: "Tipo não válido para ID do lote do insumo.",
		})
		.optional()
		.nullable(),
	/** Snapshot preenchido pelo servidor na conclusão — removido via `.omit()` nas rotas de escrita. */
	custoUnitario: z
		.number({
			invalid_type_error: "Tipo não válido para custo unitário do insumo.",
		})
		.optional()
		.nullable(),
});
export type TProductionInput = z.infer<typeof ProductionInputSchema>;

export const ProductionOutputBaseSchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para ID da organização.",
	}),
	producaoId: z.string({
		required_error: "ID da produção não informado.",
		invalid_type_error: "Tipo não válido para ID da produção.",
	}),
	produtoId: z.string({
		required_error: "ID do produto não informado.",
		invalid_type_error: "Tipo não válido para ID do produto.",
	}),
	produtoVarianteId: z
		.string({
			invalid_type_error: "Tipo não válido para ID da variante.",
		})
		.optional()
		.nullable(),
	quantidadePrevista: z
		.number({
			invalid_type_error: "Tipo não válido para quantidade prevista da saída.",
		})
		.nonnegative({ message: "Quantidade prevista da saída não pode ser negativa." })
		.optional()
		.nullable(),
	quantidadeReal: z
		.number({
			invalid_type_error: "Tipo não válido para quantidade real da saída.",
		})
		.nonnegative({ message: "Quantidade real da saída não pode ser negativa." })
		.optional()
		.nullable(),
	prazoValidadeMedida: ProductionDurationUnitEnum.optional().nullable(),
	prazoValidadeValor: z
		.number({
			invalid_type_error: "Tipo não válido para prazo de validade.",
		})
		.nonnegative({ message: "Prazo de validade não pode ser negativo." })
		.optional()
		.nullable(),
	dataValidade: OptionalDateStringSchema,
	/** Snapshot preenchido pelo servidor na conclusão — removido via `.omit()` nas rotas de escrita. */
	valorUnitarioVenda: z
		.number({
			invalid_type_error: "Tipo não válido para valor unitário de venda da saída.",
		})
		.optional()
		.nullable(),
});
export const ProductionOutputSchema = ProductionOutputBaseSchema.superRefine((value, ctx) => {
	if (value.prazoValidadeValor != null && !value.prazoValidadeMedida) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["prazoValidadeMedida"],
			message: "Medida do prazo de validade não informada.",
		});
	}
	if (value.prazoValidadeMedida && value.prazoValidadeValor == null) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["prazoValidadeValor"],
			message: "Valor do prazo de validade não informado.",
		});
	}
});
export type TProductionOutput = z.infer<typeof ProductionOutputSchema>;
