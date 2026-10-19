import { authenticateExternalRequest, requireExternalScope } from "@/lib/access/authentication";
import { PaymentTerminalError, cancelTerminalDiscountApproval, paymentTerminalApiHandler } from "@/lib/payment-attempts";
import { type NextRequest, NextResponse } from "next/server";

// O operador desistiu do pedido (tirou o desconto ou mudou a venda): sai da fila do gestor.
// Pedido já decidido não muda — a resposta traz o estado atual.
export type { TCancelTerminalDiscountApprovalOutput } from "@/lib/payment-attempts";

async function cancelTerminalDiscountApprovalRoute(request: NextRequest) {
	const actor = await authenticateExternalRequest(request);
	requireExternalScope(actor, "payment-terminal:sales:create");
	const approvalId = request.nextUrl.pathname.split("/").filter(Boolean).at(-2);
	if (!approvalId) throw new PaymentTerminalError(400, "VALIDATION_ERROR", "Pedido de aprovação não informado.");
	return NextResponse.json(
		await cancelTerminalDiscountApproval({
			organizationId: actor.organizationId,
			deviceId: actor.principalId,
			approvalId: decodeURIComponent(approvalId),
		}),
	);
}

export const POST = paymentTerminalApiHandler({ POST: cancelTerminalDiscountApprovalRoute });
