import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { filterCouponGiftProducts } from "@/lib/coupons/gifts";
import { hydratePOSProducts } from "@/lib/pos/hydrate-pos-products";
import { db } from "@/services/drizzle";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const GetCouponGiftProductsInputSchema = z.object({
	couponId: z.string({ required_error: "Cupom não informado.", invalid_type_error: "Tipo não válido para o cupom." }).min(1, "Cupom não informado."),
});
export type TGetCouponGiftProductsInput = z.infer<typeof GetCouponGiftProductsInputSchema>;

async function getCouponGiftProducts({ input, session }: { input: TGetCouponGiftProductsInput; session: TAuthUserSession }) {
	const orgId = session.membership?.organizacao.id;
	if (!orgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	const coupon = await db.query.coupons.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, input.couponId), eq(fields.organizacaoId, orgId)),
		with: { alvos: { with: { produtoVariante: { columns: { produtoId: true } } } } },
	});
	if (!coupon || coupon.beneficioTipo !== "BRINDE") throw new createHttpError.NotFound("Cupom de brinde não encontrado.");
	const targets = coupon.alvos.filter((target) => target.papel === "BENEFICIADO");
	const ids = targets.flatMap((target) => (target.produtoId ? [target.produtoId] : target.produtoVariante ? [target.produtoVariante.produtoId] : []));
	const groups = targets.flatMap((target) => (target.grupo ? [target.grupo] : []));
	const groupProducts =
		groups.length > 0
			? await db.query.products.findMany({
					where: (fields, { and, eq, inArray }) => and(eq(fields.organizacaoId, orgId), inArray(fields.grupo, groups)),
					columns: { id: true },
				})
			: [];
	const products = await hydratePOSProducts({ orgId, productIds: [...new Set([...ids, ...groupProducts.map((product) => product.id)])] });
	return { data: { products: filterCouponGiftProducts(products, coupon.alvos) }, message: "Produtos de brinde encontrados com sucesso." };
}
export type TGetCouponGiftProductsOutput = Awaited<ReturnType<typeof getCouponGiftProducts>>;

async function getCouponGiftProductsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const input = GetCouponGiftProductsInputSchema.parse({ couponId: request.nextUrl.searchParams.get("couponId") });
	return NextResponse.json(await getCouponGiftProducts({ input, session }));
}
export const GET = appApiHandler({ GET: getCouponGiftProductsRoute });
