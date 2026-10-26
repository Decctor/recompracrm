import { buildCouponGiftOptions } from "@/lib/coupons/gifts";
import { getAvailableCouponsForClient } from "@/lib/coupons/availability";
import { getCouponCheckoutConditionIssue } from "@/lib/coupons/conditions";
import { type TCouponCartItem, type TCouponRedemptionSurface, evaluateCouponAgainstCart } from "@/lib/coupons/engine";
import type { TDeliveryModeEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { sales } from "@/services/drizzle/schema";
import { and, count, eq } from "drizzle-orm";

/** Item do carrinho como o caixa o vê: referência, quantidade e o unitário final (com adicionais). */
export type TClientCartCouponItem = {
	chave?: string | null;
	valorUnitarioBase?: number;
	valorDesconto?: number;
	produtoId: string;
	produtoVarianteId?: string | null;
	quantidade: number;
	valorVendaUnitario: number;
};

/**
 * Cupons disponíveis para um cliente, cada um com a avaliação contra o carrinho atual. Mesma
 * leitura para o PDV web e para a maquininha: condições do checkout primeiro (modalidade de
 * entrega, primeira compra), depois o motor para os cupons AUTOMATICA. MANUAL sai sem avaliação —
 * quem valida é o operador. A confirmação da venda reavalia no servidor; isto é a prévia.
 */
export async function listCouponsForClientCart({
	organizacaoId,
	clienteId,
	surface,
	itens,
	entregaModalidade,
}: {
	organizacaoId: string;
	clienteId: string;
	surface: TCouponRedemptionSurface;
	itens: TClientCartCouponItem[] | null | undefined;
	entregaModalidade: TDeliveryModeEnum | null | undefined;
}) {
	const availableCoupons = await getAvailableCouponsForClient({ organizacaoId, clienteId, surface });
	const [purchaseHistory] = await db
		.select({ total: count() })
		.from(sales)
		.where(and(eq(sales.clienteId, clienteId), eq(sales.organizacaoId, organizacaoId), eq(sales.statusVenda, "CONFIRMADA")));
	const comprasAnterioresConfirmadas = purchaseHistory?.total ?? 0;

	// Enriquecimento do carrinho com o grupo dos produtos (alvos por grupo casam com products.grupo).
	const cartItems: TCouponCartItem[] = [];
	if (itens && itens.length > 0) {
		const productIds = [...new Set(itens.map((item) => item.produtoId))];
		const productsResult = await db.query.products.findMany({
			where: (fields, { inArray }) => inArray(fields.id, productIds),
			columns: { id: true, grupo: true },
		});
		const productGroupById = new Map(productsResult.map((product) => [product.id, product.grupo]));
		cartItems.push(
			...itens.map((item, index) => ({
				chave: item.chave ?? String(index),
				valorUnitarioBase: item.valorUnitarioBase,
				valorDesconto: item.valorDesconto,
				produtoId: item.produtoId,
				produtoVarianteId: item.produtoVarianteId ?? null,
				grupo: productGroupById.get(item.produtoId) ?? null,
				quantidade: item.quantidade,
				valorVendaUnitario: item.valorVendaUnitario,
			})),
		);
	}

	const context = { entregaModalidade: entregaModalidade ?? null, comprasAnterioresConfirmadas };
	return availableCoupons.map((coupon) => {
		const conditionIssue = getCouponCheckoutConditionIssue(coupon, context);
		const evaluation = conditionIssue
			? { elegivel: false as const, motivo: conditionIssue }
			: coupon.validacaoModo === "AUTOMATICA" && cartItems.length > 0
				? evaluateCouponAgainstCart({ coupon, targets: coupon.alvos, cartItems, context })
				: null;
		return {
			brindes: buildCouponGiftOptions({ coupon, targets: coupon.alvos, cartItems, context }),
			alvos: coupon.alvos.map(({ papel, produtoId, produtoVarianteId, grupo, quantidadeMinima }) => ({
				papel,
				produtoId,
				produtoVarianteId,
				grupo,
				quantidadeMinima,
			})),
			id: coupon.id,
			titulo: coupon.titulo,
			descricao: coupon.descricao,
			imagemCapaUrl: coupon.imagemCapaUrl,
			codigo: coupon.codigo,
			escopo: coupon.escopo,
			validacaoModo: coupon.validacaoModo,
			condicoesTexto: coupon.condicoesTexto,
			beneficioTipo: coupon.beneficioTipo,
			beneficioValor: coupon.beneficioValor,
			beneficioDescontoMaximo: coupon.beneficioDescontoMaximo,
			beneficioAplicacao: coupon.beneficioAplicacao,
			beneficioCompreQuantidade: coupon.beneficioCompreQuantidade,
			beneficioLeveQuantidade: coupon.beneficioLeveQuantidade,
			condicaoModalidadesEntrega: coupon.condicaoModalidadesEntrega,
			condicaoPrimeiraCompra: coupon.condicaoPrimeiraCompra,
			vigenciaFim: coupon.vigenciaFim,
			atribuicaoVigente: coupon.atribuicaoVigente ? { id: coupon.atribuicaoVigente.id, expiracaoData: coupon.atribuicaoVigente.expiracaoData } : null,
			avaliacao: evaluation,
		};
	});
}
export type TClientCartCoupon = Awaited<ReturnType<typeof listCouponsForClientCart>>[number];
