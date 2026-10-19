import { authenticateExternalRequest, requireExternalScope } from "@/lib/access/authentication";
import { paymentTerminalApiHandler, requestTerminalDiscountApproval } from "@/lib/payment-attempts";
import { TerminalSaleItemsInputSchema } from "@/schemas/payment-attempts";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Pedido de aprovação remota de desconto pela maquininha (scope payment-terminal:sales:create —
// pedir desconto é parte de vender). O servidor precifica os itens, avalia o desconto contra o
// teto do vendedor e, acima dele, abre a solicitação na fila de aprovações da plataforma, com o
// terminal como solicitante. Dentro do teto responde `approval: null`.
const RequestTerminalDiscountApprovalInputSchema = z.object({
	vendedorId: z.string({ invalid_type_error: "Tipo inválido para o vendedor." }).optional().nullable(),
	itens: TerminalSaleItemsInputSchema.min(1, "Adicione itens antes de pedir desconto."),
	descontosTotal: z
		.number({ required_error: "Desconto não informado.", invalid_type_error: "Tipo inválido para o desconto." })
		.positive("Informe o desconto antes de pedir aprovação."),
});
export type TRequestTerminalDiscountApprovalInput = z.infer<typeof RequestTerminalDiscountApprovalInputSchema>;
export type { TRequestTerminalDiscountApprovalOutput } from "@/lib/payment-attempts";

async function requestTerminalDiscountApprovalRoute(request: NextRequest) {
	const actor = await authenticateExternalRequest(request);
	requireExternalScope(actor, "payment-terminal:sales:create");
	const input = RequestTerminalDiscountApprovalInputSchema.parse(await request.json());
	const result = await requestTerminalDiscountApproval({ organizationId: actor.organizationId, deviceId: actor.principalId, input });
	return NextResponse.json(result, { status: result.data.approval ? 201 : 200 });
}

export const POST = paymentTerminalApiHandler({ POST: requestTerminalDiscountApprovalRoute });
