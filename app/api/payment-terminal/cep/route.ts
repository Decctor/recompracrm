import { authenticateExternalRequest, requireExternalScope } from "@/lib/access/authentication";
import { lookupTerminalCep, paymentTerminalApiHandler } from "@/lib/payment-attempts";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// CEP → rua, bairro, cidade e estado (ViaCEP, normalizados), para o cadastro de endereço no
// terminal começar pelo CEP em vez de digitar o endereço inteiro.
const LookupTerminalCepInputSchema = z.object({
	cep: z.string({ required_error: "CEP não informado.", invalid_type_error: "Tipo inválido para o CEP." }),
});
export type TLookupTerminalCepInput = z.infer<typeof LookupTerminalCepInputSchema>;

async function lookupTerminalCepRoute(request: NextRequest) {
	const actor = await authenticateExternalRequest(request);
	requireExternalScope(actor, "payment-terminal:clients:read");
	const input = LookupTerminalCepInputSchema.parse({ cep: request.nextUrl.searchParams.get("cep") });
	return NextResponse.json({ data: { endereco: await lookupTerminalCep(input.cep) }, message: "CEP encontrado." });
}

export const GET = paymentTerminalApiHandler({ GET: lookupTerminalCepRoute });
