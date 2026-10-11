import type { TActionApprovalConsumption, TActionApprovalPayload, TActionApprovalSummary } from "@/schemas/action-approvals";
import { relations } from "drizzle-orm";
import { index, jsonb, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { accessPrincipals } from "./access";
import { newTable } from "./common";
import { actionApprovalDecisionMethodEnum, actionApprovalStatusEnum } from "./enums";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * Primitivo genérico de aprovação de ações. Desconto de venda (`tipo = "VENDA_DESCONTO"`) é o
 * primeiro caso; novos cenários entram via payload jsonb discriminado por `tipo` (varchar
 * deliberadamente) sem migração de enum. A própria linha é o registro de
 * auditoria — inclusive no fluxo síncrono por PIN, em que nasce e é decidida no mesmo request.
 */
export const actionApprovalRequests = newTable(
	"action_approval_requests",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),

		// Classificação
		tipo: varchar("tipo", { length: 100 }).notNull(),
		status: actionApprovalStatusEnum("status").notNull().default("PENDENTE"),

		// Conteúdo
		payload: jsonb("payload").$type<TActionApprovalPayload>().notNull(),
		resumo: jsonb("resumo").$type<TActionApprovalSummary>().notNull(),

		// Atores. O solicitante é um usuário (PDV web) ou um dispositivo (a maquininha, que vende sem
		// sessão humana) — exatamente um dos dois. Aprovação pedida por dispositivo só é consumida
		// por ele (lib/sales/sale-discount-authorization.ts).
		solicitanteId: varchar("solicitante_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
		solicitanteDispositivoId: varchar("solicitante_dispositivo_id", { length: 255 }).references(() => accessPrincipals.id, { onDelete: "set null" }),
		decididaPorId: varchar("decidida_por_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
		metodoDecisao: actionApprovalDecisionMethodEnum("metodo_decisao"),
		motivoDecisao: text("motivo_decisao"),

		// Ciclo de vida
		dataDecisao: timestamp("data_decisao"),
		dataExpiracao: timestamp("data_expiracao"),
		dataConsumo: timestamp("data_consumo"),
		consumo: jsonb("consumo").$type<TActionApprovalConsumption>(),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => [
		index("idx_action_approval_requests_org_status").on(table.organizacaoId, table.status),
		index("idx_action_approval_requests_data_insercao").on(table.dataInsercao),
	],
);

export const actionApprovalRequestsRelations = relations(actionApprovalRequests, ({ one }) => ({
	organizacao: one(organizations, {
		fields: [actionApprovalRequests.organizacaoId],
		references: [organizations.id],
	}),
	solicitante: one(users, {
		fields: [actionApprovalRequests.solicitanteId],
		references: [users.id],
		relationName: "solicitante",
	}),
	solicitanteDispositivo: one(accessPrincipals, {
		fields: [actionApprovalRequests.solicitanteDispositivoId],
		references: [accessPrincipals.id],
	}),
	decididaPor: one(users, {
		fields: [actionApprovalRequests.decididaPorId],
		references: [users.id],
		relationName: "decididaPor",
	}),
}));

export type TActionApprovalRequestEntity = typeof actionApprovalRequests.$inferSelect;
export type TNewActionApprovalRequestEntity = typeof actionApprovalRequests.$inferInsert;
