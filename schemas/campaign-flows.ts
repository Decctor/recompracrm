import { z } from "zod";
import {
	AttributionModelEnum,
	CampaignFlowExecutionStatusEnum,
	CampaignFlowExecutionStepStatusEnum,
	CampaignFlowExecutionTypeEnum,
	CampaignFlowNodeTypeEnum,
	CampaignFlowStatusEnum,
	CampaignFlowTypeEnum,
	InteractionsCronJobTimeBlocksEnum,
	RecurrenceFrequencyEnum,
} from "./enums";

// ============================================================================
// CAMPAIGN FLOW
// ============================================================================

export const CampaignFlowSchema = z.object({
	titulo: z.string({
		required_error: "Título do fluxo não informado.",
		invalid_type_error: "Tipo não válido para o título do fluxo.",
	}),
	descricao: z
		.string({
			invalid_type_error: "Tipo não válido para a descrição do fluxo.",
		})
		.optional()
		.nullable(),
	status: CampaignFlowStatusEnum,
	tipo: CampaignFlowTypeEnum,

	// Recurrence config
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
	recorrenciaDiasSemana: z.array(z.number().int().min(0).max(6)).optional().nullable(),
	recorrenciaDiasMes: z.array(z.number().int().min(1).max(31)).optional().nullable(),
	recorrenciaBlocoHorario: InteractionsCronJobTimeBlocksEnum.optional().nullable(),

	// One-time config
	unicaDataExecucao: z
		.string({
			invalid_type_error: "Tipo não válido para a data de execução única.",
		})
		.datetime({ message: "Data de execução única inválida." })
		.transform((val) => new Date(val))
		.optional()
		.nullable(),
	unicaExecutada: z.boolean().optional().default(false),

	// Attribution
	atribuicaoModelo: AttributionModelEnum.default("LAST_TOUCH"),
	atribuicaoJanelaDias: z
		.number({
			invalid_type_error: "Tipo não válido para a janela de atribuição.",
		})
		.int()
		.positive()
		.default(14),

	// Audience
	publicoId: z
		.string({
			invalid_type_error: "Tipo não válido para o ID do público.",
		})
		.optional()
		.nullable(),

	// Meta
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
export type TCampaignFlow = z.infer<typeof CampaignFlowSchema>;

// ============================================================================
// CAMPAIGN FLOW NODE
// ============================================================================

export const CampaignFlowNodeSchema = z.object({
	campanhaId: z.string({
		required_error: "ID da campanha não informado.",
		invalid_type_error: "Tipo não válido para o ID da campanha.",
	}),
	tipo: CampaignFlowNodeTypeEnum,
	subtipo: z.string({
		required_error: "Subtipo do nó não informado.",
		invalid_type_error: "Tipo não válido para o subtipo do nó.",
	}),
	rotulo: z
		.string({
			invalid_type_error: "Tipo não válido para o rótulo do nó.",
		})
		.optional()
		.nullable(),
	configuracao: z.record(z.unknown(), {
		required_error: "Configuração do nó não informada.",
		invalid_type_error: "Tipo não válido para a configuração do nó.",
	}),
	posicaoX: z
		.number({
			invalid_type_error: "Tipo não válido para a posição X.",
		})
		.optional()
		.nullable(),
	posicaoY: z
		.number({
			invalid_type_error: "Tipo não válido para a posição Y.",
		})
		.optional()
		.nullable(),
	dataInsercao: z
		.string({
			invalid_type_error: "Tipo não válido para a data de inserção.",
		})
		.datetime()
		.transform((val) => new Date(val)),
});
export type TCampaignFlowNode = z.infer<typeof CampaignFlowNodeSchema>;

// ============================================================================
// CAMPAIGN FLOW EDGE
// ============================================================================

export const CampaignFlowEdgeSchema = z.object({
	campanhaId: z.string({
		required_error: "ID da campanha não informado.",
		invalid_type_error: "Tipo não válido para o ID da campanha.",
	}),
	noOrigemId: z.string({
		required_error: "ID do nó de origem não informado.",
		invalid_type_error: "Tipo não válido para o ID do nó de origem.",
	}),
	noDestinoId: z.string({
		required_error: "ID do nó de destino não informado.",
		invalid_type_error: "Tipo não válido para o ID do nó de destino.",
	}),
	condicaoLabel: z
		.string({
			invalid_type_error: "Tipo não válido para o label da condição.",
		})
		.optional()
		.nullable(),
	ordem: z
		.number({
			invalid_type_error: "Tipo não válido para a ordem.",
		})
		.int()
		.default(0),
	dataInsercao: z
		.string({
			invalid_type_error: "Tipo não válido para a data de inserção.",
		})
		.datetime()
		.transform((val) => new Date(val)),
});
export type TCampaignFlowEdge = z.infer<typeof CampaignFlowEdgeSchema>;

// ============================================================================
// CAMPAIGN FLOW EXECUTION
// ============================================================================

export const CampaignFlowExecutionSchema = z.object({
	campanhaId: z.string({
		required_error: "ID da campanha não informado.",
		invalid_type_error: "Tipo não válido para o ID da campanha.",
	}),
	organizacaoId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para o ID da organização.",
	}),
	tipo: CampaignFlowExecutionTypeEnum,
	clienteId: z.string().optional().nullable(),
	eventoTipo: z.string().optional().nullable(),
	eventoMetadados: z.record(z.unknown()).optional().nullable(),
	loteTotalClientes: z.number().int().optional().nullable(),
	loteClientesProcessados: z.number().int().default(0),
	status: CampaignFlowExecutionStatusEnum.default("PENDENTE"),
	dataInicio: z
		.string()
		.datetime()
		.transform((val) => new Date(val))
		.optional()
		.nullable(),
	dataConclusao: z
		.string()
		.datetime()
		.transform((val) => new Date(val))
		.optional()
		.nullable(),
	erro: z.string().optional().nullable(),
	vercelWorkflowRunId: z.string().optional().nullable(),
	dataInsercao: z
		.string({
			invalid_type_error: "Tipo não válido para a data de inserção.",
		})
		.datetime()
		.transform((val) => new Date(val)),
});
export type TCampaignFlowExecution = z.infer<typeof CampaignFlowExecutionSchema>;

// ============================================================================
// CAMPAIGN FLOW EXECUTION STEP
// ============================================================================

export const CampaignFlowExecutionStepSchema = z.object({
	execucaoId: z.string({
		required_error: "ID da execução não informado.",
		invalid_type_error: "Tipo não válido para o ID da execução.",
	}),
	noId: z.string({
		required_error: "ID do nó não informado.",
		invalid_type_error: "Tipo não válido para o ID do nó.",
	}),
	clienteId: z.string({
		required_error: "ID do cliente não informado.",
		invalid_type_error: "Tipo não válido para o ID do cliente.",
	}),
	status: CampaignFlowExecutionStepStatusEnum.default("PENDENTE"),
	resultado: z.record(z.unknown()).optional().nullable(),
	erro: z.string().optional().nullable(),
	delayAte: z
		.string()
		.datetime()
		.transform((val) => new Date(val))
		.optional()
		.nullable(),
	dataInicio: z
		.string()
		.datetime()
		.transform((val) => new Date(val))
		.optional()
		.nullable(),
	dataConclusao: z
		.string()
		.datetime()
		.transform((val) => new Date(val))
		.optional()
		.nullable(),
	dataInsercao: z
		.string({
			invalid_type_error: "Tipo não válido para a data de inserção.",
		})
		.datetime()
		.transform((val) => new Date(val)),
});
export type TCampaignFlowExecutionStep = z.infer<typeof CampaignFlowExecutionStepSchema>;

// ============================================================================
// STATE SCHEMAS (for API input / modal state)
// ============================================================================

export const CampaignFlowStateSchema = z.object({
	campaignFlow: CampaignFlowSchema.omit({ dataInsercao: true, autorId: true }),
	nos: z.array(
		CampaignFlowNodeSchema.omit({ campanhaId: true, dataInsercao: true }).extend({
			id: z.string().optional(),
			deletar: z.boolean().optional(),
		}),
	),
	arestas: z.array(
		CampaignFlowEdgeSchema.omit({ campanhaId: true, dataInsercao: true }).extend({
			id: z.string().optional(),
			deletar: z.boolean().optional(),
		}),
	),
});
export type TCampaignFlowState = z.infer<typeof CampaignFlowStateSchema>;
