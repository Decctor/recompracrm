// Erros da API do terminal (recompracrm-pos-android/docs/04 "Erros"): o app não interpreta
// mensagens, só o `code` estável e `retryable`. Depois que a adquirente pode ter recebido o
// comando, falha/timeout nunca é genericamente `retryable=true` para a cobrança.
export type TPaymentTerminalErrorCode =
	| "UNAUTHENTICATED"
	| "SCOPE_REQUIRED"
	| "VALIDATION_ERROR"
	| "NOT_FOUND"
	| "CONFLICT"
	| "IDEMPOTENCY_KEY_REQUIRED"
	| "IDEMPOTENCY_KEY_REUSED"
	| "PAYMENT_ATTEMPT_NOT_FOUND"
	| "PAYMENT_ATTEMPT_INVALID_TRANSITION"
	| "PAYMENT_ATTEMPT_UNCERTAIN"
	| "ACTIVE_PAYMENT_ATTEMPT_EXISTS"
	| "PAYMENT_RESULT_MISMATCH"
	| "UNSUPPORTED_PAYMENT_OPERATION";

export class PaymentTerminalError extends Error {
	readonly status: number;
	readonly code: TPaymentTerminalErrorCode;
	readonly retryable: boolean;
	readonly attemptId: string | null;
	// Compatível com `createHttpError.isHttpError`-style handling: o erro é seguro de expor.
	readonly expose = true;

	constructor(
		status: number,
		code: TPaymentTerminalErrorCode,
		message: string,
		options: { retryable?: boolean; attemptId?: string | null } = {},
	) {
		super(message);
		this.name = "PaymentTerminalError";
		this.status = status;
		this.code = code;
		this.retryable = options.retryable ?? false;
		this.attemptId = options.attemptId ?? null;
	}

	get statusCode() {
		return this.status;
	}

	toEnvelope() {
		return {
			error: {
				code: this.code,
				message: this.message,
				retryable: this.retryable,
				...(this.attemptId ? { attemptId: this.attemptId } : {}),
			},
		};
	}
}

export function isPaymentTerminalError(error: unknown): error is PaymentTerminalError {
	return error instanceof PaymentTerminalError;
}
