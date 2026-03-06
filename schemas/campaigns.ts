import z from "zod";
import {
	AttributionModelEnum,
	CampaignTriggerTypeEnum,
	CashbackProgramAccumulationTypeEnum,
	InteractionsCronJobTimeBlocksEnum,
	RecurrenceFrequencyEnum,
	TimeDurationUnitsEnum,
} from "./enums";

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

	// Recurrent campaign schedule configuration (only used when gatilhoTipo === "RECORRENTE")
	recorrenciaTipo: RecurrenceFrequencyEnum.optional().nullable(),
	recorrenciaIntervalo: z
		.number({
			invalid_type_error: "Tipo não válido para o intervalo de recorrência.",
		})
		.int("Intervalo de recorrência deve ser um número inteiro.")
		.positive("Intervalo de recorrência deve ser positivo.")
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
	execucaoAgendadaBloco: InteractionsCronJobTimeBlocksEnum,

	// Configs for recurring interactions and intervals
	permitirRecorrencia: z
		.boolean({
			required_error: "Permitir recorrência não informado.",
			invalid_type_error: "Tipo não válido para permitir recorrência.",
		})
		.optional()
		.default(true),
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
	whatsappConexaoTelefoneId: z.string({
		required_error: "ID da conexão do WhatsApp não informado.",
		invalid_type_error: "Tipo não válido para o ID da conexão do WhatsApp.",
	}),
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
	campaign: CampaignSchema.omit({ dataInsercao: true, autorId: true }),
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
});
export type TCampaignState = z.infer<typeof CampaignStateSchema>;
