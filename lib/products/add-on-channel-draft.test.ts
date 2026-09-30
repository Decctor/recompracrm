import assert from "node:assert/strict";
import { test } from "node:test";
import { rebaseAddOnChannelDraft } from "./add-on-channel-draft";

test("refetch preserva preço e pausa locais, atualizando apenas células intactas", () => {
	const baseline = { edited: { precoDelta: 5, disponivel: null }, intact: { precoDelta: 4, disponivel: null } };
	const draft = { ...baseline, edited: { precoDelta: 8, disponivel: false } };
	const incoming = { edited: { precoDelta: 6, disponivel: null }, intact: { precoDelta: 7, disponivel: null } };
	assert.deepEqual(rebaseAddOnChannelDraft(baseline, draft, incoming), { edited: draft.edited, intact: incoming.intact });
	assert.equal(baseline.edited.precoDelta, 5);
});

test("voltar a herdar é uma edição que sobrevive ao refetch", () => {
	const baseline = { cell: { precoDelta: 8, disponivel: false } };
	const draft = { cell: { precoDelta: null, disponivel: null } };
	assert.deepEqual(rebaseAddOnChannelDraft(baseline, draft, baseline), draft);
});

test("células novas e remoções remotas entram no rascunho sem reintroduzir overrides intactos", () => {
	const baseline = { removed: { precoDelta: 8, disponivel: null } };
	const incoming = { added: { precoDelta: 0, disponivel: false } };
	assert.deepEqual(rebaseAddOnChannelDraft(baseline, baseline, incoming), incoming);
});
