import { z } from "zod";
import { CommunityLessonMuxMetadataSchema } from "./community";
import {
	CommunityAssetDerivationStatusEnum,
	CommunityAssetDerivationTypeEnum,
	CommunityAssetPipelineStatusEnum,
	CommunityAssetReviewVerdictEnum,
	CommunityAssetTypeEnum,
	CommunityContentStatusEnum,
	CommunityMaterialTypeEnum,
	CommunityMuxAssetStatusEnum,
	CommunityTutorialNivelEnum,
} from "./enums";

const CommunityAssetTypeFieldSchema = z.enum(CommunityAssetTypeEnum.options, {
	required_error: "Tipo do asset nao informado.",
	invalid_type_error: "Tipo não válido para o tipo do asset.",
});

const CommunityAssetPipelineStatusFieldSchema = z
	.enum(CommunityAssetPipelineStatusEnum.options, {
		required_error: "Status do pipeline do asset nao informado.",
		invalid_type_error: "Tipo não válido para o status do pipeline do asset.",
	})
	.default("PENDENTE");

const CommunityAssetReviewVerdictFieldSchema = z.enum(CommunityAssetReviewVerdictEnum.options, {
	required_error: "Veredito da revisão nao informado.",
	invalid_type_error: "Tipo não válido para o veredito da revisão.",
});

const CommunityAssetDerivationTypeFieldSchema = z.enum(CommunityAssetDerivationTypeEnum.options, {
	required_error: "Tipo da derivação nao informado.",
	invalid_type_error: "Tipo não válido para o tipo da derivação.",
});

const CommunityAssetDerivationStatusFieldSchema = z
	.enum(CommunityAssetDerivationStatusEnum.options, {
		required_error: "Status da derivação nao informado.",
		invalid_type_error: "Tipo não válido para o status da derivação.",
	})
	.default("SUGERIDO");

const CommunityTutorialNivelFieldSchema = z
	.enum(CommunityTutorialNivelEnum.options, {
		required_error: "Nível do tutorial nao informado.",
		invalid_type_error: "Tipo não válido para o nível do tutorial.",
	})
	.default("INICIANTE");

const CommunityContentStatusFieldSchema = z
	.enum(CommunityContentStatusEnum.options, {
		required_error: "Status do conteúdo nao informado.",
		invalid_type_error: "Tipo não válido para o status do conteúdo.",
	})
	.default("RASCUNHO");

const CommunityMaterialTypeFieldSchema = z.enum(CommunityMaterialTypeEnum.options, {
	required_error: "Tipo do material nao informado.",
	invalid_type_error: "Tipo não válido para o tipo do material.",
});

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

export const AssetDerivationOperationSchema = z.object({
	tool: z
		.string({
			required_error: "Tool não informado.",
			invalid_type_error: "Tipo não válido para a tool.",
		})
		.describe("Tool ID from registry."),
	params: z.record(z.unknown()).describe("Tool-specific parameters."),
	descricao: z
		.string({
			required_error: "Descrição não informada.",
			invalid_type_error: "Tipo não válido para a descrição.",
		})
		.describe("Human-readable description of the operation."),
});
export type TAssetDerivationOperation = z.infer<typeof AssetDerivationOperationSchema>;

export const AssetDerivationExecutionErrorSchema = z.object({
	tool: z
		.string({
			required_error: "Tool não informado.",
			invalid_type_error: "Tipo não válido para a tool.",
		})
		.describe("Tool ID from registry."),
	step: z.number().int().describe("Step number of the operation that failed."),
	message: z
		.string({
			required_error: "Mensagem de erro não informada.",
			invalid_type_error: "Tipo não válido para a mensagem de erro.",
		})
		.describe("Error message from the tool."),
	timestamp: z
		.string({
			required_error: "Timestamp não informado.",
			invalid_type_error: "Tipo não válido para o timestamp.",
		})
		.datetime({ message: "Tipo não válido para o timestamp." })
		.describe("Timestamp of the error."),
});
export type TAssetDerivationExecutionError = z.infer<typeof AssetDerivationExecutionErrorSchema>;

export const CommunityAssetSchema = z.object({
	titulo: z
		.string({
			required_error: "Titulo do asset nao informado.",
			invalid_type_error: "Tipo não válido para o título do asset.",
		})
		.min(1, "Titulo do asset nao informado."),
	descricao: z
		.string({
			invalid_type_error: "Tipo não válido para a descrição do asset.",
		})
		.optional()
		.nullable(),
	tipo: CommunityAssetTypeFieldSchema,
	storagePath: z
		.string({
			invalid_type_error: "Tipo não válido para o caminho de armazenamento do asset.",
		})
		.optional()
		.nullable(),
	storageUrl: z
		.string({
			invalid_type_error: "Tipo não válido para a URL de armazenamento do asset.",
		})
		.optional()
		.nullable(),
	mimeType: z
		.string({
			invalid_type_error: "Tipo não válido para o MIME type do asset.",
		})
		.optional()
		.nullable(),
	tamanhoBytes: z
		.number({
			invalid_type_error: "Tipo não válido para o tamanho em bytes do asset.",
		})
		.int()
		.optional()
		.nullable(),
	muxAssetId: z
		.string({
			invalid_type_error: "Tipo não válido para o ID do asset no Mux.",
		})
		.optional()
		.nullable(),
	muxPlaybackId: z
		.string({
			invalid_type_error: "Tipo não válido para o playback ID do asset no Mux.",
		})
		.optional()
		.nullable(),
	muxAssetStatus: CommunityMuxAssetStatusEnum.optional().nullable(),
	muxUploadId: z
		.string({
			invalid_type_error: "Tipo não válido para o upload ID do asset no Mux.",
		})
		.optional()
		.nullable(),
	muxMetadata: CommunityLessonMuxMetadataSchema.default({}),
	transcricao: z
		.string({
			invalid_type_error: "Tipo não válido para a transcrição do asset.",
		})
		.optional()
		.nullable(),
	textoExtraido: z
		.string({
			invalid_type_error: "Tipo não válido para o texto extraído do asset.",
		})
		.optional()
		.nullable(),
	metadadosExtraidos: AssetExtractedMetadataSchema.optional().nullable(),
	duracaoSegundos: z
		.number({
			invalid_type_error: "Tipo não válido para a duração em segundos do asset.",
		})
		.int()
		.optional()
		.nullable(),
	statusPipeline: CommunityAssetPipelineStatusFieldSchema,
	etapaAtual: z
		.string({
			invalid_type_error: "Tipo não válido para a etapa atual do pipeline.",
		})
		.optional()
		.nullable(),
	tentativasRevisao: z
		.number({
			required_error: "Tentativas de revisão não informadas.",
			invalid_type_error: "Tipo não válido para as tentativas de revisão.",
		})
		.int()
		.default(0),
	maxTentativasRevisao: z
		.number({
			required_error: "Máximo de tentativas de revisão não informado.",
			invalid_type_error: "Tipo não válido para o máximo de tentativas de revisão.",
		})
		.int()
		.default(3),
	assetPaiId: z
		.string({
			invalid_type_error: "Tipo não válido para o ID do asset pai.",
		})
		.optional()
		.nullable(),
	autorId: z.string({
		required_error: "Autor nao informado.",
		invalid_type_error: "Tipo não válido para o ID do autor.",
	}),
	dataInsercao: z
		.string({
			required_error: "Data de inserção nao informada.",
			invalid_type_error: "Tipo não válido para a data de inserção.",
		})
		.datetime({ message: "Tipo não válido para a data de inserção." })
		.default(new Date().toISOString())
		.transform((val) => (val ? new Date(val) : undefined)),
	dataAtualizacao: z
		.string({
			required_error: "Data de atualização nao informada.",
			invalid_type_error: "Tipo não válido para a data de atualização.",
		})
		.datetime({ message: "Tipo não válido para a data de atualização." })
		.default(new Date().toISOString())
		.transform((val) => (val ? new Date(val) : undefined)),
});
export type TCommunityAssetSchema = z.infer<typeof CommunityAssetSchema>;

export const CommunityAssetReviewSchema = z.object({
	assetId: z.string({
		required_error: "Asset nao informado.",
		invalid_type_error: "Tipo não válido para o ID do asset.",
	}),
	iteracao: z
		.number({
			required_error: "Iteração da revisão não informada.",
			invalid_type_error: "Tipo não válido para a iteração da revisão.",
		})
		.int()
		.default(1),
	veredito: CommunityAssetReviewVerdictFieldSchema,
	scoreDensidadeInfo: z
		.number({
			invalid_type_error: "Tipo não válido para o score de densidade de informação.",
		})
		.int()
		.optional()
		.nullable(),
	scoreOriginalidade: z
		.number({
			invalid_type_error: "Tipo não válido para o score de originalidade.",
		})
		.int()
		.optional()
		.nullable(),
	scoreAlinhamentoMarca: z
		.number({
			invalid_type_error: "Tipo não válido para o score de alinhamento com a marca.",
		})
		.int()
		.optional()
		.nullable(),
	scoreQualidadeProducao: z
		.number({
			invalid_type_error: "Tipo não válido para o score de qualidade de produção.",
		})
		.int()
		.optional()
		.nullable(),
	scoreClarezaMensagem: z
		.number({
			invalid_type_error: "Tipo não válido para o score de clareza da mensagem.",
		})
		.int()
		.optional()
		.nullable(),
	scoreGeral: z
		.number({
			invalid_type_error: "Tipo não válido para o score geral.",
		})
		.int()
		.optional()
		.nullable(),
	resumoAvaliacao: z
		.string({
			invalid_type_error: "Tipo não válido para o resumo da avaliação.",
		})
		.optional()
		.nullable(),
	pontosFortes: z.array(z.string()).default([]),
	problemasIdentificados: z.array(ReviewProblemSchema).default([]),
	sugestoesMelhoria: z.array(ReviewSuggestionSchema).default([]),
	canaisRecomendados: z.array(ChannelRecommendationSchema).default([]),
	contextoRevisaoAnterior: PreviousReviewContextSchema.optional().nullable(),
	respostaModeloBruta: z.record(z.unknown()).optional().nullable(),
	modeloUtilizado: z
		.string({
			invalid_type_error: "Tipo não válido para o modelo utilizado.",
		})
		.optional()
		.nullable(),
	dataInsercao: z
		.string({
			required_error: "Data de inserção nao informada.",
			invalid_type_error: "Tipo não válido para a data de inserção.",
		})
		.datetime({ message: "Tipo não válido para a data de inserção." })
		.default(new Date().toISOString())
		.transform((val) => (val ? new Date(val) : undefined)),
});
export type TCommunityAssetReviewSchema = z.infer<typeof CommunityAssetReviewSchema>;

export const CommunityAssetDerivationSchema = z.object({
	assetOrigemId: z.string({
		required_error: "Asset de origem nao informado.",
		invalid_type_error: "Tipo não válido para o ID do asset de origem.",
	}),
	assetGeradoId: z
		.string({
			invalid_type_error: "Tipo não válido para o ID do asset gerado.",
		})
		.optional()
		.nullable(),
	tipo: CommunityAssetDerivationTypeFieldSchema,
	status: CommunityAssetDerivationStatusFieldSchema,
	titulo: z
		.string({
			required_error: "Titulo da derivação nao informado.",
			invalid_type_error: "Tipo não válido para o título da derivação.",
		})
		.min(1, "Titulo da derivação nao informado."),
	descricao: z
		.string({
			invalid_type_error: "Tipo não válido para a descrição da derivação.",
		})
		.optional()
		.nullable(),
	justificativa: z
		.string({
			invalid_type_error: "Tipo não válido para a justificativa da derivação.",
		})
		.optional()
		.nullable(),
	scoreConfianca: z
		.number({
			invalid_type_error: "Tipo não válido para o score de confiança da derivação.",
		})
		.int()
		.optional()
		.nullable(),
	conteudoSugerido: SuggestedContentSchema.optional().nullable(),
	trechoOrigem: SourceSegmentSchema.optional().nullable(),
	operacoes: z.array(AssetDerivationOperationSchema).default([]),
	erroExecucao: AssetDerivationExecutionErrorSchema.optional().nullable(),
	dataInsercao: z
		.string({
			required_error: "Data de inserção nao informada.",
			invalid_type_error: "Tipo não válido para a data de inserção.",
		})
		.datetime({ message: "Tipo não válido para a data de inserção." })
		.default(new Date().toISOString())
		.transform((val) => (val ? new Date(val) : undefined)),
	dataAtualizacao: z
		.string({
			required_error: "Data de atualização nao informada.",
			invalid_type_error: "Tipo não válido para a data de atualização.",
		})
		.datetime({ message: "Tipo não válido para a data de atualização." })
		.default(new Date().toISOString())
		.transform((val) => (val ? new Date(val) : undefined)),
});
export type TCommunityAssetDerivationSchema = z.infer<typeof CommunityAssetDerivationSchema>;

export const CommunityTutorialSchema = z.object({
	titulo: z
		.string({
			required_error: "Titulo do tutorial nao informado.",
			invalid_type_error: "Tipo não válido para o título do tutorial.",
		})
		.min(1, "Titulo do tutorial nao informado."),
	descricao: z
		.string({
			invalid_type_error: "Tipo não válido para a descrição do tutorial.",
		})
		.optional()
		.nullable(),
	nivel: CommunityTutorialNivelFieldSchema,
	status: CommunityContentStatusFieldSchema,
	thumbnailUrl: z
		.string({
			invalid_type_error: "Tipo não válido para a thumbnail do tutorial.",
		})
		.optional()
		.nullable(),
	conteudoTexto: z
		.string({
			invalid_type_error: "Tipo não válido para o conteúdo do tutorial.",
		})
		.optional()
		.nullable(),
	tags: z.array(z.string()).default([]),
	assetId: z
		.string({
			invalid_type_error: "Tipo não válido para o ID do asset do tutorial.",
		})
		.optional()
		.nullable(),
	ordem: z
		.number({
			required_error: "Ordem do tutorial não informada.",
			invalid_type_error: "Tipo não válido para a ordem do tutorial.",
		})
		.int()
		.default(0),
	categoriaId: z
		.string({
			invalid_type_error: "Tipo não válido para o ID da categoria do tutorial.",
		})
		.optional()
		.nullable(),
	duracaoEstimadaMinutos: z
		.number({
			invalid_type_error: "Tipo não válido para a duração estimada do tutorial.",
		})
		.int()
		.optional()
		.nullable(),
	autorId: z.string({
		required_error: "Autor nao informado.",
		invalid_type_error: "Tipo não válido para o ID do autor.",
	}),
	dataPublicacao: z
		.string({
			invalid_type_error: "Tipo não válido para a data de publicação do tutorial.",
		})
		.datetime({ message: "Tipo não válido para a data de publicação do tutorial." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : undefined)),
	dataInsercao: z
		.string({
			required_error: "Data de inserção nao informada.",
			invalid_type_error: "Tipo não válido para a data de inserção.",
		})
		.datetime({ message: "Tipo não válido para a data de inserção." })
		.default(new Date().toISOString())
		.transform((val) => (val ? new Date(val) : undefined)),
	dataAtualizacao: z
		.string({
			required_error: "Data de atualização nao informada.",
			invalid_type_error: "Tipo não válido para a data de atualização.",
		})
		.datetime({ message: "Tipo não válido para a data de atualização." })
		.default(new Date().toISOString())
		.transform((val) => (val ? new Date(val) : undefined)),
});
export type TCommunityTutorialSchema = z.infer<typeof CommunityTutorialSchema>;

export const CommunityMaterialSchema = z.object({
	titulo: z
		.string({
			required_error: "Titulo do material nao informado.",
			invalid_type_error: "Tipo não válido para o título do material.",
		})
		.min(1, "Titulo do material nao informado."),
	descricao: z
		.string({
			invalid_type_error: "Tipo não válido para a descrição do material.",
		})
		.optional()
		.nullable(),
	tipo: CommunityMaterialTypeFieldSchema,
	status: CommunityContentStatusFieldSchema,
	capaUrl: z
		.string({
			invalid_type_error: "Tipo não válido para a capa do material.",
		})
		.optional()
		.nullable(),
	resumo: z
		.string({
			invalid_type_error: "Tipo não válido para o resumo do material.",
		})
		.optional()
		.nullable(),
	tags: z.array(z.string()).default([]),
	metadadosEspecificos: MaterialSpecificMetadataSchema.optional().nullable(),
	assetId: z
		.string({
			invalid_type_error: "Tipo não válido para o ID do asset do material.",
		})
		.optional()
		.nullable(),
	ordem: z
		.number({
			required_error: "Ordem do material não informada.",
			invalid_type_error: "Tipo não válido para a ordem do material.",
		})
		.int()
		.default(0),
	categoriaId: z
		.string({
			invalid_type_error: "Tipo não válido para o ID da categoria do material.",
		})
		.optional()
		.nullable(),
	autorId: z.string({
		required_error: "Autor nao informado.",
		invalid_type_error: "Tipo não válido para o ID do autor.",
	}),
	dataPublicacao: z
		.string({
			invalid_type_error: "Tipo não válido para a data de publicação do material.",
		})
		.datetime({ message: "Tipo não válido para a data de publicação do material." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : undefined)),
	dataInsercao: z
		.string({
			required_error: "Data de inserção nao informada.",
			invalid_type_error: "Tipo não válido para a data de inserção.",
		})
		.datetime({ message: "Tipo não válido para a data de inserção." })
		.default(new Date().toISOString())
		.transform((val) => (val ? new Date(val) : undefined)),
	dataAtualizacao: z
		.string({
			required_error: "Data de atualização nao informada.",
			invalid_type_error: "Tipo não válido para a data de atualização.",
		})
		.datetime({ message: "Tipo não válido para a data de atualização." })
		.default(new Date().toISOString())
		.transform((val) => (val ? new Date(val) : undefined)),
});
export type TCommunityMaterialSchema = z.infer<typeof CommunityMaterialSchema>;
