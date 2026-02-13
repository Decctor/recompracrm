import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { handleSimpleChildRowsProcessing } from "@/lib/db-utils";
import { CashbackProgramPrizeSchema, CashbackProgramSchema } from "@/schemas/cashback-programs";
import { db } from "@/services/drizzle";
import { cashbackProgramBalances, cashbackProgramPrizes, cashbackPrograms } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

async function getCashbackPrograms({ session }: { session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const cashbackProgram = await db.query.cashbackPrograms.findFirst({
		where: (fields, { eq }) => eq(fields.organizacaoId, userOrgId),
		with: {
			recompensas: true,
		},
	});

	return {
		data: cashbackProgram ?? null,
	};
}
export type TGetCashbackProgramOutput = Awaited<ReturnType<typeof getCashbackPrograms>>;

const getCashbackProgramsRoute = async (request: NextRequest) => {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const result = await getCashbackPrograms({ session });
	return NextResponse.json(result, { status: 200 });
};
export const GET = appApiHandler({
	GET: getCashbackProgramsRoute,
});

const CreateCashbackProgramInputSchema = z.object({
	cashbackProgram: CashbackProgramSchema.omit({ dataInsercao: true, dataAtualizacao: true }),
	cashbackProgramPrizes: z.array(
		CashbackProgramPrizeSchema.omit({ dataInsercao: true, dataAtualizacao: true, organizacaoId: true, programaId: true }),
	),
});
export type TCreateCashbackProgramInput = z.infer<typeof CreateCashbackProgramInputSchema>;

async function createCashbackProgram({ input, session }: { input: TCreateCashbackProgramInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const existingCashbackProgram = await db.query.cashbackPrograms.findFirst({
		where: (fields, { eq }) => eq(fields.organizacaoId, userOrgId),
	});
	if (existingCashbackProgram) throw new createHttpError.BadRequest("Programa de cashback já existe.");

	const insertedCashbackProgramId = await db.transaction(async (tx) => {
		// Insert the cashback program
		const insertedCashbackProgram = await tx
			.insert(cashbackPrograms)
			.values({ ...input.cashbackProgram, organizacaoId: userOrgId })
			.returning({ id: cashbackPrograms.id });
		const programId = insertedCashbackProgram[0]?.id;
		if (!programId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao criar programa de cashback.");

		// Find all clients in the organization that don't have a balance for this program
		const existingBalanceClientIds = await tx.query.cashbackProgramBalances
			.findMany({
				where: (fields, { eq }) => eq(fields.programaId, programId),
				columns: { clienteId: true },
			})
			.then((balances) => balances.map((b) => b.clienteId));

		const clientsWithoutBalance = await tx.query.clients.findMany({
			where: (fields, { eq, notInArray, and }) =>
				existingBalanceClientIds.length > 0
					? and(eq(fields.organizacaoId, userOrgId), notInArray(fields.id, existingBalanceClientIds))
					: eq(fields.organizacaoId, userOrgId),
			columns: { id: true },
		});

		// Create balances for all clients without one
		if (clientsWithoutBalance.length > 0) {
			const balancesToInsert = clientsWithoutBalance.map((client) => ({
				organizacaoId: userOrgId,
				clienteId: client.id,
				programaId: programId,
			}));

			// Insert in batches to avoid database limits
			const BATCH_SIZE = 100;
			for (let i = 0; i < balancesToInsert.length; i += BATCH_SIZE) {
				const batch = balancesToInsert.slice(i, i + BATCH_SIZE);
				await tx.insert(cashbackProgramBalances).values(batch);
			}
		}

		if (input.cashbackProgramPrizes.length > 0) {
			const prizesToInsert = input.cashbackProgramPrizes.map((prize) => ({
				...prize,
				programaId: programId,
			}));
			await tx.insert(cashbackProgramPrizes).values(prizesToInsert);
		}
		return programId;
	});

	return {
		data: {
			insertedId: insertedCashbackProgramId,
		},
		message: "Programa de cashback criado com sucesso.",
	};
}
export type TCreateCashbackProgramOutput = Awaited<ReturnType<typeof createCashbackProgram>>;

const createCashbackProgramRoute = async (request: NextRequest) => {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const payload = await request.json();
	const input = CreateCashbackProgramInputSchema.parse(payload);
	const result = await createCashbackProgram({ input, session });
	return NextResponse.json(result, { status: 200 });
};
export const POST = appApiHandler({
	POST: createCashbackProgramRoute,
});

const UpdateCashbackProgramInputSchema = z.object({
	cashbackProgramId: z.string({
		required_error: "ID do programa de cashback não informado.",
		invalid_type_error: "Tipo não válido para o ID do programa de cashback.",
	}),
	cashbackProgram: CashbackProgramSchema.omit({ dataInsercao: true, dataAtualizacao: true }),
	cashbackProgramPrizes: z.array(
		CashbackProgramPrizeSchema.omit({ dataInsercao: true, dataAtualizacao: true, organizacaoId: true, programaId: true }).extend({
			id: z
				.string({
					required_error: "ID do prêmio do programa de cashback não informado.",
					invalid_type_error: "Tipo não válido para o ID do prêmio do programa de cashback.",
				})
				.optional()
				.nullable(),
			deletar: z
				.boolean({
					required_error: "Deletar prêmio do programa de cashback não informado.",
					invalid_type_error: "Tipo não válido para deletar prêmio do programa de cashback.",
				})
				.optional()
				.nullable(),
		}),
	),
});
export type TUpdateCashbackProgramInput = z.infer<typeof UpdateCashbackProgramInputSchema>;

async function updateCashbackProgram({ input, session }: { input: TUpdateCashbackProgramInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const transactionReturn = await db.transaction(async (tx) => {
		const updatedCashbackProgram = await db
			.update(cashbackPrograms)
			.set({ ...input.cashbackProgram, organizacaoId: userOrgId })
			.where(and(eq(cashbackPrograms.id, input.cashbackProgramId), eq(cashbackPrograms.organizacaoId, userOrgId)))
			.returning({ id: cashbackPrograms.id });
		const updatedCashbackProgramId = updatedCashbackProgram[0]?.id;
		if (!updatedCashbackProgramId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao atualizar programa de cashback.");

		await handleSimpleChildRowsProcessing({
			trx: tx,
			table: cashbackProgramPrizes,
			entities: input.cashbackProgramPrizes,
			fatherEntityKey: "programaId",
			fatherEntityId: updatedCashbackProgramId,
			organizacaoId: userOrgId,
		});
		return {
			updatedCashbackProgramId,
		};
	});

	return {
		data: {
			updatedId: transactionReturn.updatedCashbackProgramId,
		},
		message: "Programa de cashback atualizado com sucesso.",
	};
}
export type TUpdateCashbackProgramOutput = Awaited<ReturnType<typeof updateCashbackProgram>>;

const updateCashbackProgramRoute = async (request: NextRequest) => {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const payload = await request.json();
	const input = UpdateCashbackProgramInputSchema.parse(payload);
	const result = await updateCashbackProgram({ input, session });
	return NextResponse.json(result, { status: 200 });
};

export const PUT = appApiHandler({
	PUT: updateCashbackProgramRoute,
});
