import { authenticateExternalRequest, requireExternalScope } from "@/lib/access/authentication";
import { PaymentTerminalError, getTerminalTabDetails, paymentTerminalApiHandler } from "@/lib/payment-attempts";
import { type NextRequest, NextResponse } from "next/server";

// Uma conta com os pedidos (itens e adicionais), os parciais e o saldo.
export type { TTerminalTabDetails } from "@/lib/payment-attempts";

async function getTerminalTabRoute(request: NextRequest) {
	const actor = await authenticateExternalRequest(request);
	requireExternalScope(actor, "payment-terminal:sales:create");
	const tabId = request.nextUrl.pathname.split("/").filter(Boolean).at(-1);
	if (!tabId) throw new PaymentTerminalError(400, "VALIDATION_ERROR", "Conta não informada.");
	const conta = await getTerminalTabDetails({ organizationId: actor.organizationId, tabId: decodeURIComponent(tabId) });
	return NextResponse.json({ data: { conta }, message: "Conta carregada." });
}

export const GET = paymentTerminalApiHandler({ GET: getTerminalTabRoute });
