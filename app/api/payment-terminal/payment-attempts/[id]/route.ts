import { authenticateExternalRequest, requireExternalScope } from "@/lib/access/authentication";
import { buildAttemptStatusView, consumeApprovedPaymentAttempt, extractPaymentAttemptId, findPaymentAttemptForDevice, paymentTerminalApiHandler } from "@/lib/payment-attempts";
import { type NextRequest, NextResponse } from "next/server";

// Consulta/retomada de uma tentativa (docs/04 §3). Consultar uma aprovação ainda não efetivada
// retoma a efetivação — nunca reabre a adquirente.
async function getPaymentAttempt({ organizationId, deviceId, attemptId }: { organizationId: string; deviceId: string; attemptId: string }) {
	let attempt = await findPaymentAttemptForDevice({ organizationId, deviceId, attemptId });
	if (attempt.status === "APROVADA_EFETIVACAO_PENDENTE") {
		try {
			await consumeApprovedPaymentAttempt({ organizationId, paymentAttemptId: attemptId, principalId: deviceId });
			attempt = await findPaymentAttemptForDevice({ organizationId, deviceId, attemptId });
		} catch (error) {
			console.error("[payment-attempts] retomada da efetivação falhou", { attemptId, error: error instanceof Error ? error.message : String(error) });
		}
	}
	const view = buildAttemptStatusView(attempt);
	return {
		httpStatus: view.nextAction === "AGUARDAR_EFETIVACAO" ? 202 : 200,
		result: { data: view, message: "Tentativa de pagamento consultada com sucesso." },
	};
}
export type TGetPaymentTerminalAttemptOutput = Awaited<ReturnType<typeof getPaymentAttempt>>["result"];

async function getPaymentAttemptRoute(request: NextRequest) {
	const actor = await authenticateExternalRequest(request);
	requireExternalScope(actor, "payment-terminal:attempts:read");
	const attemptId = extractPaymentAttemptId(request.nextUrl.pathname);
	const { httpStatus, result } = await getPaymentAttempt({ organizationId: actor.organizationId, deviceId: actor.principalId, attemptId });
	return NextResponse.json(result, { status: httpStatus });
}

export const GET = paymentTerminalApiHandler({ GET: getPaymentAttemptRoute });
