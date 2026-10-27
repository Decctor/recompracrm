import createHttpError from "http-errors";
import type { TFiscalProblem } from "./problems";

/**
 * Validation/readiness failures are safe and actionable for fiscal operators.
 * Making them exposed HTTP 400 errors keeps their message intact both in API
 * responses and when fiscal documents persist the failure through getErrorMessage.
 *
 * `problemas` carries the structured cause (codigo + alvo) so the document can
 * persist something the UI can turn into a button, not just a sentence.
 */
export class FiscalReadinessError extends createHttpError.BadRequest {
	problemas: TFiscalProblem[];

	constructor(message: string, problemas: TFiscalProblem[] = []) {
		super(message);
		this.name = "FiscalReadinessError";
		this.problemas = problemas;
	}
}

/**
 * `instanceof FiscalReadinessError` é sempre falso: o construtor dos erros do `http-errors`
 * devolve um objeto próprio (protótipo de `BadRequestError`), que substitui o `this` da subclasse.
 * O `name` atribuído no construtor sobrevive — é ele que identifica o erro.
 */
export function isFiscalReadinessError(error: unknown): error is FiscalReadinessError {
	return error instanceof Error && error.name === "FiscalReadinessError";
}

export class FiscalIntegrationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "FiscalIntegrationError";
	}
}
