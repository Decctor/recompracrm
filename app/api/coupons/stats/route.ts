import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import type { TCouponRedemptionSourceEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { couponGrants, couponRedemptions, coupons, sales } from "@/services/drizzle/schema";
import { and, avg, count, countDistinct, eq, gte, lt, lte, sql, sum } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const PeriodSchema = z
	.string({ invalid_type_error: "Tipo inválido para período." })
	.datetime({ message: "Formato inválido para período." })
	.optional()
	.nullable()
	.transform((value) => (value ? new Date(value) : null));

const GetCouponStatsInputSchema = z.object({
	couponId: z.string({
		required_error: "ID do cupom não informado.",
		invalid_type_error: "Tipo inválido para o ID do cupom.",
	}),
	periodAfter: PeriodSchema,
	periodBefore: PeriodSchema,
	comparingPeriodAfter: PeriodSchema,
	comparingPeriodBefore: PeriodSchema,
});
export type TGetCouponStatsInput = z.infer<typeof GetCouponStatsInputSchema>;

type TPeriodTotals = {
	resgates: number;
	clientesUnicos: number;
	descontoConcedido: number;
	receitaInfluenciada: number;
	ticketMedio: number | null;
};

/**
 * Totais de um período do ledger de resgates. Só `UTILIZADO` entra: um resgate cancelado não
 * concedeu desconto nem influenciou receita, e somá-lo inflaria o custo do cupom.
 *
 * `ticketMedio` volta `null` — e não zero — quando não houve resgate com valor de venda apurado:
 * sem venda espelhada não existe ticket, e um zero ali seria uma afirmação que o dado não sustenta.
 */
async function getRedemptionTotals({
	couponId,
	after,
	before,
}: {
	couponId: string;
	after: Date | null;
	before: Date | null;
}): Promise<TPeriodTotals> {
	const conditions = [eq(couponRedemptions.cupomId, couponId), eq(couponRedemptions.status, "UTILIZADO")];
	if (after) conditions.push(gte(couponRedemptions.dataInsercao, after));
	if (before) conditions.push(lte(couponRedemptions.dataInsercao, before));

	const [result] = await db
		.select({
			resgates: count(),
			clientesUnicos: countDistinct(couponRedemptions.clienteId),
			descontoConcedido: sum(couponRedemptions.valorDesconto),
			receitaInfluenciada: sum(couponRedemptions.vendaValor),
			ticketMedio: avg(couponRedemptions.vendaValor),
		})
		.from(couponRedemptions)
		.where(and(...conditions));

	return {
		resgates: result?.resgates ?? 0,
		clientesUnicos: result?.clientesUnicos ?? 0,
		descontoConcedido: Number(result?.descontoConcedido ?? 0),
		receitaInfluenciada: Number(result?.receitaInfluenciada ?? 0),
		ticketMedio: result?.ticketMedio != null ? Number(result.ticketMedio) : null,
	};
}

async function getCouponStats({ input, session }: { input: TGetCouponStatsInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const coupon = await db.query.coupons.findFirst({
		where: and(eq(coupons.id, input.couponId), eq(coupons.organizacaoId, organizationId)),
		columns: { id: true, limiteResgatesTotal: true },
	});
	if (!coupon) throw new createHttpError.NotFound("Cupom não encontrado.");

	const { periodAfter, periodBefore, comparingPeriodAfter, comparingPeriodBefore } = input;
	const hasComparingPeriod = !!comparingPeriodAfter || !!comparingPeriodBefore;

	const periodConditions = [eq(couponRedemptions.cupomId, coupon.id)];
	if (periodAfter) periodConditions.push(gte(couponRedemptions.dataInsercao, periodAfter));
	if (periodBefore) periodConditions.push(lte(couponRedemptions.dataInsercao, periodBefore));
	const utilizedInPeriod = and(...periodConditions, eq(couponRedemptions.status, "UTILIZADO"));

	const [resumo, resumoAnterior] = await Promise.all([
		getRedemptionTotals({ couponId: coupon.id, after: periodAfter, before: periodBefore }),
		hasComparingPeriod ? getRedemptionTotals({ couponId: coupon.id, after: comparingPeriodAfter, before: comparingPeriodBefore }) : null,
	]);

	// Ticket médio da loja no mesmo período, para o cupom ser lido contra a régua da operação e não
	// contra si mesmo: um ticket alto com cupom só significa algo comparado ao ticket sem ele.
	const storeTicketConditions = [eq(sales.organizacaoId, organizationId), eq(sales.statusVenda, "CONFIRMADA")];
	if (periodAfter) storeTicketConditions.push(gte(sales.dataVenda, periodAfter));
	if (periodBefore) storeTicketConditions.push(lte(sales.dataVenda, periodBefore));
	const [storeTicketResult] = await db
		.select({ ticketMedio: avg(sales.valorTotal) })
		.from(sales)
		.where(and(...storeTicketConditions));
	const ticketMedioLoja = storeTicketResult?.ticketMedio != null ? Number(storeTicketResult.ticketMedio) : null;

	// Série diária do período. O agrupamento é por dia no fuso do banco — o eixo do gráfico só
	// precisa distinguir dias, não instantes.
	const dailyRows = await db
		.select({
			dia: sql<string>`date_trunc('day', ${couponRedemptions.dataInsercao})::date::text`,
			resgates: count(),
			descontoConcedido: sum(couponRedemptions.valorDesconto),
		})
		.from(couponRedemptions)
		.where(utilizedInPeriod)
		.groupBy(sql`date_trunc('day', ${couponRedemptions.dataInsercao})`)
		.orderBy(sql`date_trunc('day', ${couponRedemptions.dataInsercao})`);

	const porDia = dailyRows.map((row) => ({
		dia: row.dia,
		resgates: row.resgates,
		descontoConcedido: Number(row.descontoConcedido ?? 0),
	}));

	// Quebra por origem do resgate. As origens sem nenhum resgate no período ficam de fora: a lista
	// é um recorte do que aconteceu, e a tela já diz quando não aconteceu nada.
	const sourceRows = await db
		.select({
			origem: couponRedemptions.origemResgate,
			resgates: count(),
			descontoConcedido: sum(couponRedemptions.valorDesconto),
			receitaInfluenciada: sum(couponRedemptions.vendaValor),
		})
		.from(couponRedemptions)
		.where(utilizedInPeriod)
		.groupBy(couponRedemptions.origemResgate);

	const totalRedemptionsInPeriod = porDia.reduce((total, day) => total + day.resgates, 0);
	const porOrigem = sourceRows
		.map((row) => ({
			origem: row.origem as TCouponRedemptionSourceEnum,
			resgates: row.resgates,
			descontoConcedido: Number(row.descontoConcedido ?? 0),
			receitaInfluenciada: Number(row.receitaInfluenciada ?? 0),
			participacao: totalRedemptionsInPeriod > 0 ? (row.resgates / totalRedemptionsInPeriod) * 100 : 0,
		}))
		.sort((a, b) => b.resgates - a.resgates);

	// Ciclo de vida — escopo ACUMULADO, não do período: a pergunta que ele responde ("quanto do que
	// foi entregue virou uso?") não faz sentido cortada por data, porque atribuição e resgate
	// acontecem em momentos diferentes.
	const now = new Date();
	const grantConditions = and(eq(couponGrants.cupomId, coupon.id), eq(couponGrants.organizacaoId, organizationId));
	const [grantsResult, expiredGrantsResult, canceledResult, utilizedLifetimeResult, grantsWithUseResult] = await Promise.all([
		db.select({ total: count() }).from(couponGrants).where(grantConditions),
		db
			.select({ total: count() })
			.from(couponGrants)
			.where(and(grantConditions, lt(couponGrants.expiracaoData, now))),
		db
			.select({ total: count() })
			.from(couponRedemptions)
			.where(and(eq(couponRedemptions.cupomId, coupon.id), eq(couponRedemptions.status, "CANCELADO"))),
		db
			.select({ total: count() })
			.from(couponRedemptions)
			.where(and(eq(couponRedemptions.cupomId, coupon.id), eq(couponRedemptions.status, "UTILIZADO"))),
		db
			.select({ total: countDistinct(couponRedemptions.atribuicaoId) })
			.from(couponRedemptions)
			.where(and(eq(couponRedemptions.cupomId, coupon.id), eq(couponRedemptions.status, "UTILIZADO"))),
	]);

	const atribuicoesCriadas = grantsResult[0]?.total ?? 0;
	const atribuicoesExpiradas = expiredGrantsResult[0]?.total ?? 0;
	const atribuicoesUsadas = grantsWithUseResult[0]?.total ?? 0;
	const resgatesUtilizados = utilizedLifetimeResult[0]?.total ?? 0;

	const cicloDeVida = {
		atribuicoesCriadas,
		atribuicoesAtivasSemUso: Math.max(atribuicoesCriadas - atribuicoesUsadas - atribuicoesExpiradas, 0),
		atribuicoesExpiradas,
		resgatesUtilizados,
		resgatesCancelados: canceledResult[0]?.total ?? 0,
	};

	// Consumo do limite: acumulado por definição — o limite é do cupom, não do período filtrado.
	const limite = coupon.limiteResgatesTotal
		? {
				total: coupon.limiteResgatesTotal,
				consumidos: resgatesUtilizados,
				disponiveis: Math.max(coupon.limiteResgatesTotal - resgatesUtilizados, 0),
				percentualConsumido: (resgatesUtilizados / coupon.limiteResgatesTotal) * 100,
			}
		: null;

	return {
		data: { resumo, resumoAnterior, ticketMedioLoja, porDia, porOrigem, cicloDeVida, limite },
		message: "Estatísticas do cupom encontradas com sucesso.",
	};
}
export type TGetCouponStatsOutput = Awaited<ReturnType<typeof getCouponStats>>;
export type TGetCouponStatsOutputData = TGetCouponStatsOutput["data"];

async function getCouponStatsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const input = GetCouponStatsInputSchema.parse({
		couponId: request.nextUrl.searchParams.get("couponId") ?? undefined,
		periodAfter: request.nextUrl.searchParams.get("periodAfter") ?? undefined,
		periodBefore: request.nextUrl.searchParams.get("periodBefore") ?? undefined,
		comparingPeriodAfter: request.nextUrl.searchParams.get("comparingPeriodAfter") ?? undefined,
		comparingPeriodBefore: request.nextUrl.searchParams.get("comparingPeriodBefore") ?? undefined,
	});
	const result = await getCouponStats({ input, session });
	return NextResponse.json(result, { status: 200 });
}

export const GET = appApiHandler({ GET: getCouponStatsRoute });
