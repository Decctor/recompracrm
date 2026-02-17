import { z } from "zod";
import { CommunityCourseAccessLevelEnum, CommunityCourseStatusEnum, CommunityLessonContentTypeEnum } from "./enums";

export const CommunityCourseSchema = z.object({
	titulo: z.string({ required_error: "Titulo do curso nao informado." }).min(1, "Titulo do curso nao informado."),
	descricao: z
		.string({
			invalid_type_error: "Tipo não válido para a descrição do curso.",
		})
		.optional()
		.nullable(),
	thumbnailUrl: z
		.string({
			invalid_type_error: "Tipo não válido para a URL da imagem do curso.",
		})
		.optional()
		.nullable(),
	nivelAcesso: CommunityCourseAccessLevelEnum.default("PUBLICO"),
	status: CommunityCourseStatusEnum.default("RASCUNHO"),
	ordem: z
		.number({
			invalid_type_error: "Tipo não válido para a ordem do curso.",
		})
		.int()
		.default(0),
	autorId: z.string({ required_error: "Autor nao informado.", invalid_type_error: "Tipo não válido para o ID do autor." }),
	dataPublicacao: z
		.string({ required_error: "Data de publicação nao informada.", invalid_type_error: "Tipo não válido para a data de publicação." })
		.datetime({ message: "Tipo não válido para a data de publicação." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : undefined)),
	dataInsercao: z
		.string({ required_error: "Data de inserção nao informada.", invalid_type_error: "Tipo não válido para a data de inserção." })
		.datetime({ message: "Tipo não válido para a data de inserção." })
		.default(new Date().toISOString())
		.transform((val) => (val ? new Date(val) : undefined)),
});

export const CommunityCourseSectionSchema = z.object({
	cursoId: z.string({ required_error: "Curso nao informado.", invalid_type_error: "Tipo não válido para o ID do curso." }),
	titulo: z.string({ required_error: "Titulo da secao nao informado." }).min(1, "Titulo da secao nao informado."),
	descricao: z
		.string({
			invalid_type_error: "Tipo não válido para a descrição da seção.",
		})
		.optional()
		.nullable(),
	ordem: z
		.number({
			invalid_type_error: "Tipo não válido para a ordem da seção.",
		})
		.int()
		.default(0),
	dataInsercao: z
		.string({ required_error: "Data de inserção nao informada.", invalid_type_error: "Tipo não válido para a data de inserção." })
		.datetime({ message: "Tipo não válido para a data de inserção." })
		.default(new Date().toISOString())
		.transform((val) => (val ? new Date(val) : undefined)),
});

export const CommunityLessonSchema = z.object({
	secaoId: z.string({ required_error: "Secao nao informada.", invalid_type_error: "Tipo não válido para o ID da seção." }),
	titulo: z.string({ required_error: "Titulo da aula nao informado." }).min(1, "Titulo da aula nao informado."),
	descricao: z
		.string({
			invalid_type_error: "Tipo não válido para a descrição da aula.",
		})
		.optional()
		.nullable(),
	tipoConteudo: CommunityLessonContentTypeEnum.default("VIDEO"),
	conteudoTexto: z
		.string({
			invalid_type_error: "Tipo não válido para o conteúdo texto da aula.",
		})
		.optional()
		.nullable(),
	ordem: z
		.number({
			invalid_type_error: "Tipo não válido para a ordem da aula.",
		})
		.int()
		.default(0),
});

export const CommunityLessonMuxMetadataSchema = z
	.object({
		alteracaoMuxAssetId: z
			.string({
				invalid_type_error: "Tipo não válido para o ID de alteração do asset no Mux.",
			})
			.optional(),
		alteracaoMuxAssetData: z
			.string({
				invalid_type_error: "Tipo não válido para a data de alteração do asset no Mux.",
			})
			.datetime({ message: "Tipo não válido para a data de alteração do asset no Mux." })
			.optional(),
		alteracaoMusAssetMotivo: z
			.string({
				invalid_type_error: "Tipo não válido para o motivo de alteração do asset no Mux.",
			})
			.optional(),
	})
	.default({});
export type TCommunityLessonMuxMetadata = z.infer<typeof CommunityLessonMuxMetadataSchema>;

export const CommunityLessonProgressSchema = z.object({
	aulaId: z.string({ required_error: "Aula nao informada.", invalid_type_error: "Tipo não válido para o ID da aula." }),
	concluido: z
		.boolean({
			invalid_type_error: "Tipo não válido para o concluido da aula.",
		})
		.default(false),
	progressoSegundos: z
		.number({
			required_error: "Progresso em segundos da aula não informado.",
			invalid_type_error: "Tipo não válido para o progresso em segundos da aula.",
		})
		.int()
		.default(0),
});

export const CommunityReorderSchema = z.object({
	tipo: z.enum(["secao", "aula"]),
	itens: z.array(
		z.object({
			id: z.string({
				required_error: "ID do item não informado.",
				invalid_type_error: "Tipo não válido para o ID do item.",
			}),
			ordem: z
				.number({
					required_error: "Ordem do item não informada.",
					invalid_type_error: "Tipo não válido para a ordem do item.",
				})
				.int(),
		}),
	),
});
