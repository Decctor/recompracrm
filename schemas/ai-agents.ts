import z from "zod";
import {
	AiAgentAttachmentTypeEnum,
	AiAgentRunTriggerEnum,
	AiAgentRunStatusEnum,
	AiAgentScopeTypeEnum,
	AiAgentStatusEnum,
	AiAgentToolCallStatusEnum,
	AiAgentToolNameEnum,
} from "./enums";

/**
 * Configuração do agente de IA de atendimento — um por organização.
 *
 * Os três blocos de configuração (`modeloConfig`, `capacidades`, e o snapshot gravado em cada
 * execução) vivem em JSONB. Por isso **todo campo tem `.default()`**, inclusive os objetos:
 * uma configuração persistida antes de um campo existir continua parseando via
 * `parseJsonbWithFallback` (`lib/ai/shared/json.ts`), em vez de derrubar a execução.
 */

// ============================================================================
// MODELO
// ============================================================================

export const DEFAULT_AI_AGENT_MODEL = "openai/gpt-5";

export const AiAgentModelConfigSchema = z
	.object({
		modelo: z.string({ invalid_type_error: "Tipo não válido para o modelo do agente." }).default(DEFAULT_AI_AGENT_MODEL),
		temperatura: z
			.number({ invalid_type_error: "Tipo não válido para a temperatura do agente." })
			.min(0, "A temperatura mínima é 0.")
			.max(2, "A temperatura máxima é 2.")
			.optional(),
		maxTokensSaida: z
			.number({ invalid_type_error: "Tipo não válido para o limite de tokens de saída." })
			.int("O limite de tokens de saída deve ser inteiro.")
			.positive("O limite de tokens de saída deve ser positivo.")
			.optional(),
		topP: z
			.number({ invalid_type_error: "Tipo não válido para o top P do agente." })
			.min(0, "O top P mínimo é 0.")
			.max(1, "O top P máximo é 1.")
			.optional(),
	})
	.default({});
export type TAiAgentModelConfig = z.infer<typeof AiAgentModelConfigSchema>;

// ============================================================================
// CAPACIDADES (camada de permissão)
// ============================================================================
//
// `capacidades` é o que o runtime consulta para montar o toolset E o que cada execução de
// ferramenta revalida (`assertToolEnabled`). Desabilitar uma ferramenta aqui a remove do
// prompt e bloqueia sua execução, mesmo que o modelo tente chamá-la.

export const AiAgentToolConfigSchema = z.object({
	habilitada: z.boolean({ invalid_type_error: "Tipo não válido para a habilitação da ferramenta." }).default(false),
});
export type TAiAgentToolConfig = z.infer<typeof AiAgentToolConfigSchema>;

export const AiAgentToolsConfigSchema = z
	.object({
		"clientes.consultar_compras": AiAgentToolConfigSchema.optional(),
		"produtos.consultar": AiAgentToolConfigSchema.optional(),
		"orcamentos.criar": AiAgentToolConfigSchema.optional(),
		"cashback.consultar": AiAgentToolConfigSchema.optional(),
		"cupons.consultar": AiAgentToolConfigSchema.optional(),
		"atendimento.transferir_para_humano": AiAgentToolConfigSchema.optional(),
	})
	.default({});
export type TAiAgentToolsConfig = z.infer<typeof AiAgentToolsConfigSchema>;

export const AiAgentPricingConfigSchema = z
	.object({
		visiveis: z.boolean({ invalid_type_error: "Tipo não válido para a visibilidade dos preços." }).default(true),
	})
	.default({});
export type TAiAgentPricingConfig = z.infer<typeof AiAgentPricingConfigSchema>;

export const AiAgentQuotesConfigSchema = z
	.object({
		bloqueio: z.enum(["TRANSFERIR", "INFORMAR"]).default("TRANSFERIR"),
	})
	.default({});
export type TAiAgentQuotesConfig = z.infer<typeof AiAgentQuotesConfigSchema>;

/**
 * Política de estoque do agente, em dois eixos deliberadamente ortogonais: dá para não contar o
 * número ao cliente e ainda assim barrar o orçamento de 500 unidades de um item com 3 em estoque.
 *
 * `visibilidade` tem três níveis (e não o booleano dos preços) porque o espaço de decisão é maior:
 * muita empresa aceita dizer "está em falta" mas não quer expor "temos 3" — isso revela porte de
 * estoque e desatualiza muito mais rápido que preço.
 *
 * Os defaults preservam o comportamento anterior byte por byte: nenhum campo de estoque no payload
 * e nenhuma checagem no orçamento. `excedente` **não pode** ter `AVISAR` como default, porque a
 * combinação com `visibilidade: "OCULTO"` é barrada no `superRefine` e um default inválido
 * derrubaria `parseJsonbWithFallback`, cujo fallback é justamente `schema.parse(undefined)`.
 */
export const AiAgentStockConfigSchema = z
	.object({
		visibilidade: z.enum(["OCULTO", "DISPONIBILIDADE", "QUANTIDADE"]).default("OCULTO"),
		excedente: z.enum(["BLOQUEAR", "AVISAR", "PERMITIR"]).default("PERMITIR"),
	})
	.default({});
export type TAiAgentStockConfig = z.infer<typeof AiAgentStockConfigSchema>;

export const AiAgentCommercialConfigSchema = z
	.object({
		precos: AiAgentPricingConfigSchema,
		orcamentos: AiAgentQuotesConfigSchema,
		estoque: AiAgentStockConfigSchema,
	})
	.default({});
export type TAiAgentCommercialConfig = z.infer<typeof AiAgentCommercialConfigSchema>;

export const AiAgentCapabilitiesSchema = z
	.object({
		version: z.literal(1).default(1),
		ferramentas: AiAgentToolsConfigSchema,
		comercial: AiAgentCommercialConfigSchema,
		limites: z
			.object({
				// Vira `stopWhen: stepCountIs(...)` no loop do agente.
				maxChamadasFerramentasPorRun: z
					.number({ invalid_type_error: "Tipo não válido para o limite de chamadas de ferramentas." })
					.int("O limite de chamadas de ferramentas deve ser inteiro.")
					.min(1, "O limite mínimo de chamadas de ferramentas é 1.")
					.max(30, "O limite máximo de chamadas de ferramentas é 30.")
					.default(15),
				// Freio de custo por organização, checado em `prepareAgentExecution`.
				maxRunsDiarios: z
					.number({ invalid_type_error: "Tipo não válido para o limite diário de execuções." })
					.int("O limite diário de execuções deve ser inteiro.")
					.min(1, "O limite diário mínimo de execuções é 1.")
					.default(500),
			})
			.default({}),
		atendimento: z
			.object({
				// Debounce antes de responder: agrupa mensagens enviadas em sequência pelo cliente.
				atrasoRespostaMs: z
					.number({ invalid_type_error: "Tipo não válido para o atraso de resposta." })
					.int("O atraso de resposta deve ser inteiro.")
					.min(0, "O atraso de resposta mínimo é 0ms.")
					.max(60000, "O atraso de resposta máximo é 60000ms.")
					.default(5000),
			})
			.default({}),
	})
	.superRefine((capabilities, ctx) => {
		if (capabilities.ferramentas["orcamentos.criar"]?.habilitada && !capabilities.comercial.precos.visiveis) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Preços precisam estar visíveis para habilitar a criação de orçamentos.",
				path: ["comercial", "precos", "visiveis"],
			});
		}
		if (
			capabilities.ferramentas["orcamentos.criar"]?.habilitada &&
			capabilities.comercial.orcamentos.bloqueio === "TRANSFERIR" &&
			!capabilities.ferramentas["atendimento.transferir_para_humano"]?.habilitada
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "A transferência para atendente precisa estar habilitada para usar essa política de bloqueio.",
				path: ["comercial", "orcamentos", "bloqueio"],
			});
		}
		// Avisar sobre um saldo que o agente não pode mencionar produz resposta vaga ("acho que não
		// tem tudo"): ou ele explica o que falta, ou bloqueia, ou permite em silêncio.
		if (capabilities.comercial.estoque.excedente === "AVISAR" && capabilities.comercial.estoque.visibilidade === "OCULTO") {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Avisar sobre o estoque exige que a disponibilidade esteja visível para o agente.",
				path: ["comercial", "estoque", "excedente"],
			});
		}
	})
	.default({});
export type TAiAgentCapabilities = z.infer<typeof AiAgentCapabilitiesSchema>;

// ============================================================================
// ESCOPO (quem o agente atende)
// ============================================================================
//
// Config viva de implantação, e **não** uma capacidade: mora em coluna própria justamente para
// ficar fora de `AiAgentConfigSnapshotSchema`. Uma lista de clientes copiada para dentro de cada
// run inflaria `ai_agent_runs.config_snapshot` sem nenhum ganho de auditoria.
//
// O enforcement vive na camada de roteamento (`lib/chats/ai-trigger.ts`), nunca na de execução —
// é o que mantém o playground funcionando enquanto o agente roda numa lista de permissão.

export const AiAgentScopeSchema = z
	.object({
		tipo: AiAgentScopeTypeEnum.default("TODOS"),
		clienteIds: z.array(z.string({ invalid_type_error: "Tipo não válido para o ID do cliente." })).default([]),
	})
	.default({});
export type TAiAgentScope = z.infer<typeof AiAgentScopeSchema>;

/**
 * Decide se o agente pode atender um cliente. Pura de propósito: é chamada no caminho quente do
 * webhook, a partir da linha do agente que já está carregada.
 */
export function isClientInAgentScope(escopo: TAiAgentScope, clienteId: string): boolean {
	const clienteIds = escopo.clienteIds ?? [];
	if (escopo.tipo === "INCLUIR") return clienteIds.includes(clienteId);
	if (escopo.tipo === "EXCLUIR") return clienteIds.length === 0 || !clienteIds.includes(clienteId);
	return true;
}

// ============================================================================
// EXECUÇÃO (run)
// ============================================================================

export const AiAgentUsageSchema = z.object({
	tokensEntrada: z.number({ invalid_type_error: "Tipo não válido para os tokens de entrada." }).optional(),
	tokensSaida: z.number({ invalid_type_error: "Tipo não válido para os tokens de saída." }).optional(),
	tokensTotal: z.number({ invalid_type_error: "Tipo não válido para o total de tokens." }).optional(),
	modelo: z.string({ invalid_type_error: "Tipo não válido para o modelo utilizado." }).optional(),
});
export type TAiAgentUsage = z.infer<typeof AiAgentUsageSchema>;

/**
 * Config que estava valendo no momento da execução. Substitui o versionamento: o agente é
 * editado direto, e cada run carrega consigo a configuração que o produziu.
 */
export const AiAgentConfigSnapshotSchema = z.object({
	instrucoes: z.string({ invalid_type_error: "Tipo não válido para as instruções." }),
	modeloConfig: AiAgentModelConfigSchema,
	capacidades: AiAgentCapabilitiesSchema,
	conhecimento: z.array(
		z.object({
			id: z.string({ invalid_type_error: "Tipo não válido para o ID do bloco de conhecimento." }),
			titulo: z.string({ invalid_type_error: "Tipo não válido para o título do bloco de conhecimento." }),
		}),
	),
});
export type TAiAgentConfigSnapshot = z.infer<typeof AiAgentConfigSnapshotSchema>;

/**
 * Arquivo anexado à resposta do turno.
 *
 * A URL é enviada ao provedor como link — nada é baixado ou hospedado por nós. Ela precisa vir
 * literalmente das instruções ou da base de conhecimento; o prompt diz isso ao modelo, e a
 * `mensagem` do turno viaja como legenda do anexo.
 */
export const AiAgentTurnAttachmentSchema = z.object({
	url: z.string().url(),
	tipo: AiAgentAttachmentTypeEnum,
	nomeArquivo: z.string().nullable(),
});
export type TAiAgentTurnAttachment = z.infer<typeof AiAgentTurnAttachmentSchema>;

/** Saída estruturada de um turno. `mensagem: null` = o agente decidiu não responder. */
export const AiAgentTurnOutputSchema = z.object({
	mensagem: z.string().nullable(),
	anexo: AiAgentTurnAttachmentSchema.nullable(),
	resumoAtendimento: z.string(),
});
export type TAiAgentTurnOutput = z.infer<typeof AiAgentTurnOutputSchema>;

// ============================================================================
// ENTIDADES
// ============================================================================

export const AiAgentSchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para o ID da organização.",
	}),
	nome: z
		.string({ required_error: "Nome do agente não informado.", invalid_type_error: "Tipo não válido para o nome do agente." })
		.min(1, "O nome do agente não pode ser vazio.")
		.max(255, "O nome do agente deve ter no máximo 255 caracteres."),
	status: AiAgentStatusEnum,
	instrucoes: z
		.string({ required_error: "Instruções do agente não informadas.", invalid_type_error: "Tipo não válido para as instruções do agente." })
		.min(1, "As instruções do agente não podem ser vazias.")
		.max(20000, "As instruções do agente devem ter no máximo 20000 caracteres."),
	modeloConfig: AiAgentModelConfigSchema,
	capacidades: AiAgentCapabilitiesSchema,
	escopo: AiAgentScopeSchema,
	dataInsercao: z
		.string()
		.datetime()
		.transform((val) => new Date(val)),
});
export type TAiAgent = z.infer<typeof AiAgentSchema>;

export const AiAgentKnowledgeSchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para o ID da organização.",
	}),
	agenteId: z.string({ required_error: "ID do agente não informado.", invalid_type_error: "Tipo não válido para o ID do agente." }),
	titulo: z
		.string({ required_error: "Título do bloco não informado.", invalid_type_error: "Tipo não válido para o título do bloco." })
		.min(1, "O título do bloco não pode ser vazio.")
		.max(120, "O título do bloco deve ter no máximo 120 caracteres."),
	conteudo: z
		.string({ required_error: "Conteúdo do bloco não informado.", invalid_type_error: "Tipo não válido para o conteúdo do bloco." })
		.min(1, "O conteúdo do bloco não pode ser vazio.")
		.max(8000, "O conteúdo do bloco deve ter no máximo 8000 caracteres."),
	ativo: z.boolean({ invalid_type_error: "Tipo não válido para a ativação do bloco." }),
	ordem: z.number({ invalid_type_error: "Tipo não válido para a ordem do bloco." }).int("A ordem do bloco deve ser inteira."),
	dataInsercao: z
		.string()
		.datetime()
		.transform((val) => new Date(val)),
});
export type TAiAgentKnowledge = z.infer<typeof AiAgentKnowledgeSchema>;

// ============================================================================
// INPUTS DE API
// ============================================================================

/** Campos editáveis do agente (o resto é derivado ou imutável). */
export const UpdateAiAgentSchema = AiAgentSchema.omit({ organizacaoId: true, dataInsercao: true });
export type TUpdateAiAgent = z.infer<typeof UpdateAiAgentSchema>;

/** Bloco de conhecimento vindo do cliente: `id` ausente = novo; `deletar` = remoção. */
export const UpdateAiAgentKnowledgeSchema = AiAgentKnowledgeSchema.omit({
	organizacaoId: true,
	agenteId: true,
	dataInsercao: true,
}).extend({
	id: z.string({ invalid_type_error: "Tipo não válido para o ID do bloco." }).optional(),
	deletar: z.boolean({ invalid_type_error: "Tipo não válido para a remoção do bloco." }).optional(),
});
export type TUpdateAiAgentKnowledge = z.infer<typeof UpdateAiAgentKnowledgeSchema>;

// Re-exports de conveniência para quem consome só este módulo.
export {
	AiAgentAttachmentTypeEnum,
	AiAgentRunTriggerEnum,
	AiAgentRunStatusEnum,
	AiAgentScopeTypeEnum,
	AiAgentStatusEnum,
	AiAgentToolCallStatusEnum,
	AiAgentToolNameEnum,
};
