import assert from "node:assert/strict";
import { test } from "node:test";
import createHttpError from "http-errors";
import { FiscalReadinessError, isFiscalReadinessError } from "./errors";

test("reconhece FiscalReadinessError, que instanceof não reconhece", () => {
	const error = new FiscalReadinessError("Vincule um cliente com CPF ou CNPJ válido para emitir esta nota.");
	assert.equal(isFiscalReadinessError(error), true);
});

test("outros erros não são pendência de cadastro", () => {
	assert.equal(isFiscalReadinessError(new createHttpError.BadRequest("x")), false);
	assert.equal(isFiscalReadinessError(new Error("x")), false);
	assert.equal(isFiscalReadinessError({ name: "FiscalReadinessError" }), false);
});
