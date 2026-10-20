import { db } from "@/services/drizzle";
import { couponRedemptions } from "@/services/drizzle/schema";
import { and, count, eq, inArray } from "drizzle-orm";
import { type TCouponRedemptionSurface, clientMatchesCouponAudience, getCouponAvailabilityIssue } from "./engine";

/**
 * Busca os cupons disponíveis para um cliente em uma superfície de resgate.
 *
 * Candidatos: cupons ativos da organização, dentro da vigência, permitidos na superfície,
 * com limites não esgotados, e (GLOBAL casando a audiência por tag/RFM, ou INDIVIDUAL com
 * atribuição vigente do cliente). A elegibilidade de carrinho (alvos/condições) é avaliada
 * separadamente pelo motor, pois depende dos itens.
 *
 * `clienteId` nulo é um cliente que ainda não existe (a loja digital só cria o cadastro ao
 * enviar o pedido): sem tags, sem RFM, sem atribuições e sem resgates. Sem isso, cupom de
 * primeira compra nunca chegaria a quem nunca comprou.
 */
export async function getAvailableCouponsForClient({
	organizacaoId,
	clienteId,
	surface,
	now = new Date(),
}: {
	organizacaoId: string;
	clienteId: string | null;
	surface: TCouponRedemptionSurface;
	now?: Date;
}) {
	const [candidateCoupons, client] = await Promise.all([
		db.query.coupons.findMany({
			where: (fields, { eq, and }) => and(eq(fields.organizacaoId, organizacaoId), eq(fields.ativo, true)),
			with: {
				alvos: true,
				audiencias: true,
				atribuicoes: {
					// Cliente novo não tem atribuição: o filtro impossível devolve a lista vazia.
					where: (fields, { eq, sql }) => (clienteId ? eq(fields.clienteId, clienteId) : sql`false`),
				},
			},
		}),
		clienteId
			? db.query.clients.findFirst({
					where: (fields, { eq, and }) => and(eq(fields.id, clienteId), eq(fields.organizacaoId, organizacaoId)),
					columns: { id: true, analiseRFMTitulo: true },
					with: {
						tagReferencias: { columns: { clienteTagId: true } },
					},
				})
			: Promise.resolve({ id: null, analiseRFMTitulo: null, tagReferencias: [] as { clienteTagId: string }[] }),
	]);
	if (!client) return [];
	if (candidateCoupons.length === 0) return [];

	const clientTagIds = client.tagReferencias.map((reference) => reference.clienteTagId);

	// Contagens de uso (limites derivados do ledger) em duas queries agregadas.
	const couponIds = candidateCoupons.map((coupon) => coupon.id);
	const [totalCounts, clientCounts] = await Promise.all([
		db
			.select({ cupomId: couponRedemptions.cupomId, total: count() })
			.from(couponRedemptions)
			.where(and(inArray(couponRedemptions.cupomId, couponIds), eq(couponRedemptions.status, "UTILIZADO")))
			.groupBy(couponRedemptions.cupomId),
		clienteId
			? db
					.select({ cupomId: couponRedemptions.cupomId, total: count() })
					.from(couponRedemptions)
					.where(and(inArray(couponRedemptions.cupomId, couponIds), eq(couponRedemptions.status, "UTILIZADO"), eq(couponRedemptions.clienteId, clienteId)))
					.groupBy(couponRedemptions.cupomId)
			: Promise.resolve([]),
	]);
	const totalCountByCouponId = new Map(totalCounts.map((row) => [row.cupomId, row.total]));
	const clientCountByCouponId = new Map(clientCounts.map((row) => [row.cupomId, row.total]));

	return candidateCoupons.flatMap((coupon) => {
		// Atribuição vigente com maior quantidade disponível (cupons INDIVIDUAIS)
		const validGrant =
			coupon.atribuicoes
				.filter((grant) => grant.quantidadeDisponivel > 0 && (!grant.expiracaoData || grant.expiracaoData > now))
				.sort((a, b) => b.quantidadeDisponivel - a.quantidadeDisponivel)[0] ?? null;

		const availabilityIssue = getCouponAvailabilityIssue({
			coupon,
			surface,
			now,
			grant: validGrant,
			clientRedemptionsCount: clientCountByCouponId.get(coupon.id) ?? 0,
			totalRedemptionsCount: totalCountByCouponId.get(coupon.id) ?? 0,
		});
		if (availabilityIssue) return [];

		if (coupon.escopo === "GLOBAL") {
			const matchesAudience = clientMatchesCouponAudience({
				audiences: coupon.audiencias,
				clientTagIds,
				clientRFMTitle: client.analiseRFMTitulo,
			});
			if (!matchesAudience) return [];
		}

		return [{ ...coupon, atribuicaoVigente: validGrant }];
	});
}

export type TAvailableCoupon = Awaited<ReturnType<typeof getAvailableCouponsForClient>>[number];
