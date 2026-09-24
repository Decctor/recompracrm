import assert from "node:assert/strict";
import test from "node:test";
import {
	buildRewardSnapshotsMetadataKeys,
	normalizeRewardRedemptionLines,
	parseSaleRewardDraftSnapshots,
	resolveRewardRedemptionLinesInput,
	sumRewardRedemptionSaleValue,
	sumRewardRedemptionValue,
} from "./sale-reward-snapshot";

const snapshotA = { recompensaId: "premio-a", programaId: "prog-1", titulo: "Café", valor: 50, valorVenda: 8, quantidade: 2 };
const snapshotB = { recompensaId: "premio-b", programaId: "prog-1", titulo: "Bolo", valor: 120, valorVenda: 15, quantidade: 1 };

test("lê o formato atual (recompensas[]) na raiz do rascunho do PDV", () => {
	const parsed = parseSaleRewardDraftSnapshots({ cupom: null, recompensas: [snapshotA, snapshotB] });
	assert.deepEqual(parsed, [snapshotA, snapshotB]);
});

test("lê o formato atual dentro de shop (pedido da loja confirmado no PDV)", () => {
	const parsed = parseSaleRewardDraftSnapshots({ shop: { origem: "SHOP", recompensas: [snapshotB] } });
	assert.deepEqual(parsed, [snapshotB]);
});

test("converte o formato legado (recompensa objeto) em uma linha de quantidade 1", () => {
	const legacy = { recompensaId: "premio-a", programaId: "prog-1", titulo: "Café", valor: 50, valorVenda: 8 };
	assert.deepEqual(parseSaleRewardDraftSnapshots({ recompensa: legacy }), [{ ...legacy, quantidade: 1 }]);
	assert.deepEqual(parseSaleRewardDraftSnapshots({ shop: { recompensa: legacy } }), [{ ...legacy, quantidade: 1 }]);
});

test("formato atual tem precedência sobre o legado, e lista vazia não cai no legado", () => {
	const legacy = { recompensaId: "premio-x", programaId: "prog-1", titulo: "Velho", valor: 1, valorVenda: 1 };
	assert.deepEqual(parseSaleRewardDraftSnapshots({ recompensas: [snapshotA], recompensa: legacy }), [snapshotA]);
	// `recompensas: []` é a forma de um PUT limpar o resgate; o objeto legado não pode ressuscitá-lo.
	assert.deepEqual(parseSaleRewardDraftSnapshots({ recompensas: [], recompensa: legacy }), []);
});

test("as chaves gravadas apagam o legado", () => {
	assert.deepEqual(buildRewardSnapshotsMetadataKeys([snapshotA]), { recompensas: [snapshotA], recompensa: null });
});

test("ignora lixo e quantidades inválidas", () => {
	assert.deepEqual(parseSaleRewardDraftSnapshots(null), []);
	assert.deepEqual(parseSaleRewardDraftSnapshots("x"), []);
	assert.deepEqual(parseSaleRewardDraftSnapshots({ recompensas: [{ recompensaId: 1 }, null, { ...snapshotA, quantidade: 0 }] }), [
		{ ...snapshotA, quantidade: 1 },
	]);
});

test("tri-estado da entrada: plural vence, singular é compatível, ausência não altera", () => {
	assert.equal(resolveRewardRedemptionLinesInput({}), undefined);
	assert.deepEqual(resolveRewardRedemptionLinesInput({ recompensasResgate: null }), []);
	assert.deepEqual(resolveRewardRedemptionLinesInput({ recompensaResgate: null }), []);
	assert.deepEqual(resolveRewardRedemptionLinesInput({ recompensaResgate: { recompensaId: "a" } }), [{ recompensaId: "a" }]);
	assert.deepEqual(resolveRewardRedemptionLinesInput({ recompensasResgate: [{ recompensaId: "b" }], recompensaResgate: { recompensaId: "a" } }), [
		{ recompensaId: "b" },
	]);
});

test("normaliza linhas: quantidade padrão 1, ids únicos, um programa", () => {
	const ok = normalizeRewardRedemptionLines([{ recompensaId: "a" }, { recompensaId: "b", programaId: "p", quantidade: 3 }]);
	assert.equal(ok.erro, null);
	assert.deepEqual(ok.linhas, [
		{ recompensaId: "a", programaId: null, quantidade: 1 },
		{ recompensaId: "b", programaId: "p", quantidade: 3 },
	]);

	assert.match(normalizeRewardRedemptionLines([{ recompensaId: "a" }, { recompensaId: "a" }]).erro ?? "", /mais de uma vez/);
	assert.match(normalizeRewardRedemptionLines([{ recompensaId: "a", quantidade: 0 }]).erro ?? "", /Quantidade/);
	assert.match(normalizeRewardRedemptionLines([{ recompensaId: "a", quantidade: 1.5 }]).erro ?? "", /Quantidade/);
	assert.match(normalizeRewardRedemptionLines([{ recompensaId: "a", programaId: "p1" }, { recompensaId: "b", programaId: "p2" }]).erro ?? "", /mesmo programa/);
});

test("soma débito e valor comercial multiplicando pela quantidade", () => {
	assert.equal(sumRewardRedemptionValue([snapshotA, snapshotB]), 2 * 50 + 120);
	assert.equal(sumRewardRedemptionSaleValue([snapshotA, snapshotB]), 2 * 8 + 15);
	assert.equal(sumRewardRedemptionValue([]), 0);
});
