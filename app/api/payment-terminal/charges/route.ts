import { authenticateExternalRequest, requireExternalScope } from "@/lib/access/authentication";
import { buildChargeView, listOpenPaymentAttemptsForDevice, paymentTerminalApiHandler } from "@/lib/payment-attempts";
import { type NextRequest, NextResponse } from "next/server";

// Cobranças atribuídas ao terminal autenticado (recompracrm-pos-android/docs/04 §1). O terminal
// não cria tentativas no marco 1: lista, executa somente quando `nextAction=EXECUTAR` e reporta.
// Organização e dispositivo vêm da credencial; nunca da query.
async function listAssignedCharges({ organizationId, deviceId }: { organizationId: string; deviceId: string }) {
	const now = new Date();
	const attempts = await listOpenPaymentAttemptsForDevice({ organizationId, deviceId });
	return {
		data: { charges: attempts.map((attempt) => buildChargeView(attempt, now)) },
		message: "Cobranças atribuídas listadas com sucesso.",
	};
}
export type TListPaymentTerminalChargesOutput = Awaited<ReturnType<typeof listAssignedCharges>>;

async function listAssignedChargesRoute(request: NextRequest) {
	const actor = await authenticateExternalRequest(request);
	requireExternalScope(actor, "payment-terminal:charges:read");
	const result = await listAssignedCharges({ organizationId: actor.organizationId, deviceId: actor.principalId });
	return NextResponse.json(result);
}

export const GET = paymentTerminalApiHandler({ GET: listAssignedChargesRoute });
