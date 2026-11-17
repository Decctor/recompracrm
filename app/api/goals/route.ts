import { appApiHandler } from "@/lib/app-api";
import { runPagesRouteHandler, type PagesRouteHandler, type PagesRouteRequest, type PagesRouteResponse } from "@/lib/pages-route-compat";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { resolveGoalPermissions } from "@/lib/permissions/goals";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { handleSimpleChildRowsProcessing } from "@/lib/db-utils";
import { resolveActiveGoalPacing } from "@/lib/goals/resolve-active-goal-pacing";
import { GoalSchema, GoalSellerSchema } from "@/schemas/goals";
import { db } from "@/services/drizzle";
import { clients, goals, goalsSellers, sales, sellers } from "@/services/drizzle/schema";
import { and, count, eq, gte, isNotNull, lte, sum } from "drizzle-orm";
import createHttpError from "http-errors";
import { z } from "zod";

const PAGE_SIZE = 10;

/**
 *
 *
 * HELPER: compute achievement for a goal period
 *
 *
 */
async function computeGoalAchievement({
	organizacaoId,
	dataInicio,
	dataFim,
	vendedorId,
}: {
	organizacaoId: string;
	dataInicio: Date;
	dataFim: Date;
	vendedorId?: string;
}) {
	const saleConditions = [
		eq(sales.organizacaoId, organizacaoId),
		isNotNull(sales.dataVenda),
		eq(sales.statusVenda, "CONFIRMADA"),
		gte(sales.dataVenda, dataInicio),
		lte(sales.dataVenda, dataFim),
	];
	if (vendedorId) saleConditions.push(eq(sales.vendedorId, vendedorId));

	const [salesResult, clientsResult] = await Promise.all([
		db
			.select({ totalValor: sum(sales.valorTotal), totalQtde: count(sales.id) })
			.from(sales)
			.where(and(...saleConditions)),
		// `primeiraCompraData` não carrega vendedor, então um novo cliente não é atribuível a
		// ninguém. Contar o total da organização em cada vendedor daria a todos o mesmo número.
		vendedorId
			? Promise.resolve([])
			: db
					.select({ totalNovosClientes: count(clients.id) })
					.from(clients)
					.where(
						and(
							eq(clients.organizacaoId, organizacaoId),
							isNotNull(clients.primeiraCompraData),
							gte(clients.primeiraCompraData, dataInicio),
							lte(clients.primeiraCompraData, dataFim),
						),
					),
	]);

	return {
		realizadoValor: Number(salesResult[0]?.totalValor ?? 0),
		realizadoQtdeVendas: Number(salesResult[0]?.totalQtde ?? 0),
		realizadoNovosClientes: Number(clientsResult[0]?.totalNovosClientes ?? 0),
	};
}

/**
 *
 *
 * GET
 *
 *
 */

const GetGoalsInputSchema = z.object({
	id: z
		.string({
			required_error: "ID da meta não informado.",
			invalid_type_error: "Tipo inválido para ID da meta.",
		})
		.optional(),
	page: z.coerce
		.number({
			invalid_type_error: "Tipo inválido para página.",
		})
		.min(1)
		.default(1)
		.optional(),
});
export type TGetGoalsByIdInput = Pick<TGetGoalsInput, "id">;
export type TGetGoalsInput = z.infer<typeof GetGoalsInputSchema>;
async function getGoals({ input, session }: { input: TGetGoalsInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const { id, page = 1 } = input;

	if (id) {
		if (typeof id !== "string") throw new createHttpError.BadRequest("ID inválido.");

		const goal = await db.query.goals.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, id), eq(fields.organizacaoId, userOrgId)),
			with: {
				vendedores: {
					with: {
						vendedor: {
							columns: {
								id: true,
								nome: true,
								avatarUrl: true,
							},
						},
					},
				},
			},
		});
		if (!goal) throw new createHttpError.NotFound("Meta não encontrada.");
		return {
			data: {
				byId: goal,
				default: undefined,
			},
		};
	}

	// Count total for pagination
	const [totalResult, allGoals] = await Promise.all([
		db
			.select({ total: count(goals.id) })
			.from(goals)
			.where(eq(goals.organizacaoId, userOrgId)),
		db.query.goals.findMany({
			where: (fields, { eq }) => eq(fields.organizacaoId, userOrgId),
			with: {
				vendedores: {
					with: {
						vendedor: {
							columns: {
								id: true,
								nome: true,
								avatarUrl: true,
							},
						},
					},
				},
			},
			orderBy: (fields, { desc }) => desc(fields.dataInicio),
			limit: PAGE_SIZE,
			offset: (page - 1) * PAGE_SIZE,
		}),
	]);

	const goalsMatched = Number(totalResult[0]?.total ?? 0);
	const totalPages = Math.max(1, Math.ceil(goalsMatched / PAGE_SIZE));

	const now = new Date();

	// Compute achievement for each goal in parallel
	const goalsWithAchievement = await Promise.all(
		allGoals.map(async (goal) => {
			const orgAchievement = await computeGoalAchievement({
				organizacaoId: userOrgId,
				dataInicio: goal.dataInicio,
				dataFim: goal.dataFim,
			});

			const vendedoresWithAchievement = await Promise.all(
				goal.vendedores.map(async (gv) => {
					const sellerAchievement = await computeGoalAchievement({
						organizacaoId: userOrgId,
						dataInicio: goal.dataInicio,
						dataFim: goal.dataFim,
						vendedorId: gv.vendedorId,
					});
					return { ...gv, ...sellerAchievement };
				}),
			);

			const isActive = goal.dataInicio.getTime() <= now.getTime() && goal.dataFim.getTime() >= now.getTime();

			// Ritmo só existe para a meta em curso: uma meta encerrada não está adiantada nem
			// atrasada, e uma futura ainda não começou. Ver `resolveActiveGoalPacing`.
			const ritmo = isActive
				? await resolveActiveGoalPacing({
						organizacaoId: userOrgId,
						goal,
						goalSellers: goal.vendedores,
						agora: now,
					})
				: null;

			return {
				...goal,
				...orgAchievement,
				vendedores: vendedoresWithAchievement,
				isActive,
				ritmo,
			};
		}),
	);

	return {
		data: {
			byId: undefined,
			default: {
				goals: goalsWithAchievement,
				goalsMatched,
				totalPages,
			},
		},
	};
}
export type TGetGoalsOutput = Awaited<ReturnType<typeof getGoals>>;
export type TGetGoalsOutputById = Exclude<TGetGoalsOutput["data"]["byId"], undefined>;
export type TGetGoalsOutputDefault = Exclude<TGetGoalsOutput["data"]["default"], undefined>;
export type TGetGoalsOutputDefaultGoal = TGetGoalsOutputDefault["goals"][number];
const getGoalsHandler: PagesRouteHandler<TGetGoalsOutput> = async (req, res) => {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!resolveGoalPermissions(sessionUser.membership?.permissoes).visualizar)
		throw new createHttpError.Forbidden("Você não possui permissão para visualizar metas.");

	const input = GetGoalsInputSchema.parse(req.query);
	const goals = await getGoals({ input, session: sessionUser });
	return res.status(200).json(goals);
};

/**
 *
 *
 * CREATE
 *
 *
 */

const CreateGoalInputSchema = z.object({
	goal: GoalSchema.omit({ dataInsercao: true }),
	goalSellers: z.array(GoalSellerSchema.omit({ metaId: true })),
});
export type TCreateGoalInput = z.infer<typeof CreateGoalInputSchema>;

async function createGoal({ input, session }: { input: TCreateGoalInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const { goal: payloadGoal, goalSellers: payloadGoalSellers } = input;

	return await db.transaction(async (tx) => {
		const insertedGoalResponse = await tx
			.insert(goals)
			.values({ ...payloadGoal, organizacaoId: userOrgId })
			.returning({
				id: goals.id,
			});
		const insertedGoal = insertedGoalResponse[0];
		if (!insertedGoal) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao criar meta.");
		const insertedGoalId = insertedGoal.id;
		if (payloadGoalSellers.length > 0) {
			await tx.insert(goalsSellers).values(
				payloadGoalSellers.map((goalSeller) => ({
					...goalSeller,
					metaId: insertedGoalId,
					organizacaoId: userOrgId,
				})),
			);
		}

		return {
			data: {
				insertedId: insertedGoalId,
			},
			message: "Meta criada com sucesso.",
		};
	});
}
export type TCreateGoalOutput = Awaited<ReturnType<typeof createGoal>>;
export type TCreateGoalOutputInsertedId = Exclude<TCreateGoalOutput["data"]["insertedId"], undefined>;
const createGoalHandler: PagesRouteHandler<TCreateGoalOutput> = async (req, res) => {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!resolveGoalPermissions(sessionUser.membership?.permissoes).criar)
		throw new createHttpError.Forbidden("Você não possui permissão para criar metas.");

	const input = CreateGoalInputSchema.parse(req.body);
	const goal = await createGoal({ input, session: sessionUser });
	return res.status(200).json(goal);
};

/**
 *
 *
 * UPDATE
 *
 *
 */

const UpdateGoalInputSchema = z.object({
	goalId: z.string({
		required_error: "ID da meta não informado.",
		invalid_type_error: "Tipo inválido para ID da meta.",
	}),
	goal: GoalSchema.partial(),
	goalSellers: z.array(
		GoalSellerSchema.omit({ metaId: true }).extend({
			id: z
				.string({
					required_error: "ID da meta do vendedor não informado.",
					invalid_type_error: "Tipo inválido para ID da meta do vendedor.",
				})
				.optional(),
			deletar: z
				.boolean({
					required_error: "Deletar meta do vendedor não informado.",
					invalid_type_error: "Tipo inválido para deletar meta do vendedor.",
				})
				.optional(),
		}),
	),
});
export type TUpdateGoalInput = z.infer<typeof UpdateGoalInputSchema>;

async function updateGoal({ input, session }: { input: TUpdateGoalInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const { goalId, goal: payloadGoal, goalSellers: payloadGoalSellers } = input;

	return await db.transaction(async (tx) => {
		const updatedGoalResponse = await tx
			.update(goals)
			.set({ ...payloadGoal, organizacaoId: userOrgId })
			.where(and(eq(goals.id, goalId), eq(goals.organizacaoId, userOrgId)))
			.returning({
				id: goals.id,
			});
		const updatedGoal = updatedGoalResponse[0];
		if (!updatedGoal) throw new createHttpError.NotFound("Meta não encontrada.");
		const updatedGoalId = updatedGoal.id;
		await handleSimpleChildRowsProcessing({
			trx: tx,
			table: goalsSellers,
			entities: payloadGoalSellers,
			fatherEntityKey: "metaId",
			fatherEntityId: updatedGoalId,
			organizacaoId: userOrgId,
		});
		return {
			data: {
				updatedId: updatedGoalId,
			},
			message: "Meta atualizada com sucesso.",
		};
	});
}
export type TUpdateGoalOutput = Awaited<ReturnType<typeof updateGoal>>;
const updateGoalHandler: PagesRouteHandler<TUpdateGoalOutput> = async (req, res) => {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!resolveGoalPermissions(sessionUser.membership?.permissoes).editar)
		throw new createHttpError.Forbidden("Você não possui permissão para editar metas.");
	const input = UpdateGoalInputSchema.parse(req.body);
	const goal = await updateGoal({ input, session: sessionUser });
	return res.status(200).json(goal);
};

/**
 *
 *
 * DELETE
 *
 *
 */

const DeleteGoalInputSchema = z.object({
	goalId: z.string({
		required_error: "ID da meta não informado.",
		invalid_type_error: "Tipo inválido para ID da meta.",
	}),
});
export type TDeleteGoalInput = z.infer<typeof DeleteGoalInputSchema>;

async function deleteGoal({ input, session }: { input: TDeleteGoalInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const { goalId } = input;

	return await db.transaction(async (tx) => {
		// Verificar se a meta pertence à organização antes de deletar
		const goal = await tx.query.goals.findFirst({
			where: and(eq(goals.id, goalId), eq(goals.organizacaoId, userOrgId)),
		});
		if (!goal) throw new createHttpError.NotFound("Meta não encontrada.");

		await tx.delete(goalsSellers).where(eq(goalsSellers.metaId, goalId));
		await tx.delete(goals).where(and(eq(goals.id, goalId), eq(goals.organizacaoId, userOrgId)));
		return {
			data: {
				deletedId: goalId,
			},
		};
	});
}
export type TDeleteGoalOutput = Awaited<ReturnType<typeof deleteGoal>>;
export type TDeleteGoalOutputDeletedId = Exclude<TDeleteGoalOutput["data"]["deletedId"], undefined>;
const deleteGoalHandler: PagesRouteHandler<TDeleteGoalOutput> = async (req, res) => {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!resolveGoalPermissions(sessionUser.membership?.permissoes).excluir)
		throw new createHttpError.Forbidden("Você não possui permissão para excluir metas.");
	const input = DeleteGoalInputSchema.parse(req.query);
	const goal = await deleteGoal({ input, session: sessionUser });
	return res.status(200).json(goal);
};

const routeHandlers = {
	GET: getGoalsHandler,
	POST: createGoalHandler,
	PUT: updateGoalHandler,
	DELETE: deleteGoalHandler,
} satisfies Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", PagesRouteHandler<any>>>;

export const GET = appApiHandler({
	GET: (request) => runPagesRouteHandler({ request, handler: routeHandlers.GET! }),
});
export const POST = appApiHandler({
	POST: (request) => runPagesRouteHandler({ request, handler: routeHandlers.POST! }),
});
export const PUT = appApiHandler({
	PUT: (request) => runPagesRouteHandler({ request, handler: routeHandlers.PUT! }),
});
export const DELETE = appApiHandler({
	DELETE: (request) => runPagesRouteHandler({ request, handler: routeHandlers.DELETE! }),
});
