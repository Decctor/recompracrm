import assert from "node:assert/strict";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { buildWhatsappWindowOpenCondition } from "./inbox-filters";

const dialect = new PgDialect();

test("janela aberta aceita chats de conexão INTERNAL_GATEWAY, que não têm data de expiração", () => {
	const condition = buildWhatsappWindowOpenCondition(new Date("2026-09-25T15:00:00.000Z"));
	assert.ok(condition);
	const { sql: text, params } = dialect.sqlToQuery(condition);
	assert.match(text, /INTERNAL_GATEWAY/);
	assert.match(text, /"ampmais_whatsapp_connections"/);
	assert.match(text, /"ampmais_chats"\."whatsapp_janela_data_expiracao" >/);
	assert.match(text, / or /);
	assert.ok(params.some((param) => param instanceof Date || typeof param === "string"));
});
