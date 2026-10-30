import type { TMediaAdCard, TMediaAdNameHistory } from "@/schemas/media-ads";
import { relations, sql } from "drizzle-orm";
import { index, jsonb, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { newTable } from "./common";
import { mediaAdMediaTypeEnum, mediaAdPlatformEnum } from "./enums";
import { integrations } from "./integrations";
import { organizations } from "./organizations";

/**
 * Catálogo de anúncios das contas de mídia paga conectadas (Meta Ads hoje). Uma linha por anúncio,
 * com campanha e conjunto desnormalizados.
 *
 * É a fonte da biblioteca de anúncios, da identidade (nomes, status, objetivo) e do criativo; as
 * métricas do período continuam ao vivo na Insights API e são cruzadas por `anuncioId`. Guardar
 * métricas aqui seria replicar o Gerenciador, com a Meta revisando números por até 28 dias.
 *
 * A sincronização nunca apaga linhas: anúncio que sai da conta ganha `removidoEm`.
 */
export const mediaAds = newTable(
	"media_ads",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		integracaoId: varchar("integracao_id", { length: 255 })
			.references(() => integrations.id, { onDelete: "cascade" })
			.notNull(),
		plataforma: mediaAdPlatformEnum("plataforma").notNull(),
		// Conta de anúncios na plataforma (`act_…` na Meta).
		contaExternaId: varchar("conta_externa_id", { length: 255 }).notNull(),

		campanhaId: varchar("campanha_id", { length: 255 }),
		campanhaNome: text("campanha_nome"),
		campanhaObjetivo: varchar("campanha_objetivo", { length: 120 }),
		campanhaStatus: varchar("campanha_status", { length: 60 }),
		conjuntoId: varchar("conjunto_id", { length: 255 }),
		conjuntoNome: text("conjunto_nome"),
		conjuntoStatus: varchar("conjunto_status", { length: 60 }),

		anuncioId: varchar("anuncio_id", { length: 255 }).notNull(),
		anuncioNome: text("anuncio_nome").notNull(),
		// Status efetivo (`ACTIVE`, `CAMPAIGN_PAUSED`…) e o configurado no próprio anúncio (`PAUSED`).
		status: varchar("status", { length: 60 }),
		statusConfigurado: varchar("status_configurado", { length: 60 }),

		criativoId: varchar("criativo_id", { length: 255 }),
		titulo: text("titulo"),
		corpo: text("corpo"),
		tipoMidia: mediaAdMediaTypeEnum("tipo_midia").notNull().default("DESCONHECIDO"),
		cartoes: jsonb("cartoes").$type<TMediaAdCard[]>().notNull().default([]),
		// A URL tocável do vídeo expira em horas e é buscada ao abrir o anúncio; aqui fica só o id.
		videoId: varchar("video_id", { length: 255 }),
		cta: varchar("cta", { length: 80 }),
		urlDestino: text("url_destino"),
		permalink: text("permalink"),
		// Modelo de parâmetros que a conta acrescenta à URL (`utm_campaign={{campaign.name}}…`).
		urlTags: text("url_tags"),

		// Capa no nosso storage: a URL da Meta é assinada e expira. Baixada de novo só quando o criativo muda.
		capaUrl: text("capa_url"),
		capaOrigemUrl: text("capa_origem_url"),
		capaCriativoId: varchar("capa_criativo_id", { length: 255 }),

		nomesAnteriores: jsonb("nomes_anteriores").$type<TMediaAdNameHistory>().notNull().default({}),

		criadoNaPlataformaEm: timestamp("criado_na_plataforma_em", { withTimezone: true }),
		atualizadoNaPlataformaEm: timestamp("atualizado_na_plataforma_em", { withTimezone: true }),
		sincronizadoEm: timestamp("sincronizado_em", { withTimezone: true }).defaultNow().notNull(),
		removidoEm: timestamp("removido_em", { withTimezone: true }),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
		dataAtualizacao: timestamp("data_atualizacao", { mode: "date" }).$onUpdate(() => new Date()),
	},
	(table) => ({
		anuncioUnique: uniqueIndex("idx_media_ads_org_platform_ad_unique").on(table.organizacaoId, table.plataforma, table.anuncioId),
		integracaoStatusIdx: index("idx_media_ads_integration_status").on(table.integracaoId, table.status),
		integracaoCampanhaIdx: index("idx_media_ads_integration_campaign").on(table.integracaoId, table.campanhaId),
		anuncioNomeIdx: index("idx_media_ads_integration_ad_name").on(table.integracaoId, sql`lower(${table.anuncioNome})`),
	}),
);

export const mediaAdsRelations = relations(mediaAds, ({ one }) => ({
	organizacao: one(organizations, {
		fields: [mediaAds.organizacaoId],
		references: [organizations.id],
	}),
	integracao: one(integrations, {
		fields: [mediaAds.integracaoId],
		references: [integrations.id],
	}),
}));

export type TMediaAdEntity = typeof mediaAds.$inferSelect;
export type TNewMediaAdEntity = typeof mediaAds.$inferInsert;
