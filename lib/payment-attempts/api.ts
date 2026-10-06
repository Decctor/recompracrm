import type { Method } from "axios";
import { errorHandler } from "@/lib/app-api";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { PaymentTerminalError, type TPaymentTerminalErrorCode, isPaymentTerminalError } from "./errors";

type ApiMethodHandlers = {
	[key in Uppercase<Method>]?: (req: NextRequest) => Promise<NextResponse>;
};

// Códigos estáveis para erros que nascem fora do módulo (autenticação, scopes, validação Zod).
function codeForHttpStatus(status: number): TPaymentTerminalErrorCode {
	if (status === 401) return "UNAUTHENTICATED";
	if (status === 403) return "SCOPE_REQUIRED";
	if (status === 404) return "NOT_FOUND";
	if (status === 409) return "CONFLICT";
	return "VALIDATION_ERROR";
}

// Mesmo contrato do `appApiHandler`, mas o envelope de erro carrega `code`/`retryable`/`attemptId`
// (docs/04). Erros desconhecidos continuam passando pelo `errorHandler` comum: o cru nunca sai.
export function paymentTerminalApiHandler(handler: ApiMethodHandlers) {
	return async (req: NextRequest): Promise<NextResponse> => {
		try {
			const methodHandler = handler[req.method as keyof ApiMethodHandlers];
			if (methodHandler) return await methodHandler(req);
			throw new createHttpError.MethodNotAllowed(`O método ${req.method} não permitido para o caminho ${req.nextUrl.pathname}`);
		} catch (error) {
			if (isPaymentTerminalError(error)) {
				return NextResponse.json(error.toEnvelope(), { status: error.status });
			}
			if (createHttpError.isHttpError(error) && error.expose && error.statusCode < 500) {
				const mapped = new PaymentTerminalError(error.statusCode, codeForHttpStatus(error.statusCode), error.message);
				return NextResponse.json(mapped.toEnvelope(), { status: error.statusCode });
			}
			if (error instanceof ZodError) {
				const mapped = new PaymentTerminalError(400, "VALIDATION_ERROR", error.errors[0]?.message ?? "Dados inválidos.");
				return NextResponse.json(mapped.toEnvelope(), { status: 400 });
			}
			return errorHandler(error);
		}
	};
}

// Rotas dinâmicas deste módulo extraem o ID do pathname (padrão do repo para `appApiHandler`).
// URL: /api/payment-terminal/payment-attempts/{id}[/outcome] — `suffixSegments` conta os
// segmentos após o ID.
export function extractPaymentAttemptId(pathname: string, suffixSegments = 0) {
	const parts = pathname.split("/").filter(Boolean);
	const id = parts[parts.length - 1 - suffixSegments];
	if (!id) throw new PaymentTerminalError(400, "VALIDATION_ERROR", "ID da tentativa de pagamento não informado.");
	return decodeURIComponent(id);
}
