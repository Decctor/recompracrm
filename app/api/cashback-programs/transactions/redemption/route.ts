import { appApiHandler } from "@/lib/app-api";
import { applyCashbackRedemptionFIFO } from "@/lib/cashback/redemption";
import { db } from "@/services/drizzle";
import { cashbackProgramTransactions, cashbackPrograms, organizations } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const RedemptionInputSchema = z.object({
	orgId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para ID da organização.",
	}),
	clientId: z.string({
		required_error: "ID do cliente não informado.",
		invalid_type_error: "Tipo não válido para ID do cliente.",
	}),
	saleValue: z.number({
		required_error: "Valor da venda não informado.",
		invalid_type_error: "Tipo não válido para valor da venda.",
	}),
	redemptionValue: z.number({
		required_error: "Valor do resgate não informado.",
		invalid_type_error: "Tipo não válido para valor do resgate.",
	}),

	operatorIdentifier: z.string({
		required_error: "Identificador do operador não informado.",
		invalid_type_error: "Tipo não válido para identificador do operador.",
	}),
});
export type TCreateCashbackProgramRedemptionInput = z.infer<typeof RedemptionInputSchema>;
type RedemptionResponse = {
	data: {
		transactionId: string;
		newBalance: number;
		newResgatadoTotal: number;
	};
	message: string;
};

async function processRedemption(input: z.infer<typeof RedemptionInputSchema>): Promise<RedemptionResponse> {
	return await db.transaction(async (tx) => {
		// 1. Get organization and validate password
		const org = await tx.query.organizations.findFirst({
			where: eq(organizations.id, input.orgId),
			columns: { cnpj: true, nome: true },
		});

		if (!org) {
			throw new createHttpError.NotFound("Organização não encontrada.");
		}

		// 2. Validate operator
		const operator = await tx.query.sellers.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.senhaOperador, input.operatorIdentifier), eq(fields.organizacaoId, input.orgId)),
		});

		if (!operator) throw new createHttpError.Unauthorized("Operador não encontrado.");
		const membershipForSeller = await tx.query.organizationMembers.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.usuarioVendedorId, operator.id), eq(fields.organizacaoId, input.orgId)),
			with: {
				usuario: true,
			},
		});

		// 3. Get cashback program
		const program = await tx.query.cashbackPrograms.findFirst({
			where: eq(cashbackPrograms.organizacaoId, input.orgId),
		});

		if (!program) {
			throw new createHttpError.NotFound("Programa de cashback não encontrado.");
		}

		// 4. Validate redemption limit
		if (program.resgateLimiteTipo && program.resgateLimiteValor !== null) {
			let maxAllowedRedemption: number;

			if (program.resgateLimiteTipo === "FIXO") {
				maxAllowedRedemption = program.resgateLimiteValor;
			} else if (program.resgateLimiteTipo === "PERCENTUAL") {
				if (input.saleValue <= 0) {
					throw new createHttpError.BadRequest("Valor da venda deve ser informado para calcular o limite de resgate percentual.");
				}
				maxAllowedRedemption = (input.saleValue * program.resgateLimiteValor) / 100;
			} else {
				maxAllowedRedemption = Number.MAX_SAFE_INTEGER;
			}

			if (input.redemptionValue > maxAllowedRedemption) {
				throw new createHttpError.BadRequest(`Valor de resgate excede o limite permitido. Máximo: R$ ${maxAllowedRedemption.toFixed(2)}`);
			}
		}

		// 5. Apply redemption with FIFO consumption on ACÚMULO transactions
		const redemptionResult = await applyCashbackRedemptionFIFO({
			tx,
			orgId: input.orgId,
			clientId: input.clientId,
			programId: program.id,
			redemptionValue: input.redemptionValue,
		});

		const previousBalance = redemptionResult.previousBalance;
		const newBalance = redemptionResult.newBalance;
		const newResgatadoTotal = redemptionResult.newResgatadoTotal;

		// 7. Create redemption transaction
		const transactionResult = await tx
			.insert(cashbackProgramTransactions)
			.values({
				organizacaoId: input.orgId,
				clienteId: input.clientId,
				programaId: program.id,
				vendaId: null, // No associated sale for quick redemptions
				vendaValor: input.saleValue,
				tipo: "RESGATE",
				status: "ATIVO",
				valor: -input.redemptionValue,
				valorRestante: 0, // Fully consumed
				saldoValorAnterior: previousBalance,
				saldoValorPosterior: newBalance,
				expiracaoData: null,
				operadorId: membershipForSeller?.usuario?.id,
				operadorVendedorId: operator.id,
				metadados: {
					consumoFifo: redemptionResult.consumedFromAccumulations,
				},
			})
			.returning({ id: cashbackProgramTransactions.id });

		const transactionId = transactionResult[0]?.id;

		if (!transactionId) {
			throw new createHttpError.InternalServerError("Erro ao criar transação de resgate.");
		}

		return {
			data: {
				transactionId,
				newBalance,
				newResgatadoTotal,
			},
			message: "Resgate realizado com sucesso.",
		};
	});
}
export type TCreateCashbackProgramRedemptionOutput = ReturnType<typeof processRedemption>;
const redemptionRoute = async (request: NextRequest) => {
	const payload = await request.json();
	const input = RedemptionInputSchema.parse(payload);
	const result = await processRedemption(input);
	return NextResponse.json(result, { status: 200 });
};

export const POST = appApiHandler({
	POST: redemptionRoute,
});
