import { authenticateExternalRequest, requireExternalScope } from "@/lib/access/authentication";
import { PaymentTerminalError, buildTerminalCartItems, loadTerminalClientBenefits, paymentTerminalApiHandler } from "@/lib/payment-attempts";
import { TerminalSaleItemsInputSchema } from "@/schemas/payment-attempts";
import { db } from "@/services/drizzle";
import { clients } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Benefícios do cliente para o carrinho do terminal (scope payment-terminal:clients:read): saldo e
// regra de cashback, cupons avaliados nos itens precificados pelo servidor e recompensas. POST (e
// não GET) porque leva o carrinho. É a prévia: a criação da venda decide de novo com as mesmas
// funções e recusa um benefício que deixou de valer.
const GetTerminalClientBenefitsInputSchema = z.object({
	clienteId: z.string({ required_error: "Cliente não informado.", invalid_type_error: "Tipo inválido para o cliente." }),
	itens: TerminalSaleItemsInputSchema,
});
export type TGetTerminalClientBenefitsInput = z.infer<typeof GetTerminalClientBenefitsInputSchema>;

async function getTerminalClientBenefits({ input, organizationId }: { input: TGetTerminalClientBenefitsInput; organizationId: string }) {
	const client = await db.query.clients.findFirst({
		where: and(eq(clients.id, input.clienteId), eq(clients.organizacaoId, organizationId)),
		columns: { id: true },
	});
	if (!client) throw new PaymentTerminalError(404, "NOT_FOUND", "Cliente não encontrado nesta organização.");
	const itens = await buildTerminalCartItems({ organizationId, itens: input.itens });
	const benefits = await loadTerminalClientBenefits({ organizationId, clienteId: client.id, itens });
	return { data: benefits, message: "Benefícios do cliente carregados." };
}
export type TGetTerminalClientBenefitsOutput = Awaited<ReturnType<typeof getTerminalClientBenefits>>;

async function getTerminalClientBenefitsRoute(request: NextRequest) {
	const actor = await authenticateExternalRequest(request);
	requireExternalScope(actor, "payment-terminal:clients:read");
	const input = GetTerminalClientBenefitsInputSchema.parse(await request.json());
	return NextResponse.json(await getTerminalClientBenefits({ input, organizationId: actor.organizationId }));
}

export const POST = paymentTerminalApiHandler({ POST: getTerminalClientBenefitsRoute });
