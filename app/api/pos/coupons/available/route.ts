import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getAvailableCouponsForClient } from "@/lib/coupons/availability";
import { type TCouponCartItem, evaluateCouponAgainstCart } from "@/lib/coupons/engine";
import { db } from "@/services/drizzle";
import { sales } from "@/services/drizzle/schema";
import { and, count, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";
import { DeliveryModeEnum } from "@/schemas/enums";
import { getCouponCheckoutConditionIssue } from "@/lib/coupons/conditions";

const CartItemInputSchema = z.object({
	produtoId: z.string({ required_error: "ID do produto não informado." }),
	produtoVarianteId: z.string({ invalid_type_error: "Tipo não válido para ID da variante." }).optional().nullable(),
	quantidade: z.number({ required_error: "Quantidade não informada." }).min(0),
	valorVendaUnitario: z.number({ required_error: "Valor unitário não informado." }),
});

const GetAvailableCouponsInputSchema = z.object({
	clienteId: z.string({
		required_error: "ID do cliente não informado.",
		invalid_type_error: "Tipo não válido para o ID do cliente.",
	}),
	// Carrinho atual (opcional): quando presente, cupons AUTOMATICA são avaliados e retornam o desconto computado.
	itens: z.array(CartItemInputSchema).optional().nullable(),
	entregaModalidade: DeliveryModeEnum.optional().nullable(),
});
export type TGetAvailablePosCouponsInput = z.infer<typeof GetAvailableCouponsInputSchema>;

async function getAvailablePosCoupons({ input, session }: { input: TGetAvailablePosCouponsInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const availableCoupons = await getAvailableCouponsForClient({
		organizacaoId: organizationId,
		clienteId: input.clienteId,
		surface: "POS",
	});
	const [purchaseHistory] = await db
		.select({ total: count() })
		.from(sales)
		.where(and(eq(sales.clienteId, input.clienteId), eq(sales.organizacaoId, organizationId), eq(sales.statusVenda, "CONFIRMADA")));

	// Enriquecimento do carrinho com o grupo dos produtos (alvos por grupo casam com products.grupo).
	const cartItems: TCouponCartItem[] = [];
	if (input.itens && input.itens.length > 0) {
		const productIds = [...new Set(input.itens.map((item) => item.produtoId))];
		const productsResult = await db.query.products.findMany({
			where: (fields, { inArray }) => inArray(fields.id, productIds),
			columns: { id: true, grupo: true },
		});
		const productGroupById = new Map(productsResult.map((product) => [product.id, product.grupo]));
		cartItems.push(
			...input.itens.map((item, index) => ({
				chave: String(index),
				produtoId: item.produtoId,
				produtoVarianteId: item.produtoVarianteId ?? null,
				grupo: productGroupById.get(item.produtoId) ?? null,
				quantidade: item.quantidade,
				valorVendaUnitario: item.valorVendaUnitario,
			})),
		);
	}

	const coupons = availableCoupons.map((coupon) => {
		const conditionIssue = getCouponCheckoutConditionIssue(coupon, {
			entregaModalidade: input.entregaModalidade ?? null,
			comprasAnterioresConfirmadas: purchaseHistory?.total ?? 0,
		});
		const evaluation = conditionIssue
			? { elegivel: false as const, motivo: conditionIssue }
			: coupon.validacaoModo === "AUTOMATICA" && cartItems.length > 0
				? evaluateCouponAgainstCart({
						coupon,
						targets: coupon.alvos,
						cartItems,
						context: { entregaModalidade: input.entregaModalidade ?? null, comprasAnterioresConfirmadas: purchaseHistory?.total ?? 0 },
					})
				: null;
		return {
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

	return {
		data: { coupons },
		message: "Cupons disponíveis encontrados com sucesso.",
	};
}
export type TGetAvailablePosCouponsOutput = Awaited<ReturnType<typeof getAvailablePosCoupons>>;

async function getAvailablePosCouponsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const payload = await request.json();
	const input = GetAvailableCouponsInputSchema.parse(payload);
	const result = await getAvailablePosCoupons({ input, session });
	return NextResponse.json(result, { status: 200 });
}

// POST (e não GET) porque a avaliação recebe o carrinho atual no corpo da requisição.
export const POST = appApiHandler({ POST: getAvailablePosCouponsRoute });
