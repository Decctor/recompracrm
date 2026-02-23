import type {
	TAssetExtractedMetadata,
	TChannelRecommendation,
	TMaterialSpecificMetadata,
	TPreviousReviewContext,
	TReviewProblem,
	TReviewSuggestion,
	TSourceSegment,
	TSuggestedContent,
} from "@/schemas/community-pipeline";
import type { TCommunityLessonMuxMetadata } from "@/schemas/community";
import { relations } from "drizzle-orm";
import { type AnyPgColumn, boolean, index, integer, jsonb, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { newTable } from "./common";
import {
	communityAssetDerivationStatusEnum,
	communityAssetDerivationTypeEnum,
	communityAssetPipelineStatusEnum,
	communityAssetReviewVerdictEnum,
	communityAssetTypeEnum,
	communityContentStatusEnum,
	communityCourseAccessLevelEnum,
	communityCourseStatusEnum,
	communityLessonContentTypeEnum,
	communityMaterialTypeEnum,
	communityMuxAssetStatusEnum,
	communityTutorialNivelEnum,
} from "./enums";
import { users } from "./users";

// ---- COURSES ----

export const communityCourses = newTable(
	"community_courses",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		titulo: text("titulo").notNull(),
		descricao: text("descricao"),
		thumbnailUrl: text("thumbnail_url"),
		nivelAcesso: communityCourseAccessLevelEnum("nivel_acesso").notNull().default("PUBLICO"),
		status: communityCourseStatusEnum("status").notNull().default("RASCUNHO"),
		ordem: integer("ordem").notNull().default(0),
		autorId: varchar("autor_id", { length: 255 })
			.references(() => users.id)
			.notNull(),
		dataPublicacao: timestamp("data_publicacao"),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		statusIdx: index("idx_community_courses_status").on(table.status),
		nivelAcessoIdx: index("idx_community_courses_nivel_acesso").on(table.nivelAcesso),
	}),
);

export const communityCoursesRelations = relations(communityCourses, ({ one, many }) => ({
	autor: one(users, {
		fields: [communityCourses.autorId],
		references: [users.id],
	}),
	secoes: many(communityCourseSections),
}));

export type TCommunityCourseEntity = typeof communityCourses.$inferSelect;
export type TNewCommunityCourseEntity = typeof communityCourses.$inferInsert;

// ---- SECTIONS ----

export const communityCourseSections = newTable("community_course_sections", {
	id: varchar("id", { length: 255 })
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	cursoId: varchar("curso_id", { length: 255 })
		.references(() => communityCourses.id, { onDelete: "cascade" })
		.notNull(),
	titulo: text("titulo").notNull(),
	descricao: text("descricao"),
	ordem: integer("ordem").notNull().default(0),
	dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
});

export const communityCourseSectionsRelations = relations(communityCourseSections, ({ one, many }) => ({
	curso: one(communityCourses, {
		fields: [communityCourseSections.cursoId],
		references: [communityCourses.id],
	}),
	aulas: many(communityLessons),
}));

export type TCommunityCourseSectionEntity = typeof communityCourseSections.$inferSelect;
export type TNewCommunityCourseSectionEntity = typeof communityCourseSections.$inferInsert;

// ---- ASSETS ----

export const communityAssets = newTable(
	"community_assets",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		titulo: text("titulo").notNull(),
		descricao: text("descricao"),
		tipo: communityAssetTypeEnum("tipo").notNull(),
		storagePath: text("storage_path"),
		storageUrl: text("storage_url"),
		mimeType: varchar("mime_type", { length: 127 }),
		tamanhoBytes: integer("tamanho_bytes"),
		muxAssetId: text("mux_asset_id"),
		muxPlaybackId: text("mux_playback_id"),
		muxAssetStatus: communityMuxAssetStatusEnum("mux_asset_status"),
		muxUploadId: text("mux_upload_id"),
		muxMetadata: jsonb("mux_metadata").$type<TCommunityLessonMuxMetadata>().default({}),
		transcricao: text("transcricao"),
		textoExtraido: text("texto_extraido"),
		metadadosExtraidos: jsonb("metadados_extraidos").$type<TAssetExtractedMetadata>(),
		duracaoSegundos: integer("duracao_segundos"),
		statusPipeline: communityAssetPipelineStatusEnum("status_pipeline").notNull().default("PENDENTE"),
		etapaAtual: varchar("etapa_atual", { length: 50 }),
		tentativasRevisao: integer("tentativas_revisao").notNull().default(0),
		maxTentativasRevisao: integer("max_tentativas_revisao").notNull().default(3),
		assetPaiId: varchar("asset_pai_id", { length: 255 }).references((): AnyPgColumn => communityAssets.id, { onDelete: "set null" }),
		autorId: varchar("autor_id", { length: 255 })
			.references(() => users.id)
			.notNull(),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
		dataAtualizacao: timestamp("data_atualizacao").defaultNow().notNull(),
	},
	(table) => ({
		tipoIdx: index("idx_community_assets_tipo").on(table.tipo),
		statusPipelineIdx: index("idx_community_assets_status_pipeline").on(table.statusPipeline),
		assetPaiIdx: index("idx_community_assets_pai").on(table.assetPaiId),
		autorIdx: index("idx_community_assets_autor").on(table.autorId),
	}),
);

export const communityAssetsRelations = relations(communityAssets, ({ one, many }) => ({
	autor: one(users, {
		fields: [communityAssets.autorId],
		references: [users.id],
	}),
	assetPai: one(communityAssets, {
		fields: [communityAssets.assetPaiId],
		references: [communityAssets.id],
		relationName: "assetHierarquia",
	}),
	assetsFilhos: many(communityAssets, {
		relationName: "assetHierarquia",
	}),
	revisoes: many(communityAssetReviews),
	derivacoesOrigem: many(communityAssetDerivations, {
		relationName: "derivacoesOrigem",
	}),
	derivacoesGerado: many(communityAssetDerivations, {
		relationName: "derivacoesGerado",
	}),
	aulas: many(communityLessons),
	materiais: many(communityMaterials),
	tutoriais: many(communityTutorials),
}));

export type TCommunityAssetEntity = typeof communityAssets.$inferSelect;
export type TNewCommunityAssetEntity = typeof communityAssets.$inferInsert;

// ---- ASSET REVIEWS ----

export const communityAssetReviews = newTable(
	"community_asset_reviews",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		assetId: varchar("asset_id", { length: 255 })
			.references(() => communityAssets.id, { onDelete: "cascade" })
			.notNull(),
		iteracao: integer("iteracao").notNull().default(1),
		veredito: communityAssetReviewVerdictEnum("veredito").notNull(),
		scoreDensidadeInfo: integer("score_densidade_info"),
		scoreOriginalidade: integer("score_originalidade"),
		scoreAlinhamentoMarca: integer("score_alinhamento_marca"),
		scoreQualidadeProducao: integer("score_qualidade_producao"),
		scoreClarezaMensagem: integer("score_clareza_mensagem"),
		scoreGeral: integer("score_geral"),
		resumoAvaliacao: text("resumo_avaliacao"),
		pontosFortes: jsonb("pontos_fortes").$type<string[]>().default([]),
		problemasIdentificados: jsonb("problemas_identificados").$type<TReviewProblem[]>().default([]),
		sugestoesMelhoria: jsonb("sugestoes_melhoria").$type<TReviewSuggestion[]>().default([]),
		canaisRecomendados: jsonb("canais_recomendados").$type<TChannelRecommendation[]>().default([]),
		contextoRevisaoAnterior: jsonb("contexto_revisao_anterior").$type<TPreviousReviewContext>(),
		respostaModeloBruta: jsonb("resposta_modelo_bruta"),
		modeloUtilizado: varchar("modelo_utilizado", { length: 100 }),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		assetIdx: index("idx_community_asset_reviews_asset").on(table.assetId),
		assetIteracaoIdx: uniqueIndex("idx_community_asset_reviews_asset_iteracao").on(table.assetId, table.iteracao),
	}),
);

export const communityAssetReviewsRelations = relations(communityAssetReviews, ({ one }) => ({
	asset: one(communityAssets, {
		fields: [communityAssetReviews.assetId],
		references: [communityAssets.id],
	}),
}));

export type TCommunityAssetReviewEntity = typeof communityAssetReviews.$inferSelect;
export type TNewCommunityAssetReviewEntity = typeof communityAssetReviews.$inferInsert;

// ---- ASSET DERIVATIONS ----

export const communityAssetDerivations = newTable(
	"community_asset_derivations",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		assetOrigemId: varchar("asset_origem_id", { length: 255 })
			.references(() => communityAssets.id, { onDelete: "cascade" })
			.notNull(),
		assetGeradoId: varchar("asset_gerado_id", { length: 255 }).references(() => communityAssets.id, { onDelete: "set null" }),
		tipo: communityAssetDerivationTypeEnum("tipo").notNull(),
		status: communityAssetDerivationStatusEnum("status").notNull().default("SUGERIDO"),
		titulo: text("titulo").notNull(),
		descricao: text("descricao"),
		justificativa: text("justificativa"),
		scoreConfianca: integer("score_confianca"),
		conteudoSugerido: jsonb("conteudo_sugerido").$type<TSuggestedContent>(),
		trechoOrigem: jsonb("trecho_origem").$type<TSourceSegment>(),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
		dataAtualizacao: timestamp("data_atualizacao").defaultNow().notNull(),
	},
	(table) => ({
		assetOrigemIdx: index("idx_community_asset_derivations_origem").on(table.assetOrigemId),
		statusIdx: index("idx_community_asset_derivations_status").on(table.status),
	}),
);

export const communityAssetDerivationsRelations = relations(communityAssetDerivations, ({ one }) => ({
	assetOrigem: one(communityAssets, {
		fields: [communityAssetDerivations.assetOrigemId],
		references: [communityAssets.id],
		relationName: "derivacoesOrigem",
	}),
	assetGerado: one(communityAssets, {
		fields: [communityAssetDerivations.assetGeradoId],
		references: [communityAssets.id],
		relationName: "derivacoesGerado",
	}),
}));

export type TCommunityAssetDerivationEntity = typeof communityAssetDerivations.$inferSelect;
export type TNewCommunityAssetDerivationEntity = typeof communityAssetDerivations.$inferInsert;

// ---- MATERIALS ----

export const communityMaterials = newTable(
	"community_materials",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		titulo: text("titulo").notNull(),
		descricao: text("descricao"),
		tipo: communityMaterialTypeEnum("tipo").notNull(),
		status: communityContentStatusEnum("status").notNull().default("RASCUNHO"),
		capaUrl: text("capa_url"),
		resumo: text("resumo"),
		tags: jsonb("tags").$type<string[]>().default([]),
		metadadosEspecificos: jsonb("metadados_especificos").$type<TMaterialSpecificMetadata>(),
		assetId: varchar("asset_id", { length: 255 }).references(() => communityAssets.id, { onDelete: "set null" }),
		ordem: integer("ordem").notNull().default(0),
		categoriaId: varchar("categoria_id", { length: 255 }),
		autorId: varchar("autor_id", { length: 255 })
			.references(() => users.id)
			.notNull(),
		dataPublicacao: timestamp("data_publicacao"),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
		dataAtualizacao: timestamp("data_atualizacao").defaultNow().notNull(),
	},
	(table) => ({
		tipoIdx: index("idx_community_materials_tipo").on(table.tipo),
		statusIdx: index("idx_community_materials_status").on(table.status),
		assetIdx: index("idx_community_materials_asset").on(table.assetId),
	}),
);

export const communityMaterialsRelations = relations(communityMaterials, ({ one }) => ({
	asset: one(communityAssets, {
		fields: [communityMaterials.assetId],
		references: [communityAssets.id],
	}),
	autor: one(users, {
		fields: [communityMaterials.autorId],
		references: [users.id],
	}),
}));

export type TCommunityMaterialEntity = typeof communityMaterials.$inferSelect;
export type TNewCommunityMaterialEntity = typeof communityMaterials.$inferInsert;

// ---- TUTORIALS ----

export const communityTutorials = newTable(
	"community_tutorials",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		titulo: text("titulo").notNull(),
		descricao: text("descricao"),
		nivel: communityTutorialNivelEnum("nivel").notNull().default("INICIANTE"),
		status: communityContentStatusEnum("status").notNull().default("RASCUNHO"),
		thumbnailUrl: text("thumbnail_url"),
		conteudoTexto: text("conteudo_texto"),
		tags: jsonb("tags").$type<string[]>().default([]),
		assetId: varchar("asset_id", { length: 255 }).references(() => communityAssets.id, { onDelete: "set null" }),
		ordem: integer("ordem").notNull().default(0),
		categoriaId: varchar("categoria_id", { length: 255 }),
		duracaoEstimadaMinutos: integer("duracao_estimada_minutos"),
		autorId: varchar("autor_id", { length: 255 })
			.references(() => users.id)
			.notNull(),
		dataPublicacao: timestamp("data_publicacao"),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
		dataAtualizacao: timestamp("data_atualizacao").defaultNow().notNull(),
	},
	(table) => ({
		nivelIdx: index("idx_community_tutorials_nivel").on(table.nivel),
		statusIdx: index("idx_community_tutorials_status").on(table.status),
		assetIdx: index("idx_community_tutorials_asset").on(table.assetId),
	}),
);

export const communityTutorialsRelations = relations(communityTutorials, ({ one }) => ({
	asset: one(communityAssets, {
		fields: [communityTutorials.assetId],
		references: [communityAssets.id],
	}),
	autor: one(users, {
		fields: [communityTutorials.autorId],
		references: [users.id],
	}),
}));

export type TCommunityTutorialEntity = typeof communityTutorials.$inferSelect;
export type TNewCommunityTutorialEntity = typeof communityTutorials.$inferInsert;

// ---- LESSONS ----

export const communityLessons = newTable(
	"community_lessons",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		secaoId: varchar("secao_id", { length: 255 })
			.references(() => communityCourseSections.id, { onDelete: "cascade" })
			.notNull(),
		titulo: text("titulo").notNull(),
		descricao: text("descricao"),
		tipoConteudo: communityLessonContentTypeEnum("tipo_conteudo").notNull().default("VIDEO"),
		conteudoTexto: text("conteudo_texto"),
		ordem: integer("ordem").notNull().default(0),
		duracaoSegundos: integer("duracao_segundos"),
		muxAssetId: text("mux_asset_id"),
		muxPlaybackId: text("mux_playback_id"),
		muxAssetStatus: communityMuxAssetStatusEnum("mux_asset_status"),
		muxUploadId: text("mux_upload_id"),
		muxMetadata: jsonb("mux_metadata").$type<TCommunityLessonMuxMetadata>().notNull().default({}),
		assetId: varchar("asset_id", { length: 255 }).references(() => communityAssets.id, { onDelete: "set null" }),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		secaoIdx: index("idx_community_lessons_secao").on(table.secaoId),
		assetIdx: index("idx_community_lessons_asset").on(table.assetId),
	}),
);

export const communityLessonsRelations = relations(communityLessons, ({ one, many }) => ({
	secao: one(communityCourseSections, {
		fields: [communityLessons.secaoId],
		references: [communityCourseSections.id],
	}),
	asset: one(communityAssets, {
		fields: [communityLessons.assetId],
		references: [communityAssets.id],
	}),
	progressos: many(communityLessonProgress),
}));

export type TCommunityLessonEntity = typeof communityLessons.$inferSelect;
export type TNewCommunityLessonEntity = typeof communityLessons.$inferInsert;

// ---- PROGRESS TRACKING ----

export const communityLessonProgress = newTable(
	"community_lesson_progress",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		usuarioId: varchar("usuario_id", { length: 255 })
			.references(() => users.id, { onDelete: "cascade" })
			.notNull(),
		aulaId: varchar("aula_id", { length: 255 })
			.references(() => communityLessons.id, { onDelete: "cascade" })
			.notNull(),
		concluido: boolean("concluido").notNull().default(false),
		progressoSegundos: integer("progresso_segundos").default(0),
		dataConclusao: timestamp("data_conclusao"),
		dataUltimaVisualizacao: timestamp("data_ultima_visualizacao").defaultNow().notNull(),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		usuarioAulaIdx: uniqueIndex("idx_community_progress_usuario_aula").on(table.usuarioId, table.aulaId),
	}),
);

export const communityLessonProgressRelations = relations(communityLessonProgress, ({ one }) => ({
	usuario: one(users, {
		fields: [communityLessonProgress.usuarioId],
		references: [users.id],
	}),
	aula: one(communityLessons, {
		fields: [communityLessonProgress.aulaId],
		references: [communityLessons.id],
	}),
}));

export type TCommunityLessonProgressEntity = typeof communityLessonProgress.$inferSelect;
export type TNewCommunityLessonProgressEntity = typeof communityLessonProgress.$inferInsert;
