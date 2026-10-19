import { authenticateExternalRequest, requireExternalScope } from "@/lib/access/authentication";
import { PaymentTerminalError, paymentTerminalApiHandler, receiveTerminalTabPayment } from "@/lib/payment-attempts";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Recebimento parcial da conta no terminal (dinheiro ou Pix), com Idempotency-Key obrigatório:
// repetir devolve o mesmo recebimento em vez de receber duas vezes.
const ReceiveTerminalTabPaymentInputSchema = z.object({
	tabId: z.string({ required_error: "Conta não informada.", invalid_type_error: "Tipo inválido para a conta." }),
	payment: z.object({
		metodo: z.enum(["DINHEIRO", "PIX"], { required_error: "Método não informado.", invalid_type_error: "Parcial no terminal é em dinheiro ou Pix." }),
		valor: z
			.number({ required_error: "Valor não informado.", invalid_type_error: "Tipo inválido para o valor." })
			.positive("O valor deve ser positivo."),
	}),
	pagadorNome: z.string({ invalid_type_error: "Tipo inválido para o nome de quem pagou." }).max(80).optional().nullable(),
	sessaoVendaId: z.string({ invalid_type_error: "Tipo inválido para o caixa." }).optional().nullable(),
});
export type TReceiveTerminalTabPaymentRouteInput = z.infer<typeof ReceiveTerminalTabPaymentInputSchema>;
export type { TReceiveTerminalTabPaymentOutput } from "@/lib/payment-attempts";

async function receiveTerminalTabPaymentRoute(request: NextRequest) {
	const actor = await authenticateExternalRequest(request);
	requireExternalScope(actor, "payment-terminal:sales:create");
	const idempotencyKey = request.headers.get("idempotency-key")?.trim();
	if (!idempotencyKey)
		throw new PaymentTerminalError(400, "IDEMPOTENCY_KEY_REQUIRED", "O cabeçalho Idempotency-Key é obrigatório para receber na conta.");
	const input = ReceiveTerminalTabPaymentInputSchema.parse(await request.json());
	const result = await receiveTerminalTabPayment({ organizationId: actor.organizationId, deviceId: actor.principalId, idempotencyKey, input });
	return NextResponse.json(result, { status: 201 });
}

export const POST = paymentTerminalApiHandler({ POST: receiveTerminalTabPaymentRoute });
