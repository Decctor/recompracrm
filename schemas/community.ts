import { z } from "zod";

export const CommunityCourseAccessLevelEnum = z.enum(["PUBLICO", "AUTENTICADO", "ASSINATURA"]);
export type TCommunityCourseAccessLevel = z.infer<typeof CommunityCourseAccessLevelEnum>;

export const CommunityCourseStatusEnum = z.enum(["RASCUNHO", "PUBLICADO", "ARQUIVADO"]);
export type TCommunityCourseStatus = z.infer<typeof CommunityCourseStatusEnum>;

export const CommunityLessonContentTypeEnum = z.enum(["VIDEO", "TEXTO", "VIDEO_TEXTO"]);
export type TCommunityLessonContentType = z.infer<typeof CommunityLessonContentTypeEnum>;

export const CommunityCourseSchema = z.object({
	titulo: z.string({ required_error: "Titulo do curso nao informado." }).min(1, "Titulo do curso nao informado."),
	descricao: z.string().optional().nullable(),
	thumbnailUrl: z.string().optional().nullable(),
	nivelAcesso: CommunityCourseAccessLevelEnum.default("PUBLICO"),
	status: CommunityCourseStatusEnum.default("RASCUNHO"),
	ordem: z.number().int().default(0),
});

export const CommunityCourseSectionSchema = z.object({
	cursoId: z.string({ required_error: "Curso nao informado." }),
	titulo: z.string({ required_error: "Titulo da secao nao informado." }).min(1, "Titulo da secao nao informado."),
	descricao: z.string().optional().nullable(),
	ordem: z.number().int().default(0),
});

export const CommunityLessonSchema = z.object({
	secaoId: z.string({ required_error: "Secao nao informada." }),
	titulo: z.string({ required_error: "Titulo da aula nao informado." }).min(1, "Titulo da aula nao informado."),
	descricao: z.string().optional().nullable(),
	tipoConteudo: CommunityLessonContentTypeEnum.default("VIDEO"),
	conteudoTexto: z.string().optional().nullable(),
	ordem: z.number().int().default(0),
});

export const CommunityLessonProgressSchema = z.object({
	aulaId: z.string({ required_error: "Aula nao informada." }),
	concluido: z.boolean().default(false),
	progressoSegundos: z.number().int().default(0),
});

export const CommunityReorderSchema = z.object({
	tipo: z.enum(["secao", "aula"]),
	itens: z.array(
		z.object({
			id: z.string(),
			ordem: z.number().int(),
		}),
	),
});
