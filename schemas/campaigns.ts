import z from "zod";
import {
	AttributionModelEnum,
	CampaignExecutionDelayDirectionEnum,
	CampaignTriggerTypeEnum,
	CashbackProgramAccumulationTypeEnum,
	InteractionsCronJobTimeBlocksEnum,
	RecurrenceFrequencyEnum,
	TimeDurationUnitsEnum,
} from "./enums";

export const CampaignFilterLogicOperatorEnum = z.enum(["AND", "OR", "NOT"], {
	required_error: "Operador lógico do filtro não informado.",
	invalid_type_error: "Tipo não válido para o operador lógico do filtro.",
});
export type TCampaignFilterLogicOperatorEnum = z.infer<typeof CampaignFilterLogicOperatorEnum>;

export const CampaignProductClientReferenceWindowEnum = z.enum(["GERAL", "30_DIAS", "90_DIAS"], {
	required_error: "Janela do filtro não informada.",
	invalid_type_error: "Tipo não válido para a janela do filtro.",
});
export type TCampaignProductClientReferenceWindowEnum = z.infer<typeof CampaignProductClientReferenceWindowEnum>;

export const CampaignLocationFilterConfigSchema = z
	.object({
		estados: z
			.array(
				z
					.string({
						required_error: "Estado do filtro não informado.",
						invalid_type_error: "Tipo não válido para o estado do filtro.",
					})
					.trim()
					.min(1, "Estado do filtro não informado."),
				{
					required_error: "Estados do filtro não informados.",
					invalid_type_error: "Tipo não válido para os estados do filtro.",
				},
			)
			.optional(),
		cidades: z
			.array(
				z
					.string({
						required_error: "Cidade do filtro não informada.",
						invalid_type_error: "Tipo não válido para a cidade do filtro.",
					})
					.trim()
					.min(1, "Cidade do filtro não informada."),
				{
					required_error: "Cidades do filtro não informadas.",
					invalid_type_error: "Tipo não válido para as cidades do filtro.",
				},
			)
			.optional(),
		bairros: z
			.array(
				z
					.string({
						required_error: "Bairro do filtro não informado.",
						invalid_type_error: "Tipo não válido para o bairro do filtro.",
					})
					.trim()
					.min(1, "Bairro do filtro não informado."),
				{
					required_error: "Bairros do filtro não informados.",
					invalid_type_error: "Tipo não válido para os bairros do filtro.",
				},
			)
			.optional(),
	})
	.superRefine((value, ctx) => {
		const hasAtLeastOneLevel = [value.estados, value.cidades, value.bairros].some((items) => Array.isArray(items) && items.length > 0);

		if (!hasAtLeastOneLevel) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Informe ao menos um nível de localização para o filtro.",
			});
		}
	});
export type TCampaignLocationFilterConfig = z.infer<typeof CampaignLocationFilterConfigSchema>;

export const CampaignTopBuyersProductFilterConfigSchema = z.object({
	produtoId: z.string({
		required_error: "Produto do filtro não informado.",
		invalid_type_error: "Tipo não válido para o produto do filtro.",
	}),
	janela: CampaignProductClientReferenceWindowEnum,
	top: z
		.number({
			required_error: "Top do filtro não informado.",
			invalid_type_error: "Tipo não válido para o top do filtro.",
		})
		.int("Top do filtro deve ser um número inteiro.")
		.positive("Top do filtro deve ser maior que zero."),
});
export type TCampaignTopBuyersProductFilterConfig = z.infer<typeof CampaignTopBuyersProductFilterConfigSchema>;

export const CampaignFilterConditionSchema = z.discriminatedUnion("tipo", [
	z.object({
		id: z
			.string({
				required_error: "ID da condição do filtro não informado.",
				invalid_type_error: "Tipo não válido para o ID da condição do filtro.",
			})
			.optional(),
		tipo: z.literal("LOCALIZAÇÃO"),
		configuracao: CampaignLocationFilterConfigSchema,
	}),
	z.object({
		id: z
			.string({
				required_error: "ID da condição do filtro não informado.",
				invalid_type_error: "Tipo não válido para o ID da condição do filtro.",
			})
			.optional(),
		tipo: z.literal("TOP_COMPRADORES_PRODUTO"),
		configuracao: CampaignTopBuyersProductFilterConfigSchema,
	}),
]);
export type TCampaignFilterCondition = z.infer<typeof CampaignFilterConditionSchema>;

export const CampaignFilterNodeSchema: z.ZodType<any> = z.lazy(() =>
	z.union([
		z
			.object({
				id: z
					.string({
						required_error: "ID do grupo de filtro não informado.",
						invalid_type_error: "Tipo não válido para o ID do grupo de filtro.",
					})
					.optional(),
				tipo: z.literal("GRUPO"),
				operador: CampaignFilterLogicOperatorEnum,
				itens: z.array(CampaignFilterNodeSchema, {
					required_error: "Itens do grupo de filtro não informados.",
					invalid_type_error: "Tipo não válido para os itens do grupo de filtro.",
				}),
			})
			.superRefine((value, ctx) => {
				if (value.operador === "NOT" && value.itens.length !== 1) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: "Grupos com operador NOT devem possuir exatamente um item.",
						path: ["itens"],
					});
				}

				if ((value.operador === "AND" || value.operador === "OR") && value.itens.length === 0) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: "Grupos com operador AND ou OR devem possuir ao menos um item.",
						path: ["itens"],
					});
				}
			}),
		z.object({
			tipo: z.literal("CONDICAO"),
			condicao: CampaignFilterConditionSchema,
		}),
	]),
);
export type TCampaignFilterNode = z.infer<typeof CampaignFilterNodeSchema>;

// Explicit recursive TS types. `CampaignFilterNodeSchema` is a `z.lazy` so its inferred
// type collapses to `any`; these mirror the validated shape so state helpers and UI code
// get real type safety while Zod still owns runtime validation.
export type TCampaignFilterTreeNode =
	| {
			id?: string;
			tipo: "GRUPO";
			operador: TCampaignFilterLogicOperatorEnum;
			itens: TCampaignFilterTreeNode[];
	  }
	| {
			tipo: "CONDICAO";
			condicao: TCampaignFilterCondition;
	  };

export const CampaignFiltersSchema = z
	.object({
		id: z
			.string({
				required_error: "ID do grupo raiz do filtro não informado.",
				invalid_type_error: "Tipo não válido para o ID do grupo raiz do filtro.",
			})
			.optional(),
		tipo: z.literal("GRUPO"),
		operador: CampaignFilterLogicOperatorEnum,
		itens: z.array(CampaignFilterNodeSchema, {
			required_error: "Itens do filtro não informados.",
			invalid_type_error: "Tipo não válido para os itens do filtro.",
		}),
	})
	.superRefine((value, ctx) => {
		if (value.operador === "NOT" && value.itens.length !== 1) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "O grupo raiz com operador NOT deve possuir exatamente um item.",
				path: ["itens"],
			});
		}

		if ((value.operador === "AND" || value.operador === "OR") && value.itens.length === 0) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "O grupo raiz com operador AND ou OR deve possuir ao menos um item.",
				path: ["itens"],
			});
		}
	});
export type TCampaignFilters = z.infer<typeof CampaignFiltersSchema>;
export type TCampaignFiltersTree = {
	id?: string;
	tipo: "GRUPO";
	operador: TCampaignFilterLogicOperatorEnum;
	itens: TCampaignFilterTreeNode[];
};

// Item da lista curada de produtos promovidos (gatilho "PROMOCAO-PRODUTOS").
// Só configuração: o preço promocional é a fonte da verdade do desconto — o percentual existe
// apenas como auxiliar de UI e não é persistido.
export const CampaignPromotionProductSchema = z.object({
	produtoId: z.string({
		required_error: "Produto da promoção não informado.",
		invalid_type_error: "Tipo não válido para o produto da promoção.",
	}),
	// null/ausente = sem sobrescrita; o preço efetivo passa a ser o preço de venda do produto.
	precoPromocional: z
		.number({
			invalid_type_error: "Tipo não válido para o preço promocional.",
		})
		.positive("O preço promocional deve ser maior que zero.")
		.optional()
		.nullable(),
});
export type TCampaignPromotionProduct = z.infer<typeof CampaignPromotionProductSchema>;

export const CAMPAIGN_PROMOTION_PRODUCTS_LIMIT = 10;

export const CampaignSchema = z.object({
	ativo: z
		.boolean({
			required_error: "Ativo da campanha não informado.",
			invalid_type_error: "Tipo não válido para o ativo da campanha.",
		})
		.default(true),
	titulo: z.string({
		required_error: "Título da campanha não informado.",
		invalid_type_error: "Tipo não válido para o título da campanha.",
	}),
	descricao: z
		.string({
			required_error: "Descrição da campanha não informada.",
			invalid_type_error: "Tipo não válido para a descrição da campanha.",
		})
		.optional()
		.nullable(),
	gatilhoTipo: CampaignTriggerTypeEnum,

	// Specific for "NOVA-COMPRA"
	gatilhoNovaCompraValorMinimo: z
		.number({
			required_error: "Valor mínimo de nova compra não informado.",
			invalid_type_error: "Tipo não válido para o valor mínimo de nova compra.",
		})
		.optional()
		.nullable(),
	// Specific for "PERMANÊNCIA-SEGMENTAÇÃO"
	gatilhoTempoPermanenciaMedida: TimeDurationUnitsEnum.optional().nullable(),
	gatilhoTempoPermanenciaValor: z
		.number({
			required_error: "Valor da permanência não informado.",
			invalid_type_error: "Tipo não válido para o valor da permanência.",
		})
		.optional()
		.nullable(),
	// Specific for "CASHBACK-ACUMULADO"
	gatilhoNovoCashbackAcumuladoValorMinimo: z
		.number({
			required_error: "Valor mínimo de novo cashback acumulado não informado.",
			invalid_type_error: "Tipo não válido para o valor mínimo de novo cashback acumulado.",
		})
		.optional()
		.nullable(),
	gatilhoTotalCashbackAcumuladoValorMinimo: z
		.number({
			required_error: "Valor mínimo de total cashback acumulado não informado.",
			invalid_type_error: "Tipo não válido para o valor mínimo de total cashback acumulado.",
		})
		.optional()
		.nullable(),
	// Specific for "CASHBACK-EXPIRANDO"
	gatilhoCashbackExpirandoAntecedenciaValor: z
		.number({
			required_error: "Valor de antecedência do cashback expirando não informado.",
			invalid_type_error: "Tipo não válido para o valor de antecedência do cashback expirando.",
		})
		.optional()
		.nullable(),
	gatilhoCashbackExpirandoAntecedenciaMedida: TimeDurationUnitsEnum.optional().nullable(),
	gatilhoCashbackExpirandoValorMinimo: z
		.number({
			required_error: "Valor mínimo de cashback expirando não informado.",
			invalid_type_error: "Tipo não válido para o valor mínimo de cashback expirando.",
		})
		.min(0, "Valor mínimo de cashback expirando não pode ser negativo.")
		.optional()
		.nullable(),
	// Specific for "QUANTIDADE-TOTAL-COMPRAS"
	gatilhoQuantidadeTotalCompras: z
		.number({
			required_error: "Quantidade total de compras não informada.",
			invalid_type_error: "Tipo não válido para a quantidade total de compras.",
		})
		.int("Quantidade total de compras deve ser um número inteiro.")
		.positive("Quantidade total de compras deve ser positiva.")
		.optional()
		.nullable(),
	// Specific for "VALOR-TOTAL-COMPRAS"
	gatilhoValorTotalCompras: z
		.number({
			required_error: "Valor total de compras não informado.",
			invalid_type_error: "Tipo não válido para o valor total de compras.",
		})
		.positive("Valor total de compras deve ser positivo.")
		.optional()
		.nullable(),
	// Specific for "USO-UNICO"
	gatilhoUsoUnicoDataReferencia: z
		.string({
			required_error: "Data de referência do uso único não informada.",
			invalid_type_error: "Tipo não válido para a data de referência do uso único.",
		})
		.regex(/^\d{4}-\d{2}-\d{2}$/, "Data de referência do uso único inválida.")
		.optional()
		.nullable(),
	// Specific for "PROMOCAO-PRODUTOS"
	gatilhoPromocaoDataReferencia: z
		.string({
			required_error: "Data de referência da promoção não informada.",
			invalid_type_error: "Tipo não válido para a data de referência da promoção.",
		})
		.regex(/^\d{4}-\d{2}-\d{2}$/, "Data de referência da promoção inválida.")
		.optional()
		.nullable(),
	gatilhoPromocaoProdutos: z
		.array(CampaignPromotionProductSchema, {
			invalid_type_error: "Tipo não válido para os produtos da promoção.",
		})
		.optional()
		.nullable(),

	// Recurrent campaign schedule configuration (only used when gatilhoTipo === "RECORRENTE")
	recorrenciaTipo: RecurrenceFrequencyEnum.optional().nullable(),
	recorrenciaIntervalo: z
		.number({
			invalid_type_error: "Tipo não válido para o intervalo de recorrência.",
		})
		.int("Intervalo de recorrência deve ser um número inteiro.")
		.gte(0, "Intervalo de recorrência deve ser maior que zero.")
		.optional()
		.nullable()
		.default(1),
	recorrenciaDiasSemana: z.string().optional().nullable(), // JSON array string of day numbers [0-6]
	recorrenciaDiasMes: z.string().optional().nullable(), // JSON array string of day numbers [1-31]

	execucaoAgendadaMedida: TimeDurationUnitsEnum,
	execucaoAgendadaValor: z.number({
		required_error: "Valor da execução agendada não informado.",
		invalid_type_error: "Tipo não válido para o valor da execução agendada.",
	}),
	execucaoAgendadaDirecao: CampaignExecutionDelayDirectionEnum.default("DEPOIS"),
	execucaoAgendadaBloco: InteractionsCronJobTimeBlocksEnum,

	// Configs for recurring interactions and intervals
	permitirRecorrencia: z
		.boolean({
			required_error: "Permitir recorrência não informado.",
			invalid_type_error: "Tipo não válido para permitir recorrência.",
		})
		.optional()
		.default(true),
	limiteEnviosSemanais: z
		.number({
			invalid_type_error: "Tipo não válido para o limite semanal de envios da campanha.",
		})
		.int("O limite semanal de envios da campanha deve ser um número inteiro.")
		.positive("O limite semanal de envios da campanha deve ser maior que zero.")
		.optional()
		.nullable(),
	frequenciaIntervaloValor: z
		.number({
			required_error: "Valor da frequência de intervalo não informado.",
			invalid_type_error: "Tipo não válido para o valor da frequência de intervalo.",
		})
		.nullable()
		.optional()
		.default(0),
	frequenciaIntervaloMedida: TimeDurationUnitsEnum.optional().nullable().default("DIAS"),
	// Whatsapp specific
	whatsappConexaoTelefoneId: z
		.string({
			required_error: "ID da conexão do WhatsApp não informado.",
			invalid_type_error: "Tipo não válido para o ID da conexão do WhatsApp.",
		})
		.optional()
		.nullable(),
	whatsappTemplateId: z.string({
		required_error: "ID do template do WhatsApp não informado.",
		invalid_type_error: "Tipo não válido para o ID do template do WhatsApp.",
	}),
	autorId: z.string({
		required_error: "ID do autor da campanha não informado.",
		invalid_type_error: "Tipo não válido para o ID do autor da campanha.",
	}),

	// Conversion Attribution settings
	atribuicaoModelo: AttributionModelEnum,
	atribuicaoJanelaDias: z.number({
		required_error: "Janela de atribuição não informada.",
		invalid_type_error: "Tipo não válido para a janela de atribuição.",
	}),

	// Cashback generation configuration
	cashbackGeracaoAtivo: z
		.boolean({
			required_error: "Ativo da geração de cashback não informado.",
			invalid_type_error: "Tipo não válido para o ativo da geração de cashback.",
		})
		.default(false),
	cashbackGeracaoTipo: CashbackProgramAccumulationTypeEnum.optional().nullable(),
	cashbackGeracaoValor: z
		.number({
			required_error: "Valor da geração de cashback não informado.",
			invalid_type_error: "Tipo não válido para o valor da geração de cashback.",
		})
		.optional()
		.nullable(),
	cashbackGeracaoExpiracaoMedida: TimeDurationUnitsEnum.optional().nullable(),
	cashbackGeracaoExpiracaoValor: z
		.number({
			required_error: "Valor da expiração da geração de cashback não informado.",
			invalid_type_error: "Tipo não válido para o valor da expiração da geração de cashback.",
		})
		.optional()
		.nullable(),

	// Coupon generation configuration
	cupomGeracaoAtivo: z
		.boolean({
			required_error: "Ativo da geração de cupom não informado.",
			invalid_type_error: "Tipo não válido para o ativo da geração de cupom.",
		})
		.default(false),
	cupomGeracaoCupomId: z
		.string({
			required_error: "ID do cupom da geração de cupom não informado.",
			invalid_type_error: "Tipo não válido para o ID do cupom da geração de cupom.",
		})
		.optional()
		.nullable(),
	cupomGeracaoExpiracaoMedida: TimeDurationUnitsEnum.optional().nullable(),
	cupomGeracaoExpiracaoValor: z
		.number({
			required_error: "Valor da expiração da geração de cupom não informado.",
			invalid_type_error: "Tipo não válido para o valor da expiração da geração de cupom.",
		})
		.optional()
		.nullable(),
	filtros: CampaignFiltersSchema.optional().nullable(),

	dataInsercao: z
		.string({
			required_error: "Data de inserção da campanha não informada.",
			invalid_type_error: "Tipo não válido para a data de inserção da campanha.",
		})
		.datetime({ message: "Tipo não válido para a data de inserção da campanha." })
		.transform((val) => new Date(val)),
});

export const CampaignSegmentationSchema = z.object({
	campanhaId: z.string({
		required_error: "ID da campanha não informado.",
		invalid_type_error: "Tipo não válido para o ID da campanha.",
	}),
	segmentacao: z.string({
		required_error: "Segmentação da campanha não informada.",
		invalid_type_error: "Tipo não válido para a segmentação da campanha.",
	}),
});

export const CampaignStateSchema = z.object({
	campaign: CampaignSchema.omit({ dataInsercao: true, autorId: true, filtros: true }),
	segmentations: z.array(
		CampaignSegmentationSchema.omit({ campanhaId: true }).extend({
			id: z
				.string({
					required_error: "ID da segmentação da campanha não informado.",
					invalid_type_error: "Tipo não válido para o ID da segmentação da campanha.",
				})
				.optional(),
			deletar: z
				.boolean({
					required_error: "Deletar segmentação da campanha não informado.",
					invalid_type_error: "Tipo não válido para deletar segmentação da campanha.",
				})
				.optional(),
		}),
	),
	filtros: CampaignFiltersSchema.optional().nullable(),
});
export type TCampaignState = Omit<z.infer<typeof CampaignStateSchema>, "filtros"> & {
	// Override with the explicit recursive tree type so state helpers stay type-safe.
	// The Zod schema still validates runtime shape identically.
	filtros: TCampaignFiltersTree;
};
