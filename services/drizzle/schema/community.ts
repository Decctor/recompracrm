import { relations } from "drizzle-orm";
import { boolean, index, integer, pgEnum, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { newTable } from "./common";
import { users } from "./users";

// ---- ENUMS ----

export const communityCourseAccessLevelEnum = pgEnum("community_course_access_level", [
	"PUBLICO",
	"AUTENTICADO",
	"ASSINATURA",
]);

export const communityCourseStatusEnum = pgEnum("community_course_status", ["RASCUNHO", "PUBLICADO", "ARQUIVADO"]);

export const communityLessonContentTypeEnum = pgEnum("community_lesson_content_type", ["VIDEO", "TEXTO", "VIDEO_TEXTO"]);

export const communityMuxAssetStatusEnum = pgEnum("community_mux_asset_status", [
	"AGUARDANDO",
	"PROCESSANDO",
	"PRONTO",
	"ERRO",
]);

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
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		secaoIdx: index("idx_community_lessons_secao").on(table.secaoId),
	}),
);

export const communityLessonsRelations = relations(communityLessons, ({ one, many }) => ({
	secao: one(communityCourseSections, {
		fields: [communityLessons.secaoId],
		references: [communityCourseSections.id],
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
