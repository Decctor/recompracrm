import assert from "node:assert/strict";
import test from "node:test";
import { isDateOnlyTimestamp, resolveSettlementAuditOnWrite } from "./settlement-audit";

const paidAt = new Date("2026-11-04T19:43:00.000Z");

test("transacao nova ja paga nasce IMEDIATA com o autor do lancamento", () => {
	assert.deepEqual(resolveSettlementAuditOnWrite({ isNew: true, nextDataEfetivacao: paidAt, authorId: "u1" }), {
		efetivacaoAutorId: "u1",
		efetivacaoOrigem: "IMEDIATA",
	});
});

test("transacao nova pendente nao tem auditoria", () => {
	assert.deepEqual(resolveSettlementAuditOnWrite({ isNew: true, nextDataEfetivacao: null, authorId: "u1" }), {
		efetivacaoAutorId: null,
		efetivacaoOrigem: null,
	});
});

test("pendente que passa a paga e MANUAL por quem salvou", () => {
	assert.deepEqual(resolveSettlementAuditOnWrite({ isNew: false, previousDataEfetivacao: null, nextDataEfetivacao: paidAt, authorId: "u2" }), {
		efetivacaoAutorId: "u2",
		efetivacaoOrigem: "MANUAL",
	});
});

test("ajustar a data de uma transacao ja paga nao troca quem efetivou", () => {
	assert.deepEqual(
		resolveSettlementAuditOnWrite({ isNew: false, previousDataEfetivacao: paidAt, nextDataEfetivacao: new Date(), authorId: "u3" }),
		{},
	);
});

test("paga que volta a pendente limpa a auditoria", () => {
	assert.deepEqual(resolveSettlementAuditOnWrite({ isNew: false, previousDataEfetivacao: paidAt, nextDataEfetivacao: null, authorId: "u3" }), {
		efetivacaoAutorId: null,
		efetivacaoOrigem: null,
	});
});

test("horarios cravados de data digitada contam como so data", () => {
	assert.equal(isDateOnlyTimestamp(new Date("2026-11-04T12:00:00.000Z")), true);
	assert.equal(isDateOnlyTimestamp(new Date("2026-11-04T00:00:00.000Z")), true);
	assert.equal(isDateOnlyTimestamp(new Date("2026-11-04T03:00:00.000Z")), true);
	assert.equal(isDateOnlyTimestamp("2026-11-04T22:38:09.868Z"), false);
	assert.equal(isDateOnlyTimestamp(new Date("2026-11-04T12:00:00.001Z")), false);
});
