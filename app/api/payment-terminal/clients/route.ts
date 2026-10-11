import { authenticateExternalRequest, requireExternalScope } from "@/lib/access/authentication";
import { recomputeClientDuplicatesSafely } from "@/lib/clients/duplicates";
import { createCounterClient } from "@/lib/clients/create-counter-client";
import { formatPhoneAsBase } from "@/lib/formatting";
import { PaymentTerminalError, paymentTerminalApiHandler } from "@/lib/payment-attempts";
import { db } from "@/services/drizzle";
import { clients } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Identificação opcional do cliente pelo telefone (Fluxo A), pelo mesmo `telefoneBase` do POI.
// Só o necessário para o operador reconhecer a pessoa: nome e telefone mascarado — o terminal não
// é lugar para CPF, e-mail ou saldo.
const LookupTerminalClientInputSchema = z.object({
	telefone: z.string({ required_error: "Telefone não informado.", invalid_type_error: "Tipo inválido para telefone." }).min(8, "Telefone incompleto."),
});
export type TLookupTerminalClientInput = z.infer<typeof LookupTerminalClientInputSchema>;

function maskPhone(phone: string) {
	const digits = phone.replace(/\D/g, "");
	return digits.length >= 4 ? `${"•".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}` : phone;
}

async function lookupTerminalClient({ input, organizationId }: { input: TLookupTerminalClientInput; organizationId: string }) {
	const telefoneBase = formatPhoneAsBase(input.telefone);
	if (!telefoneBase) throw new PaymentTerminalError(400, "VALIDATION_ERROR", "Telefone inválido. Informe DDD e número.");
	const client = await db.query.clients.findFirst({
		where: and(eq(clients.organizacaoId, organizationId), eq(clients.telefoneBase, telefoneBase)),
		columns: { id: true, nome: true, telefone: true },
	});
	return {
		data: { client: client ? { id: client.id, nome: client.nome, telefoneMascarado: maskPhone(client.telefone) } : null },
		message: client ? "Cliente encontrado." : "Nenhum cliente com este telefone.",
	};
}
export type TLookupTerminalClientOutput = Awaited<ReturnType<typeof lookupTerminalClient>>;

async function lookupTerminalClientRoute(request: NextRequest) {
	const actor = await authenticateExternalRequest(request);
	requireExternalScope(actor, "payment-terminal:clients:read");
	const input = LookupTerminalClientInputSchema.parse({ telefone: request.nextUrl.searchParams.get("telefone") });
	return NextResponse.json(await lookupTerminalClient({ input, organizationId: actor.organizationId }));
}

// Cadastro rápido no balcão (scope payment-terminal:clients:create): nome, telefone e o aceite de
// marketing, como o autocadastro do ponto de interação. Telefone já cadastrado é CONFLICT — o app
// busca de novo em vez de criar um duplicado.
const CreateTerminalClientInputSchema = z.object({
	client: z.object({
		nome: z
			.string({ required_error: "Nome não informado.", invalid_type_error: "Tipo inválido para nome." })
			.trim()
			.min(2, "Informe o nome do cliente.")
			.max(255),
		telefone: z
			.string({ required_error: "Telefone não informado.", invalid_type_error: "Tipo inválido para telefone." })
			.min(10, "Telefone incompleto.")
			.max(30),
	}),
	// Só `true` grava a data do aceite (LGPD); ausente não é recusa.
	marketingConsent: z.boolean({ invalid_type_error: "Tipo inválido para o consentimento de marketing." }).optional().nullable(),
});
export type TCreateTerminalClientInput = z.infer<typeof CreateTerminalClientInputSchema>;

async function createTerminalClient({ input, organizationId }: { input: TCreateTerminalClientInput; organizationId: string }) {
	const client = await db.transaction((tx) =>
		createCounterClient({
			tx,
			organizacaoId: organizationId,
			canalAquisicao: "PDV",
			client: { nome: input.client.nome, telefone: input.client.telefone, marketingConsent: input.marketingConsent },
		}),
	);
	await recomputeClientDuplicatesSafely({ organizacaoId: organizationId, clienteId: client.id });
	return {
		data: { client: { id: client.id, nome: client.nome, telefoneMascarado: maskPhone(client.telefone) } },
		message: "Cliente cadastrado.",
	};
}
export type TCreateTerminalClientOutput = Awaited<ReturnType<typeof createTerminalClient>>;

async function createTerminalClientRoute(request: NextRequest) {
	const actor = await authenticateExternalRequest(request);
	requireExternalScope(actor, "payment-terminal:clients:create");
	const input = CreateTerminalClientInputSchema.parse(await request.json());
	return NextResponse.json(await createTerminalClient({ input, organizationId: actor.organizationId }), { status: 201 });
}

export const GET = paymentTerminalApiHandler({ GET: lookupTerminalClientRoute });
export const POST = paymentTerminalApiHandler({ POST: createTerminalClientRoute });
