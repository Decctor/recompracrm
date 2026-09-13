import type { TCouponBenefitSnapshot } from "@/schemas/coupons";
import type { DBTransaction } from "@/services/drizzle";
import type { TDeliveryModeEnum } from "@/schemas/enums";
import { couponGrants, couponRedemptions } from "@/services/drizzle/schema";
import { getCouponCheckoutConditionIssue } from "./conditions";
import { countPreviousConfirmedPurchases, lockClientPurchaseHistory } from "./purchase-history";
import { and, count, eq, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type TCouponRedemptionSurface, clientMatchesCouponAudience, getCouponAvailabilityIssue } from "./engine";

/**
 * Processa o resgate de um cupom dentro de uma transação de banco.
 *
 * Revalida disponibilidade (ativo, vigência, superfície, audiência e limites contados no ledger),
 * grava a linha imutável em couponRedemptions com snapshot do benefício e decrementa a
 * quantidade disponível da atribuição quando o cupom é INDIVIDUAL.
 *
 * Modalidade e primeira compra são revalidadas aqui nos dois modos de validação.
 * A elegibilidade de carrinho (alvos/condições de itens) NÃO é revalidada aqui: cupons AUTOMATICA devem
 * ser avaliados pelo motor (evaluateCouponAgainstCart) pelo chamador antes do resgate; em cupons
 * MANUAL a validação é do operador.
 */
export async function processCouponRedemption({
	trx,
	organizacaoId,
	cupomId,
	clienteId,
	surface,
	valorDesconto,
	vendaId,
	vendaValor,
	operadorId,
	operadorVendedorId,
	metadados,
	entregaModalidade,
	now = new Date(),
}: {
	trx: DBTransaction;
	organizacaoId: string;
	cupomId: string;
	clienteId: string;
	surface: TCouponRedemptionSurface;
	valorDesconto: number;
	vendaId?: string | null;
	vendaValor?: number | null;
	operadorId?: string | null;
	operadorVendedorId?: string | null;
	metadados?: Record<string, unknown> | null;
	entregaModalidade?: TDeliveryModeEnum | null;
	now?: Date;
}) {
	if (valorDesconto <= 0) throw new createHttpError.BadRequest("O valor de desconto do cupom deve ser maior que zero.");

	const coupon = await trx.query.coupons.findFirst({
		where: (fields, { eq, and }) => and(eq(fields.id, cupomId), eq(fields.organizacaoId, organizacaoId)),
		with: {
			alvos: true,
			audiencias: true,
			atribuicoes: {
				where: (fields, { eq }) => eq(fields.clienteId, clienteId),
			},
		},
	});
	if (!coupon) throw new createHttpError.NotFound("Cupom não encontrado.");

	if (coupon.condicaoPrimeiraCompra) await lockClientPurchaseHistory(trx, organizacaoId, clienteId);
	const previousConfirmedPurchases = await countPreviousConfirmedPurchases({ trx, organizacaoId, clienteId, vendaId });
	const conditionIssue = getCouponCheckoutConditionIssue(coupon, {
		entregaModalidade: entregaModalidade ?? null,
		comprasAnterioresConfirmadas: previousConfirmedPurchases,
	});
	if (conditionIssue) throw new createHttpError.BadRequest(conditionIssue);

	const validGrant =
		coupon.atribuicoes
			.filter((grant) => grant.quantidadeDisponivel > 0 && (!grant.expiracaoData || grant.expiracaoData > now))
			.sort((a, b) => b.quantidadeDisponivel - a.quantidadeDisponivel)[0] ?? null;

	const [totalCountRows, clientCountRows] = await Promise.all([
		trx
			.select({ total: count() })
			.from(couponRedemptions)
			.where(and(eq(couponRedemptions.cupomId, coupon.id), eq(couponRedemptions.status, "UTILIZADO"))),
		trx
			.select({ total: count() })
			.from(couponRedemptions)
			.where(and(eq(couponRedemptions.cupomId, coupon.id), eq(couponRedemptions.status, "UTILIZADO"), eq(couponRedemptions.clienteId, clienteId))),
	]);

	const availabilityIssue = getCouponAvailabilityIssue({
		coupon,
		surface,
		now,
		grant: validGrant,
		clientRedemptionsCount: clientCountRows[0]?.total ?? 0,
		totalRedemptionsCount: totalCountRows[0]?.total ?? 0,
	});
	if (availabilityIssue) throw new createHttpError.BadRequest(availabilityIssue);

	if (coupon.escopo === "GLOBAL" && coupon.audiencias.length > 0) {
		const client = await trx.query.clients.findFirst({
			where: (fields, { eq, and }) => and(eq(fields.id, clienteId), eq(fields.organizacaoId, organizacaoId)),
			columns: { id: true, analiseRFMTitulo: true },
			with: { tagReferencias: { columns: { clienteTagId: true } } },
		});
		if (!client) throw new createHttpError.NotFound("Cliente não encontrado.");
		const matchesAudience = clientMatchesCouponAudience({
			audiences: coupon.audiencias,
			clientTagIds: client.tagReferencias.map((reference) => reference.clienteTagId),
			clientRFMTitle: client.analiseRFMTitulo,
		});
		if (!matchesAudience) throw new createHttpError.BadRequest("O cliente não faz parte da audiência do cupom.");
	}

	const benefitSnapshot: TCouponBenefitSnapshot = {
		beneficioTipo: coupon.beneficioTipo,
		beneficioValor: coupon.beneficioValor,
		beneficioDescontoMaximo: coupon.beneficioDescontoMaximo,
		beneficioAplicacao: coupon.beneficioAplicacao,
		beneficioCompreQuantidade: coupon.beneficioCompreQuantidade,
		beneficioLeveQuantidade: coupon.beneficioLeveQuantidade,
		validacaoModo: coupon.validacaoModo,
		condicoesTexto: coupon.condicoesTexto,
		condicaoModalidadesEntrega: coupon.condicaoModalidadesEntrega,
		condicaoPrimeiraCompra: coupon.condicaoPrimeiraCompra,
		contextoAplicacao: {
			entregaModalidade: entregaModalidade ?? null,
			comprasAnterioresConfirmadas: previousConfirmedPurchases,
		},
		alvos: coupon.alvos.map((target) => ({
			papel: target.papel,
			produtoId: target.produtoId,
			produtoVarianteId: target.produtoVarianteId,
			grupo: target.grupo,
			quantidadeMinima: target.quantidadeMinima,
		})),
	};

	const insertedRedemptions = await trx
		.insert(couponRedemptions)
		.values({
			organizacaoId,
			cupomId: coupon.id,
			atribuicaoId: validGrant?.id ?? null,
			clienteId,
			status: "UTILIZADO",
			vendaId: vendaId ?? null,
			vendaValor: vendaValor ?? null,
			valorDesconto,
			cupomTitulo: coupon.titulo,
			cupomCodigo: coupon.codigo,
			beneficioSnapshot: benefitSnapshot,
			origemResgate: surface,
			operadorId: operadorId ?? null,
			operadorVendedorId: operadorVendedorId ?? null,
			metadados: metadados ?? null,
		})
		.returning({ id: couponRedemptions.id });
	const redemptionId = insertedRedemptions[0]?.id;
	if (!redemptionId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao registrar o resgate do cupom.");

	if (validGrant) {
		await trx
			.update(couponGrants)
			.set({ quantidadeDisponivel: sql`${couponGrants.quantidadeDisponivel} - 1`, dataAtualizacao: new Date() })
			.where(eq(couponGrants.id, validGrant.id));
	}

	return { redemptionId, coupon, grant: validGrant };
}

/**
 * Cancela um resgate de cupom (ex: cancelamento da venda vinculada), devolvendo o uso:
 * marca a linha do ledger como CANCELADA e reincrementa a atribuição quando houver.
 */
export async function cancelCouponRedemption({
	trx,
	organizacaoId,
	redemptionId,
}: {
	trx: DBTransaction;
	organizacaoId: string;
	redemptionId: string;
}) {
	const updatedRedemptions = await trx
		.update(couponRedemptions)
		.set({ status: "CANCELADO", dataAtualizacao: new Date() })
		.where(and(eq(couponRedemptions.id, redemptionId), eq(couponRedemptions.organizacaoId, organizacaoId), eq(couponRedemptions.status, "UTILIZADO")))
		.returning({ id: couponRedemptions.id, atribuicaoId: couponRedemptions.atribuicaoId });
	const cancelledRedemption = updatedRedemptions[0];
	if (!cancelledRedemption) throw new createHttpError.NotFound("Resgate de cupom não encontrado ou já cancelado.");

	if (cancelledRedemption.atribuicaoId) {
		await trx
			.update(couponGrants)
			.set({ quantidadeDisponivel: sql`${couponGrants.quantidadeDisponivel} + 1`, dataAtualizacao: new Date() })
			.where(eq(couponGrants.id, cancelledRedemption.atribuicaoId));
	}

	return { cancelledRedemptionId: cancelledRedemption.id };
}
