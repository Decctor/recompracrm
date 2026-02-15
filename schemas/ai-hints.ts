import { z } from "zod";

// ═══════════════════════════════════════════════════════════════
// HINT SUBJECTS (where hints appear)
// ═══════════════════════════════════════════════════════════════

export const AIHintSubjectSchema = z.enum(["dashboard", "campaigns", "clients", "sales", "sellers"]);

export type TAIHintSubject = z.infer<typeof AIHintSubjectSchema>;

// ═══════════════════════════════════════════════════════════════
// HINT STATUS
// ═══════════════════════════════════════════════════════════════

export const AIHintStatusSchema = z.enum(["active", "dismissed", "expired"]);

export type TAIHintStatus = z.infer<typeof AIHintStatusSchema>;

// ═══════════════════════════════════════════════════════════════
// FEEDBACK TYPE
// ═══════════════════════════════════════════════════════════════

export const AIHintFeedbackTypeSchema = z.enum(["like", "dislike"]);

export type TAIHintFeedbackType = z.infer<typeof AIHintFeedbackTypeSchema>;

// ═══════════════════════════════════════════════════════════════
// HINT CONTENT - DISCRIMINATED UNION
// ═══════════════════════════════════════════════════════════════

// Base fields all hints share
const AIHintBaseSchema = z.object({
	titulo: z.string().max(100),
	descricao: z.string().max(500),
	acaoSugerida: z.string().max(200).optional().nullable(),
	urlAcao: z.string().optional().nullable(),
});

// ─────────────────────────────────────────────────────────────────
// CAMPAIGN HINTS
// ─────────────────────────────────────────────────────────────────

export const AIHintCampaignSuggestionSchema = AIHintBaseSchema.extend({
	tipo: z.literal("campaign-suggestion"),
	dados: z.object({
		gatilhoSugerido: z.enum(["nova-compra", "permanencia-segmentacao", "cashback-acumulado", "aniversario"]).optional().nullable(),
		segmentosAlvo: z.array(z.string()).optional().nullable(),
		cashbackSugerido: z.number().min(0).max(100).optional().nullable(),
		motivacao: z.string(),
	}),
});

export const AIHintCampaignOptimizationSchema = AIHintBaseSchema.extend({
	tipo: z.literal("campaign-optimization"),
	dados: z.object({
		campanhaId: z.string().optional().nullable(),
		campanhaNome: z.string(),
		problemaIdentificado: z.string(),
		metricasAtuais: z
			.object({
				taxaConversao: z.number().optional().nullable(),
				ticketMedio: z.number().optional().nullable(),
				alcance: z.number().optional().nullable(),
			})
			.optional()
			.nullable(),
		melhoriaEsperada: z.string(),
	}),
});

// ─────────────────────────────────────────────────────────────────
// RFM / CLIENT HINTS
// ─────────────────────────────────────────────────────────────────

export const AIHintRFMActionSchema = AIHintBaseSchema.extend({
	tipo: z.literal("rfm-action"),
	dados: z.object({
		segmento: z.string(),
		quantidadeClientes: z.number(),
		valorPotencial: z.number().optional().nullable(),
		urgencia: z.enum(["baixa", "media", "alta", "critica"]),
		estrategia: z.string(),
	}),
});

export const AIHintClientReactivationSchema = AIHintBaseSchema.extend({
	tipo: z.literal("client-reactivation"),
	dados: z.object({
		clientesEmRisco: z.number(),
		diasSemCompraMedia: z.number(),
		valorHistorico: z.number().optional().nullable(),
		abordagemSugerida: z.string(),
	}),
});

// ─────────────────────────────────────────────────────────────────
// SALES HINTS
// ─────────────────────────────────────────────────────────────────

export const AIHintSalesTrendSchema = AIHintBaseSchema.extend({
	tipo: z.literal("sales-trend"),
	dados: z.object({
		tendencia: z.enum(["crescimento", "estavel", "queda"]),
		variacaoPercentual: z.number(),
		periodoComparacao: z.string(),
		fatoresIdentificados: z.array(z.string()).optional().nullable(),
		oportunidade: z.string().optional().nullable(),
	}),
});

export const AIHintProductInsightSchema = AIHintBaseSchema.extend({
	tipo: z.literal("product-insight"),
	dados: z.object({
		produtoId: z.string().optional().nullable(),
		produtoNome: z.string(),
		insight: z.enum(["best-seller", "declining", "seasonal-opportunity", "cross-sell"]),
		detalhes: z.string(),
	}),
});

// ─────────────────────────────────────────────────────────────────
// SELLER HINTS
// ─────────────────────────────────────────────────────────────────

export const AIHintSellerPerformanceSchema = AIHintBaseSchema.extend({
	tipo: z.literal("seller-performance"),
	dados: z.object({
		vendedorId: z.string().optional().nullable(),
		vendedorNome: z.string().optional().nullable(),
		tipoInsight: z.enum(["top-performer", "needs-coaching", "improving", "opportunity"]),
		metricas: z
			.object({
				vendasPeriodo: z.number().optional().nullable(),
				ticketMedio: z.number().optional().nullable(),
				taxaConversao: z.number().optional().nullable(),
			})
			.optional()
			.nullable(),
		recomendacao: z.string(),
	}),
});

// ─────────────────────────────────────────────────────────────────
// GENERAL / DASHBOARD HINTS
// ─────────────────────────────────────────────────────────────────

export const AIHintGeneralSchema = AIHintBaseSchema.extend({
	tipo: z.literal("general"),
	dados: z.object({
		categoria: z.enum(["opportunity", "warning", "celebration", "tip"]),
		prioridade: z.enum(["baixa", "media", "alta"]),
		contextoAdicional: z.string().optional().nullable(),
	}),
});

// ═══════════════════════════════════════════════════════════════
// COMBINED UNION
// ═══════════════════════════════════════════════════════════════

export const AIHintContentSchema = z.discriminatedUnion("tipo", [
	// Campaign hints
	AIHintCampaignSuggestionSchema,
	AIHintCampaignOptimizationSchema,
	// RFM/Client hints
	AIHintRFMActionSchema,
	AIHintClientReactivationSchema,
	// Sales hints
	AIHintSalesTrendSchema,
	AIHintProductInsightSchema,
	// Seller hints
	AIHintSellerPerformanceSchema,
	// General
	AIHintGeneralSchema,
]);

export type TAIHintContent = z.infer<typeof AIHintContentSchema>;
export type TAIHintType = TAIHintContent["tipo"];

// ═══════════════════════════════════════════════════════════════
// FULL HINT SCHEMA (for API responses)
// ═══════════════════════════════════════════════════════════════

export const AIHintSchema = z.object({
	id: z.string(),
	organizacaoId: z.string(),
	assunto: AIHintSubjectSchema,
	tipo: z.string(),
	conteudo: AIHintContentSchema,
	modeloUtilizado: z.string().nullable(),
	tokensUtilizados: z.number().nullable(),
	relevancia: z.number().min(0).max(1).nullable(),
	status: AIHintStatusSchema,
	descartadaPor: z.string().nullable(),
	dataDescarte: z.date().nullable(),
	dataExpiracao: z.date().nullable(),
	dataInsercao: z.date(),
});

export type TAIHint = z.infer<typeof AIHintSchema>;

// ═══════════════════════════════════════════════════════════════
// INPUT SCHEMAS
// ═══════════════════════════════════════════════════════════════

export const GenerateHintsInputSchema = z.object({
	assunto: AIHintSubjectSchema,
	contextoAdicional: z.string().optional(),
});
export type TGenerateHintsInput = z.infer<typeof GenerateHintsInputSchema>;

export const DismissHintInputSchema = z.object({
	id: z.string(),
});
export type TDismissHintInput = z.infer<typeof DismissHintInputSchema>;

export const GetHintsInputSchema = z.object({
	assunto: AIHintSubjectSchema.optional(),
	status: AIHintStatusSchema.optional().default("active"),
	limite: z.coerce.number().min(1).max(20).optional().default(5),
});
export type TGetHintsInput = z.infer<typeof GetHintsInputSchema>;

export const HintFeedbackInputSchema = z.object({
	id: z.string(),
	tipo: AIHintFeedbackTypeSchema,
	comentario: z.string().optional(),
});
export type THintFeedbackInput = z.infer<typeof HintFeedbackInputSchema>;

// ═══════════════════════════════════════════════════════════════
// OUTPUT SCHEMAS
// ═══════════════════════════════════════════════════════════════

export const GetHintsOutputSchema = z.object({
	data: z.array(AIHintSchema),
});
export type TGetHintsOutput = z.infer<typeof GetHintsOutputSchema>;

export const GenerateHintsOutputSchema = z.object({
	data: z.object({
		hints: z.array(z.object({ id: z.string(), tipo: z.string() })),
		tokensUsados: z.number(),
		limiteAtingido: z.boolean(),
	}),
	message: z.string(),
});
export type TGenerateHintsOutput = z.infer<typeof GenerateHintsOutputSchema>;
