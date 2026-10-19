import { authenticateExternalRequest, requireExternalScope } from "@/lib/access/authentication";
import { PaymentTerminalError, extractPaymentAttemptId, paymentTerminalApiHandler, reportPaymentAttemptEvidence } from "@/lib/payment-attempts";
import { PaymentAttemptEvidenceSchema } from "@/schemas/payment-attempts";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Evidência do terminal (docs/04 §2). O corpo não contém status interno: o backend deriva a
// transição. No caminho aprovado, persiste a aprovação e efetiva a transação pendente da venda;
// se a efetivação não terminar, responde 202 AGUARDAR_EFETIVACAO (resultado, não erro).
const ReportPaymentAttemptOutcomeInputSchema = z.object({
	evidence: PaymentAttemptEvidenceSchema,
});
export type TReportPaymentAttemptOutcomeInput = z.infer<typeof ReportPaymentAttemptOutcomeInputSchema>;
export type { TReportPaymentAttemptEvidenceOutput as TReportPaymentAttemptOutcomeOutput } from "@/lib/payment-attempts";

async function reportPaymentAttemptOutcomeRoute(request: NextRequest) {
	const actor = await authenticateExternalRequest(request);
	requireExternalScope(actor, "payment-terminal:attempts:complete");
	const attemptId = extractPaymentAttemptId(request.nextUrl.pathname, 1);

	const idempotencyKey = request.headers.get("idempotency-key")?.trim();
	if (!idempotencyKey) {
		throw new PaymentTerminalError(400, "IDEMPOTENCY_KEY_REQUIRED", "O cabeçalho Idempotency-Key é obrigatório para registrar o resultado.", { attemptId });
	}
	if (idempotencyKey.length > 255) {
		throw new PaymentTerminalError(400, "VALIDATION_ERROR", "O cabeçalho Idempotency-Key excede o tamanho permitido.", { attemptId });
	}

	const input = ReportPaymentAttemptOutcomeInputSchema.parse(await request.json());
	const { httpStatus, result } = await reportPaymentAttemptEvidence({
		organizationId: actor.organizationId,
		deviceId: actor.principalId,
		attemptId,
		idempotencyKey,
		evidence: input.evidence,
	});
	return NextResponse.json(result, { status: httpStatus });
}

export const POST = paymentTerminalApiHandler({ POST: reportPaymentAttemptOutcomeRoute });
