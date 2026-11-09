import { relations } from "drizzle-orm";
import { index, integer, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { newTable } from "./common";
import { dealIntervaloEnum, dealStatusEnum, stripeAccountEnum } from "./enums";
import { organizations } from "./organizations";
import { users } from "./users";

// Deals personalizados (vendas B2B fechadas pelo admin): uma única assinatura no Stripe
// cobre N licenças, onde cada licença = uma organização no app. O obtentor é o comprador
// do deal — organizações criadas por ele consomem licenças até quantidadeLicencas, sem
// passar por trial ou checkout próprio. O preço negociado vira um Price dedicado no
// Stripe (sobre o produto do plano base), cobrado com quantity = quantidadeLicencas.
export const deals = newTable(
	"deals",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		nome: text("nome").notNull(),
		descricao: text("descricao"),
		// Obtentor: dono das licenças. Pode ainda não ter conta no app — o vínculo é
		// reivindicado (claim) pelo emailObtentor na primeira criação de organização.
		usuarioObtentorId: varchar("usuario_obtentor_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
		nomeObtentor: text("nome_obtentor").notNull(),
		emailObtentor: text("email_obtentor").notNull(),
		telefoneObtentor: text("telefone_obtentor"),
		planoBase: text("plano_base").notNull(), // TAppSubscriptionPlanKey — define as capabilities das orgs do deal
		quantidadeLicencas: integer("quantidade_licencas").notNull(),
		valorUnitarioCentavos: integer("valor_unitario_centavos").notNull(),
		intervalo: dealIntervaloEnum("intervalo").notNull().default("MENSAL"),
		status: dealStatusEnum("status").notNull().default("PENDENTE"),
		// Stripe — assinatura única que cobre todas as licenças do deal. As orgs vinculadas
		// NÃO recebem estes IDs (só o status replicado): o customer/subscription pertence ao
		// comprador, e copiá-los quebraria o lookup do webhook e vazaria o billing portal.
		// Conta Stripe dona do customer, do price e da assinatura do deal. Nulo enquanto não há customer.
		stripeConta: stripeAccountEnum("stripe_conta"),
		stripePriceId: text("stripe_price_id"),
		stripeCustomerId: text("stripe_customer_id"),
		stripeSubscriptionId: text("stripe_subscription_id"),
		stripeCheckoutSessionId: text("stripe_checkout_session_id"),
		stripeSubscriptionStatus: text("stripe_subscription_status"),
		stripeSubscriptionStatusUltimaAlteracao: timestamp("stripe_subscription_status_ultima_alteracao"),
		autorId: varchar("autor_id", { length: 255 })
			.references(() => users.id)
			.notNull(),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		usuarioObtentorIdx: index("idx_deals_usuario_obtentor_id").on(table.usuarioObtentorId),
		emailObtentorIdx: index("idx_deals_email_obtentor").on(table.emailObtentor),
		stripeCustomerIdx: index("idx_deals_stripe_customer_id").on(table.stripeCustomerId),
		statusIdx: index("idx_deals_status").on(table.status),
	}),
);
export const dealsRelations = relations(deals, ({ one, many }) => ({
	obtentor: one(users, {
		fields: [deals.usuarioObtentorId],
		references: [users.id],
	}),
	autor: one(users, {
		fields: [deals.autorId],
		references: [users.id],
	}),
	organizacoes: many(organizations),
}));
export type TDealEntity = typeof deals.$inferSelect;
export type TNewDealEntity = typeof deals.$inferInsert;
