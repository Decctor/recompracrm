import { z } from "zod";

export const AssetExtractedMetadataSchema = z
	.object({
		frameCount: z.number().int().optional(),
		resolution: z
			.object({
				width: z.number().int(),
				height: z.number().int(),
			})
			.optional(),
		fps: z.number().optional(),
		codec: z.string().optional(),
		idioma: z.string().optional(),
		palavrasChave: z.array(z.string()).optional(),
	})
	.catchall(z.unknown());
export type TAssetExtractedMetadata = z.infer<typeof AssetExtractedMetadataSchema>;

export const ReviewProblemTypeEnum = z.enum(["AUDIO", "VIDEO", "TEXTO", "VISUAL", "CONTEUDO", "MARCA"]);
export const ReviewProblemSeverityEnum = z.enum(["BAIXA", "MEDIA", "ALTA", "CRITICA"]);

export const ReviewProblemSchema = z.object({
	tipo: ReviewProblemTypeEnum,
	severidade: ReviewProblemSeverityEnum,
	descricao: z.string(),
	timestampInicio: z.number().optional(),
	timestampFim: z.number().optional(),
});
export type TReviewProblem = z.infer<typeof ReviewProblemSchema>;

export const ReviewSuggestionPriorityEnum = z.enum(["BAIXA", "MEDIA", "ALTA"]);
export const ReviewSuggestionSchema = z.object({
	tipo: z.string(),
	descricao: z.string(),
	prioridade: ReviewSuggestionPriorityEnum,
});
export type TReviewSuggestion = z.infer<typeof ReviewSuggestionSchema>;

export const ChannelRecommendationSchema = z.object({
	canal: z.string(),
	score: z.number(),
	justificativa: z.string(),
	formatoSugerido: z.string().optional(),
});
export type TChannelRecommendation = z.infer<typeof ChannelRecommendationSchema>;

export const PreviousReviewContextSchema = z.object({
	reviewId: z.string(),
	problemasParaCorrigir: z.array(z.string()),
	sugestoesParaAplicar: z.array(z.string()),
});
export type TPreviousReviewContext = z.infer<typeof PreviousReviewContextSchema>;

export const SuggestedContentSchema = z.object({
	textoBase: z.string().optional(),
	hashtags: z.array(z.string()).optional(),
	callToAction: z.string().optional(),
	estrutura: z.record(z.unknown()).optional(),
});
export type TSuggestedContent = z.infer<typeof SuggestedContentSchema>;

export const SourceSegmentSchema = z.object({
	timestampInicio: z.number().optional(),
	timestampFim: z.number().optional(),
	paginaInicio: z.number().int().optional(),
	paginaFim: z.number().int().optional(),
	trechoTexto: z.string().optional(),
});
export type TSourceSegment = z.infer<typeof SourceSegmentSchema>;

export const MaterialSpecificMetadataSchema = z
	.object({
		isbn: z.string().optional(),
		numPaginas: z.number().int().optional(),
		capitulos: z.array(z.string()).optional(),
		numAbas: z.number().int().optional(),
		formatoBase: z.string().optional(),
	})
	.catchall(z.unknown());
export type TMaterialSpecificMetadata = z.infer<typeof MaterialSpecificMetadataSchema>;
