import { appApiHandler } from "@/lib/app-api";
import { runPagesRouteHandler, type PagesRouteHandler } from "@/lib/pages-route-compat";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { resolveGoalPermissions } from "@/lib/permissions/goals";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { resolveActiveGoalPacing } from "@/lib/goals/resolve-active-goal-pacing";
import { db } from "@/services/drizzle";
import { clients, sales } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, count, eq, gte, isNotNull, lte, sum } from "drizzle-orm";
import createHttpError from "http-errors";

async function computeAchievementForPeriod({
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
		db.select({ totalValor: sum(sales.valorTotal), totalQtde: count(sales.id) }).from(sales).where(and(...saleConditions)),
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

async function getGoalsStats({ session }: { session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const allGoals = await db.query.goals.findMany({
		where: (fields, { eq }) => eq(fields.organizacaoId, userOrgId),
		with: {
			vendedores: {
				with: { vendedor: { columns: { id: true, nome: true, avatarUrl: true } } },
			},
		},
		orderBy: (fields, { desc }) => desc(fields.dataInicio),
	});

	const now = dayjs();

	// Compute achievement for each goal in parallel
	const goalsWithAchievement = await Promise.all(
		allGoals.map(async (goal) => {
			const [achievement, vendedores] = await Promise.all([
				computeAchievementForPeriod({
					organizacaoId: userOrgId,
					dataInicio: goal.dataInicio,
					dataFim: goal.dataFim,
				}),
				Promise.all(
					goal.vendedores.map(async (goalSeller) => ({
						...goalSeller,
						...(await computeAchievementForPeriod({
							organizacaoId: userOrgId,
							dataInicio: goal.dataInicio,
							dataFim: goal.dataFim,
							vendedorId: goalSeller.vendedorId,
						})),
					})),
				),
			]);

			const percentualValor = goal.objetivoValor > 0 ? (achievement.realizadoValor / goal.objetivoValor) * 100 : 0;
			const percentualQtde =
				goal.objetivoQtdeVendas && goal.objetivoQtdeVendas > 0 ? (achievement.realizadoQtdeVendas / goal.objetivoQtdeVendas) * 100 : null;
			const percentualClientes =
				goal.objetivoNovosClientes && goal.objetivoNovosClientes > 0 ? (achievement.realizadoNovosClientes / goal.objetivoNovosClientes) * 100 : null;

			// Inclusivo nas duas pontas: uma meta que começa hoje já está ativa, e uma que termina
			// hoje ainda está. O `isBefore`/`isAfter` estrito de antes deixava o primeiro e o último
			// dia da meta sem meta ativa nenhuma na tela.
			const isActive = !dayjs(goal.dataInicio).isAfter(now) && !dayjs(goal.dataFim).isBefore(now);

			const label = `${dayjs(goal.dataInicio).format("DD/MM/YY")} - ${dayjs(goal.dataFim).format("DD/MM/YY")}`;

			return {
				...goal,
				...achievement,
				vendedores,
				percentualValor,
				percentualQtde,
				percentualClientes,
				isActive,
				label,
			};
		}),
	);

	// Find the currently active goal
	const activeGoalRow = goalsWithAchievement.find((g) => g.isActive) ?? null;

	// O ritmo só é calculado para a meta ativa. Ver `resolveActiveGoalPacing` para o porquê.
	const activeGoal = activeGoalRow
		? {
				...activeGoalRow,
				ritmo: await resolveActiveGoalPacing({
					organizacaoId: userOrgId,
					goal: activeGoalRow,
					goalSellers: activeGoalRow.vendedores,
					agora: now.toDate(),
				}),
			}
		: null;

	// Compute aggregate KPIs
	const totalMetas = goalsWithAchievement.length;
	const metasConcluidas = goalsWithAchievement.filter((g) => g.percentualValor >= 100).length;
	const mediaPercentualConclusiaoValor =
		totalMetas > 0 ? goalsWithAchievement.reduce((acc, g) => acc + g.percentualValor, 0) / totalMetas : 0;

	// Build historico for chart (most recent 12 goals, chronological order for chart)
	const historico = goalsWithAchievement.slice(0, 12).reverse();

	return {
		data: {
			activeGoal,
			historico,
			totalMetas,
			metasConcluidas,
			mediaPercentualConclusiaoValor,
		},
	};
}

export type TGetGoalsStatsOutput = Awaited<ReturnType<typeof getGoalsStats>>;
export type TGetGoalsStatsActiveGoal = Exclude<TGetGoalsStatsOutput["data"]["activeGoal"], null>;
export type TGetGoalsStatsHistoricoItem = TGetGoalsStatsOutput["data"]["historico"][number];

const getGoalsStatsHandler: PagesRouteHandler<TGetGoalsStatsOutput> = async (req, res) => {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!resolveGoalPermissions(sessionUser.membership?.permissoes).visualizar)
		throw new createHttpError.Forbidden("Você não possui permissão para visualizar metas.");
	const data = await getGoalsStats({ session: sessionUser });
	return res.status(200).json(data);
};

const routeHandlers = {
	GET: getGoalsStatsHandler,
} satisfies Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", PagesRouteHandler<any>>>;

export const GET = appApiHandler({
	GET: (request) => runPagesRouteHandler({ request, handler: routeHandlers.GET! }),
});
