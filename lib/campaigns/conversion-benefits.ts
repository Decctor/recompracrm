import { db } from "@/services/drizzle";
import { campaignConversions, cashbackProgramTransactions, couponGrants, couponRedemptions } from "@/services/drizzle/schema";
import { and, eq, inArray, ne, sql } from "drizzle-orm";

/**
 * What a converted sale actually used: the coupon the campaign handed out, or cashback.
 *
 * Attribution is last-touch, so a conversion alone only says the client bought within the window
 * after the message. A redeemed campaign coupon is direct evidence the message drove the purchase;
 * a cashback redemption is evidence for the campaigns that remind clients of their balance.
 *
 * - Campaign coupon: a UTILIZADO redemption on the sale whose grant was issued by the same campaign.
 * - Cashback: a RESGATE on the sale that was not reversed (a reversal marks it EXPIRADO). It came
 *   "from the campaign" when the FIFO consumption recorded on the redemption (`consumoFifo`) drew
 *   on an accumulation the campaign generated.
 *
 * The SQL expressions correlate with the unaliased `campaignConversions` table, so they only work
 * in `db.select().from(campaignConversions)` queries, not in the relational `db.query` API.
 */

export const conversionUsedCampaignCouponSql = sql<boolean>`exists (
	select 1 from ${couponRedemptions} r
	join ${couponGrants} g on g.id = r.atribuicao_id
	where r.venda_id = ${campaignConversions.vendaId}
		and r.status = 'UTILIZADO'
		and g.campanha_id = ${campaignConversions.campanhaId}
)`;

export const conversionCampaignCouponDiscountSql = sql<number>`coalesce((
	select sum(r.valor_desconto) from ${couponRedemptions} r
	join ${couponGrants} g on g.id = r.atribuicao_id
	where r.venda_id = ${campaignConversions.vendaId}
		and r.status = 'UTILIZADO'
		and g.campanha_id = ${campaignConversions.campanhaId}
), 0)`;

export const conversionUsedCashbackSql = sql<boolean>`exists (
	select 1 from ${cashbackProgramTransactions} t
	where t.venda_id = ${campaignConversions.vendaId}
		and t.tipo = 'RESGATE'
		and t.status <> 'EXPIRADO'
)`;

export const conversionUsedCampaignCashbackSql = sql<boolean>`exists (
	select 1 from ${cashbackProgramTransactions} t
	cross join lateral jsonb_array_elements(
		case when jsonb_typeof(t.metadados -> 'consumoFifo') = 'array' then t.metadados -> 'consumoFifo' else '[]'::jsonb end
	) consumed
	join ${cashbackProgramTransactions} accumulation on accumulation.id = consumed ->> 'accumulationTransactionId'
	where t.venda_id = ${campaignConversions.vendaId}
		and t.tipo = 'RESGATE'
		and t.status <> 'EXPIRADO'
		and accumulation.campanha_id = ${campaignConversions.campanhaId}
)`;

export const CONVERSION_BENEFIT_FILTERS = {
	CUPOM_CAMPANHA: conversionUsedCampaignCouponSql,
	CASHBACK: conversionUsedCashbackSql,
} as const;

function readConsumedAccumulationIds(metadata: unknown) {
	if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
	const consumoFifo = (metadata as { consumoFifo?: unknown }).consumoFifo;
	if (!Array.isArray(consumoFifo)) return [];
	return consumoFifo.flatMap((item) => {
		const id = item && typeof item === "object" ? (item as { accumulationTransactionId?: unknown }).accumulationTransactionId : null;
		return typeof id === "string" ? [id] : [];
	});
}

export type TConversionBenefits = {
	cupom: { titulo: string; codigo: string; valorDesconto: number; daCampanha: boolean } | null;
	cashback: {
		valorResgatado: number;
		terminologia: "DINHEIRO" | "PONTOS";
		recompensas: string[];
		daCampanha: boolean;
	} | null;
};

/** Benefits used by each conversion's sale, keyed by conversion id. */
export async function getConversionBenefits({
	organizationId,
	conversions,
}: {
	organizationId: string;
	conversions: { id: string; vendaId: string; campanhaId: string }[];
}) {
	const result = new Map<string, TConversionBenefits>();
	if (conversions.length === 0) return result;
	const saleIds = [...new Set(conversions.map((conversion) => conversion.vendaId))];

	const [coupons, redemptions] = await Promise.all([
		db
			.select({
				vendaId: couponRedemptions.vendaId,
				titulo: couponRedemptions.cupomTitulo,
				codigo: couponRedemptions.cupomCodigo,
				valorDesconto: couponRedemptions.valorDesconto,
				campanhaId: couponGrants.campanhaId,
			})
			.from(couponRedemptions)
			.leftJoin(couponGrants, eq(couponGrants.id, couponRedemptions.atribuicaoId))
			.where(
				and(eq(couponRedemptions.organizacaoId, organizationId), inArray(couponRedemptions.vendaId, saleIds), eq(couponRedemptions.status, "UTILIZADO")),
			),
		db.query.cashbackProgramTransactions.findMany({
			where: and(
				eq(cashbackProgramTransactions.organizacaoId, organizationId),
				inArray(cashbackProgramTransactions.vendaId, saleIds),
				eq(cashbackProgramTransactions.tipo, "RESGATE"),
				ne(cashbackProgramTransactions.status, "EXPIRADO"),
			),
			columns: { vendaId: true, valor: true, metadados: true, resgateRecompensaDescricao: true },
			with: {
				programa: { columns: { terminologia: true } },
				resgateRecompensa: { columns: { titulo: true } },
			},
		}),
	]);

	const consumedIds = [...new Set(redemptions.flatMap((redemption) => readConsumedAccumulationIds(redemption.metadados)))];
	const accumulationCampaign = new Map<string, string | null>();
	if (consumedIds.length > 0) {
		const accumulations = await db
			.select({ id: cashbackProgramTransactions.id, campanhaId: cashbackProgramTransactions.campanhaId })
			.from(cashbackProgramTransactions)
			.where(and(eq(cashbackProgramTransactions.organizacaoId, organizationId), inArray(cashbackProgramTransactions.id, consumedIds)));
		for (const accumulation of accumulations) accumulationCampaign.set(accumulation.id, accumulation.campanhaId);
	}

	for (const conversion of conversions) {
		const saleCoupons = coupons.filter((coupon) => coupon.vendaId === conversion.vendaId);
		// One coupon per sale today; prefer the campaign's own if that ever changes.
		const coupon = saleCoupons.find((item) => item.campanhaId === conversion.campanhaId) ?? saleCoupons[0];

		const saleRedemptions = redemptions.filter((redemption) => redemption.vendaId === conversion.vendaId);
		const recompensas = saleRedemptions.flatMap((redemption) => {
			const label = redemption.resgateRecompensa?.titulo ?? redemption.resgateRecompensaDescricao;
			return label ? [label] : [];
		});

		result.set(conversion.id, {
			cupom: coupon
				? {
						titulo: coupon.titulo,
						codigo: coupon.codigo,
						valorDesconto: coupon.valorDesconto,
						daCampanha: coupon.campanhaId === conversion.campanhaId,
					}
				: null,
			cashback:
				saleRedemptions.length > 0
					? {
							// RESGATE rows are stored as debits (negative values).
							valorResgatado: saleRedemptions.reduce((sum, redemption) => sum + Math.abs(redemption.valor), 0),
							terminologia: saleRedemptions[0]?.programa?.terminologia ?? "DINHEIRO",
							recompensas,
							daCampanha: saleRedemptions.some((redemption) =>
								readConsumedAccumulationIds(redemption.metadados).some((id) => accumulationCampaign.get(id) === conversion.campanhaId),
							),
						}
					: null,
		});
	}

	return result;
}
