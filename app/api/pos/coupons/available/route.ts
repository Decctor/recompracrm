import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { listCouponsForClientCart } from "@/lib/coupons/client-cart-coupons";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";
import { DeliveryModeEnum } from "@/schemas/enums";

const CartItemInputSchema = z.object({
	chave: z.string({ required_error: "Chave do item não informada.", invalid_type_error: "Tipo não válido para a chave do item." }).optional().nullable(),
	valorUnitarioBase: z.number({ required_error: "Preço base não informado.", invalid_type_error: "Tipo não válido para preço base." }).finite().nonnegative().optional(),
	valorDesconto: z.number({ required_error: "Desconto do item não informado.", invalid_type_error: "Tipo não válido para desconto do item." }).nonnegative().optional(),
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

	const coupons = await listCouponsForClientCart({
		organizacaoId: organizationId,
		clienteId: input.clienteId,
		surface: "POS",
		itens: input.itens,
		entregaModalidade: input.entregaModalidade,
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
