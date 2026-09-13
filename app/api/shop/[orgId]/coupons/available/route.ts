import { appApiHandler } from "@/lib/app-api";
import { getAvailableCouponsForClient } from "@/lib/coupons/availability";
import { type TCouponCartItem, evaluateCouponAgainstCart } from "@/lib/coupons/engine";
import { db } from "@/services/drizzle";
import { sales } from "@/services/drizzle/schema";
import { and, count, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";
import { DeliveryModeEnum } from "@/schemas/enums";

const CartItemInputSchema = z.object({
	produtoId: z.string({ required_error: "ID do produto não informado." }),
	produtoVarianteId: z.string({ invalid_type_error: "Tipo não válido para ID da variante." }).optional().nullable(),
	quantidade: z.number({ required_error: "Quantidade não informada." }).min(0),
	valorVendaUnitario: z.number({ required_error: "Valor unitário não informado." }),
});

const GetAvailableShopCouponsInputSchema = z.object({
	clienteId: z.string({
		required_error: "ID do cliente não informado.",
		invalid_type_error: "Tipo não válido para o ID do cliente.",
	}),
	itens: z.array(CartItemInputSchema).min(1, "Carrinho não informado."),
	entregaModalidade: DeliveryModeEnum.optional().nullable(),
});
export type TGetAvailableShopCouponsInput = z.infer<typeof GetAvailableShopCouponsInputSchema>;

function extractOrgId(pathname: string) {
	return pathname.split("/")[3];
}

async function getAvailableShopCoupons({ orgId, input }: { orgId: string; input: TGetAvailableShopCouponsInput }) {
	const organization = await db.query.organizations.findFirst({
		where: (fields, { eq }) => eq(fields.id, orgId),
		columns: { id: true },
	});
	if (!organization) throw new createHttpError.NotFound("Organização não encontrada.");

	const availableCoupons = await getAvailableCouponsForClient({
		organizacaoId: orgId,
		clienteId: input.clienteId,
		surface: "LOJA_DIGITAL",
	});
	const [purchaseHistory] = await db
		.select({ total: count() })
		.from(sales)
		.where(and(eq(sales.clienteId, input.clienteId), eq(sales.organizacaoId, orgId), eq(sales.statusVenda, "CONFIRMADA")));

	const productIds = [...new Set(input.itens.map((item) => item.produtoId))];
	const productsResult = await db.query.products.findMany({
		where: (fields, { inArray }) => inArray(fields.id, productIds),
		columns: { id: true, grupo: true },
	});
	const productGroupById = new Map(productsResult.map((product) => [product.id, product.grupo]));
	const cartItems: TCouponCartItem[] = input.itens.map((item, index) => ({
		chave: String(index),
		produtoId: item.produtoId,
		produtoVarianteId: item.produtoVarianteId ?? null,
		grupo: productGroupById.get(item.produtoId) ?? null,
		quantidade: item.quantidade,
		valorVendaUnitario: item.valorVendaUnitario,
	}));

	const coupons = availableCoupons.map((coupon) => {
		const evaluation =
			coupon.validacaoModo === "AUTOMATICA"
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
export type TGetAvailableShopCouponsOutput = Awaited<ReturnType<typeof getAvailableShopCoupons>>;

async function getAvailableShopCouponsRoute(request: NextRequest) {
	const orgId = extractOrgId(request.nextUrl.pathname);
	const payload = await request.json();
	const input = GetAvailableShopCouponsInputSchema.parse(payload);
	const result = await getAvailableShopCoupons({ orgId, input });
	return NextResponse.json(result, { status: 200 });
}

export const POST = appApiHandler({ POST: getAvailableShopCouponsRoute });
