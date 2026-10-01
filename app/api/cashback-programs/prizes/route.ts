import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { TAuthUserSession } from "@/lib/authentication/types";
import { CashbackProgramPrizeSchema } from "@/schemas/cashback-programs";
import { db } from "@/services/drizzle";
import { cashbackProgramPrizes, cashbackProgramTransactions } from "@/services/drizzle/schema";
import { eq, and, count, isNotNull } from "drizzle-orm";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import z from "zod";

const GetCashbackProgramPrizesInputSchema = z.object({
	// by id
	id: z
		.string({
			invalid_type_error: "Tipo não válido para o ID do prêmio do programa de cashback.",
		})
		.optional()
		.nullable(),

	// general
	programId: z
		.string({
			required_error: "ID do programa de cashback não informado.",
			invalid_type_error: "Tipo não válido para o ID do programa de cashback.",
		})
		.optional()
		.nullable(),
});
export type TGetCashbackProgramPrizesInput = z.infer<typeof GetCashbackProgramPrizesInputSchema>;

/**
 * Um prêmio vira item de venda no resgate: seus vínculos precisam apontar para o catálogo e o
 * programa da própria organização. Sem esta checagem, um `produtoId` alheio no payload faria o
 * resgate expor nome, código e preço de custo de outra organização.
 */
async function assertPrizeLinksBelongToOrganization({
	organizacaoId,
	programaId,
	prize,
}: {
	organizacaoId: string;
	programaId?: string;
	prize: { produtoId?: string | null; produtoVarianteId?: string | null };
}) {
	if (programaId) {
		const programa = await db.query.cashbackPrograms.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, programaId), eq(fields.organizacaoId, organizacaoId)),
			columns: { id: true },
		});
		if (!programa) throw new createHttpError.BadRequest("Programa de cashback não encontrado para esta organização.");
	}

	if (prize.produtoId) {
		const produto = await db.query.products.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, prize.produtoId as string), eq(fields.organizacaoId, organizacaoId)),
			columns: { id: true },
		});
		if (!produto) throw new createHttpError.BadRequest("O produto informado não pertence ao catálogo desta organização.");
	}

	if (prize.produtoVarianteId) {
		const variante = await db.query.productVariants.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, prize.produtoVarianteId as string), eq(fields.organizacaoId, organizacaoId)),
			columns: { id: true, produtoId: true },
		});
		if (!variante) throw new createHttpError.BadRequest("A variante informada não pertence ao catálogo desta organização.");
		if (prize.produtoId && variante.produtoId !== prize.produtoId) {
			throw new createHttpError.BadRequest("A variante informada não pertence ao produto informado.");
		}
	}
}

async function getCashbackProgramPrizes({ input, session }: { input: TGetCashbackProgramPrizesInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	// `input.id`, não `"id" in input`: a rota sempre repassa a chave (com `undefined` quando ausente),
	// então o teste de presença mandava toda listagem para o ramo por ID.
	const inputId = input.id;
	if (inputId) {
		const cashbackProgramPrize = await db.query.cashbackProgramPrizes.findFirst({
			where: (fields, operators) => operators.and(operators.eq(fields.organizacaoId, userOrgId), operators.eq(fields.id, inputId)),

			with: {
				programa: {
					columns: {
						id: true,
						titulo: true,
						terminologia: true,
					},
				},
				produto: {
					columns: {
						id: true,
						nome: true,
						grupo: true,
						precoVenda: true,
					},
				},
				produtoVariante: {
					columns: {
						id: true,
						nome: true,
						precoVenda: true,
					},
				},
			},
		});

		if (!cashbackProgramPrize) throw new createHttpError.NotFound("Prêmio do programa de cashback não encontrado.");

		return {
			data: {
				byId: cashbackProgramPrize,
				default: null,
			},
			message: "Prêmio do programa de cashback encontrado com sucesso.",
		};
	}

	const programId = input.programId;
	if (!programId) throw new createHttpError.BadRequest("ID do programa de cashback não informado.");

	// Sem paginação: um programa tem dezenas de recompensas, e a tela de gestão filtra, ordena e
	// conta por status no cliente. Arquivadas vêm junto — o filtro "Arquivadas" é dessa tela.
	const prizes = await db.query.cashbackProgramPrizes.findMany({
		where: (fields, { and, eq }) => and(eq(fields.organizacaoId, userOrgId), eq(fields.programaId, programId)),
		orderBy: (fields, { asc }) => [asc(fields.valor), asc(fields.titulo)],
		with: {
			produto: { columns: { id: true, nome: true, precoVenda: true, imagemCapaUrl: true } },
			produtoVariante: { columns: { id: true, nome: true, precoVenda: true, imagemCapaUrl: true } },
		},
	});

	// Só `RESGATE` conta como resgate; o `CANCELAMENTO` do estorno também aponta para a recompensa
	// e pesa na decisão excluir-ou-arquivar, não aqui.
	const redemptionCounts = await db
		.select({ recompensaId: cashbackProgramTransactions.resgateRecompensaId, quantidade: count() })
		.from(cashbackProgramTransactions)
		.where(
			and(
				eq(cashbackProgramTransactions.organizacaoId, userOrgId),
				eq(cashbackProgramTransactions.programaId, programId),
				eq(cashbackProgramTransactions.tipo, "RESGATE"),
				isNotNull(cashbackProgramTransactions.resgateRecompensaId),
			),
		)
		.groupBy(cashbackProgramTransactions.resgateRecompensaId);
	const redemptionCountByPrizeId = new Map(redemptionCounts.map((row) => [row.recompensaId as string, Number(row.quantidade)]));

	return {
		data: {
			default: prizes.map((prize) => ({
				...prize,
				resgatesQuantidade: redemptionCountByPrizeId.get(prize.id) ?? 0,
			})),
			byId: null,
		},
		message: "Prêmios do programa de cashback recuperados com sucesso.",
	};
}
export type TGetCashbackProgramPrizesOutput = Awaited<ReturnType<typeof getCashbackProgramPrizes>>;
export type TGetCashbackProgramPrizesOutputDefault = Exclude<Exclude<TGetCashbackProgramPrizesOutput["data"], null>["default"], null>;
export type TGetCashbackProgramPrizesOutputById = Exclude<TGetCashbackProgramPrizesOutput["data"], null>["byId"];

const getCashbackProgramPrizesRoute = async (request: NextRequest) => {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");

	const searchParams = request.nextUrl.searchParams;
	const input = GetCashbackProgramPrizesInputSchema.parse({
		id: searchParams.get("id") ?? undefined,
		programId: searchParams.get("programId") ?? undefined,
	});
	const response = await getCashbackProgramPrizes({ input, session });
	return NextResponse.json(response);
};
export const GET = appApiHandler({ GET: getCashbackProgramPrizesRoute });

const CreateCashbackProgramPrizeInputSchema = z.object({
	cashbackProgramId: z
		.string({
			required_error: "ID do programa de cashback não informado.",
			invalid_type_error: "Tipo não válido para o ID do programa de cashback.",
		})
		.describe("O ID do programa de cashback."),
	cashbackProgramPrize: CashbackProgramPrizeSchema.omit({
		dataInsercao: true,
		dataAtualizacao: true,
		organizacaoId: true,
		programaId: true,
	}),
});
export type TCreateCashbackProgramPrizeInput = z.infer<typeof CreateCashbackProgramPrizeInputSchema>;

async function createCashbackProgramPrize({ input, session }: { input: TCreateCashbackProgramPrizeInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	if (!input.cashbackProgramPrize.produtoId) throw new createHttpError.BadRequest("Toda recompensa deve estar vinculada a um produto.");
	await assertPrizeLinksBelongToOrganization({ organizacaoId: userOrgId, programaId: input.cashbackProgramId, prize: input.cashbackProgramPrize });

	const [insertedCashbackProgramPrize] = await db
		.insert(cashbackProgramPrizes)
		.values({
			...input.cashbackProgramPrize,
			organizacaoId: userOrgId,
			programaId: input.cashbackProgramId,
		})
		.returning({ id: cashbackProgramPrizes.id });

	if (!insertedCashbackProgramPrize)
		throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao criar prêmio do programa de cashback.");

	return {
		data: {
			insertedId: insertedCashbackProgramPrize,
		},
		message: "Prêmio do programa de cashback criado com sucesso.",
	};
}
export type TCreateCashbackProgramPrizeOutput = Awaited<ReturnType<typeof createCashbackProgramPrize>>;
export type TCreateCashbackProgramPrizeOutputInsertedId = Exclude<TCreateCashbackProgramPrizeOutput["data"], null>["insertedId"];

const createCashbackProgramPrizeRoute = async (request: NextRequest) => {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");

	const input = CreateCashbackProgramPrizeInputSchema.parse(await request.json());
	const response = await createCashbackProgramPrize({ input, session });
	return NextResponse.json(response);
};
export const POST = appApiHandler({ POST: createCashbackProgramPrizeRoute });

const UpdateCashbackProgramPrizeInputSchema = z.object({
	cashbackProgramPrizeId: z
		.string({
			required_error: "ID do prêmio do programa de cashback não informado.",
			invalid_type_error: "Tipo não válido para o ID do prêmio do programa de cashback.",
		})
		.describe("O ID do prêmio do programa de cashback."),
	cashbackProgramPrize: CashbackProgramPrizeSchema.omit({
		dataInsercao: true,
		dataAtualizacao: true,
		organizacaoId: true,
		programaId: true,
	}),
});
export type TUpdateCashbackProgramPrizeInput = z.infer<typeof UpdateCashbackProgramPrizeInputSchema>;

async function updateCashbackProgramPrize({ input, session }: { input: TUpdateCashbackProgramPrizeInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	if (!input.cashbackProgramPrize.produtoId) throw new createHttpError.BadRequest("Toda recompensa deve estar vinculada a um produto.");
	await assertPrizeLinksBelongToOrganization({ organizacaoId: userOrgId, prize: input.cashbackProgramPrize });

	const currentPrize = await db.query.cashbackProgramPrizes.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, input.cashbackProgramPrizeId), eq(fields.organizacaoId, userOrgId)),
		columns: { id: true, dataArquivamento: true },
	});
	if (!currentPrize) throw new createHttpError.NotFound("Prêmio do programa de cashback não encontrado.");
	// Arquivada fica fora de toda superfície por `ativo = false`; reativar pela edição a traria de
	// volta sem passar pela restauração.
	if (currentPrize.dataArquivamento) throw new createHttpError.BadRequest("Restaure a recompensa antes de editá-la.");

	const [updatedCashbackProgramPrize] = await db
		.update(cashbackProgramPrizes)
		.set({
			...input.cashbackProgramPrize,
			organizacaoId: userOrgId,
			dataAtualizacao: new Date(),
		})
		.where(and(eq(cashbackProgramPrizes.id, input.cashbackProgramPrizeId), eq(cashbackProgramPrizes.organizacaoId, userOrgId)))
		.returning({ id: cashbackProgramPrizes.id });

	if (!updatedCashbackProgramPrize)
		throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao atualizar prêmio do programa de cashback.");

	return {
		data: {
			updatedId: updatedCashbackProgramPrize,
		},
		message: "Prêmio do programa de cashback atualizado com sucesso.",
	};
}
export type TUpdateCashbackProgramPrizeOutput = Awaited<ReturnType<typeof updateCashbackProgramPrize>>;
export type TUpdateCashbackProgramPrizeOutputUpdatedId = Exclude<TUpdateCashbackProgramPrizeOutput["data"], null>["updatedId"];

const updateCashbackProgramPrizeRoute = async (request: NextRequest) => {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");

	const input = UpdateCashbackProgramPrizeInputSchema.parse(await request.json());
	const response = await updateCashbackProgramPrize({ input, session });
	return NextResponse.json(response);
};
export const PUT = appApiHandler({ PUT: updateCashbackProgramPrizeRoute });

const DeleteCashbackProgramPrizeInputSchema = z.object({
	id: z.string({
		required_error: "ID do prêmio do programa de cashback não informado.",
		invalid_type_error: "Tipo não válido para o ID do prêmio do programa de cashback.",
	}),
});
export type TDeleteCashbackProgramPrizeInput = z.infer<typeof DeleteCashbackProgramPrizeInputSchema>;

/**
 * Exclui ou arquiva, conforme o histórico. A transação de resgate referencia a recompensa sem
 * cascade (e o estorno preserva o vínculo), então uma recompensa com qualquer transação apontando
 * para ela não pode sair do banco: é arquivada (`ativo = false` + `dataArquivamento`), o que a tira
 * do PDV, do ponto de interação e da loja, e mantém o histórico resolvendo o prêmio.
 */
async function deleteCashbackProgramPrize({ input, session }: { input: TDeleteCashbackProgramPrizeInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const prize = await db.query.cashbackProgramPrizes.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, input.id), eq(fields.organizacaoId, userOrgId)),
		columns: { id: true, dataArquivamento: true },
	});
	if (!prize) throw new createHttpError.NotFound("Prêmio do programa de cashback não encontrado.");
	if (prize.dataArquivamento) throw new createHttpError.BadRequest("Esta recompensa já está arquivada.");

	const prizeCondition = and(eq(cashbackProgramPrizes.id, prize.id), eq(cashbackProgramPrizes.organizacaoId, userOrgId));
	const archive = async () => {
		await db.update(cashbackProgramPrizes).set({ ativo: false, dataArquivamento: new Date(), dataAtualizacao: new Date() }).where(prizeCondition);
		return {
			data: { deletedId: prize.id, outcome: "ARQUIVADA" as const },
			message: "Recompensa arquivada: ela já foi resgatada e continua no histórico.",
		};
	};

	const [reference] = await db
		.select({ id: cashbackProgramTransactions.id })
		.from(cashbackProgramTransactions)
		.where(eq(cashbackProgramTransactions.resgateRecompensaId, prize.id))
		.limit(1);
	if (reference) return await archive();

	try {
		await db.delete(cashbackProgramPrizes).where(prizeCondition);
	} catch (error) {
		// Um resgate gravado entre a checagem e o DELETE viola a FK (23503): arquiva em vez de falhar.
		const code = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
		if (code === "23503") return await archive();
		throw error;
	}
	return {
		data: { deletedId: prize.id, outcome: "EXCLUIDA" as const },
		message: "Recompensa excluída com sucesso.",
	};
}
export type TDeleteCashbackProgramPrizeOutput = Awaited<ReturnType<typeof deleteCashbackProgramPrize>>;

const deleteCashbackProgramPrizeRoute = async (request: NextRequest) => {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");

	const input = DeleteCashbackProgramPrizeInputSchema.parse({ id: request.nextUrl.searchParams.get("id") ?? undefined });
	const response = await deleteCashbackProgramPrize({ input, session });
	return NextResponse.json(response);
};
export const DELETE = appApiHandler({ DELETE: deleteCashbackProgramPrizeRoute });
