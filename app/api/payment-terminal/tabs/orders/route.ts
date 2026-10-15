import { authenticateExternalRequest, requireExternalScope } from "@/lib/access/authentication";
import { launchTerminalTabOrder, paymentTerminalApiHandler } from "@/lib/payment-attempts";
import { TerminalSaleItemsInputSchema } from "@/schemas/payment-attempts";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Pedido na conta: itens no formato da venda do terminal, montados pelo servidor no canal
// COMANDA. `tabOrderId` é gerado no aparelho e torna o envio idempotente (repetir não lança de
// novo); o ticket de preparo sai como no painel.
const LaunchTerminalTabOrderInputSchema = z.object({
	tabId: z.string({ required_error: "Conta não informada.", invalid_type_error: "Tipo inválido para a conta." }),
	tabOrderId: z
		.string({ required_error: "Identificador do pedido não informado.", invalid_type_error: "Tipo inválido para o pedido." })
		.uuid("Identificador do pedido inválido."),
	observacoes: z.string({ invalid_type_error: "Tipo inválido para observações." }).max(500).optional().nullable(),
	itens: TerminalSaleItemsInputSchema.min(1, "Adicione itens ao pedido."),
});
export type TLaunchTerminalTabOrderRouteInput = z.infer<typeof LaunchTerminalTabOrderInputSchema>;

async function launchTerminalTabOrderRoute(request: NextRequest) {
	const actor = await authenticateExternalRequest(request);
	requireExternalScope(actor, "payment-terminal:sales:create");
	const input = LaunchTerminalTabOrderInputSchema.parse(await request.json());
	const result = await launchTerminalTabOrder({ organizationId: actor.organizationId, input });
	return NextResponse.json(
		{ data: result, message: result.deduplicado ? "Pedido já lançado." : `Pedido ${result.pedidoNumero} enviado.` },
		{ status: result.deduplicado ? 200 : 201 },
	);
}

export const POST = paymentTerminalApiHandler({ POST: launchTerminalTabOrderRoute });
