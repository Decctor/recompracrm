import assert from "node:assert/strict";
import { test } from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { DBTransaction } from "@/services/drizzle";
import { applyAddOnChannelSettings } from "./add-on-channel-settings";

function transactionStub({ channels = [{ id: "channel", canal: "POS" }], optionIds = ["option", "other"], groupExists = true } = {}) {
	const inserted: Record<string, unknown>[] = [];
	const deleted: SQL[] = [];
	const tx = {
		query: { productAddOns: { findFirst: async () => (groupExists ? { id: "group", opcoes: optionIds.map((id) => ({ id })) } : undefined) } },
		select: () => ({ from: () => ({ where: async () => channels }) }),
		insert: () => ({
			values: (values: Record<string, unknown>[]) => ({
				onConflictDoUpdate: async () => {
					inserted.push(...values);
				},
			}),
		}),
		delete: () => ({
			where: async (where: SQL) => {
				deleted.push(where);
			},
		}),
	} as unknown as DBTransaction;
	return { tx, inserted, deleted };
}

const setting = { canalVendaId: "channel", produtoAddOnOpcaoId: "option", precoDelta: 8, disponivel: null };

test("patch valida duplicatas, canal e opção antes de gravar na transação do grupo", async () => {
	for (const settings of [[setting, setting], [{ ...setting, canalVendaId: "foreign" }], [{ ...setting, produtoAddOnOpcaoId: "removed" }]]) {
		const stub = transactionStub();
		await assert.rejects(applyAddOnChannelSettings({ tx: stub.tx, orgId: "org", produtoAddOnId: "group", settings }), { statusCode: 400 });
		assert.equal(stub.inserted.length, 0);
		assert.equal(stub.deleted.length, 0);
	}
});

test("grupo ausente aborta o patch", async () => {
	const stub = transactionStub({ groupExists: false });
	await assert.rejects(applyAddOnChannelSettings({ tx: stub.tx, orgId: "org", produtoAddOnId: "group", settings: [setting] }), { statusCode: 404 });
});

test("clear de múltiplos nós mantém organização e pares canal/opção no filtro", async () => {
	const stub = transactionStub({
		channels: [
			{ id: "channel", canal: "POS" },
			{ id: "shop", canal: "SHOP" },
		],
	});
	await applyAddOnChannelSettings({
		tx: stub.tx,
		orgId: "org",
		produtoAddOnId: "group",
		settings: [
			{ ...setting, precoDelta: null, disponivel: true },
			{ ...setting, canalVendaId: "shop", produtoAddOnOpcaoId: "other", precoDelta: null },
		],
	});
	const compiled = new PgDialect().sqlToQuery(stub.deleted[0]);
	assert.deepEqual(compiled.params, ["org", "channel", "option", "shop", "other"]);
	assert.match(
		compiled.sql,
		/organizacao_id.* and .*canal_venda_id.* and .*produto_add_on_opcao_id.* or .*canal_venda_id.* and .*produto_add_on_opcao_id/,
	);
	assert.equal(stub.inserted.length, 0);
});

test("zero é override, true herda e apenas canal iFood tocado solicita push", async () => {
	const stub = transactionStub({ channels: [{ id: "channel", canal: "IFOOD" }] });
	const result = await applyAddOnChannelSettings({
		tx: stub.tx,
		orgId: "org",
		produtoAddOnId: "group",
		settings: [{ ...setting, precoDelta: 0, disponivel: true }],
	});
	assert.deepEqual(stub.inserted, [{ organizacaoId: "org", canalVendaId: "channel", produtoAddOnOpcaoId: "option", precoDelta: 0, disponivel: null }]);
	assert.equal(result.touchedIfood, true);
	const internal = transactionStub();
	assert.equal((await applyAddOnChannelSettings({ tx: internal.tx, orgId: "org", produtoAddOnId: "group", settings: [setting] })).touchedIfood, false);
});
