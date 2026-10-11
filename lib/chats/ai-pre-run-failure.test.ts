import assert from "node:assert/strict";
import test from "node:test";
import { AgentDailyRunLimitError, AgentInactiveError, AgentSpendLimitError, AgentToolExecutionError } from "@/lib/ai/shared/errors";
import { isPreRunAgentError, shouldReleaseAfterPreRunFailure } from "./ai-pre-run-failure";

test("erros de pré-execução liberam quando o claim foi novo", () => {
	for (const error of [new AgentDailyRunLimitError("limite"), new AgentSpendLimitError("gasto"), new AgentInactiveError("pausado")]) {
		assert.equal(shouldReleaseAfterPreRunFailure({ freshClaim: true, error }), true, error.name);
	}
});

test("não libera um episódio que o agente já conduzia", () => {
	assert.equal(shouldReleaseAfterPreRunFailure({ freshClaim: false, error: new AgentDailyRunLimitError("limite") }), false);
});

test("não libera por falha de execução ou erro desconhecido", () => {
	assert.equal(shouldReleaseAfterPreRunFailure({ freshClaim: true, error: new AgentToolExecutionError("ferramenta") }), false);
	assert.equal(shouldReleaseAfterPreRunFailure({ freshClaim: true, error: new Error("boom") }), false);
	assert.equal(shouldReleaseAfterPreRunFailure({ freshClaim: true, error: "texto" }), false);
	assert.equal(isPreRunAgentError(null), false);
});
