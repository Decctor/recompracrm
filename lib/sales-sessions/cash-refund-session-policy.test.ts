import assert from "node:assert/strict";
import test from "node:test";
import { pickCashRefundSession } from "./cash-refund-session-policy";

test("nothing to refund in cash moves no drawer", () => {
	assert.equal(pickCashRefundSession({ cashToRefund: 0, originSessionIds: ["s1"], openSessionIds: ["s1"] }), null);
});

test("cash that never entered a controlled drawer moves no drawer", () => {
	assert.equal(pickCashRefundSession({ cashToRefund: 104, originSessionIds: [], openSessionIds: ["s1", "s2"] }), null);
});

test("the drawer chosen by the operator wins, even over the origin session", () => {
	assert.deepEqual(
		pickCashRefundSession({ cashToRefund: 104, requestedSessionId: "s2", originSessionIds: ["s1"], openSessionIds: ["s1", "s2"] }),
		{ sessaoVendaId: "s2" },
	);
});

test("a chosen drawer that is no longer open is refused, never silently skipped", () => {
	assert.throws(() => pickCashRefundSession({ cashToRefund: 104, requestedSessionId: "closed", originSessionIds: ["s1"], openSessionIds: ["s1"] }));
});

test("cancelling within the same shift refunds through the origin session", () => {
	assert.deepEqual(pickCashRefundSession({ cashToRefund: 104, originSessionIds: ["s1"], openSessionIds: ["s1", "s2"] }), { sessaoVendaId: "s1" });
});

test("a closed origin session falls back to the only open drawer", () => {
	assert.deepEqual(pickCashRefundSession({ cashToRefund: 104, originSessionIds: ["yesterday"], openSessionIds: ["today"] }), {
		sessaoVendaId: "today",
	});
});

test("a closed origin session with no open drawer is refused", () => {
	assert.throws(() => pickCashRefundSession({ cashToRefund: 104, originSessionIds: ["yesterday"], openSessionIds: [] }), /Abra um caixa/);
});

test("a closed origin session with several open drawers asks for a choice", () => {
	assert.throws(
		() => pickCashRefundSession({ cashToRefund: 104, originSessionIds: ["yesterday"], openSessionIds: ["a", "b"] }),
		/Escolha o caixa/,
	);
});
