import { appApiHandler } from "@/lib/app-api";
import { formatPhoneAsBase } from "@/lib/formatting";
import { ClientSchema } from "@/schemas/clients";
import { db } from "@/services/drizzle";
import { cashbackProgramBalances } from "@/services/drizzle/schema/cashback-programs";
import { clients } from "@/services/drizzle/schema/clients";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const CreateClientViaPointOfInteractionInputSchema = z.object({
	orgId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para ID da organização.",
	}),
	client: ClientSchema.pick({
		nome: true,
		telefone: true,
		cpfCnpj: true,
	}),
});
export type TCreateClientViaPointOfInteractionInput = z.infer<typeof CreateClientViaPointOfInteractionInputSchema>;

async function createClientViaPointOfInteraction({ input }: { input: TCreateClientViaPointOfInteractionInput }) {
	const { orgId, client } = input;

	return await db.transaction(async (tx) => {
		const cashbackProgram = await tx.query.cashbackPrograms.findFirst({
			where: (fields, { eq }) => eq(fields.organizacaoId, orgId),
		});
		if (!cashbackProgram) throw new createHttpError.NotFound("Programa de cashback não encontrado.");

		const isValidPhone = client.telefone && client.telefone.length >= 11;
		if (!isValidPhone) throw new createHttpError.BadRequest("Telefone inválido.");

		const clientPhoneAsBase = formatPhoneAsBase(client.telefone ?? "");
		if (!clientPhoneAsBase) throw new createHttpError.BadRequest("Telefone inválido.");

		const existingClientForPhone = await tx.query.clients.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.telefoneBase, clientPhoneAsBase), eq(fields.organizacaoId, orgId)),
		});
		if (existingClientForPhone) throw new createHttpError.BadRequest("Um cadastro já existe para este telefone.");

		console.log("[INFO] [CREATE CLIENT VIA POINT OF INTERACTION] No existing client found, continuing with insertion...");
		const insertedClientResponse = await tx
			.insert(clients)
			.values({
				...client,
				organizacaoId: orgId,
				cpfCnpj: client.cpfCnpj ?? null,
				telefone: client.telefone ?? "",
				telefoneBase: clientPhoneAsBase,
				canalAquisicao: "PONTO DE INTERAÇÃO",
			})
			.returning({ id: clients.id });

		const insertedClientId = insertedClientResponse[0]?.id;
		if (!insertedClientId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao criar cliente.");

		const insertedCashbackProgramBalanceResponse = await tx
			.insert(cashbackProgramBalances)
			.values({
				clienteId: insertedClientId,
				programaId: cashbackProgram.id,
				organizacaoId: orgId,
				saldoValorDisponivel: 0,
				saldoValorAcumuladoTotal: 0,
				saldoValorResgatadoTotal: 0,
			})
			.returning({ id: cashbackProgramBalances.id });

		const insertedCashbackProgramBalanceId = insertedCashbackProgramBalanceResponse[0]?.id;
		if (!insertedCashbackProgramBalanceId)
			throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao criar saldo de cashback.");

		return {
			data: {
				insertedClientId: insertedClientId,
				insertedCashbackProgramBalanceId: insertedCashbackProgramBalanceId,
			},
			message: "Cliente criado com sucesso.",
		};
	});
}
export type TCreateClientViaPointOfInteractionOutput = Awaited<ReturnType<typeof createClientViaPointOfInteraction>>;

async function createClientViaPointOfInteractionRoute(request: NextRequest) {
	const body = await request.json();
	console.log("[INFO] [CREATE CLIENT VIA POINT OF INTERACTION] Request body:", body);
	const input = CreateClientViaPointOfInteractionInputSchema.parse(body);
	console.log("[INFO] [CREATE CLIENT VIA POINT OF INTERACTION] Input:", input);
	const result = await createClientViaPointOfInteraction({ input });
	console.log("[INFO] [CREATE CLIENT VIA POINT OF INTERACTION] Result:", result);
	return NextResponse.json(result, {
		status: 201,
	});
}

export const POST = appApiHandler({
	POST: createClientViaPointOfInteractionRoute,
});
