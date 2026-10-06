import type { TCampaignDispatchInterruptionReasonEnum } from "@/schemas/enums";
import { relations } from "drizzle-orm";
import { boolean, jsonb, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { newTable } from "./common";
import { whatsappConnectionTypeEnum } from "./enums";
import { organizations } from "./organizations";
import { users } from "./users";

export const whatsappConnections = newTable("whatsapp_connections", {
	id: varchar("id", { length: 255 })
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	organizacaoId: varchar("organizacao_id", { length: 255 })
		.references(() => organizations.id, { onDelete: "cascade" })
		.notNull(),
	// Connection type - defaults to META_CLOUD_API for backwards compatibility
	tipoConexao: whatsappConnectionTypeEnum("tipo_conexao").notNull().default("META_CLOUD_API"),
	// Meta Cloud API fields (nullable for Internal Gateway connections)
	token: text("token"),
	dataExpiracao: timestamp("data_expiracao"),
	metaEscopo: text("meta_escopo"),
	// Internal Gateway fields (nullable for Meta Cloud API connections)
	gatewaySessaoId: varchar("gateway_sessao_id", { length: 255 }),
	gatewayStatus: varchar("gateway_status", { length: 50 }), // disconnected, connecting, qr, connected
	gatewayUltimaConexao: timestamp("gateway_ultima_conexao"),
	// Common fields
	autorId: varchar("autor_id", { length: 255 })
		.references(() => users.id)
		.notNull(),
	dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
});
export const whatsappConnectionsRelations = relations(whatsappConnections, ({ one, many }) => ({
	telefones: many(whatsappConnectionPhones),
	organizacao: one(organizations, {
		fields: [whatsappConnections.organizacaoId],
		references: [organizations.id],
	}),
}));
export type TWhatsappConnection = typeof whatsappConnections.$inferSelect;
export type TNewWhatsappConnection = typeof whatsappConnections.$inferInsert;

export type TWhatsappConnectionPhonePaymentStatus = "DESCONHECIDO" | "CONFIRMADO_PELO_USUARIO" | "VERIFICADO" | "PENDENTE";

export type TWhatsappConnectionPhoneHealthStatus = "SAUDAVEL" | "FALHA";

export type TWhatsappConnectionPhoneMetadados = {
	// Saúde do acesso ao telefone na Meta (lib/whatsapp/connection-health.ts). Gravada pelo cron
	// `whatsapp-connections-health` e por webhooks `account_update`; ausência = nunca verificado.
	saude?: {
		status: TWhatsappConnectionPhoneHealthStatus;
		verificadoEm: string;
		// Primeira verificação que falhou na sequência atual; null quando saudável.
		falhandoDesde?: string | null;
		motivo?: string | null;
		mensagem?: string | null;
		// Último aviso por e-mail da sequência atual de falha — base do silêncio de lembretes.
		notificadoEm?: string | null;
	};
	// Estado de pagamento da conta Cloud API (ver WhatsappPaymentStatusEnum em schemas/enums.ts).
	// A Meta não expõe isso de forma confiável: o usuário confirma no onboarding, a primeira
	// entrega verifica, e o erro 131042 em webhooks de status rebaixa para PENDENTE.
	pagamento?: {
		status: TWhatsappConnectionPhonePaymentStatus;
		atualizadoEm: string;
		ultimoErroCodigo?: string | null;
	};
	// Erro da Meta que se repetiria em qualquer envio deste número (pagamento, conta restrita,
	// credencial, número indisponível). Enquanto presente, nenhum disparo de campanha sai pelo
	// número. Cai quando o usuário retoma um disparo interrompido por ele, ou quando a Meta
	// confirma a entrega de uma mensagem enviada depois do bloqueio
	// (lib/campaigns/dispatch/interruption.ts).
	bloqueioEnvio?: {
		motivo: TCampaignDispatchInterruptionReasonEnum;
		codigo: number | null;
		titulo: string | null;
		detalhes: string | null;
		bloqueadoEm: string;
	} | null;
	sincronizacaoSmbApp?: {
		dataLimiteRequisicao?: string | null;
		contacts?: {
			dataRequisicao?: string | null;
			requestId?: string | null;
		};
		historicoMensagens?: {
			dataRequisicao?: string | null;
			requestId?: string | null;
		};
	};
};

export const whatsappConnectionPhones = newTable("whatsapp_connection_phones", {
	id: varchar("id", { length: 255 })
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	conexaoId: varchar("conexao_id", { length: 255 })
		.references(() => whatsappConnections.id, { onDelete: "cascade" })
		.notNull(),
	nome: text("nome").notNull(),
	// Meta Cloud API fields (nullable for Internal Gateway connections)
	whatsappBusinessAccountId: varchar("whatsapp_business_account_id", { length: 255 }),
	whatsappTelefoneId: varchar("whatsapp_telefone_id", { length: 255 }),
	// Common fields
	numero: text("numero").notNull(),
	permitirAtendimentoIa: boolean("permitir_atendimento_ia").notNull().default(false),
	metadados: jsonb("metadados").$type<TWhatsappConnectionPhoneMetadados>(),
});
export const whatsappConnectionPhonesRelations = relations(whatsappConnectionPhones, ({ one }) => ({
	conexao: one(whatsappConnections, {
		fields: [whatsappConnectionPhones.conexaoId],
		references: [whatsappConnections.id],
	}),
}));

export type TWhatsappConnectionPhone = typeof whatsappConnectionPhones.$inferSelect;
export type TNewWhatsappConnectionPhone = typeof whatsappConnectionPhones.$inferInsert;
