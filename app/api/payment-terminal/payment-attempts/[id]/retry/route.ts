import { authenticateExternalRequest, requireExternalScope } from "@/lib/access/authentication";
import { PaymentTerminalError, extractPaymentAttemptId, paymentTerminalApiHandler, retryPaymentAttemptFromDevice } from "@/lib/payment-attempts";
import { type NextRequest, NextResponse } from "next/server";

// "Tentar de novo" depois de uma cobrança não aprovada (Idempotency-Key obrigatório): nova
// tentativa para o mesmo pagamento pendente, atribuída a este dispositivo. Responde a cobrança
// nova no formato da listagem (docs/04 §1), pronta para executar.
async function retryPaymentAttemptRoute(request: NextRequest) {
	const actor = await authenticateExternalRequest(request);
	requireExternalScope(actor, "payment-terminal:attempts:complete");
	const idempotencyKey = request.headers.get("idempotency-key")?.trim();
	if (!idempotencyKey)
		throw new PaymentTerminalError(400, "IDEMPOTENCY_KEY_REQUIRED", "O cabeçalho Idempotency-Key é obrigatório para cobrar de novo.");
	if (idempotencyKey.length > 255) throw new PaymentTerminalError(400, "VALIDATION_ERROR", "O cabeçalho Idempotency-Key excede o tamanho permitido.");
	const attemptId = extractPaymentAttemptId(request.nextUrl.pathname, 1);
	const charge = await retryPaymentAttemptFromDevice({ organizationId: actor.organizationId, deviceId: actor.principalId, attemptId, idempotencyKey });
	return NextResponse.json({ data: { charge }, message: "Nova cobrança pronta no terminal." }, { status: 201 });
}

export const POST = paymentTerminalApiHandler({ POST: retryPaymentAttemptRoute });
