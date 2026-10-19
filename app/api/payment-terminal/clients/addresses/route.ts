import { authenticateExternalRequest, requireExternalScope } from "@/lib/access/authentication";
import { createTerminalClientAddress, listTerminalClientAddresses, paymentTerminalApiHandler } from "@/lib/payment-attempts";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Endereços do cliente para a venda com ENTREGA: listar (scope clients:read) e cadastrar no balcão
// (scope clients:create) a partir do CEP — cidade e estado vêm do CEP, rua e bairro do que o
// operador confirmou.
const ListTerminalClientAddressesInputSchema = z.object({
	clienteId: z
		.string({ required_error: "Cliente não informado.", invalid_type_error: "Tipo inválido para o cliente." })
		.min(1, "Cliente não informado."),
});
export type TListTerminalClientAddressesInput = z.infer<typeof ListTerminalClientAddressesInputSchema>;

async function listTerminalClientAddressesRoute(request: NextRequest) {
	const actor = await authenticateExternalRequest(request);
	requireExternalScope(actor, "payment-terminal:clients:read");
	const input = ListTerminalClientAddressesInputSchema.parse({ clienteId: request.nextUrl.searchParams.get("clienteId") });
	const enderecos = await listTerminalClientAddresses({ organizationId: actor.organizationId, clienteId: input.clienteId });
	return NextResponse.json({ data: { enderecos }, message: "Endereços do cliente carregados." });
}

const CreateTerminalClientAddressInputSchema = z.object({
	clienteId: z.string({ required_error: "Cliente não informado.", invalid_type_error: "Tipo inválido para o cliente." }),
	endereco: z.object({
		titulo: z.string({ invalid_type_error: "Tipo inválido para o título." }).max(60).optional().nullable(),
		localizacaoCep: z.string({ required_error: "CEP não informado.", invalid_type_error: "Tipo inválido para o CEP." }),
		localizacaoLogradouro: z.string({ required_error: "Rua não informada.", invalid_type_error: "Tipo inválido para a rua." }).max(200),
		localizacaoNumero: z.string({ required_error: "Número não informado.", invalid_type_error: "Tipo inválido para o número." }).max(20),
		localizacaoComplemento: z.string({ invalid_type_error: "Tipo inválido para o complemento." }).max(120).optional().nullable(),
		localizacaoBairro: z.string({ invalid_type_error: "Tipo inválido para o bairro." }).max(120).optional().nullable(),
	}),
});
export type TCreateTerminalClientAddressInput = z.infer<typeof CreateTerminalClientAddressInputSchema>;

async function createTerminalClientAddressRoute(request: NextRequest) {
	const actor = await authenticateExternalRequest(request);
	requireExternalScope(actor, "payment-terminal:clients:create");
	const input = CreateTerminalClientAddressInputSchema.parse(await request.json());
	const endereco = await createTerminalClientAddress({ organizationId: actor.organizationId, clienteId: input.clienteId, input: input.endereco });
	return NextResponse.json({ data: { endereco }, message: "Endereço cadastrado." }, { status: 201 });
}

export const GET = paymentTerminalApiHandler({ GET: listTerminalClientAddressesRoute });
export const POST = paymentTerminalApiHandler({ POST: createTerminalClientAddressRoute });
