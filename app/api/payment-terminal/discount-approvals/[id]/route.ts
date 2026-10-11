import { authenticateExternalRequest, requireExternalScope } from "@/lib/access/authentication";
import { PaymentTerminalError, getTerminalDiscountApproval, paymentTerminalApiHandler } from "@/lib/payment-attempts";
import { type NextRequest, NextResponse } from "next/server";

// Acompanhamento do pedido de aprovação de desconto: o app consulta enquanto o gestor decide.
// Só o terminal que pediu enxerga o pedido.
export type { TGetTerminalDiscountApprovalOutput } from "@/lib/payment-attempts";

async function getTerminalDiscountApprovalRoute(request: NextRequest) {
	const actor = await authenticateExternalRequest(request);
	requireExternalScope(actor, "payment-terminal:sales:create");
	const approvalId = request.nextUrl.pathname.split("/").filter(Boolean).at(-1);
	if (!approvalId) throw new PaymentTerminalError(400, "VALIDATION_ERROR", "Pedido de aprovação não informado.");
	return NextResponse.json(
		await getTerminalDiscountApproval({
			organizationId: actor.organizationId,
			deviceId: actor.principalId,
			approvalId: decodeURIComponent(approvalId),
		}),
	);
}

export const GET = paymentTerminalApiHandler({ GET: getTerminalDiscountApprovalRoute });
