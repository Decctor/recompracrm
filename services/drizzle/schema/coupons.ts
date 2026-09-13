import { relations } from "drizzle-orm";
import { boolean, doublePrecision, index, integer, jsonb, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { campaigns } from "./campaigns";
import { clientTags, clients } from "./clients";
import { newTable } from "./common";
import {
	couponBenefitScopeEnum,
	couponBenefitTypeEnum,
	couponGrantOriginEnum,
	couponRedemptionSourceEnum,
	couponRedemptionStatusEnum,
	couponScopeEnum,
	couponTargetOperatorEnum,
	couponTargetRoleEnum,
	couponValidationModeEnum,
	deliveryModeEnum,
} from "./enums";
import { organizations } from "./organizations";
import { productVariants, products } from "./products";
import { sales } from "./sales";
import { sellers } from "./sellers";
import { users } from "./users";

// -----------------------------------------------------------------------------
// COUPONS (definição/promoção — o "molde" do cupom)
// -----------------------------------------------------------------------------
export const coupons = newTable(
	"coupons",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		ativo: boolean("ativo").notNull().default(true),

		// Identidade e comunicação
		titulo: text("titulo").notNull(),
		descricao: text("descricao"), // texto de marketing (cliente final)
		imagemCapaUrl: text("imagem_capa_url"),
		codigo: text("codigo").notNull(), // código público (ex: "PROMO10"), único por organização

		// Escopo de audiência
		escopo: couponScopeEnum("escopo").notNull().default("GLOBAL"),

		// Modo de validação no resgate
		validacaoModo: couponValidationModeEnum("validacao_modo").notNull().default("AUTOMATICA"),
		condicoesTexto: text("condicoes_texto"), // regras em linguagem natural — obrigatório quando MANUAL

		// Benefício
		beneficioTipo: couponBenefitTypeEnum("beneficio_tipo").notNull(),
		beneficioValor: doublePrecision("beneficio_valor"), // R$ fixo, % ou preço-alvo conforme o tipo
		beneficioDescontoMaximo: doublePrecision("beneficio_desconto_maximo"), // teto em R$ para percentual
		beneficioAplicacao: couponBenefitScopeEnum("beneficio_aplicacao").notNull().default("VENDA_TOTAL"),
		beneficioCompreQuantidade: integer("beneficio_compre_quantidade"), // COMPRE_X_LEVE_Y: X (pago)
		beneficioLeveQuantidade: integer("beneficio_leve_quantidade"), // COMPRE_X_LEVE_Y: Y (levado)

		// Condições de carrinho (AUTOMATICA); modalidade e primeira compra valem também em MANUAL.
		condicaoValorMinimoVenda: doublePrecision("condicao_valor_minimo_venda"),
		condicaoQuantidadeMinimaItens: integer("condicao_quantidade_minima_itens"),
		condicaoModalidadesEntrega: deliveryModeEnum("condicao_modalidades_entrega").array(),
		condicaoPrimeiraCompra: boolean("condicao_primeira_compra").notNull().default(false),
		condicaoAlvosOperador: couponTargetOperatorEnum("condicao_alvos_operador").notNull().default("QUALQUER"),

		// Vigência
		vigenciaInicio: timestamp("vigencia_inicio"),
		vigenciaFim: timestamp("vigencia_fim"), // null = não expira

		// Limites de uso
		limiteResgatesTotal: integer("limite_resgates_total"), // null = ilimitado
		limiteResgatesPorCliente: integer("limite_resgates_por_cliente").default(1),
		acumulavel: boolean("acumulavel").notNull().default(false),

		// Superfícies de resgate
		resgatePermitirViaPos: boolean("resgate_permitir_via_pos").notNull().default(true),
		resgatePermitirViaPontoInteracao: boolean("resgate_permitir_via_ponto_interacao").notNull().default(true),
		// Loja digital é autoatendimento: cupons MANUAL aparecem nela apenas como aviso (resgate no balcão).
		resgatePermitirViaLojaDigital: boolean("resgate_permitir_via_loja_digital").notNull().default(true),

		autorId: varchar("autor_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
		dataAtualizacao: timestamp("data_atualizacao").$defaultFn(() => new Date()),
	},
	(table) => ({
		organizacaoCodigoUnq: uniqueIndex("unq_coupons_organizacao_codigo").on(table.organizacaoId, table.codigo),
		organizacaoIdx: index("idx_coupons_organizacao").on(table.organizacaoId),
		organizacaoAtivoIdx: index("idx_coupons_organizacao_ativo").on(table.organizacaoId, table.ativo),
		vigenciaFimIdx: index("idx_coupons_vigencia_fim").on(table.vigenciaFim),
	}),
);
export const couponsRelations = relations(coupons, ({ one, many }) => ({
	organizacao: one(organizations, {
		fields: [coupons.organizacaoId],
		references: [organizations.id],
	}),
	autor: one(users, {
		fields: [coupons.autorId],
		references: [users.id],
	}),
	alvos: many(couponTargets),
	audiencias: many(couponAudiences),
	atribuicoes: many(couponGrants),
	resgates: many(couponRedemptions),
}));

export type TCouponEntity = typeof coupons.$inferSelect;
export type TNewCouponEntity = typeof coupons.$inferInsert;

// -----------------------------------------------------------------------------
// COUPON TARGETS (escopo de produtos: quando o cupom vale e onde o desconto incide)
// -----------------------------------------------------------------------------
// Exatamente um entre produtoId, produtoVarianteId e grupo deve estar preenchido (validação no Zod).
// Sem linhas de alvo = cupom vale para qualquer carrinho (desconto base).
export const couponTargets = newTable(
	"coupon_targets",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		cupomId: varchar("cupom_id", { length: 255 })
			.references(() => coupons.id, { onDelete: "cascade" })
			.notNull(),
		// ELEGIVEL: define quando o cupom vale; BENEFICIADO: onde o desconto incide (beneficioAplicacao = ITENS_ELEGIVEIS)
		papel: couponTargetRoleEnum("papel").notNull().default("ELEGIVEL"),
		produtoId: varchar("produto_id", { length: 255 }).references(() => products.id, { onDelete: "cascade" }),
		produtoVarianteId: varchar("produto_variante_id", { length: 255 }).references(() => productVariants.id, { onDelete: "cascade" }),
		grupo: text("grupo"), // casa com products.grupo
		quantidadeMinima: integer("quantidade_minima").notNull().default(1),
	},
	(table) => ({
		cupomIdx: index("idx_coupon_targets_cupom").on(table.cupomId),
		organizacaoIdx: index("idx_coupon_targets_organizacao").on(table.organizacaoId),
	}),
);
export const couponTargetsRelations = relations(couponTargets, ({ one }) => ({
	cupom: one(coupons, {
		fields: [couponTargets.cupomId],
		references: [coupons.id],
	}),
	produto: one(products, {
		fields: [couponTargets.produtoId],
		references: [products.id],
	}),
	produtoVariante: one(productVariants, {
		fields: [couponTargets.produtoVarianteId],
		references: [productVariants.id],
	}),
}));

export type TCouponTargetEntity = typeof couponTargets.$inferSelect;
export type TNewCouponTargetEntity = typeof couponTargets.$inferInsert;

// -----------------------------------------------------------------------------
// COUPON AUDIENCES (restrição de audiência de cupons GLOBAIS: tag ou segmento RFM)
// -----------------------------------------------------------------------------
// Exatamente um entre clienteTagId e segmentacaoRFM deve estar preenchido (validação no Zod).
// Semântica OR entre linhas: o cliente precisa casar com qualquer uma.
// Sem linhas = cupom global vale para qualquer cliente identificado.
export const couponAudiences = newTable(
	"coupon_audiences",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		cupomId: varchar("cupom_id", { length: 255 })
			.references(() => coupons.id, { onDelete: "cascade" })
			.notNull(),
		clienteTagId: varchar("cliente_tag_id", { length: 255 }).references(() => clientTags.id, { onDelete: "cascade" }),
		segmentacaoRFM: text("segmentacao_rfm"), // casa com clients.analiseRFMTitulo
	},
	(table) => ({
		cupomIdx: index("idx_coupon_audiences_cupom").on(table.cupomId),
		organizacaoTagIdx: index("idx_coupon_audiences_organizacao_tag").on(table.organizacaoId, table.clienteTagId),
	}),
);
export const couponAudiencesRelations = relations(couponAudiences, ({ one }) => ({
	cupom: one(coupons, {
		fields: [couponAudiences.cupomId],
		references: [coupons.id],
	}),
	clienteTag: one(clientTags, {
		fields: [couponAudiences.clienteTagId],
		references: [clientTags.id],
	}),
}));

export type TCouponAudienceEntity = typeof couponAudiences.$inferSelect;
export type TNewCouponAudienceEntity = typeof couponAudiences.$inferInsert;

// -----------------------------------------------------------------------------
// COUPON GRANTS (atribuição individual — posse; apenas para escopo INDIVIDUAL)
// -----------------------------------------------------------------------------
export const couponGrants = newTable(
	"coupon_grants",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		cupomId: varchar("cupom_id", { length: 255 })
			.references(() => coupons.id, { onDelete: "cascade" })
			.notNull(),
		clienteId: varchar("cliente_id", { length: 255 })
			.references(() => clients.id, { onDelete: "cascade" })
			.notNull(),
		codigo: text("codigo"), // opcional: código único por atribuição (ex: gerado por campanha)
		origem: couponGrantOriginEnum("origem").notNull().default("MANUAL"),
		campanhaId: varchar("campanha_id", { length: 255 }).references(() => campaigns.id, { onDelete: "set null" }),
		quantidadeDisponivel: integer("quantidade_disponivel").notNull().default(1),
		expiracaoData: timestamp("expiracao_data"), // sobrepõe vigenciaFim do cupom
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
		dataAtualizacao: timestamp("data_atualizacao").$defaultFn(() => new Date()),
	},
	(table) => ({
		organizacaoClienteIdx: index("idx_coupon_grants_organizacao_cliente").on(table.organizacaoId, table.clienteId),
		cupomIdx: index("idx_coupon_grants_cupom").on(table.cupomId),
	}),
);
export const couponGrantsRelations = relations(couponGrants, ({ one, many }) => ({
	cupom: one(coupons, {
		fields: [couponGrants.cupomId],
		references: [coupons.id],
	}),
	cliente: one(clients, {
		fields: [couponGrants.clienteId],
		references: [clients.id],
	}),
	campanha: one(campaigns, {
		fields: [couponGrants.campanhaId],
		references: [campaigns.id],
	}),
	resgates: many(couponRedemptions),
}));

export type TCouponGrantEntity = typeof couponGrants.$inferSelect;
export type TNewCouponGrantEntity = typeof couponGrants.$inferInsert;

// -----------------------------------------------------------------------------
// COUPON REDEMPTIONS (ledger de uso — imutável; cancelamento vira status CANCELADO)
// -----------------------------------------------------------------------------
export const couponRedemptions = newTable(
	"coupon_redemptions",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		cupomId: varchar("cupom_id", { length: 255 })
			.references(() => coupons.id)
			.notNull(),
		atribuicaoId: varchar("atribuicao_id", { length: 255 }).references(() => couponGrants.id), // null quando cupom GLOBAL
		clienteId: varchar("cliente_id", { length: 255 }).references(() => clients.id, { onDelete: "set null" }),
		status: couponRedemptionStatusEnum("status").notNull().default("UTILIZADO"),

		// Contexto do uso
		vendaId: varchar("venda_id", { length: 255 }).references(() => sales.id), // null em resgate manual sem venda espelhada
		vendaValor: doublePrecision("venda_valor"), // valor de venda informado/apurado no momento
		valorDesconto: doublePrecision("valor_desconto").notNull(), // desconto efetivamente concedido

		// Snapshot (a definição do cupom pode mudar depois)
		cupomTitulo: text("cupom_titulo").notNull(),
		cupomCodigo: text("cupom_codigo").notNull(),
		beneficioSnapshot: jsonb("beneficio_snapshot"), // tipo/valor/alvos no momento do uso

		// Accountability
		origemResgate: couponRedemptionSourceEnum("origem_resgate").notNull(),
		operadorId: varchar("operador_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
		operadorVendedorId: varchar("operador_vendedor_id", { length: 255 }).references(() => sellers.id, { onDelete: "set null" }),
		metadados: jsonb("metadados"),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
		dataAtualizacao: timestamp("data_atualizacao").$defaultFn(() => new Date()),
	},
	(table) => ({
		organizacaoIdx: index("idx_coupon_redemptions_organizacao").on(table.organizacaoId),
		cupomStatusIdx: index("idx_coupon_redemptions_cupom_status").on(table.cupomId, table.status),
		cupomClienteStatusIdx: index("idx_coupon_redemptions_cupom_cliente_status").on(table.cupomId, table.clienteId, table.status),
		vendaIdx: index("idx_coupon_redemptions_venda").on(table.vendaId),
		clienteIdx: index("idx_coupon_redemptions_cliente").on(table.clienteId),
	}),
);
export const couponRedemptionsRelations = relations(couponRedemptions, ({ one }) => ({
	cupom: one(coupons, {
		fields: [couponRedemptions.cupomId],
		references: [coupons.id],
	}),
	atribuicao: one(couponGrants, {
		fields: [couponRedemptions.atribuicaoId],
		references: [couponGrants.id],
	}),
	cliente: one(clients, {
		fields: [couponRedemptions.clienteId],
		references: [clients.id],
	}),
	venda: one(sales, {
		fields: [couponRedemptions.vendaId],
		references: [sales.id],
	}),
	operador: one(users, {
		fields: [couponRedemptions.operadorId],
		references: [users.id],
	}),
	operadorVendedor: one(sellers, {
		fields: [couponRedemptions.operadorVendedorId],
		references: [sellers.id],
	}),
}));

export type TCouponRedemptionEntity = typeof couponRedemptions.$inferSelect;
export type TNewCouponRedemptionEntity = typeof couponRedemptions.$inferInsert;
